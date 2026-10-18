"""Protein and ligand preparation.

Protein:  fetch by PDB ID (RCSB) or UniProt accession (AlphaFold DB) →
          first model, first alt-loc, chosen chains, waters removed,
          hetero groups removed except an explicit keep-list (metals,
          cofactors) → hydrogens for the chosen pH and Gasteiger charges
          via Open Babel (-xr -p <pH>) → rigid receptor PDBQT.

          The previous pipeline ran `obabel -xr` *without* hydrogens, so
          the receptor PDBQT had no polar H and Vina saw no H-bond donors
          on the protein. Fixed here.

Ligand:   PubChem CID (3D SDF; falls back to SMILES + RDKit ETKDG when
          PubChem has no 3D conformer), SMILES, or an uploaded SDF/MOL
          record → protonated for the pH → PDBQT.
"""
from __future__ import annotations

import os
import re
import subprocess
from functools import lru_cache
from typing import Iterable, Optional

import httpx

WATER = {"HOH", "WAT", "DOD", "H2O"}
# Crystallisation additives that are almost never the ligand of interest.
ADDITIVES = {"SO4", "PO4", "GOL", "EDO", "ACT", "PEG", "DMS", "CL", "NA", "K", "BME",
             "MPD", "IOD", "FMT", "TRS", "EPE", "MES", "NO3", "PG4", "1PE", "IPA", "BR"}
METALS = {"ZN", "MG", "MN", "CA", "FE", "FE2", "CU", "CO", "NI", "CD"}

PDB_ID_RE = re.compile(r"^[0-9][A-Za-z0-9]{3}$")
UNIPROT_RE = re.compile(r"^([OPQ][0-9][A-Z0-9]{3}[0-9]|[A-NR-Z][0-9]([A-Z][A-Z0-9]{2}[0-9]){1,2})$")


class PrepError(RuntimeError):
    pass


# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------

def is_pdb_id(s: str) -> bool:
    return bool(PDB_ID_RE.match((s or "").strip()))


def is_uniprot(s: str) -> bool:
    return bool(UNIPROT_RE.match((s or "").strip().upper()))


async def fetch_structure(identifier: str) -> tuple[str, dict]:
    """(pdb_text, source_info) for a PDB ID or UniProt accession."""
    ident = identifier.strip()
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        if is_pdb_id(ident):
            r = await client.get(f"https://files.rcsb.org/download/{ident.upper()}.pdb")
            if r.status_code == 404:
                raise PrepError(f"PDB entry {ident.upper()} not found (or only available as mmCIF)")
            r.raise_for_status()
            return r.text, {"source": "pdb", "id": ident.upper(),
                            "url": f"https://files.rcsb.org/download/{ident.upper()}.pdb"}
        acc = ident.upper().replace("AF-", "").split("-F")[0]
        if is_uniprot(acc):
            meta = await client.get(f"https://alphafold.ebi.ac.uk/api/prediction/{acc}")
            if meta.status_code != 200 or not meta.json():
                raise PrepError(f"No AlphaFold model for UniProt {acc}")
            entry = meta.json()[0]
            url = entry.get("pdbUrl")
            r = await client.get(url)
            r.raise_for_status()
            return r.text, {"source": "alphafold", "id": acc, "url": url,
                            "model_version": entry.get("latestVersion"),
                            "entry_id": entry.get("entryId")}
    raise PrepError("Enter a 4-character PDB ID or a UniProt accession")


# ---------------------------------------------------------------------------
# Parse / clean
# ---------------------------------------------------------------------------

def _first_model(lines: Iterable[str]) -> list[str]:
    out, in_model, seen_model = [], False, False
    for line in lines:
        if line.startswith("MODEL"):
            if seen_model:
                break
            in_model = seen_model = True
            continue
        if line.startswith("ENDMDL"):
            break
        out.append(line)
    return out


def list_chains(pdb_text: str) -> list[dict]:
    chains: dict[str, set] = {}
    for line in _first_model(pdb_text.splitlines()):
        if line.startswith("ATOM"):
            chains.setdefault(line[21], set()).add(line[22:27])
    return [{"chain": c, "residues": len(r)} for c, r in sorted(chains.items())]


def list_hetero_groups(pdb_text: str, include_additives: bool = False) -> list[dict]:
    """Non-water HETATM groups (candidate co-crystallised ligands)."""
    groups: dict[tuple, list] = {}
    for line in _first_model(pdb_text.splitlines()):
        if not line.startswith("HETATM"):
            continue
        res = line[17:20].strip()
        if res in WATER:
            continue
        if not include_additives and res in ADDITIVES:
            continue
        key = (res, line[21], line[22:26].strip())
        try:
            xyz = (float(line[30:38]), float(line[38:46]), float(line[46:54]))
        except ValueError:
            continue
        groups.setdefault(key, []).append(xyz)
    out = []
    for (res, chain, seq), coords in groups.items():
        n = len(coords)
        c = [round(sum(p[i] for p in coords) / n, 3) for i in range(3)]
        out.append({"resname": res, "chain": chain, "resseq": seq, "n_atoms": n,
                    "center": c, "metal": res in METALS,
                    "label": f"{res} {chain}{seq}"})
    out.sort(key=lambda g: (g["metal"], -g["n_atoms"]))
    return out


