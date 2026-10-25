"""Accounts, billing, batch screening, structure tools and result exports.

Mounted by api/index.py. Every endpoint here accepts the same identity
headers (Authorization: Bearer <session> or X-API-Key) so the web client,
the apps and the REST API share one code path.
"""
from __future__ import annotations

import gzip
import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timedelta
from typing import List, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse, Response
from pydantic import BaseModel

from api import accounts as acc
from api import billing, exports, plans
from api import prep as P
from api import sites as S
from api.analysis import interaction_svg, split_models
from api.database import create_job, get_db, get_job_full
from api.email_service import send_lab_quote_email, send_login_email, smtp_configured
from api.models import BatchRequest, DockingRequest, JobStatus

logger = logging.getLogger(__name__)
router = APIRouter()

DEDUPE_MINUTES = 10


# ---------------------------------------------------------------------------
# Geolocation (country leaderboard)
# ---------------------------------------------------------------------------

async def geolocate(ip: Optional[str]):
    """(country, country_code, hosting) via ip-api.com. Best-effort."""
    if not acc.is_public_ip(ip):
        return None, None, 0
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"http://ip-api.com/json/{ip}",
                                    params={"fields": "status,country,countryCode,hosting"})
            data = resp.json()
            if data.get("status") == "success":
                return data.get("country"), data.get("countryCode"), int(bool(data.get("hosting")))
    except Exception as e:
        logger.warning(f"Geolocation failed: {e}")
    return None, None, 0


# ---------------------------------------------------------------------------
# Job creation (shared by /api/dock and /api/batch)
# ---------------------------------------------------------------------------

def _parse_ref(spec: Optional[str]) -> Optional[dict]:
    if not spec:
        return None
    parts = [p.strip() for p in spec.split(":")]
    return {"resname": parts[0].upper(), "chain": (parts[1] or None) if len(parts) > 1 else None,
            "resseq": (parts[2] or None) if len(parts) > 2 else None}


def _site_cfg(site, ident: acc.Identity) -> dict:
    if not site:
        return {"mode": "auto"}
    mode = (site.mode or "auto").lower()
    if mode not in ("auto", "manual", "ligand", "residues", "pocket"):
        raise HTTPException(422, "site.mode must be auto, manual, ligand, residues or pocket")
    cfg = {"mode": mode, "max_edge": ident.limits.max_box_edge}
    if mode == "ligand":
        ref = _parse_ref(site.ligand)
        if not ref:
            raise HTTPException(422, "site.ligand is required for mode=ligand (e.g. MK1 or MK1:B:902)")
        cfg.update(ref)
    elif mode == "residues":
        if not site.residues:
            raise HTTPException(422, "site.residues is required for mode=residues")
        try:
            S.parse_residue_list(site.residues)
        except ValueError as e:
            raise HTTPException(422, str(e))
        cfg["residues"] = site.residues
    elif mode == "pocket":
        cfg["pocket_rank"] = max(1, int(site.pocket_rank or 1))
    return cfg


def _prep_cfg(req, reference: Optional[str]) -> dict:
    p = req.prep
    ph = float(p.ph) if p else 7.4
    if not (0 <= ph <= 14):
        raise HTTPException(422, "pH must be between 0 and 14")
    return {
        "receptor_options": {"chains": [c.strip() for c in (p.chains or []) if c.strip()] if p else [],
                             "keep_hetero": [h.strip().upper() for h in (p.keep_hetero or []) if h.strip()] if p else [],
                             "ph": ph},
        "ligand_options": {"ph": ph},
        "reference_ligand": _parse_ref(reference),
    }


def _fingerprint(protein: str, ligand_key: str, params: dict) -> str:
    return hashlib.sha1(json.dumps([protein.upper(), ligand_key, params], sort_keys=True).encode()).hexdigest()


def _find_duplicate(ident: acc.Identity, fingerprint: str) -> Optional[dict]:
    since = (datetime.utcnow() - timedelta(minutes=DEDUPE_MINUTES)).isoformat()
    conn = get_db()
    if ident.user_id:
        row = conn.execute("SELECT * FROM docking_jobs WHERE owner_user_id=? AND fingerprint=? AND created_at>=? "
                           "AND status!='failed' ORDER BY created_at DESC LIMIT 1",
                           (ident.user_id, fingerprint, since)).fetchone()
    else:
        row = conn.execute("SELECT * FROM docking_jobs WHERE owner_user_id IS NULL AND client_hash=? AND fingerprint=? "
                           "AND created_at>=? AND status!='failed' ORDER BY created_at DESC LIMIT 1",
                           (ident.client_hash, fingerprint, since)).fetchone()
    conn.close()
    return dict(row) if row else None


