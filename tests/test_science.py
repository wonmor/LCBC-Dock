"""Protein prep, binding sites, pocket detection, RMSD, interactions, exports."""
import numpy as np
import pytest

from api import analysis as A
from api import prep as P
from api import sites as S
from tests.conftest import HAS_OBABEL

MK1_CENTROID = np.array([13.073, 22.467, 5.557])


def test_identifier_detection():
    assert P.is_pdb_id("1HSG") and P.is_pdb_id("3htb")
    assert not P.is_pdb_id("P00533")
    assert P.is_uniprot("P00533") and P.is_uniprot("Q9Y6K9")
    assert not P.is_uniprot("1HSG")


def test_chains_and_hetero_groups(pdb_1hsg):
    assert [c["chain"] for c in P.list_chains(pdb_1hsg)] == ["A", "B"]
    het = P.list_hetero_groups(pdb_1hsg)
    assert [h["resname"] for h in het] == ["MK1"]
    assert het[0]["n_atoms"] == 45
    assert np.allclose(het[0]["center"], MK1_CENTROID, atol=1e-3)


def test_clean_protein_removes_water_and_ligand_and_selects_chains(pdb_1hsg):
    clean, rep = P.clean_protein(pdb_1hsg)
    assert "HOH" not in clean and "MK1" not in clean
    assert rep["waters_removed"] == 127 and rep["hetero_removed"] == ["MK1"]
    only_a, rep_a = P.clean_protein(pdb_1hsg, chains=["A"])
    assert rep_a["chains"] == ["A"]
    assert all(l[21] == "A" for l in only_a.splitlines() if l.startswith("ATOM"))
    kept, rep_k = P.clean_protein(pdb_1hsg, keep_hetero=["MK1"])
    assert "MK1" in kept and rep_k["hetero_kept"] == ["MK1"]
    with pytest.raises(P.PrepError):
        P.clean_protein(pdb_1hsg, chains=["Z"])


def test_site_from_cocrystal_ligand(pdb_1hsg):
    box = S.site_from_ligand(pdb_1hsg, "MK1")
    assert box["mode"] == "ligand" and box["ligand"]["chain"] == "B"
    assert all(s >= S.MIN_EDGE for s in box["size"])
    # box encloses every ligand atom
    lines = P.extract_hetero(pdb_1hsg, "MK1")
    xyz = np.array([(float(l[30:38]), float(l[38:46]), float(l[46:54])) for l in lines])
    c, half = np.array(box["center"]), np.array(box["size"]) / 2
    assert np.all(np.abs(xyz - c) <= half)
    capped = S.site_from_ligand(pdb_1hsg, "MK1", max_edge=20)
    assert max(capped["size"]) <= 20
    with pytest.raises(ValueError):
        S.site_from_ligand(pdb_1hsg, "XYZ")


def test_site_from_residues(pdb_1hsg):
    assert S.parse_residue_list("A:25, B:ASP25 ASP29") == [("A", None, "25"), ("B", "ASP", "25"), (None, "ASP", "29")]
    clean, _ = P.clean_protein(pdb_1hsg)
    box = S.site_from_residues(clean, "A:25, B:25")
    assert box["residues"] == ["ASP25A", "ASP25B"]
    with pytest.raises(ValueError):
        S.site_from_residues(clean, "A:999")


def test_pocket_detection_finds_the_active_site(pdb_1hsg):
    clean, _ = P.clean_protein(pdb_1hsg)
    pockets = S.detect_pockets(clean)
    assert pockets, "expected at least one pocket"
    top = pockets[0]
    assert top["rank"] == 1
    assert np.linalg.norm(np.array(top["center"]) - MK1_CENTROID) < 3.0
    assert "ASP25A" in top["residues"] and "ASP25B" in top["residues"]


def test_ligand_library_parsing_smiles_and_sdf():
    items = P.parse_ligand_library("smiles,name\nCCO ethanol\nc1ccccc1\tbenzene\nnot_smiles bad\n", max_n=10)
    assert [i["name"] for i in items] == ["ethanol", "benzene", "bad"]
    assert items[2]["error"] == "invalid SMILES"
    sdf = P.smiles_to_sdf("CCO", name="ethanol") + P.smiles_to_sdf("CC(=O)O", name="acetic")
    recs = P.parse_ligand_library(sdf, max_n=10)
    assert [r["name"] for r in recs] == ["ethanol", "acetic"] and all("sdf" in r for r in recs)
    assert len(P.parse_ligand_library("C\nCC\nCCC\n", max_n=2)) == 2


def test_smiles_to_3d_is_deterministic_with_seed():
    a = P.smiles_to_sdf("CC(=O)Oc1ccccc1C(=O)O", seed=7)
    b = P.smiles_to_sdf("CC(=O)Oc1ccccc1C(=O)O", seed=7)
    assert a == b and P.sdf_has_3d(a)


