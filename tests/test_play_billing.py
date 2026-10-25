"""Google Play subscription verification, account binding and phone sign-in.

Google is mocked at the HTTP layer (playbilling._http_get / _http_post):
the fake checks the service-account JWT it is handed, serves
SubscriptionPurchaseV2 payloads per purchase token and records
acknowledgements. Nothing here touches the network.
"""
import json
from datetime import datetime, timedelta, timezone

import httpx
import jwt
import pytest

PKG = "com.johnseong.dock_it"


def _rfc3339(dt: datetime) -> str:
    # Google's shape: UTC, nanosecond fraction, trailing Z.
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.123456789Z")


def _sub(days=30, state="SUBSCRIPTION_STATE_ACTIVE", product="moldock_pro", plan="monthly",
         account="", ack=True, linked=None, test=True):
    s = {
        "kind": "androidpublisher#subscriptionPurchaseV2",
        "startTime": _rfc3339(datetime.now(timezone.utc) - timedelta(days=1)),
        "subscriptionState": state,
        "latestOrderId": "GPA.0000-0000-0000-00000",
        "acknowledgementState": "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED" if ack else "ACKNOWLEDGEMENT_STATE_PENDING",
        "lineItems": [{
            "productId": product,
            "expiryTime": _rfc3339(datetime.now(timezone.utc) + timedelta(days=days)),
            "autoRenewingPlan": {"autoRenewEnabled": state == "SUBSCRIPTION_STATE_ACTIVE"},
            "offerDetails": {"basePlanId": plan},
            "latestSuccessfulOrderId": "GPA.1111-1111-1111-11111",
        }],
    }
    if account:
        s["externalAccountIdentifiers"] = {"obfuscatedExternalAccountId": account}
    if linked:
        s["linkedPurchaseToken"] = linked
    if test:
        s["testPurchase"] = {}
    return s


class FakeGoogle:
    def __init__(self, public_key):
        self.public_key = public_key
        self.subs: dict = {}
        self.gone: set = set()
        self.acks: list = []
        self.token_calls = 0
        self.get_calls = 0

    def post(self, url, **kw):
        from api import playbilling
        if url == playbilling.TOKEN_URL:
            self.token_calls += 1
            data = kw["data"]
            assert data["grant_type"] == "urn:ietf:params:oauth:grant-type:jwt-bearer"
            claims = jwt.decode(data["assertion"], self.public_key, algorithms=["RS256"],
                                audience=playbilling.TOKEN_URL)
            assert claims["iss"] == "play@moldock-test.iam.gserviceaccount.com"
            assert claims["scope"] == playbilling.ANDROID_PUBLISHER_SCOPE
            return httpx.Response(200, json={"access_token": "ya29.fake", "expires_in": 3599})
        assert kw["headers"]["Authorization"] == "Bearer ya29.fake"
        assert url.endswith(":acknowledge") and f"/applications/{PKG}/" in url
        self.acks.append(url)
        return httpx.Response(204)

    def get(self, url, **kw):
        self.get_calls += 1
        assert kw["headers"]["Authorization"] == "Bearer ya29.fake"
        assert f"/applications/{PKG}/purchases/subscriptionsv2/tokens/" in url
        token = url.rsplit("/", 1)[1]
        if token in self.gone:
            return httpx.Response(410, json={"error": {"message": "expired too long"}})
        if token not in self.subs:
            return httpx.Response(404, json={"error": {"message": "not found"}})
        return httpx.Response(200, json=self.subs[token])


@pytest.fixture
def google(monkeypatch):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from api import playbilling

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                            serialization.NoEncryption()).decode()
    monkeypatch.setenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", json.dumps({
        "type": "service_account", "client_email": "play@moldock-test.iam.gserviceaccount.com",
        "private_key": pem, "private_key_id": "kid123", "token_uri": "https://evil.example/token"}))
    monkeypatch.delenv("GOOGLE_PLAY_PACKAGE_NAME", raising=False)
    fake = FakeGoogle(key.public_key())
    monkeypatch.setattr(playbilling, "_http_post", fake.post)
    monkeypatch.setattr(playbilling, "_http_get", fake.get)
    playbilling._reset_token_cache()
    yield fake
    playbilling._reset_token_cache()


