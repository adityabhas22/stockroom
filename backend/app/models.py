from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class Item(Base):
    __tablename__ = "items"
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="quantity_nonnegative"),
        CheckConstraint("reorder_point >= 0", name="reorder_nonnegative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    sku: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(40))
    location: Mapped[str] = mapped_column(String(40))
    quantity: Mapped[int] = mapped_column(default=0)
    reorder_point: Mapped[int] = mapped_column(default=5)
    version: Mapped[int] = mapped_column(default=1)
    archived: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Movement(Base):
    __tablename__ = "movements"
    __table_args__ = (
        CheckConstraint("delta <> 0", name="movement_nonzero"),
        CheckConstraint("balance >= 0", name="balance_nonnegative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), index=True)
    request_id: Mapped[str] = mapped_column(String(36), unique=True)
    delta: Mapped[int]
    balance: Mapped[int]
    note: Mapped[str] = mapped_column(String(240))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