def _validate_protein(pid: str) -> str:
    pid = (pid or "").strip()
    if not (P.is_pdb_id(pid) or P.is_uniprot(pid.upper().replace("AF-", "").split("-F")[0])):
        raise HTTPException(422, "protein_pdb_id must be a PDB ID (e.g. 1HSG) or a UniProt accession (e.g. P00533)")
    return pid.upper() if P.is_pdb_id(pid) else pid.upper().replace("AF-", "").split("-F")[0]


async def submit_single(req: DockingRequest, request: Request) -> dict:
    ident = acc.resolve_identity(request)
    protein = _validate_protein(req.protein_pdb_id)
    sizes = (req.size_x, req.size_y, req.size_z)
    if req.ligand_sdf:
        src, lig_key = "sdf", hashlib.sha1(req.ligand_sdf.encode()).hexdigest()
        if len(req.ligand_sdf) > 500_000:
            raise HTTPException(413, "SDF record too large")
    elif req.ligand_smiles:
        from rdkit import Chem
        if Chem.MolFromSmiles(req.ligand_smiles) is None:
            raise HTTPException(422, "Invalid SMILES")
        src, lig_key = "smiles", req.ligand_smiles
    elif req.ligand_cid and req.ligand_cid > 0:
        src, lig_key = "pubchem", f"cid:{req.ligand_cid}"
    else:
        raise HTTPException(422, "Provide ligand_cid, ligand_smiles or ligand_sdf")

    site = _site_cfg(req.site, ident)
    prep_cfg = _prep_cfg(req, req.reference_ligand)
    params = {"c": [req.center_x, req.center_y, req.center_z], "s": list(sizes), "e": req.exhaustiveness,
              "m": req.num_modes,
              "r": req.energy_range, "site": site, "prep": prep_cfg, "seed": req.seed}
    fp = _fingerprint(protein, lig_key, params)
    dup = _find_duplicate(ident, fp)
    if dup:
        return {"job_id": dup["job_id"], "status": dup["status"], "protein_pdb_id": dup["protein_pdb_id"],
                "ligand_cid": dup["ligand_cid"], "ligand_name": dup["ligand_name"], "email": dup.get("email"),
                "created_at": dup["created_at"], "deduplicated": True, "adjustments": []}

    exh, modes, notes = req.exhaustiveness, req.num_modes, []
    if req.strict:
        acc.enforce_job_params(ident, exhaustiveness=exh, num_modes=modes, sizes=sizes, private=req.private)
    else:
        exh, modes, sizes, notes = acc.clamp_job_params(ident, exh, modes, sizes)
        acc.enforce_job_params(ident, exhaustiveness=exh, num_modes=modes, sizes=sizes,
                               private=req.private and ident.limits.private_jobs)

    country, code, hosting = await geolocate(ident.ip)
    job_id = str(uuid.uuid4())
    job = create_job(
        job_id=job_id, protein_pdb_id=protein, ligand_cid=req.ligand_cid or 0,
        ligand_name=(req.ligand_name or "ligand")[:120], email=req.email,
        center_x=req.center_x, center_y=req.center_y, center_z=req.center_z,
        size_x=sizes[0], size_y=sizes[1], size_z=sizes[2],
        exhaustiveness=exh, num_modes=modes, energy_range=req.energy_range,
        country=country, country_code=code, geo_hosting=hosting,
        owner_user_id=ident.user_id, owner_email=(ident.user or {}).get("email"),
        client_hash=ident.client_hash,
        visibility="private" if (req.private and ident.limits.private_jobs) else "public",
        priority=ident.limits.priority, retain=1 if plans.is_paid(ident.tier) else 0, tier=ident.tier,
        ligand_smiles=req.ligand_smiles, ligand_sdf=req.ligand_sdf, ligand_source=src,
        protein_source="pdb" if P.is_pdb_id(protein) else "alphafold",
        prep_json=json.dumps(prep_cfg), site_json=json.dumps(site), seed=req.seed, fingerprint=fp,
    )
    out = job.model_dump() if hasattr(job, "model_dump") else job.dict()
    out["adjustments"] = notes
    return out


# ---------------------------------------------------------------------------
# Pricing / account / auth
# ---------------------------------------------------------------------------

@router.get("/api/pricing")
async def pricing():
    return plans.public_catalog()


@router.get("/api/account")
async def account(request: Request):
    return acc.account_summary(acc.resolve_identity(request))


class LinkRequest(BaseModel):
    email: str
    next: Optional[str] = None
    client: Optional[str] = None  # "app": phone app (adds a code, opens the app)


EMAIL_SIGNIN_UNAVAILABLE = (
    "Email sign-in is temporarily unavailable. You can still dock without an "
    "account; please try signing in again later."
)