def extract_hetero(pdb_text: str, resname: str, chain: Optional[str] = None,
                   resseq: Optional[str] = None) -> list[str]:
    """HETATM lines of one ligand instance (first match)."""
    resname = resname.strip().upper()
    lines = [l for l in _first_model(pdb_text.splitlines())
             if l.startswith("HETATM") and l[17:20].strip() == resname
             and (not chain or l[21] == chain) and (not resseq or l[22:26].strip() == str(resseq))]
    if not lines:
        return []
    # Keep a single instance (first chain/resseq encountered).
    c0, s0 = lines[0][21], lines[0][22:26]
    first = [l for l in lines if l[21] == c0 and l[22:26] == s0]
    # First alt-loc only.
    return [l for l in first if l[16] in (" ", "A")]


def clean_protein(pdb_text: str, chains: Optional[list[str]] = None,
                  keep_hetero: Optional[list[str]] = None) -> tuple[str, dict]:
    """Return (clean_pdb_text, report)."""
    keep = {k.strip().upper() for k in (keep_hetero or []) if k.strip()}
    chains_set = {c.strip() for c in (chains or []) if c.strip()}
    out, removed_het, removed_water, altlocs = [], {}, 0, 0
    kept_chains = set()
    for line in _first_model(pdb_text.splitlines()):
        rec = line[:6]
        if rec not in ("ATOM  ", "HETATM"):
            continue
        chain = line[21] if len(line) > 21 else " "
        if chains_set and chain not in chains_set:
            continue
        if line[16] not in (" ", "A"):
            altlocs += 1
            continue
        res = line[17:20].strip()
        if rec == "HETATM":
            if res in WATER:
                removed_water += 1
                continue
            if res not in keep:
                removed_het[res] = removed_het.get(res, 0) + 1
                continue
        # Clear the alt-loc flag so downstream tools don't choke.
        line = line[:16] + " " + line[17:]
        out.append(line.rstrip("\n"))
        kept_chains.add(chain)
    if not any(l.startswith("ATOM") for l in out):
        raise PrepError("No protein atoms left after chain selection")
    out.append("END")
    report = {
        "chains": sorted(kept_chains),
        "waters_removed": removed_water,
        "hetero_removed": sorted(removed_het),
        "hetero_kept": sorted(keep),
        "altlocs_dropped": altlocs,
        "atoms": sum(1 for l in out if l.startswith(("ATOM", "HETATM"))),
    }
    return "\n".join(out) + "\n", report


# ---------------------------------------------------------------------------
# Tools / versions
# ---------------------------------------------------------------------------

def _run(cmd: list[str], timeout: int = 300) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


@lru_cache(maxsize=1)
def obabel_version() -> str:
    try:
        out = _run(["obabel", "-V"], timeout=10).stdout.strip()
        return out.split(" -- ")[0] or "unknown"
    except Exception:
        return "unavailable"


@lru_cache(maxsize=1)
def rdkit_version() -> str:
    try:
        import rdkit
        return rdkit.__version__
    except Exception:
        return "unavailable"


def protonate_receptor(clean_pdb_path: str, out_pdbqt: str, ph: float = 7.4) -> dict:
    """Clean PDB → PDBQT with pH-dependent hydrogens + Gasteiger charges."""
    r = _run(["obabel", clean_pdb_path, "-xr", "-p", f"{ph:.1f}", "-O", out_pdbqt])
    if not os.path.exists(out_pdbqt) or os.path.getsize(out_pdbqt) == 0:
        raise PrepError(f"Open Babel could not prepare the receptor: {r.stderr.strip()[:300]}")
    n_hd = sum(1 for l in open(out_pdbqt) if l.startswith(("ATOM", "HETATM")) and l[77:79].strip() == "HD")
    return {"tool": f"Open Babel {obabel_version()}", "ph": ph, "charges": "Gasteiger",
            "hydrogens": "polar (non-polar merged)", "polar_h": n_hd}


# ---------------------------------------------------------------------------
# Ligands
# ---------------------------------------------------------------------------

