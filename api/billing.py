"""Stripe Checkout + Customer Portal + webhook for MolDock Pro.

No Stripe SDK: the three calls we need are plain form-encoded POSTs, and
webhook signatures are HMAC-SHA256 over "<t>.<payload>" — implemented here
so it can be unit-tested offline.

Env:
    STRIPE_SECRET_KEY        sk_live_... / sk_test_...
    STRIPE_WEBHOOK_SECRET    whsec_...  (endpoint: POST /api/billing/webhook)
    STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_PRO_ANNUAL   (see plans.py)
    PUBLIC_BASE_URL          https://lcbc-client.apps.johnseong.com
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Optional

import httpx

from api import plans
from api.accounts import get_user, update_user
from api.database import get_db

logger = logging.getLogger(__name__)

STRIPE_API = "https://api.stripe.com/v1"
SIGNATURE_TOLERANCE = 300  # seconds


def public_base_url() -> str:
    return os.environ.get("PUBLIC_BASE_URL", os.environ.get("BASE_URL", "https://lcbc-client.apps.johnseong.com")).rstrip("/")


def _secret() -> str:
    key = os.environ.get("STRIPE_SECRET_KEY", "").strip()
    if not key:
        raise RuntimeError("Stripe is not configured (STRIPE_SECRET_KEY unset)")
    return key


def _post(path: str, data: dict) -> dict:
    resp = httpx.post(f"{STRIPE_API}{path}", data=data, auth=(_secret(), ""), timeout=20)
    if resp.status_code >= 400:
        try:
            msg = resp.json().get("error", {}).get("message", resp.text)
        except Exception:
            msg = resp.text
        raise RuntimeError(f"Stripe error: {msg}")
    return resp.json()


def checkout_params(user: dict, plan: plans.Plan) -> dict:
    """Form fields for POST /v1/checkout/sessions (pure — unit tested)."""
    base = public_base_url()
    data = {
        "mode": "subscription",
        "line_items[0][price]": plan.price_id,
        "line_items[0][quantity]": "1",
        "success_url": f"{base}/account?checkout=success&session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{base}/pricing?checkout=cancelled",
        "client_reference_id": user["user_id"],
        "subscription_data[metadata][user_id]": user["user_id"],
        "subscription_data[metadata][app]": "moldock",
        "metadata[user_id]": user["user_id"],
        "metadata[plan]": plan.key,
    }
    if user.get("stripe_customer_id"):
        data["customer"] = user["stripe_customer_id"]
    elif user.get("email"):
        data["customer_email"] = user["email"]
    if plans.promo_codes_enabled():
        data["allow_promotion_codes"] = "true"
    if plans.trial_days():
        data["subscription_data[trial_period_days]"] = str(plans.trial_days())
    return data


def create_checkout_session(user: dict, plan_key: str) -> str:
    plan = plans.get_plan(plan_key)
    if not plan:
        raise ValueError("Unknown or unavailable plan")
    session = _post("/checkout/sessions", checkout_params(user, plan))
    return session["url"]


def create_portal_session(user: dict) -> str:
    if not user.get("stripe_customer_id"):
        raise ValueError("No Stripe customer for this account yet")
    params = {
        "customer": user["stripe_customer_id"],
        "return_url": f"{public_base_url()}/account",
    }
    # The Stripe account is shared with other apps; a MolDock-specific portal
    # configuration keeps the headline and allowed actions MolDock's own.
    configuration = os.environ.get("STRIPE_PORTAL_CONFIGURATION", "").strip()
    if configuration:
        params["configuration"] = configuration
    session = _post("/billing_portal/sessions", params)
    return session["url"]


# ---------------------------------------------------------------------------
# Webhook
# ---------------------------------------------------------------------------

class SignatureError(ValueError):
    pass


def verify_signature(payload: bytes, header: Optional[str], secret: str,
                     now: Optional[float] = None, tolerance: int = SIGNATURE_TOLERANCE) -> None:
    """Stripe-Signature: t=<ts>,v1=<hex>[,v1=<hex>...]"""
    if not header or not secret:
        raise SignatureError("missing signature or secret")
    ts, sigs = None, []
    for part in header.split(","):
        k, _, v = part.strip().partition("=")
        if k == "t":
            ts = v
        elif k == "v1":
            sigs.append(v)
    if not ts or not sigs:
        raise SignatureError("malformed signature header")
    try:
        ts_i = int(ts)
    except ValueError:
        raise SignatureError("bad timestamp")
    if abs((now if now is not None else time.time()) - ts_i) > tolerance:
        raise SignatureError("timestamp outside tolerance")
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected, s) for s in sigs):
        raise SignatureError("signature mismatch")


def _iso(ts: Optional[int]) -> Optional[str]:
    if not ts:
        return None
    return datetime.fromtimestamp(int(ts), tz=timezone.utc).replace(tzinfo=None).isoformat()


def _user_for_customer(customer_id: Optional[str]) -> Optional[dict]:
    if not customer_id:
        return None
    conn = get_db()
    row = conn.execute("SELECT user_id FROM users WHERE stripe_customer_id=?", (customer_id,)).fetchone()
    conn.close()
    return get_user(row["user_id"]) if row else None


def _already_processed(event_id: str, event_type: str) -> bool:
    conn = get_db()
    try:
        conn.execute("INSERT INTO stripe_events (event_id, type, received_at) VALUES (?, ?, ?)",
                     (event_id, event_type, datetime.utcnow().isoformat()))
        conn.commit()
        return False
    except Exception:
        return True
    finally:
        conn.close()


def _apply_subscription(sub: dict) -> Optional[str]:
    user_id = (sub.get("metadata") or {}).get("user_id")
    user = get_user(user_id) if user_id else None
    user = user or _user_for_customer(sub.get("customer"))
    if not user:
        logger.warning("Stripe subscription %s has no matching MolDock user", sub.get("id"))
        return None
    items = (sub.get("items") or {}).get("data") or [{}]
    item = items[0] or {}
    price_id = (item.get("price") or {}).get("id")
    # API ≥ 2025-03 moved current_period_end onto the subscription item.
    period_end = sub.get("current_period_end") or item.get("current_period_end")
    update_user(
        user["user_id"],
        stripe_customer_id=sub.get("customer") or user.get("stripe_customer_id"),
        stripe_subscription_id=sub.get("id"),
        stripe_price_id=price_id,
        stripe_status=sub.get("status"),
        stripe_period_end=_iso(period_end),
    )
    return user["user_id"]


def handle_event(event: dict) -> dict:
    """Apply a verified Stripe event. Idempotent by event id."""
    etype = event.get("type", "")
    obj = (event.get("data") or {}).get("object") or {}
    if event.get("id") and _already_processed(event["id"], etype):
        return {"ok": True, "duplicate": True}

    if etype == "checkout.session.completed":
        user_id = obj.get("client_reference_id") or (obj.get("metadata") or {}).get("user_id")
        user = get_user(user_id) if user_id else None
        if user and obj.get("customer"):
            update_user(user["user_id"], stripe_customer_id=obj["customer"],
                        stripe_subscription_id=obj.get("subscription") or user.get("stripe_subscription_id"))
            # The subscription.* event carries price + period; mark active now
            # so the user sees Pro the moment they land back on the site.
            if obj.get("mode") == "subscription" and obj.get("payment_status") in ("paid", "no_payment_required"):
                plan = plans.get_plan((obj.get("metadata") or {}).get("plan"))
                fields = {"stripe_status": "active"}
                if plan:
                    fields["stripe_price_id"] = plan.price_id
                update_user(user["user_id"], **fields)
        return {"ok": True, "user_id": user_id}

    if etype in ("customer.subscription.created", "customer.subscription.updated",
                 "customer.subscription.deleted", "customer.subscription.paused",
                 "customer.subscription.resumed"):
        return {"ok": True, "user_id": _apply_subscription(obj)}

    if etype == "invoice.payment_failed":
        user = _user_for_customer(obj.get("customer"))
        if user:
            update_user(user["user_id"], stripe_status="past_due")
        return {"ok": True}

    return {"ok": True, "ignored": etype}


def parse_webhook(payload: bytes, signature: Optional[str]) -> dict:
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "").strip()
    verify_signature(payload, signature, secret)
    return json.loads(payload)
