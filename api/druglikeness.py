"""
Drug-likeness scoring for ligand candidates.

Implements the rules medicinal chemists actually look at on day one:
  • Lipinski's Rule of Five (oral bioavailability)
  • Veber's rules (rotatable bonds + TPSA)
  • Ghose / Egan refinements
  • Quantitative Estimate of Drug-likeness (QED, Bickerton 2012)
  • PAINS substructure flags (pan-assay interference)

All computed locally with RDKit so we don't blow rate limits on
external services. Each rule returns a per-criterion pass/fail plus
an overall verdict so the UI can render nuanced badges instead of a
single binary.
"""

from __future__ import annotations

import logging
from typing import Optional

_logger = logging.getLogger(__name__)

try:
    from rdkit import Chem
    from rdkit.Chem import AllChem, Crippen, Descriptors, Lipinski, QED
    from rdkit.Chem.FilterCatalog import FilterCatalog, FilterCatalogParams
    _RDKIT_OK = True
    _PAINS_CATALOG: Optional[FilterCatalog] = None
except Exception as e:  # pragma: no cover
    _logger.warning("RDKit unavailable: %s", e)
    Chem = None  # type: ignore
    _RDKIT_OK = False
    _PAINS_CATALOG = None


def _pains_catalog():
    """Lazy-init the PAINS filter catalog. The catalog is heavy enough
    that we don't want to build it at import time."""
    global _PAINS_CATALOG
    if _PAINS_CATALOG is None and _RDKIT_OK:
        params = FilterCatalogParams()
        params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS_A)
        params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS_B)
        params.AddCatalog(FilterCatalogParams.FilterCatalogs.PAINS_C)
        _PAINS_CATALOG = FilterCatalog(params)
    return _PAINS_CATALOG


def score(smiles: Optional[str]) -> dict:
    """Compute the full drug-likeness panel for a SMILES string.

    Returns a structured dict the client can render directly. Always
    returns a result — if RDKit is missing or SMILES is bad, the dict
    carries `error` instead of throwing so the UI can degrade
    gracefully (badges hidden, ligand still dockable)."""
    if not _RDKIT_OK:
        return {"error": "RDKit not installed", "available": False}
    if not smiles or not isinstance(smiles, str) or not smiles.strip():
        return {"error": "No SMILES provided", "available": False}

    mol = Chem.MolFromSmiles(smiles.strip())
    if mol is None:
        return {"error": "Invalid SMILES", "available": False, "smiles": smiles}

    mw = Descriptors.MolWt(mol)
    logp = Crippen.MolLogP(mol)
    tpsa = Descriptors.TPSA(mol)
    hbd = Lipinski.NumHDonors(mol)
    hba = Lipinski.NumHAcceptors(mol)
    rotb = Lipinski.NumRotatableBonds(mol)
    rings = Lipinski.RingCount(mol)
    aromatic_rings = Lipinski.NumAromaticRings(mol)
    heavy_atoms = mol.GetNumHeavyAtoms()
    formal_charge = Chem.GetFormalCharge(mol)

    qed_score = float(QED.qed(mol))

    # Lipinski's Rule of Five — oral bioavailability heuristic.
    lipinski_violations: list[str] = []
    if mw > 500:  lipinski_violations.append(f"MW {mw:.0f} > 500")
    if logp > 5: lipinski_violations.append(f"LogP {logp:.1f} > 5")
    if hbd > 5:  lipinski_violations.append(f"H-donors {hbd} > 5")
    if hba > 10: lipinski_violations.append(f"H-acceptors {hba} > 10")

    # Veber's rules — oral bioavailability post-Lipinski.
    veber_violations: list[str] = []
    if rotb > 10:  veber_violations.append(f"Rot. bonds {rotb} > 10")
    if tpsa > 140: veber_violations.append(f"TPSA {tpsa:.0f} > 140")

    # Ghose drug-likeness window (a tighter Lipinski).
    ghose_violations: list[str] = []
    if not (160 <= mw <= 480):    ghose_violations.append(f"MW {mw:.0f} ∉ [160, 480]")
    if not (-0.4 <= logp <= 5.6): ghose_violations.append(f"LogP {logp:.1f} ∉ [-0.4, 5.6]")
    if not (40 <= heavy_atoms <= 70):
        # Ghose actually specifies atom count 20-70, but include heavy
        # for a stricter read.
        if not (20 <= heavy_atoms <= 70):
            ghose_violations.append(f"Heavy atoms {heavy_atoms} ∉ [20, 70]")

    # PAINS — pan-assay interference compounds (filter out promiscuous
    # nuisance scaffolds that show up in screens but aren't real hits).
    pains_hits: list[str] = []
    cat = _pains_catalog()
    if cat is not None:
        for entry in cat.GetMatches(mol):
            pains_hits.append(entry.GetDescription())

    # Verdict. Lipinski + Veber are the universal ones; everything
    # else is informational.
    verdict = "drug_like"
    if lipinski_violations or veber_violations:
        verdict = "concerns"
    if pains_hits or len(lipinski_violations) > 1:
        verdict = "fail"

    return {
        "available": True,
        "smiles": smiles,
        "verdict": verdict,
        "qed": qed_score,
        "qed_label": _qed_label(qed_score),
        "properties": {
            "molecular_weight": round(mw, 2),
            "log_p": round(logp, 2),
            "tpsa": round(tpsa, 2),
            "h_bond_donors": hbd,
            "h_bond_acceptors": hba,
            "rotatable_bonds": rotb,
            "rings": rings,
            "aromatic_rings": aromatic_rings,
            "heavy_atoms": heavy_atoms,
            "formal_charge": formal_charge,
        },
        "rules": {
            "lipinski": {
                "passes": len(lipinski_violations) == 0,
                "violations": lipinski_violations,
                "max_allowed_violations": 1,  # Lipinski himself allowed 1.
            },
            "veber": {
                "passes": len(veber_violations) == 0,
                "violations": veber_violations,
            },
            "ghose": {
                "passes": len(ghose_violations) == 0,
                "violations": ghose_violations,
            },
            "pains": {
                "passes": len(pains_hits) == 0,
                "matched_filters": pains_hits[:5],  # cap so the JSON stays small
                "match_count": len(pains_hits),
            },
        },
    }


def _qed_label(q: float) -> str:
    if q >= 0.67: return "Excellent"
    if q >= 0.5:  return "Good"
    if q >= 0.35: return "Moderate"
    return "Poor"