@router.post("/api/auth/request-link")
async def request_link(body: LinkRequest):
    email = (body.email or "").strip().lower()
    if not acc.valid_email(email):
        raise HTTPException(422, "Enter a valid email address")
    if acc.recent_login_requests(email) >= 5:
        raise HTTPException(429, "Too many sign-in emails. Try again in 15 minutes.")
    dev_login = os.environ.get("MOLDOCK_DEV_LOGIN") == "1" and not smtp_configured()
    if not smtp_configured() and not dev_login:
        # No mail server: say so instead of telling the user to check an
        # inbox that will never receive anything.
        raise HTTPException(503, EMAIL_SIGNIN_UNAVAILABLE)
    token = acc.create_login_token(email)
    nxt = body.next if (body.next or "").startswith("/") else "/account"
    code = None
    if body.client == "app":
        # The web verify page hands the token to the app (dockit://auth);
        # the code covers e-mail read on another device.
        code = acc.attach_login_code(token)
        link = f"{billing.public_base_url()}/auth/verify?token={token}&app=1"
    else:
        link = f"{billing.public_base_url()}/auth/verify?token={token}&next={nxt}"
    sent = send_login_email(email, link, code)
    resp = {"ok": True, "sent": sent}
    # Local development only: no SMTP → hand the link back so sign-in works.
    if not sent and dev_login:
        resp["dev_link"] = link
        if code:
            resp["dev_code"] = code
    elif not sent:
        raise HTTPException(503, EMAIL_SIGNIN_UNAVAILABLE)
    return resp


@router.get("/api/auth/verify")
async def verify_link(token: str = Query(..., min_length=10)):
    user = acc.consume_login_token(token)
    if not user:
        raise HTTPException(400, "This sign-in link is invalid, used or expired.")
    session = acc.create_session(user["user_id"])
    tier, sources = acc.tier_for_user(user)
    return {"session_token": session, "email": user["email"], "tier": tier}


class CodeRequest(BaseModel):
    email: str
    code: str


@router.post("/api/auth/verify-code")
async def verify_code(body: CodeRequest):
    user = acc.consume_login_code(body.email, body.code)
    if not user:
        raise HTTPException(400, "That code is wrong or has expired. Request a new one.")
    session = acc.create_session(user["user_id"])
    tier, sources = acc.tier_for_user(user)
    return {"session_token": session, "email": user["email"], "tier": tier}


@router.post("/api/auth/logout")
async def logout(request: Request):
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        acc.revoke_session(auth[7:].strip())
    return {"ok": True}


@router.get("/api/account/jobs")
async def my_jobs(request: Request, limit: int = Query(100, ge=1, le=500)):
    ident = acc.require_user(request)
    conn = get_db()
    rows = conn.execute(
        "SELECT job_id, status, protein_pdb_id, ligand_cid, ligand_name, created_at, completed_at, "
        "best_affinity, num_poses, visibility, batch_id FROM docking_jobs WHERE owner_user_id=? "
        "AND batch_id IS NULL ORDER BY created_at DESC LIMIT ?", (ident.user_id, limit)).fetchall()
    batches = conn.execute(
        "SELECT batch_id, name, protein_pdb_id, created_at, n_ligands, visibility FROM batches "
        "WHERE owner_user_id=? ORDER BY created_at DESC LIMIT 50", (ident.user_id,)).fetchall()
    conn.close()
    return {"jobs": [dict(r) for r in rows], "batches": [dict(b) for b in batches]}


class KeyRequest(BaseModel):
    label: Optional[str] = ""


@router.get("/api/account/api-keys")
async def list_keys(request: Request):
    ident = acc.require_user(request)
    return {"keys": acc.list_api_keys(ident.user_id), "allowed": ident.limits.api_keys}


@router.post("/api/account/api-keys")
async def create_key(body: KeyRequest, request: Request):
    ident = acc.require_user(request)
    if ident.via == "api_key":
        raise HTTPException(403, "Create API keys from the website, not with another API key")
    if not ident.limits.api_keys:
        raise acc.upgrade_error("api", "API keys are part of MolDock Pro.")
    if len(acc.list_api_keys(ident.user_id)) >= 10:
        raise HTTPException(409, "At most 10 active keys")
    return acc.create_api_key(ident.user_id, body.label or "")


@router.delete("/api/account/api-keys/{key_id}")
async def delete_key(key_id: str, request: Request):
    ident = acc.require_user(request)
    if not acc.revoke_api_key(ident.user_id, key_id):
        raise HTTPException(404, "Key not found")
    return {"ok": True}


class MemberRequest(BaseModel):
    email: str


def _owned_org(ident: acc.Identity) -> dict:
    org = acc.get_org(ident.user.get("org_id")) if ident.user.get("org_id") else None
    if not org or (org.get("owner_email") or "").lower() != (ident.user.get("email") or "").lower():
        raise HTTPException(403, "Only the lab owner can manage seats")
    return org


