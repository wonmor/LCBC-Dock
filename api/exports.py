"""Result exports + reproducibility records.

Everything here is a pure function of a job row (dict from docking_jobs),
so it is easy to test and identical across the web, the app and the API.
"""
from __future__ import annotations

import csv
import gzip
import io
import json
import os
import subprocess
import tempfile
import zipfile
from typing import Optional

from api.analysis import pdbqt_atoms, pdbqt_block_to_pdb, split_models
from api.docking import parse_vina_output_text

SITE_URL = os.environ.get("PUBLIC_BASE_URL", "https://lcbc-client.apps.johnseong.com").rstrip("/")

VINA_CITATIONS = """@article{Eberhardt2021Vina,
  title   = {AutoDock Vina 1.2.0: New Docking Methods, Expanded Force Field, and Python Bindings},
  author  = {Eberhardt, Jerome and Santos-Martins, Diogo and Tillack, Andreas F. and Forli, Stefano},
  journal = {Journal of Chemical Information and Modeling},
  volume  = {61}, number = {8}, pages = {3891--3898}, year = {2021},
  doi     = {10.1021/acs.jcim.1c00203}
}

@article{Trott2010Vina,
  title   = {AutoDock Vina: Improving the speed and accuracy of docking with a new scoring function, efficient optimization, and multithreading},
  author  = {Trott, Oleg and Olson, Arthur J.},
  journal = {Journal of Computational Chemistry},
  volume  = {31}, number = {2}, pages = {455--461}, year = {2010},
  doi     = {10.1002/jcc.21334}
}

@article{OBoyle2011OpenBabel,
  title   = {Open Babel: An open chemical toolbox},
  author  = {O'Boyle, Noel M. and Banck, Michael and James, Craig A. and Morley, Chris and Vandermeersch, Tim and Hutchison, Geoffrey R.},
  journal = {Journal of Cheminformatics},
  volume  = {3}, pages = {33}, year = {2011},
  doi     = {10.1186/1758-2946-3-33}
}
"""


def _j(row: dict, key: str) -> dict:
    try:
        return json.loads(row.get(key) or "{}") or {}
    except (TypeError, ValueError):
        return {}


def receptor_pdb(row: dict) -> str:
    blob = row.get("receptor_pdb_gz")
    if not blob:
        return ""
    try:
        return gzip.decompress(blob).decode()
    except Exception:
        return ""


def poses(row: dict) -> list[dict]:
    return parse_vina_output_text(row.get("output_pdbqt") or "")


def result_url(row: dict) -> str:
    return f"{SITE_URL}/results/{row['job_id']}"


def ligand_label(row: dict) -> str:
    if row.get("ligand_cid"):
        return f"{row['ligand_name']} (PubChem CID {row['ligand_cid']})"
    return row.get("ligand_name") or "ligand"


def protein_label(row: dict) -> str:
    prep = _j(row, "prep_json")
    src = (prep.get("receptor") or {}).get("source") or {}
    if src.get("source") == "alphafold":
        return f"the AlphaFold model of UniProt {src.get('id')} (AlphaFold DB v{src.get('model_version', '?')})"
    return f"PDB {str(row['protein_pdb_id']).upper()}"


