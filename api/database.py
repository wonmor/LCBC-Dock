import sqlite3
import os
from datetime import datetime, timedelta
from typing import Optional, List
from api.models import DockingJob, JobStatus

DB_PATH = os.environ.get("LCBC_DB_PATH", "lcbc_dock.db")


def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30)
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
    # Add columns if upgrading from old schema. Each ALTER is wrapped
    # individually so a partial migration doesn't block the rest.
    for ddl in (
        "ALTER TABLE docking_jobs ADD COLUMN status_message TEXT",
        # Academic / lab-notebook fields. Notes is freeform; tags is a
        # comma-separated list ("ochem-201, thesis-ch3"). Both are
        # nullable so legacy rows just read as empty.
        "ALTER TABLE docking_jobs ADD COLUMN notes TEXT",
        "ALTER TABLE docking_jobs ADD COLUMN tags TEXT",
        "ALTER TABLE docking_jobs ADD COLUMN owner_email TEXT",
        # Geo-of-origin for the country leaderboard. Resolved from the
        # client IP at submission time (ip-api.com). Nullable so jobs
        # where lookup failed / was a private IP just don't get counted.
        "ALTER TABLE docking_jobs ADD COLUMN country TEXT",
        "ALTER TABLE docking_jobs ADD COLUMN country_code TEXT",
        # --- accounts / quotas / monetisation -------------------------
        "ALTER TABLE docking_jobs ADD COLUMN owner_user_id TEXT",
        # sha256(salt + client IP)[:32] — lets us count unique submitters and
        # fold duplicate submissions without storing raw IPs.
        "ALTER TABLE docking_jobs ADD COLUMN client_hash TEXT",
        "ALTER TABLE docking_jobs ADD COLUMN geo_hosting INTEGER DEFAULT 0",
        "ALTER TABLE docking_jobs ADD COLUMN visibility TEXT DEFAULT 'public'",
        "ALTER TABLE docking_jobs ADD COLUMN priority INTEGER DEFAULT 0",
        "ALTER TABLE docking_jobs ADD COLUMN retain INTEGER DEFAULT 0",
        "ALTER TABLE docking_jobs ADD COLUMN tier TEXT",
        # --- researcher features --------------------------------------
        "ALTER TABLE docking_jobs ADD COLUMN batch_id TEXT",
        "ALTER TABLE docking_jobs ADD COLUMN ligand_smiles TEXT",
        "ALTER TABLE docking_jobs ADD COLUMN ligand_sdf TEXT",
        "ALTER TABLE docking_jobs ADD COLUMN ligand_source TEXT DEFAULT 'pubchem'",
        "ALTER TABLE docking_jobs ADD COLUMN protein_source TEXT DEFAULT 'pdb'",
        "ALTER TABLE docking_jobs ADD COLUMN prep_json TEXT",
        "ALTER TABLE docking_jobs ADD COLUMN site_json TEXT",
        "ALTER TABLE docking_jobs ADD COLUMN seed INTEGER",
        "ALTER TABLE docking_jobs ADD COLUMN repro_json TEXT",
        "ALTER TABLE docking_jobs ADD COLUMN analysis_json TEXT",
        "ALTER TABLE docking_jobs ADD COLUMN receptor_pdb_gz BLOB",
        "ALTER TABLE docking_jobs ADD COLUMN started_at TEXT",
        # sha1 of the scientific parameters — folds accidental double submits
        "ALTER TABLE docking_jobs ADD COLUMN fingerprint TEXT",
    ):
        try:
            conn.execute(ddl)
        except Exception:
            pass
    conn.executescript(_EXTRA_SCHEMA)
    try:
        conn.execute("ALTER TABLE batches ADD COLUMN receptor_pdb_gz BLOB")
    except Exception:
        pass
    # Phone app purchases: app_account_token is the UUID handed to StoreKit
    # (appAccountToken) and Play Billing (obfuscatedAccountId) so a store
    # purchase names the MolDock account it was bought for.
    for ddl in (
        "ALTER TABLE users ADD COLUMN app_account_token TEXT",
        "ALTER TABLE users ADD COLUMN play_purchase_token TEXT",
        "ALTER TABLE users ADD COLUMN play_product_id TEXT",
        "ALTER TABLE users ADD COLUMN play_base_plan TEXT",
        "ALTER TABLE users ADD COLUMN play_expires_at TEXT",
        "ALTER TABLE users ADD COLUMN play_order_id TEXT",
        "ALTER TABLE users ADD COLUMN play_checked_at TEXT",
        # Phone sign-in: a 6-digit code mailed alongside the magic link.
        "ALTER TABLE login_tokens ADD COLUMN code_hash TEXT",
        "ALTER TABLE login_tokens ADD COLUMN attempts INTEGER DEFAULT 0",
    ):
        try:
            conn.execute(ddl)
        except Exception:
            pass
    for ddl in (
        "CREATE INDEX IF NOT EXISTS ix_jobs_status ON docking_jobs(status, priority, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_jobs_owner ON docking_jobs(owner_user_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_jobs_client ON docking_jobs(client_hash, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_jobs_batch ON docking_jobs(batch_id)",
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_app_account_token ON users(app_account_token)",
        "CREATE INDEX IF NOT EXISTS ix_users_play_token ON users(play_purchase_token)",
    ):
        conn.execute(ddl)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
    except Exception:
        pass
    conn.commit()
    conn.close()


