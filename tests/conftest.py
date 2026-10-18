import os
import shutil
import sys

import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

DATA = os.path.join(ROOT, "tests", "data")
HAS_OBABEL = shutil.which("obabel") is not None


@pytest.fixture
def db(tmp_path, monkeypatch):
    """Fresh SQLite DB per test."""
    import api.database as database
    monkeypatch.setattr(database, "DB_PATH", str(tmp_path / "test.db"))
    database.init_db()
    return database


@pytest.fixture
def client(db, monkeypatch):
    """TestClient without the startup hook (no worker thread), no geo lookups."""
    from fastapi.testclient import TestClient
    import api.routes as routes

    async def no_geo(ip):
        return ("Testland", "TL", 0)

    monkeypatch.setattr(routes, "geolocate", no_geo)
    from api.index import app
    app.router.on_startup.clear()
    return TestClient(app)


@pytest.fixture
def pdb_1hsg():
    with open(os.path.join(DATA, "1HSG.pdb")) as f:
        return f.read()


@pytest.fixture
def vina_out_1hsg():
    with open(os.path.join(DATA, "1HSG_indinavir_vina.pdbqt")) as f:
        return f.read()
