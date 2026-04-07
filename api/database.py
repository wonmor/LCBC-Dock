import sqlite3
import os
from datetime import datetime
from typing import Optional, List
from api.models import DockingJob, JobStatus

DB_PATH = os.environ.get("LCBC_DB_PATH", "lcbc_dock.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS docking_jobs (
            job_id TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'queued',
            protein_pdb_id TEXT NOT NULL,
            ligand_cid INTEGER NOT NULL,
            ligand_name TEXT NOT NULL,
            email TEXT,
            center_x REAL DEFAULT 0.0,
            center_y REAL DEFAULT 0.0,
            center_z REAL DEFAULT 0.0,
            size_x REAL DEFAULT 20.0,
            size_y REAL DEFAULT 20.0,
            size_z REAL DEFAULT 20.0,
            exhaustiveness INTEGER DEFAULT 8,
            num_modes INTEGER DEFAULT 9,
            energy_range REAL DEFAULT 3.0,
            created_at TEXT NOT NULL,
            completed_at TEXT,
            error_message TEXT,
            best_affinity REAL,
            num_poses INTEGER,
            output_pdbqt TEXT,
            docked_pdb TEXT,
            status_message TEXT
        )
    """)
    # Add column if upgrading from old schema
    try:
        conn.execute("ALTER TABLE docking_jobs ADD COLUMN status_message TEXT")
    except Exception:
        pass
    conn.commit()
    conn.close()


def create_job(job_id: str, protein_pdb_id: str, ligand_cid: int,
               ligand_name: str, email: Optional[str],
               center_x: float, center_y: float, center_z: float,
               size_x: float, size_y: float, size_z: float,
               exhaustiveness: int, num_modes: int, energy_range: float) -> DockingJob:
    conn = get_db()
    now = datetime.utcnow().isoformat()
    conn.execute("""
        INSERT INTO docking_jobs
        (job_id, status, protein_pdb_id, ligand_cid, ligand_name, email,
         center_x, center_y, center_z, size_x, size_y, size_z,
         exhaustiveness, num_modes, energy_range, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (job_id, JobStatus.QUEUED, protein_pdb_id, ligand_cid, ligand_name,
          email, center_x, center_y, center_z, size_x, size_y, size_z,
          exhaustiveness, num_modes, energy_range, now))
    conn.commit()
    conn.close()
    return DockingJob(
        job_id=job_id, status=JobStatus.QUEUED,
        protein_pdb_id=protein_pdb_id, ligand_cid=ligand_cid,
        ligand_name=ligand_name, email=email, created_at=now
    )


def update_job_status(job_id: str, status: JobStatus,
                      error_message: Optional[str] = None,
                      best_affinity: Optional[float] = None,
                      num_poses: Optional[int] = None,
                      output_pdbqt: Optional[str] = None,
                      docked_pdb: Optional[str] = None,
                      status_message: Optional[str] = None):
    conn = get_db()
    completed_at = datetime.utcnow().isoformat() if status in (JobStatus.COMPLETED, JobStatus.FAILED) else None
    conn.execute("""
        UPDATE docking_jobs SET status=?, completed_at=?, error_message=?,
        best_affinity=?, num_poses=?, output_pdbqt=?, docked_pdb=?,
        status_message=COALESCE(?, status_message)
        WHERE job_id=?
    """, (status, completed_at, error_message, best_affinity, num_poses,
          output_pdbqt, docked_pdb, status_message, job_id))
    conn.commit()
    conn.close()


def update_job_message(job_id: str, message: str):
    """Append a message to the status log for live progress."""
    conn = get_db()
    row = conn.execute("SELECT status_message FROM docking_jobs WHERE job_id=?", (job_id,)).fetchone()
    existing = row["status_message"] if row and row["status_message"] else ""
    # Keep latest message on first line, full log below
    from datetime import datetime
    timestamp = datetime.utcnow().strftime("%H:%M:%S")
    log_line = f"[{timestamp}] {message}"
    if existing:
        lines = existing.split("\n")
        # Replace first line (current status) and append to log
        updated = f"{message}\n{log_line}\n" + "\n".join(lines[1:]) if len(lines) > 1 else f"{message}\n{log_line}"
    else:
        updated = f"{message}\n{log_line}"
    conn.execute("UPDATE docking_jobs SET status_message=? WHERE job_id=?", (updated, job_id))
    conn.commit()
    conn.close()


def get_job(job_id: str) -> Optional[DockingJob]:
    conn = get_db()
    row = conn.execute("SELECT * FROM docking_jobs WHERE job_id=?", (job_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return DockingJob(
        job_id=row["job_id"], status=row["status"],
        protein_pdb_id=row["protein_pdb_id"], ligand_cid=row["ligand_cid"],
        ligand_name=row["ligand_name"], email=row["email"],
        created_at=row["created_at"], completed_at=row["completed_at"],
        error_message=row["error_message"], best_affinity=row["best_affinity"],
        num_poses=row["num_poses"]
    )


def get_job_full(job_id: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM docking_jobs WHERE job_id=?", (job_id,)).fetchone()
    conn.close()
    if not row:
        return None
    return dict(row)


def get_queue_position(job_id: str) -> int:
    conn = get_db()
    rows = conn.execute(
        "SELECT job_id FROM docking_jobs WHERE status IN (?, ?) ORDER BY created_at ASC",
        (JobStatus.QUEUED, JobStatus.PREPARING)
    ).fetchall()
    conn.close()
    for i, row in enumerate(rows):
        if row["job_id"] == job_id:
            return i + 1
    return 0


def cleanup_old_jobs(days: int = 30):
    """Delete completed/failed jobs older than N days to save disk space."""
    conn = get_db()
    cutoff = (datetime.utcnow() - __import__('datetime').timedelta(days=days)).isoformat()
    result = conn.execute(
        "DELETE FROM docking_jobs WHERE status IN (?, ?) AND created_at < ?",
        (JobStatus.COMPLETED, JobStatus.FAILED, cutoff)
    )
    deleted = result.rowcount
    conn.commit()
    conn.close()
    return deleted


def get_pending_jobs() -> List[dict]:
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM docking_jobs WHERE status=? ORDER BY created_at ASC LIMIT 1",
        (JobStatus.QUEUED,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