def methods_paragraph(row: dict) -> str:
    repro = _j(row, "repro_json")
    prep = _j(row, "prep_json")
    site = _j(row, "site_json")
    rec = prep.get("receptor") or {}
    clean = rec.get("clean") or {}
    lig = prep.get("ligand") or {}
    ph = rec.get("ph", 7.4)
    chains = ", ".join(clean.get("chains") or []) or "all"
    kept = ", ".join(clean.get("hetero_kept") or []) or "none"
    if site.get("mode") == "ligand":
        l = site.get("ligand") or {}
        site_txt = (f"centred on the co-crystallised ligand {l.get('resname')} "
                    f"(chain {l.get('chain')}, residue {l.get('resseq')})")
    elif site.get("mode") == "residues":
        site_txt = f"enclosing residues {', '.join(site.get('residues', [])[:12])}"
    elif site.get("mode") == "pocket":
        site_txt = "centred on the top-ranked pocket from grid-based buriedness detection"
    elif site.get("mode") == "manual":
        site_txt = "defined manually"
    else:
        site_txt = "centred on the geometric centre of the protein"
    lig_src = {"pubchem": "retrieved from PubChem as a 3D conformer",
               "smiles": "built from SMILES with RDKit (ETKDGv3 embedding, MMFF94 relaxation)",
               "sdf": "taken from the uploaded SDF"}.get(row.get("ligand_source") or "pubchem", "")
    if lig.get("embedded_from_smiles"):
        lig_src = "built from its PubChem SMILES with RDKit (ETKDGv3, MMFF94) because no 3D conformer was available"
    text = (
        f"Molecular docking of {ligand_label(row)} into {protein_label(row)} was performed with "
        f"AutoDock Vina {repro.get('vina_version', '1.2.5')} (Vina scoring function) via MolDock "
        f"({result_url(row)}). The receptor was prepared by removing waters and hetero groups "
        f"(retained: {kept}; chains: {chains}), adding hydrogens appropriate for pH {ph} and assigning "
        f"Gasteiger charges with {repro.get('obabel_version', 'Open Babel')}. The ligand was {lig_src}, "
        f"protonated for pH {lig.get('ph', ph)} and converted to PDBQT with Open Babel "
        f"({lig.get('active_torsions', '?')} active torsions). The search box was {site_txt}: centre "
        f"({row['center_x']:.3f}, {row['center_y']:.3f}, {row['center_z']:.3f}) Å, size "
        f"{row['size_x']:.1f} × {row['size_y']:.1f} × {row['size_z']:.1f} Å. Docking used "
        f"exhaustiveness {row['exhaustiveness']}, up to {row['num_modes']} poses, an energy range of "
        f"{row['energy_range']} kcal/mol and random seed {row.get('seed', 'unrecorded')}. "
    )
    if row.get("best_affinity") is not None:
        text += f"The top-ranked pose scored {row['best_affinity']} kcal/mol."
    an = _j(row, "analysis_json")
    rmsd = (an.get("rmsd") or {}).get("values")
    if rmsd and rmsd[0] is not None:
        text += (f" Redocking against the crystallographic pose gave a heavy-atom RMSD of "
                 f"{rmsd[0]:.2f} Å for the top pose (symmetry-aware Hungarian matching, no superposition).")
    return text.strip()


def bibtex(row: dict) -> str:
    year = (row.get("completed_at") or row.get("created_at") or "2026")[:4]
    key = f"MolDock{str(row['protein_pdb_id']).upper()}_{row['job_id'][:8]}"
    title = f"Docking of {ligand_label(row)} into {protein_label(row)} with AutoDock Vina"
    entry = (
        f"@misc{{{key},\n"
        f"  title        = {{{title}}},\n"
        f"  howpublished = {{MolDock docking job {row['job_id']}}},\n"
        f"  year         = {{{year}}},\n"
        f"  note         = {{Best affinity {row.get('best_affinity')} kcal/mol; exhaustiveness "
        f"{row['exhaustiveness']}; seed {row.get('seed', 'n/a')}}},\n"
        f"  url          = {{{result_url(row)}}}\n"
        f"}}\n\n"
    )
    return entry + VINA_CITATIONS


def params_record(row: dict) -> dict:
    """Machine-readable reproducibility record (params.json)."""
    return {
        "job_id": row["job_id"],
        "url": result_url(row),
        "created_at": row.get("created_at"),
        "completed_at": row.get("completed_at"),
        "engine": {"name": "AutoDock Vina", "scoring": "vina", **_j(row, "repro_json")},
        "protein": {"id": row["protein_pdb_id"], "source": row.get("protein_source") or "pdb",
                    "preparation": _j(row, "prep_json").get("receptor")},
        "ligand": {"name": row.get("ligand_name"), "pubchem_cid": row.get("ligand_cid") or None,
                   "smiles": row.get("ligand_smiles"), "source": row.get("ligand_source") or "pubchem",
                   "preparation": _j(row, "prep_json").get("ligand")},
        "box": {"center": [row["center_x"], row["center_y"], row["center_z"]],
                "size": [row["size_x"], row["size_y"], row["size_z"]], "site": _j(row, "site_json")},
        "search": {"exhaustiveness": row["exhaustiveness"], "num_modes": row["num_modes"],
                   "energy_range": row["energy_range"], "seed": row.get("seed")},
        "vina_command": (_j(row, "repro_json") or {}).get("command"),
    }


