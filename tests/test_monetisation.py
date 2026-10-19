"""Plans, quotas/gating, accounts, Stripe webhook, StoreKit, leaderboard, API."""
import base64
import hashlib
import hmac
import json
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from api import plans

DOCK = {"protein_pdb_id": "1HSG", "ligand_cid": 2244, "ligand_name": "Aspirin"}


# ---------------------------------------------------------------- plans --

def test_catalog_hides_prices_until_configured(monkeypatch):
    monkeypatch.delenv("STRIPE_PRICE_PRO_MONTHLY", raising=False)
    monkeypatch.delenv("STRIPE_PRICE_PRO_ANNUAL", raising=False)
    cat = plans.public_catalog()
    assert cat["tiers"]["pro"]["prices"] == {} and cat["checkout_enabled"] is False
    assert cat["tiers"]["pro"]["list_prices"] == {"monthly_cents": 999, "annual_cents": 7900}
    monkeypatch.setenv("STRIPE_PRICE_PRO_MONTHLY", "price_m")
    monkeypatch.setenv("STRIPE_PRICE_PRO_ANNUAL", "price_a")
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_x")
    cat = plans.public_catalog()
    assert set(cat["tiers"]["pro"]["prices"]) == {"monthly", "annual"}
    assert cat["tiers"]["pro"]["annual_savings_percent"] == 34
    assert plans.tier_for_price("price_a") == "pro" and plans.tier_for_price("price_x") is None
    assert plans.get_plan("pro_annual").price_id == "price_a"


def test_tier_limits_are_monotonic():
    order = [plans.TIER_ANON, plans.TIER_FREE, plans.TIER_PRO, plans.TIER_LAB]
    for a, b in zip(order, order[1:]):
        la, lb = plans.limits_for(a), plans.limits_for(b)
        assert lb.jobs_per_day > la.jobs_per_day
        assert lb.max_exhaustiveness >= la.max_exhaustiveness
        assert lb.max_batch_ligands >= la.max_batch_ligands


# ------------------------------------------------------------- accounts --

def _sign_in(client, email="a@example.org", monkeypatch=None):
    if monkeypatch:
        monkeypatch.setenv("MOLDOCK_DEV_LOGIN", "1")
    r = client.post("/api/auth/request-link", json={"email": email})
    assert r.status_code == 200, r.text
    token = r.json()["dev_link"].split("token=")[1].split("&")[0]
    v = client.get(f"/api/auth/verify?token={token}")
    assert v.status_code == 200
    again = client.get(f"/api/auth/verify?token={token}")
    assert again.status_code == 400  # magic links are one-shot
    return {"Authorization": f"Bearer {v.json()['session_token']}"}


def _make_pro(email):
    from api import accounts as acc
    u = acc.get_user_by_email(email)
    acc.update_user(u["user_id"], stripe_status="active", stripe_price_id="price_test_m",
                    stripe_period_end=(datetime.utcnow() + timedelta(days=30)).isoformat())
    return u


def test_anonymous_paywall_shapes(client, monkeypatch):
    r = client.post("/api/dock", json={**DOCK, "exhaustiveness": 16, "strict": True})
    assert r.status_code == 402
    body = r.json()
    assert isinstance(body["detail"], str)  # old app builds render detail as text
    assert body["paywall"]["code"] == "upgrade_required" and body["paywall"]["feature"] == "exhaustiveness"
    # non-strict (shipped apps): clamped, not refused
    r = client.post("/api/dock", json={**DOCK, "exhaustiveness": 32})
    assert r.status_code == 200 and r.json()["adjustments"] == ["exhaustiveness 32→8"]
    # concurrency: anonymous may have one active job
    r = client.post("/api/dock", json={**DOCK, "ligand_cid": 2519, "ligand_name": "Caffeine"})
    assert r.status_code == 429 and r.json()["paywall"]["code"] == "too_many_active"


def test_duplicate_submission_is_folded(client):
    a = client.post("/api/dock", json={**DOCK, "strict": True}).json()
    b = client.post("/api/dock", json={**DOCK, "strict": True}).json()
    assert b["job_id"] == a["job_id"] and b["deduplicated"] is True


