"""Pose analysis: redocking RMSD, protein–ligand interactions, 2D diagram.

RMSD
    Heavy-atom RMSD between a docked pose and the co-crystallised ligand,
    both in the receptor frame (no superposition — that is the redocking
    convention). Atom correspondence is solved per element with the
    Hungarian algorithm (scipy.optimize.linear_sum_assignment), which
    handles symmetric groups and differing atom order between the PubChem
    ligand and the PDB HETATM record (the "Hungarian RMSD" of spyrmsd /
    DockRMSD-style tools). < 2 Å is the conventional success threshold.

Interactions (geometry, PLIP-like thresholds)
    hydrogen bond   donor–acceptor heavy atoms 2.5–3.5 Å (ligand donors
                    must carry a polar H, and the D–H···A angle ≥ 120°)
    hydrophobic     ligand C (bonded only to C/H) – protein side-chain C
                    of hydrophobic residues ≤ 4.0 Å, closest per residue
    π-stacking      ring centroids ≤ 5.5 Å; parallel (< 30°, offset ≤ 2 Å)
                    or T-shaped (60–90°)
    salt bridge     charged group centroids of opposite sign ≤ 5.5 Å
    metal           ligand N/O/S – metal ion ≤ 2.8 Å
    Ligand chemistry (bond orders, charges, aromaticity) comes from
    Open Babel's conversion of the pose to SDF, read with RDKit; atom
    order is preserved, so indices match the PDBQT pose.
"""
from __future__ import annotations

import math
import os
import subprocess
import tempfile
from typing import Optional

import numpy as np

from api.prep import METALS, _first_model

# ---------------------------------------------------------------------------
# PDBQT helpers
# ---------------------------------------------------------------------------


def split_models(pdbqt_text: str) -> list[str]:
    """Multi-model Vina output → list of per-pose PDBQT blocks."""
    models, cur, inside = [], [], False
    for line in pdbqt_text.splitlines(keepends=True):
        if line.startswith("MODEL"):
            cur, inside = [], True
        elif line.startswith("ENDMDL"):
            models.append("".join(cur))
            inside = False
        elif inside:
            cur.append(line)
    if not models and pdbqt_text.strip():
        models = [pdbqt_text]
    return models


def pdbqt_atoms(block: str) -> list[dict]:
    out = []
    for l in block.splitlines():
        if l.startswith(("ATOM", "HETATM")):
            adtype = l[77:79].strip() if len(l) >= 78 else ""
            el = {"A": "C", "OA": "O", "NA": "N", "SA": "S", "HD": "H", "HS": "H"}.get(adtype, adtype[:1] if adtype else l[12:14].strip()[:1])
            if adtype in ("Cl", "CL"):
                el = "Cl"
            elif adtype in ("Br", "BR"):
                el = "Br"
            out.append({"name": l[12:16].strip(), "element": el.capitalize(), "adtype": adtype,
                        "xyz": (float(l[30:38]), float(l[38:46]), float(l[46:54]))})
    return out


def pdbqt_block_to_pdb(block: str, resname: str = "LIG", chain: str = "L") -> str:
    lines = []
    for i, a in enumerate(pdbqt_atoms(block), start=1):
        x, y, z = a["xyz"]
        lines.append(f"HETATM{i:5d} {a['name'][:4]:<4} {resname:>3} {chain}   1    "
                     f"{x:8.3f}{y:8.3f}{z:8.3f}  1.00  0.00          {a['element']:>2}")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# RMSD
# ---------------------------------------------------------------------------


def hungarian_rmsd(pose: list[tuple[str, tuple]], ref: list[tuple[str, tuple]]) -> Optional[float]:
    """Element-matched minimum-assignment heavy-atom RMSD (no fitting)."""
    from scipy.optimize import linear_sum_assignment

    def heavy(atoms):
        return [(e.capitalize(), np.array(x, dtype=float)) for e, x in atoms if e.upper() not in ("H", "D")]

    p, r = heavy(pose), heavy(ref)
    if not p or len(p) != len(r):
        return None
    total = 0.0
    for el in {e for e, _ in p}:
        pc = np.array([x for e, x in p if e == el])
        rc = np.array([x for e, x in r if e == el])
        if len(pc) != len(rc):
            return None
        d2 = ((pc[:, None, :] - rc[None, :, :]) ** 2).sum(-1)
        rows, cols = linear_sum_assignment(d2)
        total += d2[rows, cols].sum()
    return round(math.sqrt(total / len(p)), 3)


