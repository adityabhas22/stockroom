import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

# A dedicated PostgreSQL database is required: locking behavior is part of the contract.
url = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://stockroom:stockroom@localhost:55432/stockroom_test"
)
if not url.rsplit("/", 1)[-1].split("?")[0].endswith("_test"):
    raise RuntimeError("TEST_DATABASE_URL database name must end in _test")
os.environ["DATABASE_URL"] = url
os.environ["SESSION_SECRET"] = "test-only-session-key-with-at-least-32-chars"
os.environ["OPERATOR_PASSWORD"] = "test-password-only"
os.environ["COOKIE_SECURE"] = "false"

from app.database import engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def clean_database():
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE movements, items RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture
def anonymous():
    with TestClient(app, headers={"X-Stockroom-Request": "1"}) as client:
        yield client


@pytest.fixture
def client(anonymous):
    assert (
        anonymous.post("/api/session", json={"password": "test-password-only"}).status_code == 200
    )
    return anonymous


@pytest.fixture
def item(client):
    response = client.post(
        "/api/items",
        json={
            "sku": "CAB-001",
            "name": "USB-C cable",
            "category": "Cables",
            "location": "A-01",
            "reorder_point": 5,
        },
    )
    assert response.status_code == 201
    return response.json()