def test_daily_quota(client, db, monkeypatch):
    headers = _sign_in(client, "quota@example.org", monkeypatch)
    # free tier: 5/day, 2 active. Mark finished jobs completed so concurrency doesn't bite.
    for cid in range(1, 6):
        r = client.post("/api/dock", json={**DOCK, "ligand_cid": cid, "strict": True}, headers=headers)
        assert r.status_code == 200, r.text
        conn = db.get_db()
        conn.execute("UPDATE docking_jobs SET status='completed' WHERE job_id=?", (r.json()["job_id"],))
        conn.commit()
        conn.close()
    r = client.post("/api/dock", json={**DOCK, "ligand_cid": 99, "strict": True}, headers=headers)
    assert r.status_code == 429 and r.json()["paywall"]["code"] == "quota_exceeded"
    acct = client.get("/api/account", headers=headers).json()
    assert acct["tier"] == "free" and acct["usage"]["remaining_today"] == 0


def test_failed_jobs_are_refunded(client, db, monkeypatch):
    headers = _sign_in(client, "refund@example.org", monkeypatch)
    ids = []
    for cid in range(1, 6):
        r = client.post("/api/dock", json={**DOCK, "ligand_cid": cid}, headers=headers)
        ids.append(r.json()["job_id"])
        conn = db.get_db()
        conn.execute("UPDATE docking_jobs SET status='failed' WHERE job_id=?", (ids[-1],))
        conn.commit()
        conn.close()
    assert client.get("/api/account", headers=headers).json()["usage"]["used_today"] == 0


def test_private_jobs_and_api_keys(client, db, monkeypatch):
    headers = _sign_in(client, "pro@example.org", monkeypatch)
    r = client.post("/api/dock", json={**DOCK, "private": True, "strict": True}, headers=headers)
    assert r.status_code == 402 and r.json()["paywall"]["feature"] == "private"
    assert client.post("/api/account/api-keys", json={}, headers=headers).status_code == 402
    monkeypatch.setenv("STRIPE_PRICE_PRO_MONTHLY", "price_test_m")
    _make_pro("pro@example.org")
    assert client.get("/api/account", headers=headers).json()["tier"] == "pro"
    r = client.post("/api/dock", json={**DOCK, "private": True, "exhaustiveness": 32, "strict": True}, headers=headers)
    assert r.status_code == 200, r.text
    job_id = r.json()["job_id"]
    assert client.get(f"/api/jobs/{job_id}", headers=headers).status_code == 200
    assert client.get(f"/api/jobs/{job_id}").status_code == 404  # hidden from everyone else
    other = _sign_in(client, "other@example.org", monkeypatch)
    assert client.get(f"/api/jobs/{job_id}", headers=other).status_code == 404
    # API key works as identity, and is listed without the secret
    key = client.post("/api/account/api-keys", json={"label": "ci"}, headers=headers).json()
    assert key["key"].startswith("mdk_")
    assert client.get(f"/api/jobs/{job_id}", headers={"X-API-Key": key["key"]}).status_code == 200
    listed = client.get("/api/account/api-keys", headers=headers).json()["keys"]
    assert listed and "key" not in listed[0]
    client.delete(f"/api/account/api-keys/{key['key_id']}", headers=headers)
    assert client.get(f"/api/jobs/{job_id}", headers={"X-API-Key": key["key"]}).status_code == 401
    # priority queue: pro jobs run before earlier anonymous jobs
    anon = client.post("/api/dock", json={**DOCK, "ligand_cid": 777}).json()["job_id"]
    pro2 = client.post("/api/dock", json={**DOCK, "ligand_cid": 778}, headers=headers).json()["job_id"]
    assert db.get_pending_jobs()[0]["job_id"] in (job_id, pro2)
    assert db.get_pending_jobs()[0]["job_id"] != anon