def reference_atoms(hetatm_lines: list[str]) -> list[tuple[str, tuple]]:
    out = []
    for l in hetatm_lines:
        el = (l[76:78].strip() or l[12:14].strip()[:1]).capitalize()
        out.append((el, (float(l[30:38]), float(l[38:46]), float(l[46:54]))))
    return out


def pose_rmsds(pdbqt_text: str, ref_lines: list[str]) -> list[Optional[float]]:
    ref = reference_atoms(ref_lines)
    out = []
    for block in split_models(pdbqt_text):
        atoms = [(a["element"], a["xyz"]) for a in pdbqt_atoms(block)]
        out.append(hungarian_rmsd(atoms, ref))
    return out


# ---------------------------------------------------------------------------
# Protein features
# ---------------------------------------------------------------------------

_PROT_DONORS = {("*", "N"), ("ARG", "NE"), ("ARG", "NH1"), ("ARG", "NH2"), ("ASN", "ND2"),
                ("GLN", "NE2"), ("HIS", "ND1"), ("HIS", "NE2"), ("LYS", "NZ"), ("SER", "OG"),
                ("THR", "OG1"), ("TYR", "OH"), ("TRP", "NE1"), ("CYS", "SG")}
_PROT_ACCEPTORS = {("*", "O"), ("*", "OXT"), ("ASP", "OD1"), ("ASP", "OD2"), ("GLU", "OE1"),
                   ("GLU", "OE2"), ("ASN", "OD1"), ("GLN", "OE1"), ("HIS", "ND1"), ("HIS", "NE2"),
                   ("SER", "OG"), ("THR", "OG1"), ("TYR", "OH"), ("MET", "SD")}
_HYDROPHOBIC_C = {
    "ALA": {"CB"}, "VAL": {"CB", "CG1", "CG2"}, "LEU": {"CB", "CG", "CD1", "CD2"},
    "ILE": {"CB", "CG1", "CG2", "CD1"}, "MET": {"CB", "CG", "CE"}, "PRO": {"CB", "CG"},
    "PHE": {"CB", "CG", "CD1", "CD2", "CE1", "CE2", "CZ"}, "TYR": {"CB", "CG", "CD1", "CD2", "CE1", "CE2"},
    "TRP": {"CB", "CG", "CD2", "CE3", "CZ2", "CZ3", "CH2"}, "THR": {"CG2"}, "LYS": {"CB", "CG", "CD"},
    "ARG": {"CB", "CG"}, "GLU": {"CB", "CG"}, "GLN": {"CB", "CG"}, "CYS": {"CB"},
}
_RINGS = {"PHE": [("CG", "CD1", "CD2", "CE1", "CE2", "CZ")], "TYR": [("CG", "CD1", "CD2", "CE1", "CE2", "CZ")],
          "TRP": [("CD2", "CE2", "CE3", "CZ2", "CZ3", "CH2"), ("CG", "CD1", "NE1", "CE2", "CD2")],
          "HIS": [("CG", "ND1", "CD2", "CE1", "NE2")]}
_POS = {"LYS": ("NZ",), "ARG": ("NE", "NH1", "NH2"), "HIS": ("ND1", "NE2")}
_NEG = {"ASP": ("OD1", "OD2"), "GLU": ("OE1", "OE2")}


def protein_atoms(pdb_text: str) -> list[dict]:
    out = []
    for l in _first_model(pdb_text.splitlines()):
        if not l.startswith(("ATOM", "HETATM")):
            continue
        el = (l[76:78].strip() or l[12:14].strip()[:1]).upper()
        if el in ("H", "D"):
            continue
        out.append({"res": l[17:20].strip(), "chain": l[21], "seq": l[22:27].strip(),
                    "name": l[12:16].strip(), "element": el,
                    "xyz": np.array((float(l[30:38]), float(l[38:46]), float(l[46:54])))})
    return out


def _resid(a: dict) -> str:
    return f"{a['res']}{a['seq']}{a['chain']}"


