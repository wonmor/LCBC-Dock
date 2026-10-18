import asyncio
import gzip
import hashlib
import json
import logging
import os
import random
import shutil
import tempfile
import threading
import time
from collections import OrderedDict

from api.database import (
    get_pending_jobs, update_job_status, update_job_message, cleanup_old_jobs,
    set_job_fields, get_db,
)
from api.models import JobStatus
from api.docking import download_ligand_sdf, run_vina, pdbqt_to_pdb, vina_version
from api.email_service import send_completion_email, send_failure_email
from api import prep as P
from api import sites as S
from api import analysis as A

logger = logging.getLogger(__name__)

_worker_running = False
_RECEPTOR_CACHE: "OrderedDict[str, dict]" = OrderedDict()
_RECEPTOR_CACHE_MAX = 4


def start_worker():
    """Start the background docking worker thread."""
    global _worker_running
    if _worker_running:
        return
    _worker_running = True
    thread = threading.Thread(target=_worker_loop, daemon=True)
    thread.start()
    logger.info("Docking worker started")


def _worker_loop():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    last_cleanup = 0

    while True:
        try:
            now = time.time()
            if now - last_cleanup > 3600:
                deleted = cleanup_old_jobs(days=30)
                if deleted > 0:
                    logger.info(f"Cleaned up {deleted} old jobs (>30 days)")
                last_cleanup = now

            pending = get_pending_jobs()
            if pending:
                job = pending[0]
                logger.info(f"Processing job {job['job_id']}")
                loop.run_until_complete(process_job(job))
            else:
                time.sleep(2)
        except Exception as e:
            logger.error(f"Worker error: {e}")
            time.sleep(5)


def _json(row: dict, key: str) -> dict:
    try:
        return json.loads(row.get(key) or "{}") or {}
    except (TypeError, ValueError):
        return {}


async def _prepared_receptor(job: dict, rec_opts: dict, progress) -> dict:
    """Fetch + clean + protonate, cached by (structure, options) so a batch
    of 500 ligands prepares the receptor once."""
    key_src = json.dumps([job["protein_pdb_id"].upper(), sorted(rec_opts.get("chains") or []),
                          sorted(rec_opts.get("keep_hetero") or []), rec_opts.get("ph", 7.4)])
    key = hashlib.sha1(key_src.encode()).hexdigest()
    cached = _RECEPTOR_CACHE.get(key)
    if cached and os.path.exists(cached["pdbqt"]):
        _RECEPTOR_CACHE.move_to_end(key)
        progress(1, f"Using prepared receptor {job['protein_pdb_id'].upper()} (cached)")
        return cached

    progress(1, f"Fetching structure {job['protein_pdb_id'].upper()}...")
    raw, source = await P.fetch_structure(job["protein_pdb_id"])
    progress(2, "Cleaning structure (waters, hetero groups, alt-locs, chains)...")
    clean, report = P.clean_protein(raw, chains=rec_opts.get("chains"), keep_hetero=rec_opts.get("keep_hetero"))
    d = tempfile.mkdtemp(prefix="moldock_rec_")
    clean_path = os.path.join(d, "receptor_clean.pdb")
    with open(clean_path, "w") as f:
        f.write(clean)
    ph = float(rec_opts.get("ph", 7.4))
    progress(3, f"Adding hydrogens for pH {ph} and Gasteiger charges...")
    prot = P.protonate_receptor(clean_path, os.path.join(d, "receptor.pdbqt"), ph=ph)
    entry = {"raw": raw, "clean": clean, "pdbqt": os.path.join(d, "receptor.pdbqt"), "dir": d,
             "report": {"source": source, "clean": report, **prot, "ph": ph}}
    _RECEPTOR_CACHE[key] = entry
    while len(_RECEPTOR_CACHE) > _RECEPTOR_CACHE_MAX:
        _, old = _RECEPTOR_CACHE.popitem(last=False)
        shutil.rmtree(old["dir"], ignore_errors=True)
    return entry


