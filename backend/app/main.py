import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from sqlalchemy import case, func, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from .auth import require_csrf, require_session, serializer, verify_password
from .database import get_db
from .models import Item, Movement
from .schemas import ItemInput, ItemOut, ItemUpdate, LoginInput, MovementInput, MovementOut

log = logging.getLogger("stockroom")
REQUESTS = Counter(
    "stockroom_http_requests_total", "Completed HTTP requests", ["method", "route", "status"]
)
LATENCY = Histogram(
    "stockroom_http_request_duration_seconds",
    "Request duration",
    ["method", "route"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5),
)


@asynccontextmanager
async def lifespan(app):
    serializer()
    if len(os.environ.get("OPERATOR_PASSWORD", "")) < 12:
        raise RuntimeError("OPERATOR_PASSWORD must contain at least 12 characters")
    yield


app = FastAPI(
    title="Stockroom API", version="1.0.0", lifespan=lifespan, dependencies=[Depends(require_csrf)]
)


@app.middleware("http")
async def observe(request: Request, call_next):
    start = time.perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response
    finally:
        route = getattr(request.scope.get("route"), "path", "unmatched")
        if route not in {"/metrics", "/health", "/ready"}:
            REQUESTS.labels(request.method, route, str(status)).inc()
            LATENCY.labels(request.method, route).observe(time.perf_counter() - start)


@app.get("/health")
def health():
    return {"status": "ok", "version": os.environ.get("APP_VERSION", "dev")}


@app.get("/ready")
def ready(db: Session = Depends(get_db)):
    try:
        # Check schema availability too; SELECT 1 alone passes before migrations.
        db.execute(text("SELECT id FROM items LIMIT 1"))
    except SQLAlchemyError:
        raise HTTPException(503, "Database is not ready") from None
    return {"status": "ready"}


@app.get("/metrics", include_in_schema=False)
def metrics():
    return Response(generate_latest(), headers={"Content-Type": CONTENT_TYPE_LATEST})


@app.post("/api/session")
def login(data: LoginInput, response: Response):
    if not verify_password(data.password):
        raise HTTPException(401, "Incorrect workspace password")
    response.set_cookie(
        "session",
        serializer().dumps({"role": "operator"}),
        httponly=True,
        secure=os.environ.get("COOKIE_SECURE", "true").lower() == "true",
        samesite="strict",
        max_age=28800,
        path="/",
    )
    return {"role": "operator"}


@app.get("/api/session", dependencies=[Depends(require_session)])
def session():
    return {"role": "operator"}


@app.delete("/api/session", status_code=204)
def logout(response: Response):
    response.delete_cookie("session", path="/")


auth = [Depends(require_session)]


def find_item(db, item_id, lock=False):
    stmt = select(Item).where(Item.id == item_id, Item.archived.is_(False))
    item = db.scalar(stmt.with_for_update() if lock else stmt)
    if item is None:
        raise HTTPException(404, "Item not found")
    return item


def commit(db):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This SKU or request ID already exists") from None


@app.get("/api/items", dependencies=auth)
def list_items(
    q: str = Query("", max_length=120),
    status: Literal["all", "low", "out"] = "all",
    offset: int = Query(0, ge=0),
    limit: int = Query(30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    stmt = select(Item).where(Item.archived.is_(False))
    if q.strip():
        escaped = q.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        stmt = stmt.where(
            Item.name.ilike(f"%{escaped}%", escape="\\")
            | Item.sku.ilike(f"%{escaped}%", escape="\\")
        )
    if status == "low":
        stmt = stmt.where(Item.quantity <= Item.reorder_point, Item.quantity > 0)
    if status == "out":
        stmt = stmt.where(Item.quantity == 0)
    count = db.scalar(select(func.count()).select_from(stmt.subquery()))
    items = db.scalars(stmt.order_by(Item.name, Item.id).offset(offset).limit(limit)).all()
    return {"items": [ItemOut.model_validate(item) for item in items], "total": count}


@app.get("/api/summary", dependencies=auth)
def summary(db: Session = Depends(get_db)):
    total, units, low, out = db.execute(
        select(
            func.count(Item.id),
            func.coalesce(func.sum(Item.quantity), 0),
            func.sum(
                case(((Item.quantity <= Item.reorder_point) & (Item.quantity > 0), 1), else_=0)
            ),
            func.sum(case((Item.quantity == 0, 1), else_=0)),
        ).where(Item.archived.is_(False))
    ).one()
    return {"items": total, "units": units, "low": low or 0, "out": out or 0}


@app.post("/api/items", status_code=201, response_model=ItemOut, dependencies=auth)
def create_item(data: ItemInput, db: Session = Depends(get_db)):
    item = Item(**data.model_dump())
    db.add(item)
    commit(db)
    db.refresh(item)
    return item


@app.get("/api/items/{item_id}", response_model=ItemOut, dependencies=auth)
def get_item(item_id: int, db: Session = Depends(get_db)):
    return find_item(db, item_id)


@app.put("/api/items/{item_id}", response_model=ItemOut, dependencies=auth)
def update_item(item_id: int, data: ItemUpdate, db: Session = Depends(get_db)):
    item = find_item(db, item_id, lock=True)
    if item.version != data.version:
        raise HTTPException(409, "This item changed. Refresh it before saving.")
    for field, value in data.model_dump(exclude={"version"}).items():
        setattr(item, field, value)
    item.version += 1
    commit(db)
    return item


@app.delete("/api/items/{item_id}", status_code=204, dependencies=auth)
def archive_item(item_id: int, db: Session = Depends(get_db)):
    item = find_item(db, item_id, lock=True)
    if item.quantity:
        raise HTTPException(409, "Issue the remaining stock before archiving this item")
    item.archived = True
    item.version += 1
    commit(db)


@app.post(
    "/api/items/{item_id}/movements", response_model=MovementOut, status_code=201, dependencies=auth
)
def move_stock(
    item_id: int, data: MovementInput, response: Response, db: Session = Depends(get_db)
):
    item = find_item(db, item_id, lock=True)
    previous = db.scalar(select(Movement).where(Movement.request_id == str(data.request_id)))
    if previous:
        if (previous.item_id, previous.delta, previous.note) != (item_id, data.delta, data.note):
            raise HTTPException(409, "Request ID was already used for a different movement")
        response.status_code = 200
        return previous
    balance = item.quantity + data.delta
    if balance < 0:
        raise HTTPException(409, f"Only {item.quantity} units are available")
    if balance > 1000000000:
        raise HTTPException(409, "Stock limit exceeded")
    item.quantity = balance
    item.version += 1
    movement = Movement(
        item_id=item_id,
        request_id=str(data.request_id),
        delta=data.delta,
        balance=balance,
        note=data.note,
    )
    db.add(movement)
    commit(db)
    db.refresh(movement)
    return movement


@app.get("/api/movements", dependencies=auth)
def movements(
    item_id: int | None = None,
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    stmt = select(Movement, Item.name, Item.sku).join(Item)
    if item_id is not None:
        stmt = stmt.where(Movement.item_id == item_id)
    count = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.execute(stmt.order_by(Movement.id.desc()).offset(offset).limit(limit)).all()
    return {
        "total": count,
        "items": [
            dict(MovementOut.model_validate(m).model_dump(), name=name, sku=sku)
            for m, name, sku in rows
        ],
    }
