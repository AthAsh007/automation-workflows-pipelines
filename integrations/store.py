"""Idempotency and a lease-based queue, on SQLite.

SQLite so the whole integration runs in one command with nothing installed, and
because the semantics are easier to read as 200 lines of SQL than as a broker's
configuration.

The interface is five methods on purpose: claim, enqueue, lease, complete, fail.
Moving to Postgres is a connection change. Moving to SQS or Redis means
implementing those five.
"""

from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from dataclasses import dataclass
from typing import Any

DB_PATH = os.environ.get("INTEGRATION_DB", "integrations.db")

SCHEMA = """
PRAGMA journal_mode = WAL;

-- One row per delivery the provider has ever sent us. The primary key is what
-- makes a duplicate impossible rather than unlikely.
CREATE TABLE IF NOT EXISTS deliveries (
    delivery_id  TEXT PRIMARY KEY,
    source       TEXT NOT NULL,
    event_type   TEXT,
    received_at  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS queue (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_id  TEXT NOT NULL UNIQUE,
    source       TEXT NOT NULL,
    event_type   TEXT,
    payload      TEXT NOT NULL,
    attempts     INTEGER NOT NULL DEFAULT 0,
    available_at REAL NOT NULL,
    leased_until REAL,
    lease_token  TEXT,
    created_at   REAL NOT NULL
);

-- The index the lease query uses. Without it, a queue of any size scans.
CREATE INDEX IF NOT EXISTS queue_ready
    ON queue (available_at, leased_until);

CREATE TABLE IF NOT EXISTS dead_letters (
    delivery_id  TEXT PRIMARY KEY,
    source       TEXT NOT NULL,
    event_type   TEXT,
    payload      TEXT NOT NULL,
    attempts     INTEGER NOT NULL,
    last_error   TEXT,
    failed_at    REAL NOT NULL
);
"""


@dataclass
class Job:
    id: int
    delivery_id: str
    source: str
    event_type: str
    payload: dict
    attempts: int
    lease_token: str


class Store:
    def __init__(self, path: str = DB_PATH):
        self.conn = sqlite3.connect(path, isolation_level=None, timeout=30)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)

    def close(self) -> None:
        self.conn.close()

    # -- idempotency ------------------------------------------------------

    def claim(self, delivery_id: str, source: str, event_type: str = "") -> bool:
        """Record a delivery id. False means we have seen it before.

        The uniqueness is enforced by the primary key rather than by a SELECT
        followed by an INSERT, which has a race between the two statements that
        two concurrent retries will find.
        """
        try:
            self.conn.execute(
                "INSERT INTO deliveries (delivery_id, source, event_type, received_at)"
                " VALUES (?,?,?,?)",
                (delivery_id, source, event_type, time.time()))
            return True
        except sqlite3.IntegrityError:
            return False

    # -- queue ------------------------------------------------------------

    def enqueue(self, delivery_id: str, source: str, event_type: str,
                payload: dict[str, Any], delay: float = 0.0) -> None:
        self.conn.execute(
            "INSERT OR IGNORE INTO queue"
            " (delivery_id, source, event_type, payload, available_at, created_at)"
            " VALUES (?,?,?,?,?,?)",
            (delivery_id, source, event_type,
             json.dumps(payload, ensure_ascii=False),
             time.time() + delay, time.time()))

    def lease(self, seconds: float = 60.0, limit: int = 1) -> list[Job]:
        """Take jobs that are due and not already leased.

        A lease rather than a delete, so a worker that dies mid-job releases the
        work when the lease expires instead of losing it. That is the difference
        between at-least-once and at-most-once, and at-least-once is the one you
        want when the alternative is silently dropping a customer's event.
        """
        now = time.time()
        token = uuid.uuid4().hex
        rows = self.conn.execute(
            "SELECT * FROM queue"
            " WHERE available_at <= ? AND (leased_until IS NULL OR leased_until < ?)"
            " ORDER BY available_at LIMIT ?", (now, now, limit)).fetchall()
        jobs = []
        for row in rows:
            # The WHERE clause repeats the lease condition so that two workers
            # racing for the same row cannot both win: the second UPDATE matches
            # nothing.
            changed = self.conn.execute(
                "UPDATE queue SET leased_until = ?, lease_token = ?"
                " WHERE id = ? AND (leased_until IS NULL OR leased_until < ?)",
                (now + seconds, token, row["id"], now)).rowcount
            if changed:
                jobs.append(Job(
                    id=row["id"], delivery_id=row["delivery_id"],
                    source=row["source"], event_type=row["event_type"] or "",
                    payload=json.loads(row["payload"]),
                    attempts=row["attempts"], lease_token=token))
        return jobs

    def complete(self, job: Job) -> None:
        self.conn.execute("DELETE FROM queue WHERE id = ? AND lease_token = ?",
                          (job.id, job.lease_token))

    def fail(self, job: Job, error: str, retry_in: float | None) -> None:
        """Reschedule, or dead-letter when there is nothing left to try.

        The payload goes to the dead-letter table rather than being deleted. An
        event you cannot process is still evidence, and the most common thing you
        need after fixing the bug is the events that hit it.
        """
        if retry_in is None:
            self.conn.execute(
                "INSERT OR REPLACE INTO dead_letters"
                " (delivery_id, source, event_type, payload, attempts, last_error, failed_at)"
                " SELECT delivery_id, source, event_type, payload, attempts + 1, ?, ?"
                " FROM queue WHERE id = ?", (error[:1000], time.time(), job.id))
            self.conn.execute("DELETE FROM queue WHERE id = ?", (job.id,))
            return
        self.conn.execute(
            "UPDATE queue SET attempts = attempts + 1, available_at = ?,"
            " leased_until = NULL, lease_token = NULL WHERE id = ?",
            (time.time() + retry_in, job.id))

    # -- introspection ----------------------------------------------------

    def counts(self) -> dict[str, int]:
        one = lambda sql: self.conn.execute(sql).fetchone()[0]
        return {
            "queued": one("SELECT COUNT(*) FROM queue"),
            "ready": one("SELECT COUNT(*) FROM queue WHERE available_at <= %f"
                         % time.time()),
            "dead_letters": one("SELECT COUNT(*) FROM dead_letters"),
            "deliveries_seen": one("SELECT COUNT(*) FROM deliveries"),
        }

    def dead_letters(self, limit: int = 50) -> list[dict]:
        return [dict(r) for r in self.conn.execute(
            "SELECT * FROM dead_letters ORDER BY failed_at DESC LIMIT ?",
            (limit,)).fetchall()]

    def replay_dead_letter(self, delivery_id: str) -> bool:
        """Put a dead letter back on the queue after the bug is fixed."""
        row = self.conn.execute(
            "SELECT * FROM dead_letters WHERE delivery_id = ?",
            (delivery_id,)).fetchone()
        if row is None:
            return False
        self.conn.execute(
            "INSERT OR IGNORE INTO queue"
            " (delivery_id, source, event_type, payload, available_at, created_at)"
            " VALUES (?,?,?,?,?,?)",
            (row["delivery_id"], row["source"], row["event_type"],
             row["payload"], time.time(), time.time()))
        self.conn.execute("DELETE FROM dead_letters WHERE delivery_id = ?",
                          (delivery_id,))
        return True