def _resolve_site(job: dict, site: dict, rec: dict) -> dict:
    mode = (site or {}).get("mode") or "auto"
    sizes = [job["size_x"], job["size_y"], job["size_z"]]
    max_edge = site.get("max_edge")
    if mode == "ligand":
        box = S.site_from_ligand(rec["raw"], site["resname"], site.get("chain"), site.get("resseq"),
                                 max_edge=max_edge)
    elif mode == "residues":
        box = S.site_from_residues(rec["clean"], site["residues"], max_edge=max_edge)
    elif mode == "pocket":
        pockets = S.detect_pockets(rec["clean"])
        if not pockets:
            raise P.PrepError("No pocket found — choose a ligand, residues or a manual box")
        idx = max(0, min(int(site.get("pocket_rank", 1)) - 1, len(pockets) - 1))
        box = dict(pockets[idx])
        if max_edge:
            box["size"] = [min(s, max_edge) for s in box["size"]]
    elif mode == "manual" or any(abs(c) > 1e-9 for c in (job["center_x"], job["center_y"], job["center_z"])):
        box = {"mode": "manual", "center": [job["center_x"], job["center_y"], job["center_z"]], "size": sizes}
    else:
        box = S.protein_center_box(rec["clean"], edge=max(sizes))
        box["size"] = sizes
    box.setdefault("mode", mode)
    return box


async def _ligand_sdf(job: dict, work_dir: str, seed: int, lig_report: dict) -> str:
    path = os.path.join(work_dir, "ligand.sdf")
    src = job.get("ligand_source") or "pubchem"
    if src == "smiles" or (src == "pubchem" and not job.get("ligand_cid") and job.get("ligand_smiles")):
        sdf = P.smiles_to_sdf(job["ligand_smiles"], seed=seed, name=job["ligand_name"])
    elif src == "sdf":
        sdf = P.sdf_record_to_3d(job["ligand_sdf"], seed=seed)
    else:
        p = await download_ligand_sdf(job["ligand_cid"], work_dir)
        sdf = open(p).read()
        if not P.sdf_has_3d(sdf):
            # PubChem has no 3D conformer for many large/flexible compounds.
            import httpx
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/"
                                     f"{job['ligand_cid']}/property/IsomericSMILES,SMILES/JSON")
                props = r.json()["PropertyTable"]["Properties"][0]
            smi = props.get("IsomericSMILES") or props.get("SMILES")
            sdf = P.smiles_to_sdf(smi, seed=seed, name=job["ligand_name"])
            lig_report["embedded_from_smiles"] = True
    with open(path, "w") as f:
        f.write(sdf)
    return path


