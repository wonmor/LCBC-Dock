"""StoreKit 2 signed-transaction (JWS) verification for MolDock iOS / Mac.

Ported from ElectronVisualized's server/storekit.py (same checks): the JWS
x5c chain must end in the pinned Apple Root CA - G3, the intermediate and
leaf must carry Apple's marker OIDs, every certificate must be in date,
the ES256 signature must verify with the leaf key, and the payload must be
for com.johnseong.dock-it, a known MolDock product, not revoked and not
expired. No network access is needed.
"""
from __future__ import annotations

import base64
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

_logger = logging.getLogger(__name__)

# Apple Root CA - G3 (https://www.apple.com/certificateauthority/). Public
# root certificate, valid until 2039-04-30. SHA-256 of the DER:
# 63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179
APPLE_ROOT_CA_G3_PEM = """-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----
"""

# Marker extensions Apple puts on its App Store signing chain.
_OID_WWDR_INTERMEDIATE = "1.2.840.113635.100.6.2.1"
_OID_APP_STORE_LEAF = "1.2.840.113635.100.6.11.1"

# Bundle ids whose signed transactions we accept. Override/extend with the
# STOREKIT_BUNDLE_IDS env var (comma separated).
DEFAULT_BUNDLE_IDS = (
    "com.johnseong.dock-it",  # MolDock iOS + Mac (shared bundle)
)


class StoreKitVerificationError(ValueError):
    """Raised for any reason the JWS cannot be trusted. The message is safe
    to echo to clients (no secrets, no key material)."""


def allowed_bundle_ids() -> set[str]:
    env = os.environ.get("STOREKIT_BUNDLE_IDS", "")
    extra = {b.strip() for b in env.split(",") if b.strip()}
    return set(DEFAULT_BUNDLE_IDS) | extra


def tier_for_product_id(product_id: str) -> str | None:
    """Map an App Store product id onto a MolDock tier (see plans.py)."""
    from api.plans import STOREKIT_PRODUCTS
    return STOREKIT_PRODUCTS.get((product_id or "").strip())


def _trusted_roots():
    """Pinned roots as `cryptography` certificate objects. Patched in tests."""
    from cryptography import x509
    return [x509.load_pem_x509_certificate(APPLE_ROOT_CA_G3_PEM.encode())]


def _b64url_decode(segment: str) -> bytes:
    pad = "=" * (-len(segment) % 4)
    return base64.urlsafe_b64decode(segment + pad)


def _has_marker(cert, dotted: str) -> bool:
    from cryptography.x509.oid import ObjectIdentifier
    try:
        cert.extensions.get_extension_for_oid(ObjectIdentifier(dotted))
        return True
    except Exception:
        return False


def _verify_signed_by(cert, issuer, label: str) -> None:
    from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa
    pub = issuer.public_key()
    try:
        if isinstance(pub, ec.EllipticCurvePublicKey):
            pub.verify(cert.signature, cert.tbs_certificate_bytes,
                       ec.ECDSA(cert.signature_hash_algorithm))
        elif isinstance(pub, rsa.RSAPublicKey):
            pub.verify(cert.signature, cert.tbs_certificate_bytes,
                       padding.PKCS1v15(), cert.signature_hash_algorithm)
        else:
            raise StoreKitVerificationError(f"{label}: unsupported issuer key type")
    except StoreKitVerificationError:
        raise
    except Exception:
        raise StoreKitVerificationError(f"{label}: certificate signature invalid")


def _check_validity(cert, now: datetime, label: str) -> None:
    # `cryptography` 40 exposes naive UTC datetimes here.
    nvb = getattr(cert, "not_valid_before_utc", None) or cert.not_valid_before.replace(tzinfo=timezone.utc)
    nva = getattr(cert, "not_valid_after_utc", None) or cert.not_valid_after.replace(tzinfo=timezone.utc)
    if not (nvb <= now <= nva):
        raise StoreKitVerificationError(f"{label}: certificate outside its validity window")


