"""Wait for PostgreSQL before running the single migration process."""

import time

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .database import engine

for attempt in range(60):
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        break
    except SQLAlchemyError:
        if attempt == 59:
            raise
        time.sleep(2)