async def process_job(job: dict):
    """Process a single docking job (also used directly by tests)."""
    job_id = job["job_id"]
    TOTAL = 8
    start = time.time()

    def progress(step: int, msg: str):
        elapsed = time.time() - start
        if step > 1 and elapsed > 0:
            remaining = max(0, elapsed / (step - 1) * TOTAL - elapsed)
            mins, secs = divmod(int(remaining), 60)
            eta = f"{mins}m {secs}s" if mins else f"{secs}s"
            full = f"[{step}/{TOTAL}] {msg} (ETA ~{eta})"
        else:
            full = f"[{step}/{TOTAL}] {msg}"
        update_job_message(job_id, full)

    try:
        update_job_status(job_id, JobStatus.PREPARING, status_message=f"[1/{TOTAL}] Starting job...")
        set_job_fields(job_id, started_at=time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()))
        prep_cfg = _json(job, "prep_json")
        rec_opts = prep_cfg.get("receptor_options") or {}
        lig_opts = prep_cfg.get("ligand_options") or {}
        site_cfg = _json(job, "site_json")
        seed = job.get("seed")
        if seed is None:
            seed = random.SystemRandom().randint(1, 2**31 - 1)

        rec = await _prepared_receptor(job, rec_opts, progress)

        progress(4, "Defining the search box...")
        box = _resolve_site(job, site_cfg, rec)
        cx, cy, cz = box["center"]
        sx, sy, sz = box["size"]

        with tempfile.TemporaryDirectory(prefix=f"dock_{job_id[:8]}_") as work_dir:
            progress(5, f"Preparing ligand {job['ligand_name']}...")
            lig_report: dict = {}
            sdf_path = await _ligand_sdf(job, work_dir, seed, lig_report)
            lig_ph = lig_opts.get("ph", rec_opts.get("ph", 7.4))
            lig_report.update(P.ligand_to_pdbqt(sdf_path, os.path.join(work_dir, "ligand.pdbqt"), ph=lig_ph))
            heavy_atoms = None
            try:
                from rdkit import Chem
                m = Chem.MolFromMolFile(sdf_path)
                heavy_atoms = m.GetNumHeavyAtoms() if m else None
            except Exception:
                pass

            progress(6, f"Running AutoDock Vina (exhaustiveness={job['exhaustiveness']}, seed={seed})...")
            update_job_status(job_id, JobStatus.DOCKING)
            cmd: list = []
            out_path, poses = run_vina(
                rec["pdbqt"], os.path.join(work_dir, "ligand.pdbqt"), work_dir,
                cx, cy, cz, sx, sy, sz,
                job["exhaustiveness"], job["num_modes"], job["energy_range"],
                seed=seed, cpu=int(os.environ.get("VINA_CPU", "0") or 0) or None, command_out=cmd,
            )
            progress(7, "Converting poses...")
            docked_pdb_path = pdbqt_to_pdb(out_path, work_dir)
            output_pdbqt = open(out_path).read()
            docked_pdb = open(docked_pdb_path).read()

        progress(8, "Analysing interactions...")
        analysis: dict = {"poses": []}
        blocks = A.split_models(output_pdbqt)
        n_analyse = 1 if job.get("batch_id") else len(blocks)
        for i, b in enumerate(blocks):
            if i < n_analyse:
                try:
                    analysis["poses"].append(A.analyze_pose(b, rec["clean"]))
                except Exception as e:  # analysis must never fail the docking
                    logger.warning(f"[{job_id[:8]}] interaction analysis failed: {e}")
                    analysis["poses"].append(None)
        ref = prep_cfg.get("reference_ligand") or (
            {"resname": box["ligand"]["resname"], "chain": box["ligand"]["chain"], "resseq": box["ligand"]["resseq"]}
            if box.get("mode") == "ligand" else None)
        if ref:
            ref_lines = P.extract_hetero(rec["raw"], ref["resname"], ref.get("chain"), ref.get("resseq"))
            if ref_lines:
                values = A.pose_rmsds(output_pdbqt, ref_lines)
                analysis["rmsd"] = {"reference": f"{ref['resname']} {ref_lines[0][21]}{ref_lines[0][22:26].strip()}",
                                    "values": values,
                                    "note": None if any(v is not None for v in values) else
                                    "Docked ligand and crystal ligand have different heavy atoms; RMSD not defined."}
        best_affinity = poses[0]["affinity"] if poses else 0.0
        if heavy_atoms:
            analysis["heavy_atoms"] = heavy_atoms
            analysis["ligand_efficiency"] = round(-best_affinity / heavy_atoms, 3) if best_affinity else None

        repro = {
            "vina_version": vina_version(), "obabel_version": P.obabel_version(),
            "rdkit_version": P.rdkit_version(), "seed": seed, "command": cmd[0] if cmd else None,
            "scoring": "vina", "runtime_s": round(time.time() - start, 1),
        }
        prep_cfg["receptor"] = rec["report"]
        prep_cfg["ligand"] = lig_report
        set_job_fields(
            job_id,
            center_x=cx, center_y=cy, center_z=cz, size_x=sx, size_y=sy, size_z=sz,
            seed=seed, repro_json=json.dumps(repro), prep_json=json.dumps(prep_cfg),
            site_json=json.dumps({**site_cfg, **box}), analysis_json=json.dumps(analysis),
            receptor_pdb_gz=None if job.get("batch_id") else gzip.compress(rec["clean"].encode()),
        )
        if job.get("batch_id"):
            conn = get_db()
            conn.execute("UPDATE batches SET receptor_pdb_gz=COALESCE(receptor_pdb_gz, ?) WHERE batch_id=?",
                         (gzip.compress(rec["clean"].encode()), job["batch_id"]))
            conn.commit()
            conn.close()

        update_job_status(job_id, JobStatus.COMPLETED, best_affinity=best_affinity, num_poses=len(poses),
                          output_pdbqt=output_pdbqt, docked_pdb=docked_pdb)
        logger.info(f"[{job_id[:8]}] Docking completed. Best affinity: {best_affinity} kcal/mol")

        if job.get("email") and not job.get("batch_id"):
            send_completion_email(job["email"], job_id, job["protein_pdb_id"], job["ligand_name"], best_affinity)

    except Exception as e:
        error_msg = str(e)
        logger.error(f"[{job_id[:8]}] Docking failed: {error_msg}")
        update_job_status(job_id, JobStatus.FAILED, error_message=error_msg)
        if job.get("email") and not job.get("batch_id"):
            send_failure_email(job["email"], job_id, job["protein_pdb_id"], job["ligand_name"], error_msg)