def _ring_geom(coords: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    c = coords.mean(axis=0)
    _, _, vt = np.linalg.svd(coords - c)
    return c, vt[2] / np.linalg.norm(vt[2])


def _protein_groups(patoms: list[dict], near: set[int]):
    by_res: dict[str, dict[str, dict]] = {}
    for i in near:
        a = patoms[i]
        by_res.setdefault(_resid(a), {})[a["name"]] = a
    rings, pos, neg = [], [], []
    for rid, names in by_res.items():
        res = next(iter(names.values()))["res"]
        for ring in _RINGS.get(res, []):
            if all(n in names for n in ring):
                c, n = _ring_geom(np.array([names[x]["xyz"] for x in ring]))
                rings.append({"res": rid, "center": c, "normal": n})
        for table, out in ((_POS, pos), (_NEG, neg)):
            if res in table and any(n in names for n in table[res]):
                pts = [names[n]["xyz"] for n in table[res] if n in names]
                out.append({"res": rid, "center": np.mean(pts, axis=0)})
    return rings, pos, neg


# ---------------------------------------------------------------------------
# Ligand chemistry via Open Babel → RDKit
# ---------------------------------------------------------------------------


def pose_to_rdkit(block: str):
    """PDBQT pose → RDKit Mol (Hs kept, atom order = PDBQT order)."""
    from rdkit import Chem, RDLogger

    RDLogger.DisableLog("rdApp.*")  # valence warnings are handled below

    with tempfile.TemporaryDirectory() as d:
        src, dst = os.path.join(d, "pose.pdbqt"), os.path.join(d, "pose.sdf")
        with open(src, "w") as f:
            f.write(block)
        try:
            subprocess.run(["obabel", src, "-O", dst], capture_output=True, text=True, timeout=60)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass
        mol = None
        if os.path.exists(dst) and os.path.getsize(dst) > 0:
            mol = Chem.MolFromMolFile(dst, removeHs=False, sanitize=True)
            if mol is None:
                mol = _sanitize_charged(Chem.MolFromMolFile(dst, removeHs=False, sanitize=False))
        if mol is None:
            mol = Chem.MolFromPDBBlock(pdbqt_block_to_pdb(block), removeHs=False, proximityBonding=True)
    return mol


def _sanitize_charged(mol):
    """Open Babel writes protonated amines (4-valent N) without the +1
    formal charge; RDKit then refuses to sanitise. Assign the charge and
    retry so aromaticity / ring perception still work."""
    from rdkit import Chem

    if mol is None:
        return None
    mol.UpdatePropertyCache(strict=False)
    for a in mol.GetAtoms():
        valence = sum(b.GetBondTypeAsDouble() for b in a.GetBonds())
        if a.GetSymbol() == "N" and a.GetFormalCharge() == 0 and valence >= 4:
            a.SetFormalCharge(1)
    try:
        Chem.SanitizeMol(mol)
    except Exception:
        try:
            Chem.SanitizeMol(mol, Chem.SanitizeFlags.SANITIZE_ALL ^ Chem.SanitizeFlags.SANITIZE_PROPERTIES)
        except Exception:
            pass
    return mol


def _ligand_features(mol) -> dict:
    from rdkit import Chem

    donors, acceptors, hydrophobic, pos, neg = [], [], [], [], []
    for a in mol.GetAtoms():
        i, el = a.GetIdx(), a.GetSymbol()
        nbrs = [n.GetSymbol() for n in a.GetNeighbors()]
        if el in ("N", "O") and "H" in nbrs:
            donors.append(i)
        charge = a.GetFormalCharge()
        if el == "O" and charge <= 0:
            acceptors.append(i)
        elif el == "N" and charge <= 0 and "H" not in nbrs:
            deg = a.GetDegree()
            if (a.GetIsAromatic() and deg == 2) or (not a.GetIsAromatic() and deg <= 2):
                acceptors.append(i)          # pyridine-type N, imine, nitrile
            elif deg == 3 and a.GetHybridization() == Chem.HybridizationType.SP3:
                acceptors.append(i)          # tertiary amine
        if el == "C" and all(n in ("C", "H") for n in nbrs):
            hydrophobic.append(i)
        if a.GetFormalCharge() > 0 and el == "N":
            pos.append([i])
        if a.GetFormalCharge() < 0 and el == "O":
            neg.append([i])
    # Carboxylic acids / amidines without formal charges (pH handling in
    # Open Babel is not always applied to docked poses): treat COOH as
    # negative and amidine/guanidine as positive.
    patt_acid = Chem.MolFromSmarts("[CX3](=O)[OX1H0-,OX2H1]")
    patt_amid = Chem.MolFromSmarts("[NX3][CX3]=[NX2,NX3+]")
    for m in mol.GetSubstructMatches(patt_acid):
        grp = [m[1], m[2]]
        if not any(set(grp) & set(g) for g in neg):
            neg.append(grp)
    for m in mol.GetSubstructMatches(patt_amid):
        grp = [m[0], m[2]]
        if not any(set(grp) & set(g) for g in pos):
            pos.append(grp)
    rings = []
    ri = mol.GetRingInfo()
    for ring in ri.AtomRings():
        if all(mol.GetAtomWithIdx(i).GetIsAromatic() for i in ring):
            rings.append(list(ring))
    return {"donors": donors, "acceptors": sorted(set(acceptors)), "hydrophobic": hydrophobic,
            "pos": pos, "neg": neg, "rings": rings}


def _angle(a, b, c) -> float:
    v1, v2 = a - b, c - b
    cosang = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9)
    return math.degrees(math.acos(max(-1.0, min(1.0, cosang))))