@router.post("/api/account/org/members")
async def org_add(body: MemberRequest, request: Request):
    ident = acc.require_user(request)
    org = _owned_org(ident)
    if not acc.valid_email(body.email):
        raise HTTPException(422, "Enter a valid email")
    return acc.add_org_member(org["org_id"], body.email)


@router.delete("/api/account/org/members")
async def org_remove(email: str, request: Request):
    ident = acc.require_user(request)
    org = _owned_org(ident)
    if email.lower() == (org.get("owner_email") or "").lower():
        raise HTTPException(400, "The owner keeps their seat")
    return acc.remove_org_member(org["org_id"], email)


# --- Billing ----------------------------------------------------------------

class CheckoutRequest(BaseModel):
    plan: str


@router.post("/api/billing/checkout")
async def checkout(body: CheckoutRequest, request: Request):
    ident = acc.require_user(request)
    if not plans.get_plan(body.plan):
        raise HTTPException(400, "This plan is not available yet")
    if plans.is_paid(ident.tier) and "stripe" in ident.sources:
        raise HTTPException(409, "You already have an active subscription — manage it from your account")
    try:
        return {"url": billing.create_checkout_session(ident.user, body.plan)}
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@router.post("/api/billing/portal")
async def portal(request: Request):
    ident = acc.require_user(request)
    try:
        return {"url": billing.create_portal_session(ident.user)}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except RuntimeError as e:
        raise HTTPException(503, str(e))