_EXTRA_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    created_at TEXT NOT NULL,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    stripe_price_id TEXT,
    stripe_status TEXT,
    stripe_period_end TEXT,
    storekit_original_tx TEXT UNIQUE,
    storekit_product_id TEXT,
    storekit_expires_at TEXT,
    org_id TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_tokens (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS api_keys (
    key_id TEXT PRIMARY KEY,
    key_hash TEXT UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    label TEXT,
    prefix TEXT,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    revoked INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS orgs (
    org_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    seats INTEGER NOT NULL,
    owner_email TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lab_quotes (
    quote_id TEXT PRIMARY KEY,
    name TEXT, email TEXT, institution TEXT, seats INTEGER,
    message TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stripe_events (
    event_id TEXT PRIMARY KEY,
    type TEXT,
    received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS batches (
    batch_id TEXT PRIMARY KEY,
    owner_user_id TEXT,
    client_hash TEXT,
    name TEXT,
    protein_pdb_id TEXT NOT NULL,
    params_json TEXT,
    visibility TEXT DEFAULT 'public',
    created_at TEXT NOT NULL,
    n_ligands INTEGER DEFAULT 0,
    retain INTEGER DEFAULT 0
);
"""


def update_job_metadata(job_id: str, notes: Optional[str] = None,
                        tags: Optional[str] = None) -> bool:
    """Update the academic-only fields (notes, tags). Returns True
    when the row exists, False when no job matches the id."""
    conn = get_db()
    row = conn.execute("SELECT job_id FROM docking_jobs WHERE job_id=?", (job_id,)).fetchone()
    if not row:
        conn.close()
        return False
    conn.execute("""
        UPDATE docking_jobs
        SET notes = COALESCE(?, notes),
            tags  = COALESCE(?, tags)
        WHERE job_id=?
    """, (notes, tags, job_id))
    conn.commit()
    conn.close()
    return True


def list_jobs_by_email(email: str, limit: int = 100) -> List[dict]:
    """All jobs submitted under a given email — drives the dashboard
    filter and the per-class roll-up for instructors."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM docking_jobs WHERE email=? OR owner_email=? ORDER BY created_at DESC LIMIT ?",
        (email, email, limit)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def list_jobs_by_ids(job_ids: List[str]) -> List[dict]:
    """Used by the comparison view to load N jobs in one round-trip."""
    if not job_ids:
        return []
    conn = get_db()
    placeholders = ",".join("?" * len(job_ids))
    rows = conn.execute(
        f"SELECT * FROM docking_jobs WHERE job_id IN ({placeholders})",
        tuple(job_ids)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# Optional columns create_job() accepts as keyword arguments.
_JOB_EXTRA_COLUMNS = (
    "country", "country_code", "owner_user_id", "client_hash", "geo_hosting",
    "visibility", "priority", "retain", "tier", "batch_id", "ligand_smiles",
    "ligand_sdf", "ligand_source", "protein_source", "prep_json", "site_json",
    "seed", "owner_email", "fingerprint",
)


def create_job(job_id: str, protein_pdb_id: str, ligand_cid: int,
               ligand_name: str, email: Optional[str],
               center_x: float, center_y: float, center_z: float,
               size_x: float, size_y: float, size_z: float,
               exhaustiveness: int, num_modes: int, energy_range: float,
               conn: Optional[sqlite3.Connection] = None,
               **extra) -> DockingJob:
    unknown = set(extra) - set(_JOB_EXTRA_COLUMNS)
    if unknown:
        raise TypeError(f"unknown job columns: {sorted(unknown)}")
    own = conn is None
    conn = conn or get_db()
    now = datetime.utcnow().isoformat()
    cols = ["job_id", "status", "protein_pdb_id", "ligand_cid", "ligand_name", "email",
            "center_x", "center_y", "center_z", "size_x", "size_y", "size_z",
            "exhaustiveness", "num_modes", "energy_range", "created_at"]
    vals = [job_id, JobStatus.QUEUED.value, protein_pdb_id, ligand_cid, ligand_name,
            email, center_x, center_y, center_z, size_x, size_y, size_z,
            exhaustiveness, num_modes, energy_range, now]
    for k in _JOB_EXTRA_COLUMNS:
        if k in extra and extra[k] is not None:
            cols.append(k)
            vals.append(extra[k])
    conn.execute(
        f"INSERT INTO docking_jobs ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
        vals,
    )
    if own:
        conn.commit()
        conn.close()
    return DockingJob(
        job_id=job_id, status=JobStatus.QUEUED,
        protein_pdb_id=protein_pdb_id, ligand_cid=ligand_cid,
        ligand_name=ligand_name, email=email, created_at=now
    )


def set_job_fields(job_id: str, **fields):
    """Generic column update used by the worker for repro / analysis data."""
    if not fields:
        return
    conn = get_db()
    sets = ", ".join(f"{k}=?" for k in fields)
    conn.execute(f"UPDATE docking_jobs SET {sets} WHERE job_id=?", (*fields.values(), job_id))
    conn.commit()
    conn.close()


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
        "SELECT job_id FROM docking_jobs WHERE status IN (?, ?) "
        "ORDER BY CASE status WHEN 'preparing' THEN 0 ELSE 1 END, "
        "COALESCE(priority, 0) DESC, created_at ASC",
        (JobStatus.QUEUED.value, JobStatus.PREPARING.value)
    ).fetchall()
    conn.close()
    for i, row in enumerate(rows):
        if row["job_id"] == job_id:
            return i + 1
    return 0


def cleanup_old_jobs(days: int = 30):
    """Delete completed/failed jobs older than N days to save disk space.
    Jobs submitted by paying accounts (retain=1) are kept so their result
    URLs stay stable for papers."""
    conn = get_db()
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    result = conn.execute(
        "DELETE FROM docking_jobs WHERE status IN (?, ?) AND created_at < ? "
        "AND COALESCE(retain, 0) = 0",
        (JobStatus.COMPLETED.value, JobStatus.FAILED.value, cutoff)
    )
    deleted = result.rowcount
    conn.execute(
        "DELETE FROM batches WHERE COALESCE(retain, 0) = 0 AND created_at < ? AND batch_id NOT IN "
        "(SELECT DISTINCT batch_id FROM docking_jobs WHERE batch_id IS NOT NULL)",
        (cutoff,),
    )
    conn.commit()
    conn.close()
    return deleted


LEADERBOARD_WINDOW_DAYS = 30
LEADERBOARD_DEFINITION = (
    "Completed docking jobs in the last 30 days, by the country of the "
    "submitting IP. Repeat submissions of the same protein + ligand by the "
    "same visitor on the same day count once; failed and still-queued jobs, "
    "batch-screening ligands and data-centre (cloud/VPN) IPs are excluded."
)


def country_leaderboard(limit: int = 20, days: int = LEADERBOARD_WINDOW_DAYS,
                        now: Optional[datetime] = None) -> List[dict]:
    """Countries ranked by completed docking jobs in a trailing window.

    What used to be counted: every row in docking_jobs with a country — i.e.
    every *submission* (queued, failed and duplicates included) still in the
    table, which the hourly 30-day cleanup made an implicit, undocumented
    window. Now: status=completed, completed_at inside the window, single
    jobs only (batch ligands excluded), data-centre IPs excluded, and
    (submitter, protein, ligand, UTC day) de-duplicated. Rows from before
    client hashing existed fall back to job_id, i.e. are counted as-is.
    """
    conn = get_db()
    cutoff = ((now or datetime.utcnow()) - timedelta(days=days)).isoformat()
    rows = conn.execute(
        """
        SELECT country, country_code,
               COUNT(DISTINCT COALESCE(client_hash, job_id) || '|' ||
                     UPPER(protein_pdb_id) || '|' || ligand_cid || '|' ||
                     COALESCE(ligand_smiles, '') || '|' || SUBSTR(created_at, 1, 10)) AS jobs,
               COUNT(DISTINCT COALESCE(client_hash, job_id)) AS submitters
        FROM docking_jobs
        WHERE country IS NOT NULL AND country != ''
          AND status = 'completed'
          AND completed_at >= ?
          AND batch_id IS NULL
          AND COALESCE(geo_hosting, 0) = 0
        GROUP BY country, country_code
        ORDER BY jobs DESC, country ASC
        LIMIT ?
        """,
        (cutoff, limit),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_pending_jobs() -> List[dict]:
    """Next job to run: highest priority (Pro/Lab) first, then FIFO."""
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM docking_jobs WHERE status=? "
        "ORDER BY COALESCE(priority, 0) DESC, created_at ASC LIMIT 1",
        (JobStatus.QUEUED.value,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