def analyze_pose(block: str, receptor_pdb: str) -> dict:
    """Interactions between one pose and the receptor."""
    from scipy.spatial import cKDTree

    mol = pose_to_rdkit(block)
    if mol is None:
        return {"error": "could not read pose", "interactions": [], "residues": []}
    conf = mol.GetConformer()
    lxyz = np.array([[conf.GetAtomPosition(i).x, conf.GetAtomPosition(i).y, conf.GetAtomPosition(i).z]
                     for i in range(mol.GetNumAtoms())])
    feats = _ligand_features(mol)
    patoms = protein_atoms(receptor_pdb)
    if not patoms:
        return {"error": "empty receptor", "interactions": [], "residues": []}
    pxyz = np.array([a["xyz"] for a in patoms])
    tree = cKDTree(pxyz)
    near = set(j for lst in tree.query_ball_point(lxyz, r=7.0) for j in lst)

    inter: list[dict] = []

    def add(kind, i_lig, pa_res, dist, **kw):
        inter.append({"type": kind, "ligand_atoms": i_lig if isinstance(i_lig, list) else [int(i_lig)],
                      "residue": pa_res, "distance": round(float(dist), 2), **kw})

    # Hydrogen bonds
    for i in sorted(set(feats["donors"]) | set(feats["acceptors"])):
        el_is_donor = i in feats["donors"]
        el_is_acc = i in feats["acceptors"]
        for j in tree.query_ball_point(lxyz[i], r=3.5):
            pa = patoms[j]
            key_generic = ("*", pa["name"]) if pa["name"] in ("N", "O", "OXT") else None
            p_donor = (pa["res"], pa["name"]) in _PROT_DONORS or (key_generic in _PROT_DONORS and not (pa["res"] == "PRO" and pa["name"] == "N"))
            p_acc = (pa["res"], pa["name"]) in _PROT_ACCEPTORS or key_generic in _PROT_ACCEPTORS
            d = float(np.linalg.norm(lxyz[i] - pxyz[j]))
            if d < 2.5:
                continue
            if el_is_donor and p_acc:
                hs = [n.GetIdx() for n in mol.GetAtomWithIdx(i).GetNeighbors() if n.GetSymbol() == "H"]
                if any(_angle(lxyz[i], lxyz[h], pxyz[j]) >= 120 for h in hs):
                    add("hbond", i, _resid(pa), d, ligand_role="donor", protein_atom=pa["name"])
                    continue
            if el_is_acc and p_donor:
                add("hbond", i, _resid(pa), d, ligand_role="acceptor", protein_atom=pa["name"])

    # Hydrophobic contacts — closest pair per residue
    best: dict[str, tuple] = {}
    for i in feats["hydrophobic"]:
        for j in tree.query_ball_point(lxyz[i], r=4.0):
            pa = patoms[j]
            if pa["element"] != "C" or pa["name"] not in _HYDROPHOBIC_C.get(pa["res"], set()):
                continue
            d = float(np.linalg.norm(lxyz[i] - pxyz[j]))
            rid = _resid(pa)
            if rid not in best or d < best[rid][1]:
                best[rid] = (i, d, pa["name"])
    for rid, (i, d, nm) in best.items():
        add("hydrophobic", i, rid, d, protein_atom=nm)

    rings, ppos, pneg = _protein_groups(patoms, near)

    # π-stacking
    for ring in feats["rings"]:
        c, n = _ring_geom(lxyz[ring])
        for pr in rings:
            d = float(np.linalg.norm(c - pr["center"]))
            if d > 5.5:
                continue
            ang = math.degrees(math.acos(min(1.0, abs(float(np.dot(n, pr["normal"]))))))
            offset = float(np.linalg.norm((pr["center"] - c) - np.dot(pr["center"] - c, n) * n))
            if ang < 30 and offset <= 2.0:
                add("pi_stacking", list(ring), pr["res"], d, geometry="parallel", angle=round(ang, 1))
            elif 60 <= ang <= 90:
                add("pi_stacking", list(ring), pr["res"], d, geometry="T-shaped", angle=round(ang, 1))

    # Salt bridges
    for lgroups, pgroups in ((feats["pos"], pneg), (feats["neg"], ppos)):
        for grp in lgroups:
            c = lxyz[grp].mean(axis=0)
            for pg in pgroups:
                d = float(np.linalg.norm(c - pg["center"]))
                if d <= 5.5:
                    add("salt_bridge", list(grp), pg["res"], d)

    # Metal coordination
    for i, a in enumerate(mol.GetAtoms()):
        if a.GetSymbol() not in ("N", "O", "S"):
            continue
        for j in tree.query_ball_point(lxyz[i], r=2.8):
            if patoms[j]["res"] in METALS:
                add("metal", i, _resid(patoms[j]), float(np.linalg.norm(lxyz[i] - pxyz[j])))

    # Residue summary table
    table: dict[str, dict] = {}
    for it in inter:
        row = table.setdefault(it["residue"], {"residue": it["residue"], "hbond": 0, "hydrophobic": 0,
                                               "pi_stacking": 0, "salt_bridge": 0, "metal": 0,
                                               "min_distance": it["distance"]})
        row[it["type"]] += 1
        row["min_distance"] = min(row["min_distance"], it["distance"])
    residues = sorted(table.values(), key=lambda r: (-(r["hbond"] * 3 + r["salt_bridge"] * 3 + r["pi_stacking"] * 2 + r["hydrophobic"]), r["min_distance"]))
    counts = {k: sum(1 for it in inter if it["type"] == k) for k in ("hbond", "hydrophobic", "pi_stacking", "salt_bridge", "metal")}
    return {"interactions": inter, "residues": residues, "counts": counts,
            "n_ligand_atoms": mol.GetNumAtoms()}