def test_batch_gating_and_creation(client, db, monkeypatch):
    lib = "CCO ethanol\nc1ccccc1O phenol\nbad_smiles x\n"
    r = client.post("/api/batch", json={"protein_pdb_id": "1HSG", "library": lib})
    assert r.status_code == 401 and r.json()["paywall"]["code"] == "sign_in_required"
    headers = _sign_in(client, "batch@example.org", monkeypatch)
    six = "\n".join(f"{'C' * (i + 1)}O l{i}" for i in range(6))
    r = client.post("/api/batch", json={"protein_pdb_id": "1HSG", "library": six}, headers=headers)
    assert r.status_code == 402 and r.json()["paywall"]["feature"] == "batch_size"
    r = client.post("/api/batch", json={"protein_pdb_id": "1HSG", "library": lib,
                                        "site": {"mode": "pocket"}}, headers=headers)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["n_ligands"] == 2 and out["skipped"][0]["name"] == "x"
    b = client.get(f"/api/batch/{out['batch_id']}").json()
    assert b["counts"]["queued"] == 2 and {l["ligand_name"] for l in b["ligands"]} == {"ethanol", "phenol"}
    # mark one completed with a score → ranked first in table and CSV
    conn = db.get_db()
    jid = [l["job_id"] for l in b["ligands"] if l["ligand_name"] == "phenol"][0]
    conn.execute("UPDATE docking_jobs SET status='completed', best_affinity=-5.1, analysis_json=? WHERE job_id=?",
                 (json.dumps({"heavy_atoms": 7, "ligand_efficiency": 0.729,
                              "poses": [{"counts": {"hbond": 2}, "residues": [{"residue": "ASP25A"}]}]}), jid))
    conn.commit()
    conn.close()
    b = client.get(f"/api/batch/{out['batch_id']}").json()
    assert b["ligands"][0]["ligand_name"] == "phenol" and b["ligands"][0]["rank"] == 1
    csv_text = client.get(f"/api/batch/{out['batch_id']}/csv").text
    assert csv_text.splitlines()[1].startswith("1,phenol,") and "ASP25A" in csv_text
    # batch ligands count toward the daily quota (2 used of 5)
    assert client.get("/api/account", headers=headers).json()["usage"]["used_today"] == 2


def test_lab_org_seats_grant_lab_tier(client, monkeypatch):
    monkeypatch.setenv("MOLDOCK_ADMIN_TOKEN", "adm")
    assert client.post("/api/admin/orgs", json={"name": "X", "seats": 2, "owner_email": "pi@uni.edu"}).status_code == 403
    org = client.post("/api/admin/orgs", headers={"X-Admin-Token": "adm"},
                      json={"name": "Lee Lab", "seats": 2, "owner_email": "pi@uni.edu"}).json()
    owner = _sign_in(client, "pi@uni.edu", monkeypatch)
    assert client.get("/api/account", headers=owner).json()["tier"] == "lab"
    r = client.post("/api/account/org/members", json={"email": "student@uni.edu"}, headers=owner)
    assert r.status_code == 200 and len(r.json()["members"]) == 2
    r = client.post("/api/account/org/members", json={"email": "third@uni.edu"}, headers=owner)
    assert r.status_code == 409
    student = _sign_in(client, "student@uni.edu", monkeypatch)
    assert client.get("/api/account", headers=student).json()["tier"] == "lab"
    assert client.post("/api/account/org/members", json={"email": "z@uni.edu"}, headers=student).status_code == 403
    assert org["seats"] == 2


def test_lab_quote(client, db):
    r = client.post("/api/lab-quote", json={"name": "Prof Lee", "email": "lee@snu.ac.kr",
                                            "institution": "SNU", "seats": 12, "message": "<b>hi</b>"})
    assert r.status_code == 200
    assert client.post("/api/lab-quote", json={"name": "", "email": "x", "institution": ""}).status_code == 422


# --------------------------------------------------------------- stripe --

def _stripe_sig(body: bytes, secret="whsec_t", ts=None):
    ts = str(ts or int(time.time()))
    return f"t={ts},v1=" + hmac.new(secret.encode(), ts.encode() + b"." + body, hashlib.sha256).hexdigest()


def test_signature_verification():
    from api import billing
    body = b'{"id":"evt_1"}'
    billing.verify_signature(body, _stripe_sig(body), "whsec_t")
    with pytest.raises(billing.SignatureError):
        billing.verify_signature(body, _stripe_sig(body, "whsec_other"), "whsec_t")
    with pytest.raises(billing.SignatureError):
        billing.verify_signature(body, _stripe_sig(body, ts=int(time.time()) - 3600), "whsec_t")
    with pytest.raises(billing.SignatureError):
        billing.verify_signature(body, None, "whsec_t")


def test_checkout_params_carry_user_and_plan(monkeypatch):
    from api import billing
    monkeypatch.setenv("STRIPE_PRICE_PRO_ANNUAL", "price_a")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://moldock.test")
    p = billing.checkout_params({"user_id": "u_1", "email": "a@b.co"}, plans.get_plan("pro_annual"))
    assert p["mode"] == "subscription" and p["line_items[0][price]"] == "price_a"
    assert p["client_reference_id"] == "u_1" and p["subscription_data[metadata][user_id]"] == "u_1"
    assert p["customer_email"] == "a@b.co" and p["success_url"].startswith("https://moldock.test/account")