def test_hungarian_rmsd_basics():
    ref = [("C", (0, 0, 0)), ("C", (1.5, 0, 0)), ("O", (3, 0, 0))]
    same_permuted = [("C", (1.5, 0, 0)), ("O", (3, 0, 0)), ("C", (0, 0, 0))]
    assert A.hungarian_rmsd(same_permuted, ref) == 0.0
    shifted = [(e, (x + 1, y, z)) for e, (x, y, z) in ref]
    assert A.hungarian_rmsd(shifted, ref) == pytest.approx(1.0, abs=1e-6)
    assert A.hungarian_rmsd(ref[:2], ref) is None  # different atom sets


def test_redocking_rmsd_1hsg(pdb_1hsg, vina_out_1hsg):
    ref = P.extract_hetero(pdb_1hsg, "MK1")
    values = A.pose_rmsds(vina_out_1hsg, ref)
    assert len(values) == 9
    assert values[0] is not None and values[0] < 2.0, values  # successful redock


@pytest.mark.skipif(not HAS_OBABEL, reason="Open Babel not installed")
def test_interactions_1hsg_top_pose(pdb_1hsg, vina_out_1hsg):
    clean, _ = P.clean_protein(pdb_1hsg)
    pose = A.split_models(vina_out_1hsg)[0]
    res = A.analyze_pose(pose, clean)
    assert res["counts"]["hbond"] >= 2
    assert res["counts"]["hydrophobic"] >= 5
    residues = {r["residue"] for r in res["residues"]}
    # the catalytic aspartates are the signature contacts of HIV protease inhibitors
    assert residues & {"ASP25A", "ASP25B"}
    # no duplicate (atom, residue, protein atom) H-bonds
    keys = [(i["ligand_atoms"][0], i["residue"], i.get("protein_atom")) for i in res["interactions"] if i["type"] == "hbond"]
    assert len(keys) == len(set(keys))
    svg = A.interaction_svg(pose, res)
    assert svg.startswith("<?xml") or "<svg" in svg
    assert "ASP25" in svg and "H-bond" in svg


@pytest.mark.skipif(not HAS_OBABEL, reason="Open Babel not installed")
def test_exports_from_job_row(pdb_1hsg, vina_out_1hsg):
    import gzip
    import io
    import json
    import zipfile
    from api import exports as E

    clean, rep = P.clean_protein(pdb_1hsg)
    pose = A.split_models(vina_out_1hsg)[0]
    row = {
        "job_id": "00000000-test", "protein_pdb_id": "1HSG", "ligand_cid": 5362440, "ligand_name": "Indinavir",
        "ligand_source": "pubchem", "center_x": 13.07, "center_y": 22.47, "center_z": 5.56,
        "size_x": 20, "size_y": 20, "size_z": 20, "exhaustiveness": 8, "num_modes": 9, "energy_range": 3.0,
        "seed": 42, "best_affinity": -11.34, "created_at": "2026-10-18T00:00:00", "completed_at": "2026-10-18T00:01:00",
        "output_pdbqt": vina_out_1hsg, "receptor_pdb_gz": gzip.compress(clean.encode()),
        "repro_json": json.dumps({"vina_version": "1.2.5", "obabel_version": "Open Babel 3.1.0", "seed": 42}),
        "prep_json": json.dumps({"receptor": {"ph": 7.4, "clean": rep, "source": {"source": "pdb", "id": "1HSG"}},
                                 "ligand": {"ph": 7.4, "active_torsions": 17}}),
        "site_json": json.dumps({"mode": "ligand", "ligand": {"resname": "MK1", "chain": "B", "resseq": "902"}}),
        "analysis_json": json.dumps({"poses": [A.analyze_pose(pose, clean)], "rmsd": {"values": [0.55]}}),
    }
    methods = E.methods_paragraph(row)
    for needle in ("AutoDock Vina 1.2.5", "pH 7.4", "seed 42", "MK1", "0.55 Å", "exhaustiveness 8"):
        assert needle in methods
    bib = E.bibtex(row)
    assert "@misc{MolDock1HSG_" in bib and "Eberhardt2021Vina" in bib and "Trott2010Vina" in bib
    sdf = E.poses_sdf(row)
    assert sdf.count("$$$$") == 9 and "<vina_affinity_kcal_mol>" in sdf
    cpx = E.complex_pdb(row)
    assert "LIG L" in cpx and cpx.count("ATOM") > 1000
    csv_text = E.poses_csv(row)
    assert csv_text.splitlines()[1].startswith("1,-11.336,")
    pml = E.pymol_script(row)
    assert "cmd.load" in pml and "receptor" in pml
    z = zipfile.ZipFile(io.BytesIO(E.bundle_zip(row)))
    assert {"receptor.pdb", "poses.sdf", "params.json", "methods.txt", "citation.bib",
            "open_in_pymol.pml", "open_in_chimerax.cxc"} <= set(z.namelist())
    assert json.loads(z.read("params.json"))["search"]["seed"] == 42