# ---------------------------------------------------------------------------
# 2D interaction diagram (SVG)
# ---------------------------------------------------------------------------

_COLORS = {"hbond": "#2563eb", "hydrophobic": "#9a6b00", "pi_stacking": "#16a34a",
           "salt_bridge": "#dc2626", "metal": "#7c3aed"}
_LABELS = {"hbond": "H-bond", "hydrophobic": "Hydrophobic", "pi_stacking": "π-stacking",
           "salt_bridge": "Salt bridge", "metal": "Metal"}


def interaction_svg(block: str, analysis: dict, size: int = 640) -> str:
    """LigPlot-style 2D map: ligand depiction (RDKit) with interacting
    residues placed radially around it and dashed lines to the ligand
    atoms they touch, coloured by interaction type."""
    from rdkit import Chem
    from rdkit.Chem import rdDepictor
    from rdkit.Chem.Draw import rdMolDraw2D

    mol = pose_to_rdkit(block)
    if mol is None:
        return ""
    for a in mol.GetAtoms():
        a.SetIntProp("orig", a.GetIdx())
    try:
        heavy = Chem.RemoveHs(mol, sanitize=False)
    except Exception:
        heavy = mol
    orig_to_new = {a.GetIntProp("orig"): a.GetIdx() for a in heavy.GetAtoms()}
    # Map H atoms onto their heavy neighbour.
    for a in mol.GetAtoms():
        if a.GetSymbol() == "H" and a.GetIdx() not in orig_to_new and a.GetNeighbors():
            orig_to_new[a.GetIdx()] = orig_to_new.get(a.GetNeighbors()[0].GetIdx(), 0)
    heavy = Chem.Mol(heavy)
    heavy.RemoveAllConformers()
    rdDepictor.Compute2DCoords(heavy)

    # Group interactions by residue (one label per residue, several lines).
    per_res: dict[str, list[tuple[str, int]]] = {}
    for it in analysis.get("interactions", []):
        atoms = [orig_to_new.get(i) for i in it["ligand_atoms"]]
        atoms = [a for a in atoms if a is not None]
        if not atoms:
            continue
        per_res.setdefault(it["residue"], []).append((it["type"], atoms[0]))

    drawer = rdMolDraw2D.MolDraw2DSVG(size, size)
    opts = drawer.drawOptions()
    opts.padding = 0.28
    opts.clearBackground = True
    opts.bondLineWidth = 2
    highlight = sorted({a for v in per_res.values() for _, a in v})
    colors = {}
    for res, lst in per_res.items():
        for kind, a in lst:
            colors.setdefault(a, tuple(int(_COLORS[kind][k:k + 2], 16) / 255 for k in (1, 3, 5)) + (0.35,))
    drawer.DrawMolecule(heavy, highlightAtoms=highlight, highlightAtomColors=colors, highlightBonds=[])
    pts = {i: drawer.GetDrawCoords(i) for i in range(heavy.GetNumAtoms())}
    drawer.FinishDrawing()
    svg = drawer.GetDrawingText()

    cx = sum(p.x for p in pts.values()) / max(1, len(pts))
    cy = sum(p.y for p in pts.values()) / max(1, len(pts))
    radius = max(max(math.hypot(p.x - cx, p.y - cy) for p in pts.values()) + 55, size * 0.36) if pts else size * 0.4
    radius = min(radius, size / 2 - 40)
    # Angles from the centroid to each residue's first contact atom, then
    # spread so labels never overlap (min gap 360/n, capped at 24°).
    items = []
    for res, lst in per_res.items():
        p = pts[lst[0][1]]
        items.append([math.atan2(p.y - cy, p.x - cx), res, lst])
    items.sort()
    if items:
        gap = min(math.radians(24), 2 * math.pi / len(items))
        for k in range(1, len(items)):
            if items[k][0] - items[k - 1][0] < gap:
                items[k][0] = items[k - 1][0] + gap
        overflow = items[-1][0] - (items[0][0] + 2 * math.pi - gap)
        if overflow > 0:
            for k, it in enumerate(items):
                it[0] -= overflow * k / max(1, len(items) - 1)
    extra = []
    for ang, res, lst in items:
        lx, ly = cx + radius * math.cos(ang), cy + radius * math.sin(ang)
        for kind, a in lst:
            p = pts[a]
            extra.append(f'<line x1="{p.x:.1f}" y1="{p.y:.1f}" x2="{lx:.1f}" y2="{ly:.1f}" '
                         f'stroke="{_COLORS[kind]}" stroke-width="1.6" stroke-dasharray="4 3" opacity="0.9"/>')
        kinds = sorted({k for k, _ in lst})
        col = _COLORS[kinds[0]]
        w = 8 + 7.2 * len(res)
        extra.append(f'<rect x="{lx - w / 2:.1f}" y="{ly - 11:.1f}" width="{w:.1f}" height="22" rx="11" '
                     f'fill="#ffffff" stroke="{col}" stroke-width="1.6"/>')
        extra.append(f'<text x="{lx:.1f}" y="{ly + 4:.1f}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" '
                     f'font-size="12" fill="#111">{res}</text>')
    used = sorted({k for v in per_res.values() for k, _ in v})
    for n, kind in enumerate(used):
        y = size - 14 - 16 * (len(used) - 1 - n)
        extra.append(f'<line x1="10" y1="{y - 4}" x2="30" y2="{y - 4}" stroke="{_COLORS[kind]}" stroke-width="2" stroke-dasharray="4 3"/>'
                     f'<text x="36" y="{y}" font-family="Helvetica,Arial,sans-serif" font-size="11" fill="#333">{_LABELS[kind]}</text>')
    return svg.replace("</svg>", "\n".join(extra) + "\n</svg>")
