import asyncio
import logging
import tempfile
import os
import threading
import time

from api.database import get_pending_jobs, update_job_status, update_job_message, get_job_full, cleanup_old_jobs
from api.models import JobStatus
from api.docking import (
    download_protein_pdb, download_ligand_sdf, clean_protein_pdb,
    prepare_protein_pdbqt, prepare_ligand_pdbqt, run_vina,
    pdbqt_to_pdb, compute_grid_center
)
from api.email_service import send_completion_email, send_failure_email

logger = logging.getLogger(__name__)

_worker_running = False


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
    """Main worker loop that processes queued jobs."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    last_cleanup = 0

    while True:
        try:
            # Cleanup old jobs once per hour
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
                loop.run_until_complete(_process_job(job))
            else:
                time.sleep(2)
        except Exception as e:
            logger.error(f"Worker error: {e}")
            time.sleep(5)


async def _process_job(job: dict):
    """Process a single docking job."""
    job_id = job["job_id"]

    try:
        import time as _time
        TOTAL_STEPS = 7
        start_time = _time.time()

        def progress(step: int, msg: str):
            elapsed = _time.time() - start_time
            if step > 1 and elapsed > 0:
                est_total = elapsed / (step - 1) * TOTAL_STEPS
                remaining = max(0, est_total - elapsed)
                mins, secs = divmod(int(remaining), 60)
                eta = f"{mins}m {secs}s" if mins else f"{secs}s"
                full_msg = f"[{step}/{TOTAL_STEPS}] {msg} (ETA ~{eta})"
            else:
                full_msg = f"[{step}/{TOTAL_STEPS}] {msg}"
            update_job_message(job_id, full_msg)

        update_job_status(job_id, JobStatus.PREPARING, status_message=f"[1/{TOTAL_STEPS}] Starting job...")

        with tempfile.TemporaryDirectory(prefix=f"dock_{job_id[:8]}_") as work_dir:
            # Step 1: Download protein
            progress(1, f"Downloading protein {job['protein_pdb_id']} from RCSB PDB...")
            logger.info(f"[{job_id[:8]}] Downloading protein {job['protein_pdb_id']}")
            pdb_path = await download_protein_pdb(job["protein_pdb_id"], work_dir)

            # Step 2: Clean protein
            progress(2, "Removing water molecules and heteroatoms...")
            clean_pdb = clean_protein_pdb(pdb_path, work_dir)

            # Compute grid center if user provided zeros
            center_x, center_y, center_z = job["center_x"], job["center_y"], job["center_z"]
            if center_x == 0 and center_y == 0 and center_z == 0:
                center_x, center_y, center_z = compute_grid_center(clean_pdb)
                logger.info(f"[{job_id[:8]}] Auto grid center: ({center_x}, {center_y}, {center_z})")

            # Step 3: Prepare protein PDBQT
            progress(3, "Converting protein to PDBQT format...")
            logger.info(f"[{job_id[:8]}] Preparing protein PDBQT")
            receptor_pdbqt = prepare_protein_pdbqt(clean_pdb, work_dir)

            # Step 4: Download ligand
            progress(4, f"Downloading ligand {job['ligand_name']} from PubChem...")
            logger.info(f"[{job_id[:8]}] Downloading ligand CID {job['ligand_cid']}")
            sdf_path = await download_ligand_sdf(job["ligand_cid"], work_dir)

            # Step 5: Prepare ligand PDBQT
            progress(5, "Converting ligand to PDBQT format...")
            logger.info(f"[{job_id[:8]}] Preparing ligand PDBQT")
            ligand_pdbqt = prepare_ligand_pdbqt(sdf_path, work_dir)

            # Step 6: Run Vina
            progress(6, f"Running AutoDock Vina (exhaustiveness={job['exhaustiveness']})...")
            update_job_status(job_id, JobStatus.DOCKING, status_message=f"[6/{TOTAL_STEPS}] Running AutoDock Vina (exhaustiveness={job['exhaustiveness']})...")
            logger.info(f"[{job_id[:8]}] Running AutoDock Vina")

            output_pdbqt_path, poses = run_vina(
                receptor_pdbqt, ligand_pdbqt, work_dir,
                center_x, center_y, center_z,
                job["size_x"], job["size_y"], job["size_z"],
                job["exhaustiveness"], job["num_modes"], job["energy_range"]
            )

            # Step 7: Convert output
            progress(7, "Converting docked poses to PDB format...")
            docked_pdb_path = pdbqt_to_pdb(output_pdbqt_path, work_dir)

            # Read output files
            with open(output_pdbqt_path, "r") as f:
                output_pdbqt = f.read()
            with open(docked_pdb_path, "r") as f:
                docked_pdb = f.read()

            best_affinity = poses[0]["affinity"] if poses else 0.0
            num_poses = len(poses)

            # Update job as completed
            update_job_status(
                job_id, JobStatus.COMPLETED,
                best_affinity=best_affinity,
                num_poses=num_poses,
                output_pdbqt=output_pdbqt,
                docked_pdb=docked_pdb
            )

            logger.info(f"[{job_id[:8]}] Docking completed. Best affinity: {best_affinity} kcal/mol")

            # Send email notification
            if job.get("email"):
                send_completion_email(
                    job["email"], job_id, job["protein_pdb_id"],
                    job["ligand_name"], best_affinity
                )

    except Exception as e:
        error_msg = str(e)
        logger.error(f"[{job_id[:8]}] Docking failed: {error_msg}")
        update_job_status(job_id, JobStatus.FAILED, error_message=error_msg)

        if job.get("email"):
            send_failure_email(
                job["email"], job_id, job["protein_pdb_id"],
                job["ligand_name"], error_msg
            )