def verify_chain(x5c: list[str], now: datetime | None = None):
    """Validate the x5c chain and return the leaf certificate."""
    from cryptography import x509
    from cryptography.hazmat.primitives import serialization

    now = now or datetime.now(timezone.utc)
    if not isinstance(x5c, list) or len(x5c) != 3:
        raise StoreKitVerificationError("x5c chain must contain exactly three certificates")
    try:
        leaf, inter, root = [x509.load_der_x509_certificate(base64.b64decode(c)) for c in x5c]
    except Exception:
        raise StoreKitVerificationError("x5c chain is not valid DER")

    root_der = root.public_bytes(serialization.Encoding.DER)
    if not any(root_der == r.public_bytes(serialization.Encoding.DER) for r in _trusted_roots()):
        raise StoreKitVerificationError("chain does not terminate in a trusted Apple root")

    for cert, label in ((leaf, "leaf"), (inter, "intermediate"), (root, "root")):
        _check_validity(cert, now, label)
    _verify_signed_by(inter, root, "intermediate")
    _verify_signed_by(leaf, inter, "leaf")
    if not _has_marker(inter, _OID_WWDR_INTERMEDIATE):
        raise StoreKitVerificationError("intermediate is not an Apple WWDR certificate")
    if not _has_marker(leaf, _OID_APP_STORE_LEAF):
        raise StoreKitVerificationError("leaf is not an App Store signing certificate")
    return leaf


def verify_transaction_jws(jws: str, now: datetime | None = None,
                           bundle_ids: set[str] | None = None) -> dict[str, Any]:
    """Verify a StoreKit 2 `jwsRepresentation` and return a normalised
    entitlement dict::

        {tier, product_id, bundle_id, transaction_id, original_transaction_id,
         expires_at (ISO-8601 or None), environment, purchase_date}

    Raises StoreKitVerificationError on any problem.
    """
    import jwt

    now = now or datetime.now(timezone.utc)
    if not isinstance(jws, str) or jws.count(".") != 2:
        raise StoreKitVerificationError("malformed JWS")
    try:
        header = json.loads(_b64url_decode(jws.split(".")[0]))
    except Exception:
        raise StoreKitVerificationError("malformed JWS header")
    if header.get("alg") != "ES256":
        raise StoreKitVerificationError("unexpected JWS algorithm")

    leaf = verify_chain(header.get("x5c"), now=now)
    try:
        payload = jwt.decode(jws, key=leaf.public_key(), algorithms=["ES256"],
                             options={"verify_exp": False, "verify_aud": False})
    except Exception:
        raise StoreKitVerificationError("JWS signature invalid")

    bundle_id = payload.get("bundleId") or ""
    if bundle_id not in (bundle_ids or allowed_bundle_ids()):
        raise StoreKitVerificationError("transaction is for another app")

    product_id = payload.get("productId") or ""
    tier = tier_for_product_id(product_id)
    if tier is None:
        raise StoreKitVerificationError("unknown product")

    def _ms(key: str) -> datetime | None:
        v = payload.get(key)
        if v in (None, ""):
            return None
        try:
            return datetime.fromtimestamp(int(v) / 1000, tz=timezone.utc)
        except (TypeError, ValueError, OSError):
            raise StoreKitVerificationError(f"bad {key}")

    revoked = _ms("revocationDate")
    if revoked is not None and revoked <= now:
        raise StoreKitVerificationError("transaction was revoked")
    expires = _ms("expiresDate")
    if expires is not None and expires <= now:
        raise StoreKitVerificationError("subscription has expired")

    purchase = _ms("purchaseDate")
    return {
        "tier": tier,
        "product_id": product_id,
        "bundle_id": bundle_id,
        "transaction_id": str(payload.get("transactionId") or ""),
        "original_transaction_id": str(payload.get("originalTransactionId") or ""),
        "expires_at": expires.isoformat() if expires else None,
        "purchase_date": purchase.isoformat() if purchase else None,
        "environment": payload.get("environment") or "Production",
        "ownership": payload.get("inAppOwnershipType") or "",
        # Set by the phone app from /api/account → app_account_token.
        "app_account_token": str(payload.get("appAccountToken") or "").lower(),
    }