@router.post("/api/billing/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    try:
        event = billing.parse_webhook(payload, request.headers.get("stripe-signature"))
    except billing.SignatureError as e:
        raise HTTPException(400, f"Invalid signature: {e}")
    return billing.handle_event(event)


class LabQuote(BaseModel):
    name: str
    email: str
    institution: str
    seats: int = 5
    message: Optional[str] = ""


@router.post("/api/lab-quote")
async def lab_quote(body: LabQuote):
    if not acc.valid_email(body.email) or not body.institution.strip() or not body.name.strip():
        raise HTTPException(422, "Name, institution and a valid email are required")
    seats = max(1, min(int(body.seats or 5), 10000))
    qid = "q_" + uuid.uuid4().hex[:12]
    rec = {"quote_id": qid, "name": body.name.strip()[:120], "email": body.email.strip()[:200],
           "institution": body.institution.strip()[:200], "seats": seats,
           "message": (body.message or "").strip()[:4000], "created_at": datetime.utcnow().isoformat()}
    conn = get_db()
    conn.execute("INSERT INTO lab_quotes (quote_id, name, email, institution, seats, message, created_at) "
                 "VALUES (:quote_id, :name, :email, :institution, :seats, :message, :created_at)", rec)
    conn.commit()
    conn.close()
    owner = os.environ.get("SALES_EMAIL") or os.environ.get("SMTP_USER")
    if owner:
        send_lab_quote_email(owner, rec)
    return {"ok": True, "quote_id": qid}


# --- Store purchases (App Store + Google Play) ------------------------------

def _mask_email(email: Optional[str]) -> str:
    if not email or "@" not in email:
        return ""
    name, _, domain = email.partition("@")
    return f"{name[:1]}***@{domain}"


_STORE_COLUMNS = {
    "storekit_original_tx": ("storekit_original_tx", "storekit_product_id", "storekit_expires_at"),
    "play_purchase_token": ("play_purchase_token", "play_product_id", "play_base_plan",
                            "play_expires_at", "play_order_id", "play_checked_at"),
}


def _bind_store_purchase(ident: acc.Identity, column: str, keys: list[str],
                         account_token: str) -> dict:
    """Pick the MolDock account a verified store purchase belongs to.

    `column` holds the store's subscription key (App Store original
    transaction id / Play purchase token); `keys` are this purchase's key
    plus any it replaced. The purchase's account token (appAccountToken /
    obfuscatedAccountId) wins: a signed-in user cannot claim a subscription
    bought for another e-mail account, and an anonymous restore signs into
    the account that bought it. A purchase made signed-out lives on an
    e-mail-less account; signing in and restoring moves it onto the real
    account. One store subscription → one MolDock account.
    """
    keys = [k for k in keys if k]
    owner = acc.user_for_app_account_token(account_token)
    user = ident.user
    if user:
        if owner and owner["user_id"] != user["user_id"] and owner.get("email"):
            masked = _mask_email(owner.get("email"))
            raise HTTPException(409, "This subscription belongs to another MolDock account"
                                + (f" ({masked})" if masked else "")
                                + ". Sign in with that account to use it.")
    else:
        user = owner
        if not user:
            conn = get_db()
            marks = ",".join("?" * len(keys))
            row = conn.execute(f"SELECT user_id FROM users WHERE {column} IN ({marks})", keys).fetchone()
            conn.close()
            user = acc.get_user(row["user_id"]) if row else None
        if not user:
            uid = "u_" + uuid.uuid4().hex[:20]
            conn = get_db()
            conn.execute("INSERT INTO users (user_id, created_at) VALUES (?, ?)", (uid, datetime.utcnow().isoformat()))
            conn.commit()
            conn.close()
            user = acc.get_user(uid)
    # Moving the subscription takes its entitlement off the previous holder.
    cleared = ", ".join(f"{c}=NULL" for c in _STORE_COLUMNS[column])
    conn = get_db()
    marks = ",".join("?" * len(keys))
    conn.execute(f"UPDATE users SET {cleared} WHERE {column} IN ({marks}) AND user_id!=?",
                 (*keys, user["user_id"]))
    conn.commit()
    conn.close()
    return user


def _purchase_response(ident: acc.Identity, user: dict, ent: dict) -> dict:
    out = {"ok": True, "tier": acc.tier_for_user(acc.get_user(user["user_id"]))[0], "entitlement": ent}
    if not ident.user:
        out["session_token"] = acc.create_session(user["user_id"])
    return out


class StoreKitBody(BaseModel):
    jws: str


@router.post("/api/storekit/verify")
async def storekit_verify(body: StoreKitBody, request: Request):
    from api.storekit import StoreKitVerificationError, verify_transaction_jws
    try:
        ent = verify_transaction_jws(body.jws)
    except StoreKitVerificationError as e:
        raise HTTPException(400, str(e))
    ident = acc.resolve_identity(request)
    otx = ent["original_transaction_id"]
    user = _bind_store_purchase(ident, "storekit_original_tx", [otx], ent.get("app_account_token", ""))
    acc.update_user(user["user_id"], storekit_original_tx=otx, storekit_product_id=ent["product_id"],
                    storekit_expires_at=(ent["expires_at"] or "")[:19] or None)
    return _purchase_response(ident, user, ent)


class PlayBody(BaseModel):
    purchase_token: str
    product_id: Optional[str] = None


@router.post("/api/play/verify")
async def play_verify(body: PlayBody, request: Request):
    """Android: verify a Play Billing subscription with Google and grant
    its tier to the account (see playbilling.py)."""
    from api import playbilling
    try:
        ent = playbilling.verify_purchase(body.purchase_token)
    except playbilling.PlayVerificationError as e:
        raise HTTPException(400, str(e))
    except playbilling.PlayNotConfigured:
        logger.error("POST /api/play/verify but GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is unset")
        raise HTTPException(503, "Google Play purchases can't be verified right now. Please try again later.")
    except playbilling.PlayUnavailable as e:
        logger.error("Play verification unavailable: %s", e)
        raise HTTPException(502, "Google Play could not be reached. Please try again shortly.")
    ident = acc.resolve_identity(request)
    token = ent["purchase_token"]
    user = _bind_store_purchase(ident, "play_purchase_token", [token, ent["linked_purchase_token"]],
                                ent["account_token"])
    acc.update_user(user["user_id"], play_purchase_token=token, play_product_id=ent["product_id"],
                    play_base_plan=ent["base_plan_id"] or None, play_order_id=ent["order_id"] or None,
                    play_expires_at=playbilling.stored_expiry(ent),
                    play_checked_at=datetime.utcnow().isoformat())
    # The purchase token is the user's secret; don't echo it back.
    public = {k: v for k, v in ent.items() if k not in ("purchase_token", "linked_purchase_token")}
    return _purchase_response(ident, user, public)


# --- Admin (Lab orgs) -------------------------------------------------------

def _admin(request: Request):
    token = os.environ.get("MOLDOCK_ADMIN_TOKEN", "")
    if not token or request.headers.get("x-admin-token") != token:
        raise HTTPException(403, "Forbidden")


class OrgRequest(BaseModel):
    name: str
    seats: int
    owner_email: str
    expires_at: Optional[str] = None


@router.post("/api/admin/orgs")
async def admin_create_org(body: OrgRequest, request: Request):
    _admin(request)
    return acc.create_org(body.name, body.seats, body.owner_email, body.expires_at)


@router.post("/api/admin/orgs/{org_id}/members")
async def admin_add_member(org_id: str, body: MemberRequest, request: Request):
    _admin(request)
    return acc.add_org_member(org_id, body.email)


# ---------------------------------------------------------------------------
# Structure tools (protein prep / binding site)
# ---------------------------------------------------------------------------

_STRUCT_CACHE: dict = {}


async def _structure(ident_str: str) -> tuple[str, dict]:
    key = ident_str.strip().upper()
    if key in _STRUCT_CACHE:
        return _STRUCT_CACHE[key]
    try:
        val = await P.fetch_structure(ident_str)
    except P.PrepError as e:
        raise HTTPException(404, str(e))
    if len(_STRUCT_CACHE) > 32:
        _STRUCT_CACHE.pop(next(iter(_STRUCT_CACHE)))
    _STRUCT_CACHE[key] = val
    return val


@router.get("/api/structure/{identifier}/inspect")
async def inspect_structure(identifier: str):
    """Chains and hetero groups (candidate co-crystallised ligands)."""
    text, source = await _structure(identifier)
    return {"source": source, "chains": P.list_chains(text), "hetero": P.list_hetero_groups(text),
            "metals_and_cofactors_hint": sorted(P.METALS)}


@router.get("/api/structure/{identifier}/pockets")
async def structure_pockets(identifier: str, chains: Optional[str] = None):
    text, _ = await _structure(identifier)
    clean, _ = P.clean_protein(text, chains=[c for c in (chains or "").split(",") if c])
    return {"pockets": S.detect_pockets(clean), "method": "grid buriedness (14 rays, 1 Å grid)"}


class SiteBody(BaseModel):
    protein: str
    mode: str
    ligand: Optional[str] = None
    residues: Optional[str] = None
    pocket_rank: int = 1
    chains: Optional[List[str]] = None


@router.post("/api/structure/site")
async def preview_site(body: SiteBody):
    """Preview the box a site definition will produce."""
    text, _ = await _structure(body.protein)
    try:
        if body.mode == "ligand":
            ref = _parse_ref(body.ligand) or {}
            return S.site_from_ligand(text, ref.get("resname", ""), ref.get("chain"), ref.get("resseq"))
        if body.mode == "residues":
            clean, _ = P.clean_protein(text, chains=body.chains)
            return S.site_from_residues(clean, body.residues or "")
        if body.mode == "pocket":
            clean, _ = P.clean_protein(text, chains=body.chains)
            pockets = S.detect_pockets(clean)
            if not pockets:
                raise HTTPException(404, "No pocket found")
            return pockets[max(0, min(body.pocket_rank - 1, len(pockets) - 1))]
        clean, _ = P.clean_protein(text, chains=body.chains)
        return S.protein_center_box(clean)
    except (ValueError, P.PrepError) as e:
        raise HTTPException(422, str(e))


# ---------------------------------------------------------------------------
# Batch / virtual screening
# ---------------------------------------------------------------------------

@router.post("/api/batch")
async def submit_batch(req: BatchRequest, request: Request):
    ident = acc.resolve_identity(request)
    protein = _validate_protein(req.protein_pdb_id)
    if not ident.user and ident.limits.max_batch_ligands == 0:
        raise acc.PaywallError(401, "sign_in_required",
                               "Sign in (free) to screen up to 5 ligands, or go Pro for 500 per batch.",
                               feature="batch")
    if len(req.library) > 5_000_000:
        raise HTTPException(413, "Library too large (5 MB max)")
    cap = max(ident.limits.max_batch_ligands, 1)
    items = P.parse_ligand_library(req.library, max_n=cap + 1)
    valid = [i for i in items if not i.get("error")]
    if not valid:
        raise HTTPException(422, "No valid ligands found (one SMILES per line, or an SDF file)")
    sizes = (req.size_x, req.size_y, req.size_z)
    acc.enforce_job_params(ident, exhaustiveness=req.exhaustiveness, num_modes=req.num_modes,
                           sizes=sizes, private=req.private, n_ligands=len(valid), batch=True)
    site = _site_cfg(req.site, ident)
    prep_cfg = _prep_cfg(req, None)
    if site.get("mode") == "ligand":
        prep_cfg["reference_ligand"] = None  # different ligands: RMSD to crystal is meaningless
    batch_id = "b_" + uuid.uuid4().hex[:16]
    vis = "private" if req.private else "public"
    retain = 1 if plans.is_paid(ident.tier) else 0
    country, code, hosting = await geolocate(ident.ip)
    conn = get_db()
    conn.execute("INSERT INTO batches (batch_id, owner_user_id, client_hash, name, protein_pdb_id, params_json, "
                 "visibility, created_at, n_ligands, retain) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                 (batch_id, ident.user_id, ident.client_hash, (req.name or f"Screen vs {protein}")[:120], protein,
                  json.dumps({"site": site, "prep": prep_cfg, "exhaustiveness": req.exhaustiveness,
                              "num_modes": req.num_modes, "size": sizes,
                              "center": [req.center_x, req.center_y, req.center_z],
                              "skipped": [i for i in items if i.get("error")]}),
                  vis, datetime.utcnow().isoformat(), len(valid), retain))
    for item in valid:
        create_job(
            job_id=str(uuid.uuid4()), protein_pdb_id=protein, ligand_cid=0, ligand_name=item["name"], email=None,
            center_x=req.center_x, center_y=req.center_y, center_z=req.center_z,
            size_x=sizes[0], size_y=sizes[1], size_z=sizes[2], exhaustiveness=req.exhaustiveness,
            num_modes=req.num_modes, energy_range=req.energy_range, conn=conn,
            owner_user_id=ident.user_id, client_hash=ident.client_hash, visibility=vis,
            priority=ident.limits.priority - 1, retain=retain, tier=ident.tier, batch_id=batch_id,
            ligand_smiles=item.get("smiles"), ligand_sdf=item.get("sdf"),
            ligand_source="sdf" if item.get("sdf") else "smiles",
            protein_source="pdb" if P.is_pdb_id(protein) else "alphafold",
            prep_json=json.dumps(prep_cfg), site_json=json.dumps(site), seed=req.seed,
            country=country, country_code=code, geo_hosting=hosting,
        )
    conn.commit()
    conn.close()
    return {"batch_id": batch_id, "n_ligands": len(valid),
            "skipped": [{"name": i["name"], "error": i["error"]} for i in items if i.get("error")],
            "truncated": len(items) > cap}


