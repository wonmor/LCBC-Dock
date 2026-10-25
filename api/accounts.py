"""MolDock accounts, entitlements and quotas.

MolDock had no accounts before (an optional e-mail per job only), so this
adds the smallest thing that can carry a subscription across web, iOS and
the REST API:

    identity  = user (Authorization: Bearer <session token>)
              | user (X-API-Key: mdk_...)            — Pro/Lab only
              | anonymous (sha256(salt + client IP))  — quota by IP hash

    sign-in   = e-mailed magic link (POST /api/auth/request-link →
                GET /api/auth/verify?token=...) → 30-day session token.
                StoreKit purchases on iOS can also mint a session
                (see storekit.py), so the app works without an e-mail.

    tier      = max(active Stripe subscription, active StoreKit
                subscription, active Google Play subscription, Lab org
                seat), else free (signed in) or anonymous.

Quotas are counted from docking_jobs itself (jobs created today, UTC, by
this identity, failed jobs refunded), so there is no separate counter that
can drift out of sync with reality.
"""
from __future__ import annotations

import hashlib
import ipaddress
import os
import secrets
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from fastapi import HTTPException, Request  # noqa: F401

from api import plans
from api.database import get_db

class PaywallError(Exception):
    """402 (upgrade) / 429 (quota) / 401 (sign-in). Rendered by index.py as
    {"detail": "<message>", "paywall": {code, feature, ...}} so that older
    app builds, which display `detail` as a string, keep working."""

    def __init__(self, status: int, code: str, message: str, **extra):
        super().__init__(message)
        self.status, self.code, self.message, self.extra = status, code, message, extra

    def payload(self) -> dict:
        return {"detail": self.message, "paywall": {"code": self.code, "message": self.message, **self.extra}}


SESSION_DAYS = 30
LOGIN_TOKEN_MINUTES = 30
API_KEY_PREFIX = "mdk_"


def _now() -> datetime:
    return datetime.utcnow()


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _salt() -> str:
    # Not a secret in the cryptographic sense, but keeps the stored hash from
    # being a plain lookup table of IPs. Set IP_HASH_SALT in production.
    return os.environ.get("IP_HASH_SALT", "moldock-default-salt")


# ---------------------------------------------------------------------------
# Client IP
# ---------------------------------------------------------------------------

def client_ip(request: Request) -> Optional[str]:
    """Client IP behind CapRover's nginx.

    nginx *appends* the peer address to X-Forwarded-For, so the left-most
    entry is whatever the client chose to send. With TRUSTED_PROXY_HOPS=1
    (CapRover default) the real client is the right-most entry. The old code
    took the left-most entry, so a spoofed header could pick the country.
    """
    hops = int(os.environ.get("TRUSTED_PROXY_HOPS", "1") or 1)
    fwd = request.headers.get("x-forwarded-for")
    if fwd and hops > 0:
        parts = [p.strip() for p in fwd.split(",") if p.strip()]
        if parts:
            return parts[-hops] if len(parts) >= hops else parts[0]
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host if request.client else None


def client_hash(ip: Optional[str]) -> str:
    return _hash(_salt() + (ip or "unknown"))[:32]


def is_public_ip(ip: Optional[str]) -> bool:
    if not ip:
        return False
    try:
        a = ipaddress.ip_address(ip)
        return not (a.is_private or a.is_loopback or a.is_reserved or a.is_link_local)
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Users
# ---------------------------------------------------------------------------

def get_user(user_id: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE user_id=?", (user_id,)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_email(email: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE email=?", (email.lower().strip(),)).fetchone()
    conn.close()
    return dict(row) if row else None


def get_or_create_user(email: str) -> dict:
    email = email.lower().strip()
    existing = get_user_by_email(email)
    if existing:
        return existing
    conn = get_db()
    uid = "u_" + uuid.uuid4().hex[:20]
    try:
        conn.execute("INSERT INTO users (user_id, email, created_at) VALUES (?, ?, ?)",
                     (uid, email, _now().isoformat()))
        conn.commit()
    except sqlite3.IntegrityError:
        pass
    conn.close()
    return get_user_by_email(email)  # type: ignore[return-value]


