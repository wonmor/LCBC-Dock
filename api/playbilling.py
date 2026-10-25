"""Google Play Billing subscription verification for MolDock Android.

The Android app buys the `moldock_pro` subscription (base plans `monthly`
and `annual`) with Play Billing, passing the account's app_account_token as
obfuscatedAccountId, then POSTs the purchase token to /api/play/verify. The
server never trusts the client: it asks the Google Play Developer API
(purchases.subscriptionsv2.get) for the subscription's real state and only
then grants Pro, exactly as storekit.py does for Apple's signed JWS.

No RTDN (Pub/Sub) is needed: like StoreKit, the expiry is stored on the
account and the tier lapses by itself when it passes. Renewals are picked
up lazily — when a signed-in request arrives after the stored expiry, the
server re-queries Google (at most once per PLAY_RECHECK_MINUTES) and moves
the expiry forward if the subscription renewed. The app also re-posts its
active purchase on launch.

No Google SDK: the service-account OAuth exchange is one RS256-signed JWT
and the two Play calls are plain HTTPS, so all of it is unit-tested offline.

Env:
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON  service-account key JSON (raw, or
                                      base64 of it). Needs "View financial
                                      data" + "Manage orders and
                                      subscriptions" on the Play app.
    GOOGLE_PLAY_PACKAGE_NAME          default com.johnseong.dock_it
    PLAY_RECHECK_MINUTES              lazy renewal re-check interval (60)
"""
from __future__ import annotations

import base64
import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import quote

import httpx

_logger = logging.getLogger(__name__)

DEFAULT_PACKAGE_NAME = "com.johnseong.dock_it"
ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher"
TOKEN_URL = "https://oauth2.googleapis.com/token"
PUBLISHER_API = "https://androidpublisher.googleapis.com/androidpublisher/v3"

# subscriptionState values that carry an entitlement while expiryTime is in
# the future. CANCELED means auto-renew was switched off: the user keeps
# access until the paid period ends. Everything else (PENDING, ON_HOLD,
# PAUSED, EXPIRED, PENDING_PURCHASE_CANCELED) grants nothing.
ENTITLED_STATES = (
    "SUBSCRIPTION_STATE_ACTIVE",
    "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
    "SUBSCRIPTION_STATE_CANCELED",
)


class PlayVerificationError(ValueError):
    """The purchase cannot be trusted or grants nothing. Safe to echo."""


class PlayNotConfigured(RuntimeError):
    """No service account configured (→ 503)."""


class PlayUnavailable(RuntimeError):
    """Google could not be reached or refused our credentials (→ 502)."""


def package_name() -> str:
    return (os.environ.get("GOOGLE_PLAY_PACKAGE_NAME") or DEFAULT_PACKAGE_NAME).strip()


def recheck_minutes() -> int:
    try:
        return max(1, int(os.environ.get("PLAY_RECHECK_MINUTES", "60") or 60))
    except ValueError:
        return 60


def tier_for_product_id(product_id: str) -> Optional[str]:
    from api.plans import PLAY_PRODUCTS
    return PLAY_PRODUCTS.get((product_id or "").strip())


# ---------------------------------------------------------------------------
# Service-account OAuth
# ---------------------------------------------------------------------------

def _service_account() -> dict:
    raw = (os.environ.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON") or "").strip()
    if not raw:
        raise PlayNotConfigured("Google Play verification is not configured")
    if not raw.startswith("{"):
        try:
            raw = base64.b64decode(raw).decode()
        except Exception:
            raise PlayNotConfigured("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is neither JSON nor base64 JSON")
    try:
        info = json.loads(raw)
    except ValueError:
        raise PlayNotConfigured("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON")
    if not info.get("client_email") or not info.get("private_key"):
        raise PlayNotConfigured("service account JSON lacks client_email / private_key")
    return info


def configured() -> bool:
    try:
        _service_account()
        return True
    except PlayNotConfigured:
        return False


def build_assertion(info: dict, now: Optional[int] = None) -> str:
    """The signed JWT exchanged for an access token (pure — unit tested)."""
    import jwt
    iat = int(now if now is not None else time.time())
    claims = {
        "iss": info["client_email"],
        "scope": ANDROID_PUBLISHER_SCOPE,
        "aud": TOKEN_URL,
        "iat": iat,
        "exp": iat + 3600,
    }
    headers = {"kid": info["private_key_id"]} if info.get("private_key_id") else None
    return jwt.encode(claims, info["private_key"], algorithm="RS256", headers=headers)


_token_lock = threading.Lock()
_token_cache: dict[str, Any] = {"token": None, "expires": 0.0, "email": None}


def _http_post(url: str, **kw) -> httpx.Response:  # patched in tests
    return httpx.post(url, timeout=15, **kw)


def _http_get(url: str, **kw) -> httpx.Response:  # patched in tests
    return httpx.get(url, timeout=15, **kw)


def access_token() -> str:
    info = _service_account()
    with _token_lock:
        if (_token_cache["token"] and _token_cache["email"] == info["client_email"]
                and _token_cache["expires"] - 60 > time.time()):
            return _token_cache["token"]
        try:
            resp = _http_post(TOKEN_URL, data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": build_assertion(info),
            })
        except httpx.HTTPError:
            raise PlayUnavailable("could not reach Google OAuth")
        if resp.status_code != 200:
            _logger.error("Google OAuth token exchange failed: HTTP %s", resp.status_code)
            raise PlayUnavailable("Google refused the service-account credentials")
        body = resp.json()
        _token_cache.update(token=body["access_token"],
                            expires=time.time() + int(body.get("expires_in", 3600)),
                            email=info["client_email"])
        return body["access_token"]


def _reset_token_cache() -> None:
    with _token_lock:
        _token_cache.update(token=None, expires=0.0, email=None)