def _batch_rows(batch_id: str) -> tuple[Optional[dict], list[dict]]:
    conn = get_db()
    b = conn.execute("SELECT batch_id, owner_user_id, client_hash, name, protein_pdb_id, params_json, visibility, "
                     "created_at, n_ligands FROM batches WHERE batch_id=?", (batch_id,)).fetchone()
    rows = conn.execute("SELECT job_id, ligand_name, ligand_smiles, ligand_cid, status, best_affinity, "
                        "analysis_json, error_message, completed_at FROM docking_jobs WHERE batch_id=?",
                        (batch_id,)).fetchall()
    conn.close()
    if not b:
        return None, []
    out = []
    for r in rows:
        d = dict(r)
        an = json.loads(d.pop("analysis_json") or "{}") if d.get("analysis_json") else {}
        p0 = (an.get("poses") or [None])[0] or {}
        d["heavy_atoms"] = an.get("heavy_atoms")
        d["ligand_efficiency"] = an.get("ligand_efficiency")
        d["hbonds"] = (p0.get("counts") or {}).get("hbond")
        d["key_residues"] = [x["residue"] for x in (p0.get("residues") or [])[:5]]
        out.append(d)
    done = [r for r in out if r["status"] == "completed" and r["best_affinity"] is not None]
    done.sort(key=lambda r: r["best_affinity"])
    for i, r in enumerate(done, start=1):
        r["rank"] = i
    rest = [r for r in out if r not in done]
    return dict(b), done + rest