def sdf_has_3d(sdf_text: str) -> bool:
    lines = sdf_text.splitlines()
    if len(lines) < 4:
        return False
    try:
        n = int(lines[3][:3])
    except ValueError:
        return False
    zs = []
    for l in lines[4:4 + n]:
        try:
            zs.append(float(l[20:30]))
        except ValueError:
            pass
    return any(abs(z) > 1e-4 for z in zs)


def smiles_to_sdf(smiles: str, seed: int = 42, name: str = "") -> str:
    """RDKit ETKDGv3 conformer + MMFF94 relaxation → SDF text (with H)."""
    from rdkit import Chem
    from rdkit.Chem import AllChem

    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise PrepError(f"Invalid SMILES: {smiles[:80]}")
    if mol.GetNumHeavyAtoms() > 150:
        raise PrepError("Ligand too large (>150 heavy atoms)")
    mol = Chem.AddHs(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = int(seed) & 0x7FFFFFFF
    if AllChem.EmbedMolecule(mol, params) != 0:
        params.useRandomCoords = True
        if AllChem.EmbedMolecule(mol, params) != 0:
            raise PrepError("Could not generate 3D coordinates for the SMILES")
    try:
        AllChem.MMFFOptimizeMolecule(mol, maxIters=500)
    except Exception:
        pass
    if name:
        mol.SetProp("_Name", name)
    return Chem.MolToMolBlock(mol) + "$$$$\n"


def sdf_record_to_3d(sdf_text: str, seed: int = 42) -> str:
    """Uploaded record: keep if 3D, otherwise embed via its SMILES."""
    if sdf_has_3d(sdf_text):
        return sdf_text if sdf_text.rstrip().endswith("$$$$") else sdf_text.rstrip() + "\n$$$$\n"
    from rdkit import Chem
    mol = Chem.MolFromMolBlock(sdf_text)
    if mol is None:
        raise PrepError("Could not read SDF record")
    return smiles_to_sdf(Chem.MolToSmiles(mol), seed=seed, name=mol.GetProp("_Name") if mol.HasProp("_Name") else "")


def ligand_to_pdbqt(sdf_path: str, out_pdbqt: str, ph: Optional[float] = 7.4) -> dict:
    cmd = ["obabel", sdf_path, "-O", out_pdbqt]
    if ph is not None:
        cmd[2:2] = ["-p", f"{ph:.1f}"]
    r = _run(cmd, timeout=120)
    if not os.path.exists(out_pdbqt) or os.path.getsize(out_pdbqt) == 0:
        raise PrepError(f"Could not convert ligand to PDBQT: {r.stderr.strip()[:300]}")
    torsions = 0
    for line in open(out_pdbqt):
        m = re.search(r"(\d+) active torsions", line)
        if m:
            torsions = int(m.group(1))
            break
    return {"tool": f"Open Babel {obabel_version()}", "ph": ph, "charges": "Gasteiger",
            "active_torsions": torsions}


def parse_ligand_library(text: str, max_n: int) -> list[dict]:
    """SMILES list ("SMILES [name]" per line, optional CSV header) or a
    multi-record SDF → [{name, smiles?, sdf?}]. Invalid entries are kept
    with an `error` so the user sees which rows were skipped."""
    text = (text or "").rstrip()
    if not text.strip():
        return []
    items: list[dict] = []
    if "$$$$" in text or "M  END" in text:
        from rdkit import Chem
        records = []
        for chunk in text.replace("\r\n", "\n").split("$$$$"):
            if not chunk.strip():
                continue
            # Drop only the newline that followed "$$$$" — the first line of
            # a molfile is the title and may legitimately be blank.
            records.append(chunk[1:] if chunk.startswith("\n") else chunk)
        for i, block in enumerate(records):
            if len(items) >= max_n:
                break
            mol = Chem.MolFromMolBlock(block)
            name = (block.splitlines()[0].strip() if block.splitlines() else "") or f"ligand_{i + 1}"
            if mol is None:
                items.append({"name": name, "error": "unreadable SDF record"})
                continue
            items.append({"name": name[:80], "smiles": Chem.MolToSmiles(mol), "sdf": block + "\n$$$$\n"})
        return items
    from rdkit import Chem
    for i, raw in enumerate(text.splitlines()):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        parts = re.split(r"[,\t ]+", line, maxsplit=1)
        smi = parts[0].strip().strip('"')
        name = (parts[1].strip().strip('"') if len(parts) > 1 else "") or f"ligand_{len(items) + 1}"
        if i == 0 and smi.lower() in ("smiles", "smi", "canonical_smiles"):
            continue
        if len(items) >= max_n:
            break
        mol = Chem.MolFromSmiles(smi)
        if mol is None:
            items.append({"name": name[:80], "smiles": smi, "error": "invalid SMILES"})
        else:
            items.append({"name": name[:80], "smiles": Chem.MolToSmiles(mol)})
    return items
