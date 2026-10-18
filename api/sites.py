"""Binding-site definition for the Vina search box.

Modes:
  ligand    — box around a co-crystallised ligand (resname[, chain, resseq])
  residues  — box around a residue list ("A:25, B:25" or "ASP25")
  pocket    — automatic pocket detection (grid buriedness, LIGSITE-style)
  manual    — explicit centre + size
  auto      — legacy behaviour: protein centroid, fixed 20 Å cube

Pocket detection: grid points (1 Å) that are 3–8 Å from the nearest
protein heavy atom are scored by buriedness — how many of 14 directions
(6 axes + 8 cube diagonals) hit protein within 10 Å. Points buried in
≥ 10/14 directions are clustered by 26-connectivity; clusters are ranked
by volume. It is a deliberately simple, dependency-light detector (numpy
+ scipy) and is honest about that in the UI; fpocket can replace it later.
"""
from __future__ import annotations

import re
from typing import Optional

import numpy as np

from api.prep import _first_model, extract_hetero

MIN_EDGE = 12.0


def _atoms(pdb_text: str, records=("ATOM",)) -> tuple[np.ndarray, list[tuple]]:
    coords, meta = [], []
    for l in _first_model(pdb_text.splitlines()):
        if not l.startswith(records):
            continue
        el = (l[76:78].strip() or l[12:14].strip()[:1]).upper()
        if el in ("H", "D"):
            continue
        try:
            coords.append((float(l[30:38]), float(l[38:46]), float(l[46:54])))
        except ValueError:
            continue
        meta.append((l[17:20].strip(), l[21], l[22:26].strip(), l[12:16].strip()))
    return np.array(coords, dtype=float).reshape(-1, 3), meta


def _box(coords: np.ndarray, padding: float, min_edge: float = MIN_EDGE, max_edge: Optional[float] = None) -> dict:
    lo, hi = coords.min(axis=0), coords.max(axis=0)
    center = (lo + hi) / 2
    size = np.maximum(hi - lo + 2 * padding, min_edge)
    if max_edge:
        size = np.minimum(size, max_edge)
    return {"center": [round(float(c), 3) for c in center], "size": [round(float(s), 1) for s in size]}


def site_from_ligand(pdb_text: str, resname: str, chain: Optional[str] = None,
                     resseq: Optional[str] = None, padding: float = 5.0,
                     max_edge: Optional[float] = None) -> dict:
    lines = extract_hetero(pdb_text, resname, chain, resseq)
    if not lines:
        raise ValueError(f"Ligand {resname} not found in the structure")
    coords = np.array([(float(l[30:38]), float(l[38:46]), float(l[46:54])) for l in lines])
    box = _box(coords, padding, max_edge=max_edge)
    box.update({"mode": "ligand", "ligand": {"resname": resname.upper(), "chain": lines[0][21],
                                             "resseq": lines[0][22:26].strip(), "n_atoms": len(lines)}})
    return box


_RES_RE = re.compile(r"^(?:([A-Za-z0-9]):)?([A-Za-z]{3})?(-?\d+)$")


def parse_residue_list(spec: str) -> list[tuple[Optional[str], Optional[str], str]]:
    out = []
    for tok in re.split(r"[,\s;]+", spec or ""):
        tok = tok.strip()
        if not tok:
            continue
        m = _RES_RE.match(tok)
        if not m:
            raise ValueError(f"Can't read residue '{tok}' (use A:25, ASP25 or A:ASP25)")
        out.append((m.group(1), (m.group(2) or "").upper() or None, m.group(3)))
    if not out:
        raise ValueError("No residues given")
    return out


def site_from_residues(pdb_text: str, spec: str, padding: float = 6.0,
                       max_edge: Optional[float] = None) -> dict:
    wanted = parse_residue_list(spec)
    coords, meta = _atoms(pdb_text)
    mask = np.zeros(len(meta), dtype=bool)
    found = set()
    for i, (res, chain, seq, _name) in enumerate(meta):
        for wc, wr, ws in wanted:
            if seq == ws and (wc is None or chain == wc) and (wr is None or res == wr):
                mask[i] = True
                found.add(f"{res}{seq}{chain}")
    if not mask.any():
        raise ValueError("None of those residues are in the structure")
    box = _box(coords[mask], padding, max_edge=max_edge)
    box.update({"mode": "residues", "residues": sorted(found)})
    return box


_DIRS = np.array([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
                  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
                  [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]], dtype=float)
_DIRS /= np.linalg.norm(_DIRS, axis=1)[:, None]


def detect_pockets(pdb_text: str, max_pockets: int = 5, spacing: float = 1.0,
                   min_buriedness: int = 10, ray_length: float = 10.0,
                   min_points: int = 20) -> list[dict]:
    from scipy import ndimage
    from scipy.spatial import cKDTree

    coords, meta = _atoms(pdb_text)
    if len(coords) < 50:
        return []
    tree = cKDTree(coords)
    lo = coords.min(axis=0) - 2
    hi = coords.max(axis=0) + 2
    axes = [np.arange(lo[i], hi[i] + spacing, spacing) for i in range(3)]
    shape = tuple(len(a) for a in axes)
    gx, gy, gz = np.meshgrid(*axes, indexing="ij")
    grid = np.stack([gx.ravel(), gy.ravel(), gz.ravel()], axis=1)

    dist, _ = tree.query(grid, k=1, distance_upper_bound=8.0)
    cand = np.where((dist >= 3.0) & (dist <= 8.0))[0]
    if len(cand) == 0:
        return []
    pts = grid[cand]
    steps = np.arange(1.5, ray_length + 0.01, 1.0)
    hits = np.zeros(len(pts), dtype=int)
    for d in _DIRS:
        hit_d = np.zeros(len(pts), dtype=bool)
        for s in steps:
            dd, _ = tree.query(pts + d * s, k=1, distance_upper_bound=1.8)
            hit_d |= np.isfinite(dd)
        hits += hit_d
    buried = cand[hits >= min_buriedness]
    if len(buried) == 0:
        return []
    mask = np.zeros(shape, dtype=bool)
    mask.ravel()[buried] = True
    labels, n = ndimage.label(mask, structure=np.ones((3, 3, 3)))
    bur_score = np.zeros(int(np.prod(shape)))
    bur_score[cand] = hits
    pockets = []
    for lab in range(1, n + 1):
        idx = np.flatnonzero(labels.ravel() == lab)
        if len(idx) < min_points:
            continue
        p = grid[idx]
        near = tree.query_ball_point(p, r=4.0)
        res = sorted({f"{meta[j][0]}{meta[j][2]}{meta[j][1]}" for lst in near for j in lst})
        box = _box(p, padding=4.0)
        pockets.append({
            "center": [round(float(c), 3) for c in p.mean(axis=0)],
            "size": box["size"],
            "volume_A3": round(float(len(idx) * spacing ** 3), 1),
            "buriedness": round(float(bur_score[idx].mean()) / len(_DIRS), 3),
            "residues": res,
            "n_points": int(len(idx)),
        })
    pockets.sort(key=lambda q: (-q["volume_A3"] * q["buriedness"]))
    for i, q in enumerate(pockets[:max_pockets]):
        q["rank"] = i + 1
        q["mode"] = "pocket"
    return pockets[:max_pockets]


def protein_center_box(pdb_text: str, edge: float = 20.0) -> dict:
    coords, _ = _atoms(pdb_text)
    c = coords.mean(axis=0) if len(coords) else np.zeros(3)
    return {"mode": "auto", "center": [round(float(x), 3) for x in c], "size": [edge] * 3}