@router.get("/api/batch/{batch_id}")
async def get_batch(batch_id: str, request: Request):
    ident = acc.resolve_identity(request)
    b, rows = _batch_rows(batch_id)
    if not b or not acc.can_view(b, ident):
        raise HTTPException(404, "Batch not found")
    counts = {s: sum(1 for r in rows if r["status"] == s) for s in ("queued", "preparing", "docking", "completed", "failed")}
    params = json.loads(b.pop("params_json") or "{}")
    b.pop("client_hash", None)
    b.pop("owner_user_id", None)
    return {**b, "params": params, "counts": counts, "ligands": rows}


@router.get("/api/batch/{batch_id}/csv")
async def batch_csv(batch_id: str, request: Request):
    ident = acc.resolve_identity(request)
    b, rows = _batch_rows(batch_id)
    if not b or not acc.can_view(b, ident):
        raise HTTPException(404, "Batch not found")
    return PlainTextResponse(exports.batch_csv(b, rows), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename=moldock_{batch_id}.csv"})


# ---------------------------------------------------------------------------
# Results: analysis + exports
# ---------------------------------------------------------------------------

def load_viewable_job(job_id: str, request: Request, completed: bool = True) -> tuple[dict, acc.Identity]:
    ident = acc.resolve_identity(request)
    row = get_job_full(job_id)
    if not row or not acc.can_view(row, ident):
        raise HTTPException(404, "Job not found")
    if completed and row["status"] != JobStatus.COMPLETED.value:
        raise HTTPException(400, f"Job status is {row['status']}, not completed")
    if not row.get("receptor_pdb_gz") and row.get("batch_id"):
        conn = get_db()
        b = conn.execute("SELECT receptor_pdb_gz FROM batches WHERE batch_id=?", (row["batch_id"],)).fetchone()
        conn.close()
        if b and b["receptor_pdb_gz"]:
            row["receptor_pdb_gz"] = b["receptor_pdb_gz"]
    return row, ident


def analysis_for_viewer(row: dict, ident: acc.Identity) -> dict:
    """Interactions for every pose on Pro/Lab; best pose only otherwise."""
    an = json.loads(row.get("analysis_json") or "{}") if row.get("analysis_json") else {}
    poses = an.get("poses") or []
    owner_paid = plans.is_paid(row.get("tier") or "")
    if not (ident.limits.all_pose_interactions or owner_paid):
        an["poses"] = poses[:1] + [{"locked": True} for _ in poses[1:]]
        an["locked_reason"] = "Interaction analysis for every pose is part of MolDock Pro."
    return an


@router.get("/api/results/{job_id}/interactions")
async def interactions(job_id: str, request: Request, pose: int = Query(1, ge=1)):
    row, ident = load_viewable_job(job_id, request)
    an = analysis_for_viewer(row, ident)
    poses = an.get("poses") or []
    if pose > len(poses):
        # Batch children only analyse pose 1 at run time; compute on demand.
        rec = exports.receptor_pdb(row)
        blocks = split_models(row.get("output_pdbqt") or "")
        if pose > len(blocks) or not rec:
            raise HTTPException(404, "No such pose")
        if pose > 1 and not (ident.limits.all_pose_interactions or plans.is_paid(row.get("tier") or "")):
            raise acc.upgrade_error("pose_interactions", "Interaction analysis for every pose is part of MolDock Pro.")
        from api.analysis import analyze_pose
        return analyze_pose(blocks[pose - 1], rec)
    data = poses[pose - 1]
    if data and data.get("locked"):
        raise acc.upgrade_error("pose_interactions", an.get("locked_reason", "Upgrade to see this pose."))
    return data or {"interactions": [], "residues": [], "error": "analysis unavailable"}


@router.get("/api/results/{job_id}/interactions.svg")
async def interactions_svg(job_id: str, request: Request, pose: int = Query(1, ge=1)):
    data = await interactions(job_id, request, pose)
    row, _ = load_viewable_job(job_id, request)
    blocks = split_models(row.get("output_pdbqt") or "")
    svg = interaction_svg(blocks[pose - 1], data) if pose <= len(blocks) else ""
    if not svg:
        raise HTTPException(404, "Diagram unavailable")
    return Response(svg, media_type="image/svg+xml")


_EXPORTS = {
    "sdf": ("chemical/x-mdl-sdfile", "poses.sdf", lambda r: exports.poses_sdf(r)),
    "complex": ("chemical/x-pdb", "complex_pose1.pdb", lambda r: exports.complex_pdb(r)),
    "receptor": ("chemical/x-pdb", "receptor.pdb", lambda r: exports.receptor_pdb(r)),
    "pymol": ("text/plain", "moldock.pml", lambda r: exports.pymol_script(r)),
    "chimerax": ("text/plain", "open_in_chimerax.cxc", lambda r: exports.chimerax_script(r)),
    "csv": ("text/csv", "poses.csv", lambda r: exports.poses_csv(r)),
    "interactions-csv": ("text/csv", "interactions.csv", lambda r: exports.interactions_csv(r)),
    "params": ("application/json", "params.json", lambda r: json.dumps(exports.params_record(r), indent=2)),
    "methods": ("text/plain", "methods.txt", lambda r: exports.methods_paragraph(r) + "\n"),
    "bibtex": ("text/x-bibtex", "citation.bib", lambda r: exports.bibtex(r)),
}


@router.get("/api/results/{job_id}/export/{fmt}")
async def export(job_id: str, fmt: str, request: Request):
    row, ident = load_viewable_job(job_id, request)
    # Same gating as the results page: per-pose interactions beyond pose 1
    # are Pro, so exports carry what this viewer is allowed to see.
    row = dict(row)
    row["analysis_json"] = json.dumps(analysis_for_viewer(row, ident))
    if fmt == "zip":
        svg = None
        try:
            an = json.loads(row.get("analysis_json") or "{}")
            blocks = split_models(row.get("output_pdbqt") or "")
            if an.get("poses") and an["poses"][0] and blocks:
                svg = interaction_svg(blocks[0], an["poses"][0])
        except Exception:
            pass
        return Response(exports.bundle_zip(row, svg), media_type="application/zip",
                        headers={"Content-Disposition": f"attachment; filename=moldock_{job_id[:8]}.zip"})
    if fmt not in _EXPORTS:
        raise HTTPException(404, f"Unknown export '{fmt}'. Options: zip, {', '.join(_EXPORTS)}")
    media, name, fn = _EXPORTS[fmt]
    body = fn(row)
    if not body:
        raise HTTPException(404, "Not available for this job (older jobs lack the prepared receptor)")
    fname = f"moldock_{job_id[:8]}_{name}"
    return PlainTextResponse(body, media_type=media, headers={"Content-Disposition": f"attachment; filename={fname}"})