def test_webhook_lifecycle(client, monkeypatch):
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_t")
    monkeypatch.setenv("STRIPE_PRICE_PRO_MONTHLY", "price_m")
    headers = _sign_in(client, "sub@example.org", monkeypatch)
    uid = client.get("/api/account", headers=headers).json()["user_id"]

    def send(ev):
        body = json.dumps(ev).encode()
        return client.post("/api/billing/webhook", content=body, headers={"Stripe-Signature": _stripe_sig(body)})

    sub = {"id": "sub_1", "customer": "cus_1", "status": "active", "metadata": {"user_id": uid},
           "items": {"data": [{"price": {"id": "price_m"}, "current_period_end": int(time.time()) + 86400 * 30}]}}
    assert send({"id": "evt_a", "type": "customer.subscription.created", "data": {"object": sub}}).status_code == 200
    acct = client.get("/api/account", headers=headers).json()
    assert acct["tier"] == "pro" and acct["sources"] == ["stripe"]
    assert send({"id": "evt_a", "type": "customer.subscription.created", "data": {"object": sub}}).json()["duplicate"]
    # cancellation found by customer id (no metadata)
    gone = {**sub, "status": "canceled", "metadata": {}}
    send({"id": "evt_b", "type": "customer.subscription.deleted", "data": {"object": gone}})
    assert client.get("/api/account", headers=headers).json()["tier"] == "free"
    # forged event rejected
    body = json.dumps({"id": "evt_c", "type": "customer.subscription.created", "data": {"object": sub}}).encode()
    r = client.post("/api/billing/webhook", content=body, headers={"Stripe-Signature": _stripe_sig(body, "whsec_x")})
    assert r.status_code == 400


# ------------------------------------------------------------- storekit --

@pytest.fixture(scope="module")
def apple_like_chain():
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.x509.oid import NameOID, ObjectIdentifier

    now = datetime.now(timezone.utc)

    def _mk(subject, issuer_name, issuer_key, key, oid=None, ca=False):
        b = (x509.CertificateBuilder()
             .subject_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, subject)]))
             .issuer_name(x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, issuer_name)]))
             .public_key(key.public_key()).serial_number(x509.random_serial_number())
             .not_valid_before(now - timedelta(days=1)).not_valid_after(now + timedelta(days=365))
             .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True))
        if oid:
            b = b.add_extension(x509.UnrecognizedExtension(ObjectIdentifier(oid), b"\x05\x00"), critical=False)
        return b.sign(issuer_key, hashes.SHA256())

    rk, ik, lk = ec.generate_private_key(ec.SECP384R1()), ec.generate_private_key(ec.SECP256R1()), ec.generate_private_key(ec.SECP256R1())
    root = _mk("Root", "Root", rk, rk, ca=True)
    inter = _mk("WWDR", "Root", rk, ik, oid="1.2.840.113635.100.6.2.1", ca=True)
    leaf = _mk("Leaf", "WWDR", ik, lk, oid="1.2.840.113635.100.6.11.1")
    der = lambda c: c.public_bytes(serialization.Encoding.DER)
    return SimpleNamespace(root=root, leaf_key=lk, x5c=[base64.b64encode(der(c)).decode() for c in (leaf, inter, root)])


def _jws(chain, **over):
    import jwt
    now_ms = int(time.time() * 1000)
    p = {"transactionId": "2001", "originalTransactionId": "2000", "bundleId": "com.johnseong.dock-it",
         "productId": "com.johnseong.dockit.pro.monthly", "purchaseDate": now_ms - 1000,
         "expiresDate": now_ms + 30 * 86_400_000, "environment": "Production"}
    p.update(over)
    return jwt.encode(p, chain.leaf_key, algorithm="ES256", headers={"x5c": chain.x5c})


def test_storekit_unlocks_pro_and_mints_session(client, apple_like_chain, monkeypatch):
    from api import storekit
    with pytest.raises(storekit.StoreKitVerificationError):
        storekit.verify_transaction_jws(_jws(apple_like_chain))  # untrusted root
    monkeypatch.setattr(storekit, "_trusted_roots", lambda: [apple_like_chain.root])
    with pytest.raises(storekit.StoreKitVerificationError):
        storekit.verify_transaction_jws(_jws(apple_like_chain, bundleId="com.other.app"))
    with pytest.raises(storekit.StoreKitVerificationError):
        storekit.verify_transaction_jws(_jws(apple_like_chain, productId="com.johnseong.dockit.unknown"))
    r = client.post("/api/storekit/verify", json={"jws": _jws(apple_like_chain)})
    assert r.status_code == 200 and r.json()["tier"] == "pro"
    headers = {"Authorization": f"Bearer {r.json()['session_token']}"}
    assert client.get("/api/account", headers=headers).json()["sources"] == ["app_store"]
    # restoring on a second device signs into the same account
    r2 = client.post("/api/storekit/verify", json={"jws": _jws(apple_like_chain)})
    h2 = {"Authorization": f"Bearer {r2.json()['session_token']}"}
    assert client.get("/api/account", headers=h2).json()["user_id"] == client.get("/api/account", headers=headers).json()["user_id"]