def ensure_app_account_token(user_id: str) -> str:
    """A stable random UUID per account, handed to the phone app to pass as
    StoreKit `appAccountToken` / Play `obfuscatedAccountId`, so every store
    purchase names the MolDock account it was bought for. Random (not
    derived from the e-mail) so it carries no personal data."""
    user = get_user(user_id) or {}
    if user.get("app_account_token"):
        return user["app_account_token"]
    token = str(uuid.uuid4())
    conn = get_db()
    conn.execute("UPDATE users SET app_account_token=? WHERE user_id=? AND app_account_token IS NULL",
                 (token, user_id))
    conn.commit()
    conn.close()
    return (get_user(user_id) or {}).get("app_account_token") or token


def user_for_app_account_token(token: Optional[str]) -> Optional[dict]:
    token = (token or "").strip().lower()
    if not token:
        return None
    conn = get_db()
    row = conn.execute("SELECT user_id FROM users WHERE lower(app_account_token)=?", (token,)).fetchone()
    conn.close()
    return get_user(row["user_id"]) if row else None


def update_user(user_id: str, **fields) -> None:
    if not fields:
        return
    conn = get_db()
    sets = ", ".join(f"{k}=?" for k in fields)
    conn.execute(f"UPDATE users SET {sets} WHERE user_id=?", (*fields.values(), user_id))
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Magic-link sign-in + sessions
# ---------------------------------------------------------------------------

def valid_email(email: str) -> bool:
    email = (email or "").strip()
    return 3 < len(email) < 255 and "@" in email and "." in email.split("@")[-1] and " " not in email


def create_login_token(email: str) -> str:
    token = secrets.token_urlsafe(32)
    conn = get_db()
    conn.execute(
        "INSERT INTO login_tokens (token_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (_hash(token), email.lower().strip(), _now().isoformat(),
         (_now() + timedelta(minutes=LOGIN_TOKEN_MINUTES)).isoformat()),
    )
    conn.commit()
    conn.close()
    return token


LOGIN_CODE_ATTEMPTS = 5


