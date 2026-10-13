from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.database import engine, get_db
from app.main import app


def movement(client, item, delta, request_id=None, note="Delivery received"):
    return client.post(
        f"/api/items/{item['id']}/movements",
        json={"delta": delta, "note": note, "request_id": request_id or str(uuid4())},
    )


def test_auth_and_csrf(anonymous):
    assert anonymous.get("/api/items").status_code == 401
    assert anonymous.post("/api/session", json={"password": "wrong"}).status_code == 401
    anonymous.headers.pop("X-Stockroom-Request")
    assert (
        anonymous.post("/api/session", json={"password": "test-password-only"}).status_code == 403
    )


def test_logout(client):
    assert client.delete("/api/session").status_code == 204
    assert client.get("/api/session").status_code == 401


def test_create_read_update_archive(client, item):
    path = f"/api/items/{item['id']}"
    assert client.get(path).json()["quantity"] == 0
    payload = {
        k: item[k] for k in ("sku", "name", "category", "location", "reorder_point", "version")
    }
    payload["location"] = "B-02"
    assert client.put(path, json=payload).json()["location"] == "B-02"
    assert client.put(path, json=payload).status_code == 409
    assert client.delete(path).status_code == 204
    assert client.get(path).status_code == 404
    assert client.get("/api/items").json()["total"] == 0


def test_duplicate_sku(client, item):
    payload = {k: item[k] for k in ("sku", "name", "category", "location", "reorder_point")}
    assert client.post("/api/items", json=payload).status_code == 409


@pytest.mark.parametrize(
    "field,value",
    [
        ("sku", "bad sku"),
        ("name", "  "),
        ("reorder_point", -1),
        ("reorder_point", 1.5),
        ("quantity", 100),
    ],
)
def test_validation(client, item, field, value):
    payload = {k: item[k] for k in ("sku", "name", "category", "location", "reorder_point")}
    payload[field] = value
    assert client.post("/api/items", json=payload).status_code == 422


def test_receipt_issue_and_audit(client, item):
    assert movement(client, item, 8).json()["balance"] == 8
    assert movement(client, item, -3, note="Issued to electronics lab").json()["balance"] == 5
    assert movement(client, item, -6).status_code == 409
    assert client.get(f"/api/items/{item['id']}").json()["quantity"] == 5
    rows = client.get("/api/movements").json()
    assert rows["total"] == 2
    assert [r["balance"] for r in rows["items"]] == [5, 8]
    assert client.delete(f"/api/items/{item['id']}").status_code == 409


def test_idempotency(client, item):
    key = str(uuid4())
    first = movement(client, item, 10, key)
    second = movement(client, item, 10, key)
    assert first.status_code == 201 and second.status_code == 200
    assert first.json() == second.json()
    assert movement(client, item, 11, key).status_code == 409
    assert client.get(f"/api/items/{item['id']}").json()["quantity"] == 10


def test_filters_summary_and_pagination(client, item):
    assert client.get("/api/summary").json() == {"items": 1, "units": 0, "low": 0, "out": 1}
    movement(client, item, 3)
    assert client.get("/api/items?status=low").json()["total"] == 1
    assert client.get("/api/items?status=out").json()["total"] == 0
    assert client.get("/api/items?q=cab").json()["total"] == 1
    assert client.get("/api/items?q=%25").json()["total"] == 0
    assert client.get("/api/items?limit=1&offset=1").json() == {"items": [], "total": 1}
    assert client.get("/api/items?limit=101").status_code == 422


@pytest.mark.parametrize("delta", [0, 1.1, True, 1000001])
def test_invalid_movements(client, item, delta):
    assert movement(client, item, delta).status_code == 422


def test_concurrent_issues_cannot_oversell(client, item):
    movement(client, item, 5)
    cookie = client.cookies.get("session")

    def issue(_):
        with TestClient(
            app, headers={"X-Stockroom-Request": "1", "Cookie": f"session={cookie}"}
        ) as other:
            return movement(other, item, -4).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(issue, range(2))) == [201, 409]
    assert client.get(f"/api/items/{item['id']}").json()["quantity"] == 1


def test_concurrent_retry_applies_once(client, item):
    cookie, key = client.cookies.get("session"), str(uuid4())

    def receive(_):
        with TestClient(
            app, headers={"X-Stockroom-Request": "1", "Cookie": f"session={cookie}"}
        ) as other:
            return movement(other, item, 7, key).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(receive, range(2))) == [200, 201]
    assert client.get(f"/api/items/{item['id']}").json()["quantity"] == 7


def test_health_readiness_metrics(client):
    assert client.get("/health").status_code == 200
    assert client.get("/ready").status_code == 200
    client.get("/api/items/987654321")
    metrics = client.get("/metrics").text
    assert 'route="/api/items/{item_id}"' in metrics
    assert "987654321" not in metrics


def test_readiness_failure_keeps_liveness(client):
    class BrokenDB:
        def execute(self, *_):
            from sqlalchemy.exc import OperationalError

            raise OperationalError("", {}, Exception("offline"))

    app.dependency_overrides[get_db] = lambda: BrokenDB()
    try:
        assert client.get("/ready").status_code == 503
        assert client.get("/health").status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_database_rejects_negative_stock(client, item):
    from sqlalchemy.exc import IntegrityError

    with pytest.raises(IntegrityError), engine.begin() as conn:
        conn.execute(text("UPDATE items SET quantity=-1 WHERE id=:id"), {"id": item["id"]})