# ---------------------------------------------------------- leaderboard --

def test_leaderboard_counts_completed_unique_recent_jobs(db):
    now = datetime.utcnow()

    def add(job_id, country, status="completed", client="c1", ligand=1, days_ago=1, batch=None, hosting=0):
        t = (now - timedelta(days=days_ago)).isoformat()
        db.create_job(job_id, "1HSG", ligand, "L", None, 0, 0, 0, 20, 20, 20, 8, 9, 3.0,
                      country=country, country_code=country[:2].upper(), client_hash=client,
                      batch_id=batch, geo_hosting=hosting)
        conn = db.get_db()
        conn.execute("UPDATE docking_jobs SET status=?, created_at=?, completed_at=? WHERE job_id=?",
                     (status, t, t if status == "completed" else None, job_id))
        conn.commit()
        conn.close()

    add("a1", "India")
    add("a2", "India")                      # same visitor, same complex, same day → once
    add("a3", "India", ligand=2)            # different ligand → counts
    add("a4", "India", status="failed", ligand=3)
    add("a5", "India", status="queued", ligand=4)
    add("a6", "India", days_ago=45, ligand=5)  # outside window
    add("a7", "India", batch="b_1", ligand=6)  # batch ligand
    add("a8", "India", hosting=1, ligand=7, client="bot")  # data-centre IP
    add("b1", "Korea", client="k1")
    add("b2", "Korea", client="k2")
    add("b3", "Korea", client="k3")
    rows = {r["country"]: r for r in db.country_leaderboard()}
    assert rows["India"]["jobs"] == 2 and rows["India"]["submitters"] == 1
    assert rows["Korea"]["jobs"] == 3 and rows["Korea"]["submitters"] == 3
    assert [r["country"] for r in db.country_leaderboard()] == ["Korea", "India"]


def test_leaderboard_endpoint_documents_metric(client):
    body = client.get("/api/leaderboard/countries").json()
    assert body["metric"] == "completed_jobs" and body["window_days"] == 30
    assert "last 30 days" in body["definition"]


def test_client_ip_uses_trusted_proxy_hop():
    from api.accounts import client_ip
    req = SimpleNamespace(headers={"x-forwarded-for": "6.6.6.6, 203.0.113.9"}, client=None)
    assert client_ip(req) == "203.0.113.9"  # left-most entry is client-controlled


def test_sign_in_without_smtp_is_a_clear_503(client, monkeypatch):
    from api import email_service, routes
    monkeypatch.delenv("MOLDOCK_DEV_LOGIN", raising=False)
    monkeypatch.setattr(email_service, "SMTP_USER", "")
    monkeypatch.setattr(email_service, "SMTP_PASS", "")
    r = client.post("/api/auth/request-link", json={"email": "nosmtp@example.org"})
    assert r.status_code == 503
    assert r.json()["detail"] == routes.EMAIL_SIGNIN_UNAVAILABLE
    # A configured server that fails to deliver must not claim "check your inbox".
    monkeypatch.setattr(email_service, "SMTP_USER", "u")
    monkeypatch.setattr(email_service, "SMTP_PASS", "p")
    monkeypatch.setattr(routes, "send_login_email", lambda *a: False)
    r = client.post("/api/auth/request-link", json={"email": "nosmtp@example.org"})
    assert r.status_code == 503


def test_portal_session_uses_moldock_configuration(monkeypatch):
    from api import billing
    sent = {}

    def fake_post(path, params):
        sent.update(params, _path=path)
        return {"url": "https://billing.stripe.com/session/x"}

    monkeypatch.setattr(billing, "_post", fake_post)
    user = {"stripe_customer_id": "cus_123"}
    monkeypatch.delenv("STRIPE_PORTAL_CONFIGURATION", raising=False)
    billing.create_portal_session(user)
    assert "configuration" not in sent
    monkeypatch.setenv("STRIPE_PORTAL_CONFIGURATION", "bpc_moldock")
    assert billing.create_portal_session(user) == "https://billing.stripe.com/session/x"
    assert sent["configuration"] == "bpc_moldock" and sent["_path"] == "/billing_portal/sessions"