# ---------------------------------------------------------------------------
# Play Developer API
# ---------------------------------------------------------------------------

def fetch_subscription(purchase_token: str) -> dict:
    """purchases.subscriptionsv2.get for this app's package."""
    url = (f"{PUBLISHER_API}/applications/{quote(package_name(), safe='')}"
           f"/purchases/subscriptionsv2/tokens/{quote(purchase_token, safe='')}")
    try:
        resp = _http_get(url, headers={"Authorization": f"Bearer {access_token()}"})
    except httpx.HTTPError:
        raise PlayUnavailable("could not reach Google Play")
    if resp.status_code in (400, 404, 410):
        # 410: expired for too long to query; 400/404: not this app's token.
        raise PlayVerificationError("unknown or expired purchase token")
    if resp.status_code in (401, 403):
        _logger.error("Play Developer API refused credentials: HTTP %s", resp.status_code)
        raise PlayUnavailable("Google Play refused the service-account credentials")
    if resp.status_code != 200:
        raise PlayUnavailable(f"Google Play error (HTTP {resp.status_code})")
    return resp.json()


def acknowledge(product_id: str, purchase_token: str) -> bool:
    """Best effort: Play refunds subscriptions left unacknowledged for three
    days. The app acknowledges too (finishTransaction); doing it here as
    well means a crash between purchase and finish can't cost the sale."""
    url = (f"{PUBLISHER_API}/applications/{quote(package_name(), safe='')}"
           f"/purchases/subscriptions/{quote(product_id, safe='')}"
           f"/tokens/{quote(purchase_token, safe='')}:acknowledge")
    try:
        resp = _http_post(url, json={}, headers={"Authorization": f"Bearer {access_token()}"})
        return resp.status_code in (200, 204)
    except Exception:
        _logger.warning("Play acknowledge failed", exc_info=True)
        return False


def _parse_time(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    v = value.strip().replace("Z", "+00:00")
    # Google sends nanosecond precision ("…T12:00:00.123456789Z").
    if "." in v:
        head, _, rest = v.partition(".")
        frac, sign, tz = rest, "", ""
        for s in ("+", "-"):
            if s in rest:
                frac, sign, tz = rest.partition(s)
                break
        v = f"{head}.{frac[:6]}{sign}{tz}"
    try:
        dt = datetime.fromisoformat(v)
    except ValueError:
        raise PlayVerificationError("bad expiryTime")
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def entitlement(sub: dict, purchase_token: str, now: Optional[datetime] = None) -> dict:
    """Normalise a SubscriptionPurchaseV2 (pure — unit tested)::

        {tier, active, state, product_id, base_plan_id, expires_at, order_id,
         auto_renewing, acknowledged, account_token, linked_purchase_token,
         purchase_token, test}

    `tier` is None when no line item is a known MolDock product.
    """
    now = now or datetime.now(timezone.utc)
    best, best_exp, tier = None, None, None
    for item in sub.get("lineItems") or []:
        t = tier_for_product_id(item.get("productId") or "")
        if not t:
            continue
        exp = _parse_time(item.get("expiryTime"))
        if best is None or (exp and (best_exp is None or exp > best_exp)):
            best, best_exp, tier = item, exp, t
    state = sub.get("subscriptionState") or "SUBSCRIPTION_STATE_UNSPECIFIED"
    active = bool(tier and state in ENTITLED_STATES and best_exp and best_exp > now)
    item = best or {}
    return {
        "tier": tier,
        "active": active,
        "state": state,
        "product_id": item.get("productId") or "",
        "base_plan_id": (item.get("offerDetails") or {}).get("basePlanId") or "",
        "expires_at": best_exp.isoformat() if best_exp else None,
        "order_id": item.get("latestSuccessfulOrderId") or sub.get("latestOrderId") or "",
        "auto_renewing": bool((item.get("autoRenewingPlan") or {}).get("autoRenewEnabled")),
        "acknowledged": sub.get("acknowledgementState") == "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED",
        "account_token": (sub.get("externalAccountIdentifiers") or {}).get("obfuscatedExternalAccountId") or "",
        "linked_purchase_token": sub.get("linkedPurchaseToken") or "",
        "purchase_token": purchase_token,
        "test": "testPurchase" in sub,
    }


def verify_purchase(purchase_token: str, now: Optional[datetime] = None) -> dict:
    """Ask Google about this token and return the entitlement, or raise
    PlayVerificationError if it grants nothing right now."""
    token = (purchase_token or "").strip()
    if not token or len(token) > 4096:
        raise PlayVerificationError("malformed purchase token")
    ent = entitlement(fetch_subscription(token), token, now=now)
    if not ent["tier"]:
        raise PlayVerificationError("unknown product")
    if ent["state"] in ("SUBSCRIPTION_STATE_PENDING",):
        raise PlayVerificationError("payment is still pending")
    if not ent["active"]:
        raise PlayVerificationError("subscription has expired")
    if not ent["acknowledged"]:
        ent["acknowledged"] = acknowledge(ent["product_id"], token)
    return ent


def stored_expiry(ent: dict, now: Optional[datetime] = None) -> Optional[str]:
    """What to store as users.play_expires_at: naive-UTC ISO, the format
    accounts.tier_for_user compares. A subscription that grants nothing
    (on hold, paused, pending) is capped at `now` even if Google reports a
    later expiryTime, so the stored date alone never over-grants."""
    if not ent.get("expires_at"):
        return None
    exp = _parse_time(ent["expires_at"]).astimezone(timezone.utc)
    if not ent.get("active"):
        exp = min(exp, (now or datetime.now(timezone.utc)).astimezone(timezone.utc))
    return exp.replace(tzinfo=None).isoformat()[:19]