def attach_login_code(token: str) -> str:
    """Phone sign-in: a 6-digit code for the same one-shot login token, for
    when the e-mail is read somewhere the app link can't open. Five wrong
    guesses burn the token."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    conn = get_db()
    row = conn.execute("SELECT email FROM login_tokens WHERE token_hash=?", (_hash(token),)).fetchone()
    conn.execute("UPDATE login_tokens SET code_hash=? WHERE token_hash=?",
                 (_hash(f"{row['email']}:{code}"), _hash(token)))
    conn.commit()
    conn.close()
    return code


def consume_login_code(email: str, code: str) -> Optional[dict]:
    """One-shot like consume_login_token. Only the newest live token for the
    e-mail is considered, and each wrong code counts against it."""
    email = (email or "").lower().strip()
    code = "".join(ch for ch in (code or "") if ch.isdigit())
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM login_tokens WHERE email=? AND used=0 AND code_hash IS NOT NULL AND expires_at >= ? "
        "ORDER BY created_at DESC LIMIT 1", (email, _now().isoformat())).fetchone()
    if not row:
        conn.close()
        return None
    if len(code) != 6 or _hash(f"{email}:{code}") != row["code_hash"]:
        attempts = (row["attempts"] or 0) + 1
        conn.execute("UPDATE login_tokens SET attempts=?, used=? WHERE token_hash=?",
                     (attempts, 1 if attempts >= LOGIN_CODE_ATTEMPTS else 0, row["token_hash"]))
        conn.commit()
        conn.close()
        return None
    conn.execute("UPDATE login_tokens SET used=1 WHERE token_hash=?", (row["token_hash"],))
    conn.commit()
    conn.close()
    return get_or_create_user(email)


def recent_login_requests(email: str, minutes: int = 15) -> int:
    conn = get_db()
    n = conn.execute(
        "SELECT COUNT(*) AS c FROM login_tokens WHERE email=? AND created_at >= ?",
        (email.lower().strip(), (_now() - timedelta(minutes=minutes)).isoformat()),
    ).fetchone()["c"]
    conn.close()
    return n


def consume_login_token(token: str) -> Optional[dict]:
    """One-shot: returns the user and marks the token used."""
    conn = get_db()
    row = conn.execute("SELECT * FROM login_tokens WHERE token_hash=?", (_hash(token),)).fetchone()
    if not row or row["used"] or row["expires_at"] < _now().isoformat():
        conn.close()
        return None
    conn.execute("UPDATE login_tokens SET used=1 WHERE token_hash=?", (_hash(token),))
    conn.commit()
    conn.close()
    return get_or_create_user(row["email"])


def create_session(user_id: str) -> str:
    token = "mds_" + secrets.token_urlsafe(32)
    conn = get_db()
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (_hash(token), user_id, _now().isoformat(),
         (_now() + timedelta(days=SESSION_DAYS)).isoformat()),
    )
    conn.commit()
    conn.close()
    return token


def revoke_session(token: str) -> None:
    conn = get_db()
    conn.execute("DELETE FROM sessions WHERE token_hash=?", (_hash(token),))
    conn.commit()
    conn.close()


def _user_for_session(token: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM sessions WHERE token_hash=?", (_hash(token),)).fetchone()
    conn.close()
    if not row or row["expires_at"] < _now().isoformat():
        return None
    return get_user(row["user_id"])


# ---------------------------------------------------------------------------
# API keys (Pro / Lab)
# ---------------------------------------------------------------------------

def create_api_key(user_id: str, label: str = "") -> dict:
    raw = API_KEY_PREFIX + secrets.token_urlsafe(32)
    key_id = "k_" + uuid.uuid4().hex[:12]
    conn = get_db()
    conn.execute(
        "INSERT INTO api_keys (key_id, key_hash, user_id, label, prefix, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (key_id, _hash(raw), user_id, (label or "")[:60], raw[:10], _now().isoformat()),
    )
    conn.commit()
    conn.close()
    # The raw key is returned exactly once.
    return {"key_id": key_id, "key": raw, "prefix": raw[:10], "label": label}


def list_api_keys(user_id: str) -> list[dict]:
    conn = get_db()
    rows = conn.execute(
        "SELECT key_id, label, prefix, created_at, last_used_at FROM api_keys "
        "WHERE user_id=? AND revoked=0 ORDER BY created_at DESC", (user_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def revoke_api_key(user_id: str, key_id: str) -> bool:
    conn = get_db()
    cur = conn.execute("UPDATE api_keys SET revoked=1 WHERE key_id=? AND user_id=?", (key_id, user_id))
    conn.commit()
    conn.close()
    return cur.rowcount > 0


def _user_for_api_key(raw: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM api_keys WHERE key_hash=? AND revoked=0", (_hash(raw),)).fetchone()
    if row:
        conn.execute("UPDATE api_keys SET last_used_at=? WHERE key_id=?", (_now().isoformat(), row["key_id"]))
        conn.commit()
    conn.close()
    return get_user(row["user_id"]) if row else None


# ---------------------------------------------------------------------------
# Orgs (Lab / Institution seats)
# ---------------------------------------------------------------------------

def create_org(name: str, seats: int, owner_email: str, expires_at: Optional[str]) -> dict:
    org_id = "org_" + uuid.uuid4().hex[:12]
    conn = get_db()
    conn.execute("INSERT INTO orgs (org_id, name, seats, owner_email, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                 (org_id, name, int(seats), owner_email.lower().strip(), expires_at, _now().isoformat()))
    conn.commit()
    conn.close()
    add_org_member(org_id, owner_email)
    return get_org(org_id)  # type: ignore[return-value]


def get_org(org_id: str) -> Optional[dict]:
    conn = get_db()
    row = conn.execute("SELECT * FROM orgs WHERE org_id=?", (org_id,)).fetchone()
    members = conn.execute("SELECT email FROM users WHERE org_id=? ORDER BY email", (org_id,)).fetchall()
    conn.close()
    if not row:
        return None
    d = dict(row)
    d["members"] = [m["email"] for m in members]
    return d


def add_org_member(org_id: str, email: str) -> dict:
    org = get_org(org_id)
    if not org:
        raise HTTPException(404, "Organisation not found")
    email = email.lower().strip()
    if email not in org["members"] and len(org["members"]) >= org["seats"]:
        raise PaywallError(409, "seats_full", f"All {org['seats']} seats are in use.")
    user = get_or_create_user(email)
    update_user(user["user_id"], org_id=org_id)
    return get_org(org_id)  # type: ignore[return-value]


def remove_org_member(org_id: str, email: str) -> dict:
    user = get_user_by_email(email)
    if user and user.get("org_id") == org_id:
        update_user(user["user_id"], org_id=None)
    return get_org(org_id)  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Entitlement
# ---------------------------------------------------------------------------

_ACTIVE_STRIPE = ("active", "trialing", "past_due")


def tier_for_user(user: Optional[dict], now: Optional[datetime] = None) -> tuple[str, list[str]]:
    """(tier, sources) — the highest tier any source grants right now."""
    if not user:
        return plans.TIER_ANON, []
    now_iso = (now or _now()).isoformat()
    tier, sources = plans.TIER_FREE, []
    st = plans.tier_for_price(user.get("stripe_price_id")) or (
        plans.TIER_PRO if user.get("stripe_price_id") else None)
    if (user.get("stripe_status") in _ACTIVE_STRIPE and st
            and (not user.get("stripe_period_end") or user["stripe_period_end"] > now_iso)):
        tier = plans.higher(tier, st)
        sources.append("stripe")
    sk = plans.STOREKIT_PRODUCTS.get(user.get("storekit_product_id") or "")
    if sk and user.get("storekit_expires_at") and user["storekit_expires_at"] > now_iso:
        tier = plans.higher(tier, sk)
        sources.append("app_store")
    gp = plans.PLAY_PRODUCTS.get(user.get("play_product_id") or "")
    if gp and user.get("play_expires_at") and user["play_expires_at"] > now_iso:
        tier = plans.higher(tier, gp)
        sources.append("google_play")
    if user.get("org_id"):
        org = get_org(user["org_id"])
        if org and (not org.get("expires_at") or org["expires_at"] > now_iso):
            tier = plans.higher(tier, plans.TIER_LAB)
            sources.append("lab")
    return tier, sources


@dataclass
class Identity:
    user: Optional[dict]
    tier: str
    sources: list
    client_hash: str
    ip: Optional[str]
    via: str  # "session" | "api_key" | "anonymous"

    @property
    def user_id(self) -> Optional[str]:
        return self.user["user_id"] if self.user else None

    @property
    def limits(self) -> plans.Limits:
        return plans.limits_for(self.tier)


def resolve_identity(request: Request) -> Identity:
    ip = client_ip(request)
    ch = client_hash(ip)
    api_key = request.headers.get("x-api-key")
    if api_key:
        user = _user_for_api_key(api_key.strip())
        if not user:
            raise PaywallError(401, "invalid_api_key", "Unknown or revoked API key.")
        tier, sources = tier_for_user(user)
        if not plans.limits_for(tier).api_keys:
            raise PaywallError(402, "upgrade_required", "API access needs MolDock Pro.", feature="api")
        return Identity(user, tier, sources, ch, ip, "api_key")
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        user = _user_for_session(auth[7:].strip())
        if user:
            user = _refresh_play_if_lapsed(user)
            tier, sources = tier_for_user(user)
            return Identity(user, tier, sources, ch, ip, "session")
    return Identity(None, plans.TIER_ANON, [], ch, ip, "anonymous")


def _refresh_play_if_lapsed(user: dict) -> dict:
    """RTDN-free renewal: once a stored Google Play expiry has passed, ask
    Google again (at most every PLAY_RECHECK_MINUTES) and carry the new
    expiry forward if the subscription renewed. Never raises."""
    if not user.get("play_purchase_token") or not user.get("play_product_id"):
        return user
    now = _now()
    if user.get("play_expires_at") and user["play_expires_at"] > now.isoformat():
        return user
    from api import playbilling
    checked = user.get("play_checked_at")
    if checked and checked > (now - timedelta(minutes=playbilling.recheck_minutes())).isoformat():
        return user
    if not playbilling.configured():
        return user
    fields = {"play_checked_at": now.isoformat()}
    try:
        ent = playbilling.entitlement(playbilling.fetch_subscription(user["play_purchase_token"]),
                                      user["play_purchase_token"])
        if ent["tier"]:
            fields.update(play_expires_at=playbilling.stored_expiry(ent),
                          play_base_plan=ent["base_plan_id"] or user.get("play_base_plan"),
                          play_order_id=ent["order_id"] or user.get("play_order_id"))
    except playbilling.PlayVerificationError:
        fields["play_expires_at"] = None
    except Exception:
        import logging
        logging.getLogger(__name__).warning("Play renewal re-check failed", exc_info=True)
    update_user(user["user_id"], **fields)
    return get_user(user["user_id"]) or user


def require_user(request: Request) -> Identity:
    ident = resolve_identity(request)
    if not ident.user:
        raise PaywallError(401, "sign_in_required", "Sign in to continue.")
    return ident


# ---------------------------------------------------------------------------
# Quotas
# ---------------------------------------------------------------------------

def _day_start(now: Optional[datetime] = None) -> datetime:
    n = now or _now()
    return datetime(n.year, n.month, n.day)


def usage(ident: Identity, now: Optional[datetime] = None) -> dict:
    """Dockings used today (UTC) and currently active, for this identity.
    Signed-in users are counted by account; anonymous by IP hash. Failed
    jobs are refunded."""
    start = _day_start(now).isoformat()
    if ident.user_id:
        where, arg = "owner_user_id=?", ident.user_id
    else:
        where, arg = "owner_user_id IS NULL AND client_hash=?", ident.client_hash
    conn = get_db()
    used = conn.execute(
        f"SELECT COUNT(*) AS c FROM docking_jobs WHERE {where} AND created_at >= ? AND status != 'failed'",
        (arg, start)).fetchone()["c"]
    active = conn.execute(
        f"SELECT COUNT(*) AS c FROM docking_jobs WHERE {where} AND status IN ('queued','preparing','docking')",
        (arg,)).fetchone()["c"]
    conn.close()
    lim = ident.limits
    return {
        "used_today": used,
        "jobs_per_day": lim.jobs_per_day,
        "remaining_today": max(0, lim.jobs_per_day - used),
        "active": active,
        "max_active": lim.max_active,
        "resets_at": (_day_start(now) + timedelta(days=1)).isoformat() + "Z",
    }


def upgrade_error(feature: str, message: str, **extra) -> PaywallError:
    return PaywallError(402, "upgrade_required", message, feature=feature, **extra)


def clamp_job_params(ident: Identity, exhaustiveness: int, num_modes: int,
                     sizes: tuple[float, float, float]) -> tuple[int, int, tuple, list[str]]:
    """Legacy (non-strict) clients: clamp to the plan instead of refusing,
    and report what changed. Shipped app builds offer exhaustiveness up to
    32 and know nothing about plans."""
    lim = ident.limits
    notes = []
    if exhaustiveness > lim.max_exhaustiveness:
        notes.append(f"exhaustiveness {exhaustiveness}→{lim.max_exhaustiveness}")
        exhaustiveness = lim.max_exhaustiveness
    if num_modes > lim.max_num_modes:
        notes.append(f"num_modes {num_modes}→{lim.max_num_modes}")
        num_modes = lim.max_num_modes
    if max(sizes) > lim.max_box_edge:
        notes.append(f"box edge capped at {lim.max_box_edge:.0f} Å")
        sizes = tuple(min(s, lim.max_box_edge) for s in sizes)
    return exhaustiveness, num_modes, sizes, notes


def enforce_job_params(ident: Identity, *, exhaustiveness: int, num_modes: int,
                       sizes: tuple[float, float, float], private: bool,
                       n_ligands: int = 1, batch: bool = False) -> None:
    """Server-side gating. Raises 402 (upgrade) or 429 (quota)."""
    lim = ident.limits
    if exhaustiveness < 1 or num_modes < 1 or any(s <= 0 for s in sizes):
        raise PaywallError(422, "invalid_params", "exhaustiveness, num_modes and box sizes must be positive")
    if exhaustiveness > lim.max_exhaustiveness:
        raise upgrade_error("exhaustiveness",
                            f"Exhaustiveness above {lim.max_exhaustiveness} needs a higher plan.",
                            limit=lim.max_exhaustiveness)
    if num_modes > lim.max_num_modes:
        raise upgrade_error("num_modes", f"More than {lim.max_num_modes} poses needs a higher plan.",
                            limit=lim.max_num_modes)
    if max(sizes) > lim.max_box_edge:
        raise upgrade_error("box_size", f"Search boxes larger than {lim.max_box_edge:.0f} Å per side need a higher plan.",
                            limit=lim.max_box_edge)
    if private and not lim.private_jobs:
        raise upgrade_error("private", "Private jobs need MolDock Pro.")
    if batch:
        if lim.max_batch_ligands == 0:
            raise upgrade_error("batch", "Batch screening needs a free account or MolDock Pro.")
        if n_ligands > lim.max_batch_ligands:
            raise upgrade_error("batch_size", f"Your plan screens up to {lim.max_batch_ligands} ligands per batch.",
                                limit=lim.max_batch_ligands)
    u = usage(ident)
    if u["used_today"] + n_ligands > lim.jobs_per_day:
        raise PaywallError(429, "quota_exceeded",
                           f"Daily limit reached ({lim.jobs_per_day} dockings/day on your plan). "
                           f"Resets at 00:00 UTC.", feature="daily_jobs", tier=ident.tier, **u)
    if not batch and u["active"] >= lim.max_active:
        raise PaywallError(429, "too_many_active",
                           f"You already have {u['active']} job(s) in the queue. "
                           f"Your plan allows {lim.max_active} at a time.",
                           feature="concurrency", tier=ident.tier, **u)


def can_view(job_or_batch: dict, ident: Identity) -> bool:
    """Private jobs/batches are visible only to their owner (or org mates)."""
    if (job_or_batch.get("visibility") or "public") != "private":
        return True
    owner = job_or_batch.get("owner_user_id")
    if not owner or not ident.user_id:
        return False
    if owner == ident.user_id:
        return True
    owner_user = get_user(owner)
    return bool(owner_user and owner_user.get("org_id") and owner_user["org_id"] == ident.user.get("org_id"))


def account_summary(ident: Identity) -> dict:
    u = ident.user or {}
    return {
        "signed_in": bool(ident.user),
        "user_id": ident.user_id,
        "email": u.get("email"),
        "tier": ident.tier,
        "sources": ident.sources,
        "limits": plans._limits_dict(ident.tier),
        "usage": usage(ident),
        "stripe": {
            "status": u.get("stripe_status"),
            "period_end": u.get("stripe_period_end"),
            "has_customer": bool(u.get("stripe_customer_id")),
        },
        "app_store": {"product_id": u.get("storekit_product_id"), "expires_at": u.get("storekit_expires_at")},
        "google_play": {"product_id": u.get("play_product_id"), "base_plan": u.get("play_base_plan"),
                        "expires_at": u.get("play_expires_at")},
        # Pass as StoreKit appAccountToken / Play obfuscatedAccountId.
        "app_account_token": ensure_app_account_token(ident.user_id) if ident.user_id else None,
        "org": get_org(u["org_id"]) if u.get("org_id") else None,
    }