def _sign_in(client, monkeypatch, email):
    monkeypatch.setenv("MOLDOCK_DEV_LOGIN", "1")
    r = client.post("/api/auth/request-link", json={"email": email, "client": "app"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "app=1" in body["dev_link"] and len(body["dev_code"]) == 6
    v = client.post("/api/auth/verify-code", json={"email": email, "code": body["dev_code"]})
    assert v.status_code == 200, v.text
    h = {"Authorization": f"Bearer {v.json()['session_token']}"}
    return h, client.get("/api/account", headers=h).json()


# ------------------------------------------------------------- pure parts --

def test_entitlement_states_and_expiry():
    from api import playbilling as pb
    tok = "tok"
    ent = pb.entitlement(_sub(), tok)
    assert ent["active"] and ent["tier"] == "pro" and ent["base_plan_id"] == "monthly"
    assert ent["auto_renewing"] and ent["test"] and ent["order_id"].startswith("GPA.1111")
    # Cancelled = auto-renew off: still entitled until the paid period ends.
    assert pb.entitlement(_sub(state="SUBSCRIPTION_STATE_CANCELED"), tok)["active"]
    assert pb.entitlement(_sub(state="SUBSCRIPTION_STATE_IN_GRACE_PERIOD"), tok)["active"]
    for state in ("SUBSCRIPTION_STATE_ON_HOLD", "SUBSCRIPTION_STATE_PAUSED", "SUBSCRIPTION_STATE_EXPIRED",
                  "SUBSCRIPTION_STATE_PENDING", "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED"):
        e = pb.entitlement(_sub(state=state), tok)
        assert not e["active"], state
        # A non-entitled state never stores a future expiry.
        assert pb.stored_expiry(e) <= datetime.utcnow().isoformat()
    assert not pb.entitlement(_sub(days=-1), tok)["active"]
    assert pb.entitlement(_sub(product="some_other_sub"), tok)["tier"] is None
    # Nanosecond timestamps are parsed, and stored as naive UTC seconds.
    stored = pb.stored_expiry(pb.entitlement(_sub(days=30), tok))
    assert len(stored) == 19 and stored > datetime.utcnow().isoformat()


def test_service_account_env_accepts_base64_and_rejects_garbage(monkeypatch):
    import base64
    from api import playbilling as pb
    monkeypatch.delenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", raising=False)
    assert not pb.configured()
    monkeypatch.setenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", "not json at all")
    assert not pb.configured()
    info = {"client_email": "a@b.iam.gserviceaccount.com", "private_key": "x"}
    monkeypatch.setenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON", base64.b64encode(json.dumps(info).encode()).decode())
    assert pb.configured()


def test_access_token_is_cached_and_ignores_key_token_uri(google):
    from api import playbilling as pb
    assert pb.access_token() == "ya29.fake"
    assert pb.access_token() == "ya29.fake"
    assert google.token_calls == 1  # FakeGoogle asserts the URL is Google's, not the JSON's


# ---------------------------------------------------------------- routes --

def test_play_purchase_upgrades_signed_in_account(client, google, monkeypatch):
    h, acct = _sign_in(client, monkeypatch, "droid@example.org")
    assert acct["tier"] == "free" and acct["app_account_token"]
    google.subs["tok-1"] = _sub(plan="annual", days=365, account=acct["app_account_token"], ack=False)
    r = client.post("/api/play/verify", json={"purchase_token": "tok-1", "product_id": "moldock_pro"}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["tier"] == "pro" and "session_token" not in body
    assert "purchase_token" not in body["entitlement"]
    assert len(google.acks) == 1 and "/subscriptions/moldock_pro/tokens/tok-1:acknowledge" in google.acks[0]
    acct = client.get("/api/account", headers=h).json()
    assert acct["tier"] == "pro" and acct["sources"] == ["google_play"]
    assert acct["google_play"]["base_plan"] == "annual"
    # Server-side limits follow the account.
    assert acct["limits"]["max_exhaustiveness"] == 32


@pytest.mark.parametrize("sub,status,detail", [
    (_sub(days=-2, state="SUBSCRIPTION_STATE_EXPIRED"), 400, "expired"),
    (_sub(state="SUBSCRIPTION_STATE_ON_HOLD", days=-1), 400, "expired"),
    (_sub(state="SUBSCRIPTION_STATE_PENDING"), 400, "pending"),
    (_sub(product="someone_elses_product"), 400, "unknown product"),
])
def test_play_rejects_non_entitling_purchases(client, google, monkeypatch, sub, status, detail):
    h, _ = _sign_in(client, monkeypatch, "rej@example.org")
    google.subs["tok-x"] = sub
    r = client.post("/api/play/verify", json={"purchase_token": "tok-x"}, headers=h)
    assert r.status_code == status and detail in r.json()["detail"]
    assert client.get("/api/account", headers=h).json()["tier"] == "free"


def test_play_unknown_token_and_unconfigured_server(client, google, monkeypatch):
    h, _ = _sign_in(client, monkeypatch, "unk@example.org")
    r = client.post("/api/play/verify", json={"purchase_token": "forged"}, headers=h)
    assert r.status_code == 400 and "unknown or expired" in r.json()["detail"]
    google.gone.add("ancient")
    assert client.post("/api/play/verify", json={"purchase_token": "ancient"}, headers=h).status_code == 400
    monkeypatch.delenv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")
    r = client.post("/api/play/verify", json={"purchase_token": "anything"}, headers=h)
    assert r.status_code == 503


def test_play_purchase_is_bound_to_the_buying_account(client, google, monkeypatch):
    ha, a = _sign_in(client, monkeypatch, "buyer@example.org")
    hb, b = _sign_in(client, monkeypatch, "other@example.org")
    google.subs["tok-a"] = _sub(account=a["app_account_token"])
    # Another signed-in account can't claim it...
    r = client.post("/api/play/verify", json={"purchase_token": "tok-a"}, headers=hb)
    assert r.status_code == 409 and "b***@example.org" in r.json()["detail"]
    assert client.get("/api/account", headers=hb).json()["tier"] == "free"
    # ...the buyer can,
    assert client.post("/api/play/verify", json={"purchase_token": "tok-a"}, headers=ha).json()["tier"] == "pro"
    # and a signed-out restore on a new phone lands in the buyer's account.
    r = client.post("/api/play/verify", json={"purchase_token": "tok-a"})
    assert r.status_code == 200
    h2 = {"Authorization": f"Bearer {r.json()['session_token']}"}
    assert client.get("/api/account", headers=h2).json()["user_id"] == a["user_id"]


def test_signed_out_purchase_moves_to_the_account_signed_in_later(client, google, monkeypatch):
    # Bought before signing in: the server keeps it on an e-mail-less account.
    google.subs["tok-anon"] = _sub()
    r = client.post("/api/play/verify", json={"purchase_token": "tok-anon"})
    anon = {"Authorization": f"Bearer {r.json()['session_token']}"}
    anon_token = client.get("/api/account", headers=anon).json()["app_account_token"]
    # Even if a later purchase on that anonymous account carries its token,
    google.subs["tok-anon"] = _sub(account=anon_token)
    # signing in with e-mail and restoring claims it.
    h, me = _sign_in(client, monkeypatch, "late@example.org")
    r = client.post("/api/play/verify", json={"purchase_token": "tok-anon"}, headers=h)
    assert r.status_code == 200 and r.json()["tier"] == "pro"
    assert client.get("/api/account", headers=anon).json()["tier"] == "free"


def test_play_upgrade_token_replaces_linked_token(client, google, monkeypatch):
    h, a = _sign_in(client, monkeypatch, "upgrader@example.org")
    google.subs["tok-m"] = _sub(account=a["app_account_token"])
    assert client.post("/api/play/verify", json={"purchase_token": "tok-m"}, headers=h).status_code == 200
    # Monthly → annual: Play issues a new token that links to the old one.
    google.subs["tok-y"] = _sub(plan="annual", days=365, account=a["app_account_token"], linked="tok-m")
    r = client.post("/api/play/verify", json={"purchase_token": "tok-y"})  # signed out restore
    assert r.status_code == 200
    from api import accounts as acc
    u = acc.get_user(a["user_id"])
    assert u["play_purchase_token"] == "tok-y" and u["play_base_plan"] == "annual"


def test_play_renewal_is_picked_up_without_rtdn(client, google, monkeypatch):
    from api import accounts as acc
    h, a = _sign_in(client, monkeypatch, "renew@example.org")
    google.subs["tok-r"] = _sub(account=a["app_account_token"])
    assert client.post("/api/play/verify", json={"purchase_token": "tok-r"}, headers=h).status_code == 200
    # The stored period ends...
    past = (datetime.utcnow() - timedelta(minutes=5)).isoformat()[:19]
    acc.update_user(a["user_id"], play_expires_at=past, play_checked_at=None)
    # ...but Google says it renewed: the next request carries it forward.
    google.subs["tok-r"] = _sub(days=31, account=a["app_account_token"])
    calls = google.get_calls
    acct = client.get("/api/account", headers=h).json()
    assert acct["tier"] == "pro" and google.get_calls == calls + 1
    assert acct["google_play"]["expires_at"] > datetime.utcnow().isoformat()
    # Lapsed for real (on hold): tier drops, and Google isn't asked again
    # until PLAY_RECHECK_MINUTES have passed.
    google.subs["tok-r"] = _sub(state="SUBSCRIPTION_STATE_ON_HOLD", days=-1, account=a["app_account_token"])
    acc.update_user(a["user_id"], play_expires_at=past, play_checked_at=None)
    assert client.get("/api/account", headers=h).json()["tier"] == "free"
    calls = google.get_calls
    assert client.get("/api/account", headers=h).json()["tier"] == "free"
    assert google.get_calls == calls


def test_storekit_app_account_token_binds_purchase(client, monkeypatch):
    """Same binding rule for iOS: appAccountToken in the signed JWS."""
    import tests.test_monetisation as tm
    from api import storekit
    chain = tm.make_apple_like_chain()
    monkeypatch.setattr(storekit, "_trusted_roots", lambda: [chain.root])
    ha, a = _sign_in(client, monkeypatch, "ios-buyer@example.org")
    hb, _ = _sign_in(client, monkeypatch, "ios-other@example.org")
    jws = tm._jws(chain, appAccountToken=a["app_account_token"].upper(), originalTransactionId="7000")
    assert client.post("/api/storekit/verify", json={"jws": jws}, headers=hb).status_code == 409
    r = client.post("/api/storekit/verify", json={"jws": jws}, headers=ha)
    assert r.status_code == 200 and r.json()["tier"] == "pro"
    assert client.get("/api/account", headers=ha).json()["sources"] == ["app_store"]


# ------------------------------------------------------- phone sign-in code --

def test_login_code_is_one_shot_and_rate_limited(client, monkeypatch):
    monkeypatch.setenv("MOLDOCK_DEV_LOGIN", "1")
    email = "codes@example.org"
    code = client.post("/api/auth/request-link", json={"email": email, "client": "app"}).json()["dev_code"]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(4):
        assert client.post("/api/auth/verify-code", json={"email": email, "code": wrong}).status_code == 400
    assert client.post("/api/auth/verify-code", json={"email": email, "code": code}).status_code == 200
    assert client.post("/api/auth/verify-code", json={"email": email, "code": code}).status_code == 400
    # Five wrong guesses burn the token, even for the right code afterwards.
    code = client.post("/api/auth/request-link", json={"email": email, "client": "app"}).json()["dev_code"]
    wrong = "000000" if code != "000000" else "111111"
    for _ in range(5):
        client.post("/api/auth/verify-code", json={"email": email, "code": wrong})
    assert client.post("/api/auth/verify-code", json={"email": email, "code": code}).status_code == 400
    # Web requests still get a plain magic link without a code.
    web = client.post("/api/auth/request-link", json={"email": "web@example.org"}).json()
    assert "dev_code" not in web and "next=/account" in web["dev_link"]


def test_catalog_lists_play_products():
    from api import plans
    assert plans.public_catalog()["play_products"] == {"moldock_pro": ["monthly", "annual"]}