def poses_csv(row: dict) -> str:
    an = _j(row, "analysis_json")
    rmsd = (an.get("rmsd") or {}).get("values") or []
    per_pose = an.get("poses") or []
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["pose", "affinity_kcal_mol", "rmsd_lb", "rmsd_ub", "rmsd_to_crystal_A",
                "hbonds", "hydrophobic", "pi_stacking", "salt_bridges", "key_residues"])
    for i, p in enumerate(poses(row)):
        a = per_pose[i] if i < len(per_pose) and per_pose[i] else {}
        c = a.get("counts") or {}
        w.writerow([p["model"], p["affinity"], p.get("rmsd_lb"), p.get("rmsd_ub"),
                    rmsd[i] if i < len(rmsd) else "",
                    c.get("hbond", ""), c.get("hydrophobic", ""), c.get("pi_stacking", ""),
                    c.get("salt_bridge", ""),
                    " ".join(r["residue"] for r in (a.get("residues") or [])[:8])])
    return buf.getvalue()


def interactions_csv(row: dict) -> str:
    an = _j(row, "analysis_json")
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["pose", "type", "residue", "distance_A", "ligand_atoms", "detail"])
    for i, a in enumerate(an.get("poses") or []):
        for it in (a or {}).get("interactions", []):
            detail = it.get("ligand_role") or it.get("geometry") or ""
            if it.get("protein_atom"):
                detail = f"{detail} {it['protein_atom']}".strip()
            w.writerow([i + 1, it["type"], it["residue"], it["distance"],
                        " ".join(str(x + 1) for x in it["ligand_atoms"]), detail])
    return buf.getvalue()


def poses_sdf(row: dict) -> str:
    """All poses as SDF with Vina scores as data fields (Open Babel)."""
    pdbqt = row.get("output_pdbqt") or ""
    if not pdbqt:
        return ""
    with tempfile.TemporaryDirectory() as d:
        src, dst = os.path.join(d, "poses.pdbqt"), os.path.join(d, "poses.sdf")
        with open(src, "w") as f:
            f.write(pdbqt)
        try:
            subprocess.run(["obabel", src, "-O", dst], capture_output=True, text=True, timeout=120)
            sdf = open(dst).read() if os.path.exists(dst) else ""
        except (FileNotFoundError, subprocess.TimeoutExpired):
            sdf = ""
    if not sdf:
        return ""
    ps = poses(row)
    records = [r for r in sdf.split("$$$$\n") if r.strip()]
    out = []
    for i, rec in enumerate(records):
        lines = rec.rstrip("\n").split("\n")
        name = f"{row.get('ligand_name') or 'ligand'}_pose{i + 1}"
        lines[0] = name
        # drop Open Babel's own data fields (they duplicate REMARKs)
        if "M  END" in lines:
            lines = lines[: lines.index("M  END") + 1]
        rec = "\n".join(lines) + "\n"
        if i < len(ps):
            rec += f"> <vina_affinity_kcal_mol>\n{ps[i]['affinity']}\n\n"
            rec += f"> <pose>\n{i + 1}\n\n"
        rec += f"> <moldock_job>\n{row['job_id']}\n\n"
        out.append(rec + "$$$$\n")
    return "".join(out)


def complex_pdb(row: dict, pose_index: int = 0) -> str:
    rec = receptor_pdb(row)
    blocks = split_models(row.get("output_pdbqt") or "")
    if not rec or not blocks or pose_index >= len(blocks):
        return ""
    body = [l for l in rec.splitlines() if l.startswith(("ATOM", "HETATM"))]
    header = [f"REMARK   MolDock job {row['job_id']}  pose {pose_index + 1}",
              f"REMARK   Vina affinity {poses(row)[pose_index]['affinity']} kcal/mol"]
    return "\n".join(header + body + ["TER"]) + "\n" + pdbqt_block_to_pdb(blocks[pose_index]) + "END\n"


def pymol_script(row: dict) -> str:
    """Self-contained PyMOL .pml: receptor and poses are embedded, so the
    single file opens the full scene with no network or extra files."""
    rec = receptor_pdb(row)
    sdf = poses_sdf(row)
    return f"""# MolDock job {row['job_id']}  —  {result_url(row)}
# Open with:  pymol moldock_{row['job_id'][:8]}.pml
python
import os, tempfile
from pymol import cmd
_d = tempfile.mkdtemp(prefix="moldock_")
open(os.path.join(_d, "receptor.pdb"), "w").write('''{rec}''')
open(os.path.join(_d, "poses.sdf"), "w").write('''{sdf}''')
cmd.load(os.path.join(_d, "receptor.pdb"), "receptor")
cmd.load(os.path.join(_d, "poses.sdf"), "poses")
python end
hide everything
show cartoon, receptor
set cartoon_transparency, 0.2
show sticks, poses
color grey80, receptor and elem C
color green, poses and elem C
select pocket, byres (receptor within 5 of poses)
show sticks, pocket and not name N+C+O
distance hbonds, poses, pocket, mode=2
color yellow, hbonds
orient poses
"""


def chimerax_script(row: dict) -> str:
    """ChimeraX .cxc — expects receptor.pdb and poses.sdf next to it
    (both are in the bundle ZIP)."""
    return f"""# MolDock job {row['job_id']}  —  {result_url(row)}
# Unzip the MolDock bundle and run:  chimerax open_in_chimerax.cxc
open receptor.pdb
open poses.sdf
hide #2 models
show #2.1 models
style #2 stick
color #2 & C green
view #2.1
select zone #2.1 5 #1 residues true
show sel atoms
hbonds #2.1 restrict #1 reveal true color yellow
contacts #2.1 restrict #1 reveal true
"""


def pymol_bundle_script() -> str:
    return """# Run inside the unzipped MolDock bundle:  pymol open_in_pymol.pml
load receptor.pdb
load poses.sdf, poses
hide everything
show cartoon, receptor
show sticks, poses
color grey80, receptor and elem C
color green, poses and elem C
select pocket, byres (receptor within 5 of poses and state 1)
show sticks, pocket and not name N+C+O
distance hbonds, poses, pocket, mode=2
orient poses
"""


def bundle_zip(row: dict, interaction_svg: Optional[str] = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        rec = receptor_pdb(row)
        if rec:
            z.writestr("receptor.pdb", rec)
        z.writestr("poses.pdbqt", row.get("output_pdbqt") or "")
        sdf = poses_sdf(row)
        if sdf:
            z.writestr("poses.sdf", sdf)
        cpx = complex_pdb(row)
        if cpx:
            z.writestr("complex_pose1.pdb", cpx)
        z.writestr("poses.csv", poses_csv(row))
        z.writestr("interactions.csv", interactions_csv(row))
        if interaction_svg:
            z.writestr("interactions_pose1.svg", interaction_svg)
        z.writestr("params.json", json.dumps(params_record(row), indent=2))
        z.writestr("methods.txt", methods_paragraph(row) + "\n")
        z.writestr("citation.bib", bibtex(row))
        z.writestr("open_in_pymol.pml", pymol_bundle_script())
        z.writestr("open_in_chimerax.cxc", chimerax_script(row))
        z.writestr("README.txt", f"MolDock docking job {row['job_id']}\n{result_url(row)}\n\n"
                   "receptor.pdb         prepared receptor (heavy atoms, waters/hetero groups removed)\n"
                   "poses.pdbqt / .sdf   all Vina poses (SDF carries vina_affinity_kcal_mol)\n"
                   "complex_pose1.pdb    receptor + top pose\n"
                   "poses.csv            scores, RMSD to crystal (if computed), interaction counts\n"
                   "interactions.csv     every detected contact per pose\n"
                   "params.json          everything needed to re-run the job (incl. seed)\n"
                   "methods.txt          a methods paragraph for your paper\n"
                   "citation.bib         BibTeX for this run + AutoDock Vina + Open Babel\n"
                   "open_in_pymol.pml / open_in_chimerax.cxc   visualisation scripts\n")
    return buf.getvalue()


def batch_csv(batch: dict, rows: list[dict]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["rank", "name", "smiles", "pubchem_cid", "best_affinity_kcal_mol", "ligand_efficiency",
                "heavy_atoms", "hbonds_pose1", "key_residues", "status", "job_id", "url"])
    for r in rows:
        w.writerow([r.get("rank", ""), r["ligand_name"], r.get("ligand_smiles") or "",
                    r.get("ligand_cid") or "", r.get("best_affinity") if r.get("best_affinity") is not None else "",
                    r.get("ligand_efficiency") if r.get("ligand_efficiency") is not None else "",
                    r.get("heavy_atoms") or "", r.get("hbonds") if r.get("hbonds") is not None else "",
                    " ".join(r.get("key_residues") or []), r["status"], r["job_id"],
                    f"{SITE_URL}/results/{r['job_id']}"])
    return buf.getvalue()
