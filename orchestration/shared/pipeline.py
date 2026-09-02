"""The daily partner extract, as plain Python.

Every orchestrator example calls into this module. The orchestrator's job is
scheduling, retries, observability and backfill. None of them should be holding
the business logic, and keeping it here is what lets the same pipeline be
compared across six engines fairly, and tested without any of them.

Storage is SQLite so the examples run with no infrastructure. The SQL is written
so that swapping in Postgres is a connection change and an `ON CONFLICT` clause,
not a rewrite.

    python -m shared.pipeline --date 2026-09-01 --source shared/sample/partner-2026-09-01.csv
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sqlite3
from dataclasses import dataclass, asdict
from datetime import date, datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_DB = os.environ.get("PIPELINE_DB", str(HERE / "warehouse.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS partner_orders (
    partner_id     TEXT    NOT NULL,
    external_id    TEXT    NOT NULL,
    business_date  TEXT    NOT NULL,
    customer_ref   TEXT,
    amount_cents   INTEGER NOT NULL,
    currency       TEXT    NOT NULL,
    status         TEXT    NOT NULL,
    placed_at      TEXT,
    loaded_at      TEXT    NOT NULL,
    PRIMARY KEY (partner_id, external_id, business_date)
);

CREATE TABLE IF NOT EXISTS partner_orders_rejects (
    business_date  TEXT NOT NULL,
    row_number     INTEGER NOT NULL,
    reason         TEXT NOT NULL,
    raw            TEXT NOT NULL,
    loaded_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS quality_checks (
    business_date  TEXT NOT NULL,
    check_name     TEXT NOT NULL,
    passed         INTEGER NOT NULL,
    observed       TEXT,
    threshold      TEXT,
    detail         TEXT,
    checked_at     TEXT NOT NULL,
    PRIMARY KEY (business_date, check_name)
);
"""

CURRENCIES = {"GBP", "USD", "EUR", "SGD", "AUD", "CAD"}
STATUSES = {"placed", "shipped", "delivered", "cancelled", "refunded"}
AMOUNT = re.compile(r"^-?\d+(\.\d{1,2})?$")


@dataclass
class Row:
    partner_id: str
    external_id: str
    business_date: str
    customer_ref: str | None
    amount_cents: int
    currency: str
    status: str
    placed_at: str | None


@dataclass
class LoadResult:
    business_date: str
    read: int = 0
    accepted: int = 0
    rejected: int = 0
    upserted: int = 0

    def as_dict(self):
        return asdict(self)


def connect(db_path: str = DEFAULT_DB) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


# -- validate -------------------------------------------------------------

def validate_row(raw: dict, business_date: str) -> tuple[Row | None, str | None]:
    """Return (row, None) or (None, reason).

    Rejects carry a reason rather than raising, because one malformed line in a
    partner file should cost you that line, not the day.
    """
    partner = (raw.get("partner_id") or "").strip()
    external = (raw.get("external_id") or "").strip()
    if not partner:
        return None, "partner_id is empty"
    if not external:
        return None, "external_id is empty"

    amount = (raw.get("amount") or "").strip()
    if not AMOUNT.match(amount):
        return None, "amount %r is not a decimal with at most two places" % amount
    # Integer minor units. Storing money as a float is how a reconciliation
    # report ends up 0.01 out and nobody can say which row.
    whole, _, frac = amount.partition(".")
    cents = int(whole) * 100 + (int(frac.ljust(2, "0")) if frac else 0)
    if whole.startswith("-"):
        cents = int(whole) * 100 - (int(frac.ljust(2, "0")) if frac else 0)

    currency = (raw.get("currency") or "").strip().upper()
    if currency not in CURRENCIES:
        return None, "currency %r is not one of %s" % (currency, ", ".join(sorted(CURRENCIES)))

    status = (raw.get("status") or "").strip().lower()
    if status not in STATUSES:
        return None, "status %r is not one of %s" % (status, ", ".join(sorted(STATUSES)))

    placed = (raw.get("placed_at") or "").strip() or None
    if placed:
        try:
            datetime.fromisoformat(placed.replace("Z", "+00:00"))
        except ValueError:
            return None, "placed_at %r is not ISO 8601" % placed

    return Row(
        partner_id=partner,
        external_id=external,
        business_date=business_date,
        customer_ref=(raw.get("customer_ref") or "").strip() or None,
        amount_cents=cents,
        currency=currency,
        status=status,
        placed_at=placed,
    ), None


# -- load -----------------------------------------------------------------

def load_csv(conn, source: str | Path, business_date: str) -> LoadResult:
    """Parse, validate, and upsert one day's file.

    The target partition is deleted before it is written, so running the same
    date twice produces the same table. That property is what makes a backfill
    safe, and it belongs here rather than in whichever orchestrator called this.
    """
    result = LoadResult(business_date=business_date)
    now = datetime.now(timezone.utc).isoformat()

    text = Path(source).read_text(encoding="utf-8-sig") if not isinstance(source, io.StringIO) \
        else source.getvalue()
    reader = csv.DictReader(io.StringIO(text))

    accepted: list[Row] = []
    rejects: list[tuple] = []
    for n, raw in enumerate(reader, start=2):   # line 1 is the header
        result.read += 1
        row, reason = validate_row(raw, business_date)
        if row is None:
            result.rejected += 1
            rejects.append((business_date, n, reason,
                            json.dumps(raw, ensure_ascii=False), now))
        else:
            result.accepted += 1
            accepted.append(row)

    with conn:
        conn.execute("DELETE FROM partner_orders WHERE business_date = ?", (business_date,))
        conn.execute("DELETE FROM partner_orders_rejects WHERE business_date = ?", (business_date,))
        conn.executemany(
            "INSERT INTO partner_orders (partner_id, external_id, business_date,"
            " customer_ref, amount_cents, currency, status, placed_at, loaded_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)"
            " ON CONFLICT (partner_id, external_id, business_date) DO UPDATE SET"
            "   customer_ref = excluded.customer_ref,"
            "   amount_cents = excluded.amount_cents,"
            "   currency     = excluded.currency,"
            "   status       = excluded.status,"
            "   placed_at    = excluded.placed_at,"
            "   loaded_at    = excluded.loaded_at",
            [(r.partner_id, r.external_id, r.business_date, r.customer_ref,
              r.amount_cents, r.currency, r.status, r.placed_at, now) for r in accepted])
        conn.executemany(
            "INSERT INTO partner_orders_rejects"
            " (business_date, row_number, reason, raw, loaded_at) VALUES (?,?,?,?,?)",
            rejects)

    result.upserted = conn.execute(
        "SELECT COUNT(*) c FROM partner_orders WHERE business_date = ?",
        (business_date,)).fetchone()["c"]
    return result


# -- quality --------------------------------------------------------------

def run_quality_checks(conn, business_date: str, *, min_rows: int = 1,
                       max_null_customer_rate: float = 0.10,
                       max_reject_rate: float = 0.05) -> list[dict]:
    """The four checks every warehouse table wants, recorded as results.

    A failing check is a recorded failure, not an exception. An orchestrator
    should be able to show 'null rate 14%, threshold 10%' rather than a stack
    trace, and a human should be able to see which check failed on which day.
    """
    now = datetime.now(timezone.utc).isoformat()
    rows = conn.execute(
        "SELECT COUNT(*) c,"
        " SUM(CASE WHEN customer_ref IS NULL OR customer_ref = '' THEN 1 ELSE 0 END) null_cust"
        " FROM partner_orders WHERE business_date = ?", (business_date,)).fetchone()
    total = rows["c"] or 0
    null_cust = rows["null_cust"] or 0
    rejected = conn.execute(
        "SELECT COUNT(*) c FROM partner_orders_rejects WHERE business_date = ?",
        (business_date,)).fetchone()["c"]
    dupes = conn.execute(
        "SELECT COUNT(*) c FROM (SELECT partner_id, external_id, COUNT(*) n"
        " FROM partner_orders WHERE business_date = ?"
        " GROUP BY partner_id, external_id HAVING n > 1)", (business_date,)).fetchone()["c"]

    read_total = total + rejected
    null_rate = (null_cust / total) if total else 0.0
    reject_rate = (rejected / read_total) if read_total else 0.0

    checks = [
        {"check_name": "row_count", "passed": total >= min_rows,
         "observed": total, "threshold": ">= %d" % min_rows,
         "detail": "rows written for the partition"},
        {"check_name": "unique_key", "passed": dupes == 0,
         "observed": dupes, "threshold": "= 0",
         "detail": "duplicate (partner_id, external_id) within the partition"},
        {"check_name": "null_customer_ref", "passed": null_rate <= max_null_customer_rate,
         "observed": round(null_rate, 4), "threshold": "<= %.2f" % max_null_customer_rate,
         "detail": "%d of %d rows have no customer_ref" % (null_cust, total)},
        {"check_name": "reject_rate", "passed": reject_rate <= max_reject_rate,
         "observed": round(reject_rate, 4), "threshold": "<= %.2f" % max_reject_rate,
         "detail": "%d of %d source rows failed validation" % (rejected, read_total)},
    ]

    with conn:
        conn.executemany(
            "INSERT INTO quality_checks"
            " (business_date, check_name, passed, observed, threshold, detail, checked_at)"
            " VALUES (?,?,?,?,?,?,?)"
            " ON CONFLICT (business_date, check_name) DO UPDATE SET"
            "   passed = excluded.passed, observed = excluded.observed,"
            "   threshold = excluded.threshold, detail = excluded.detail,"
            "   checked_at = excluded.checked_at",
            [(business_date, c["check_name"], 1 if c["passed"] else 0,
              str(c["observed"]), c["threshold"], c["detail"], now) for c in checks])
    return checks


def failed(checks: list[dict]) -> list[dict]:
    return [c for c in checks if not c["passed"]]


def format_alert(business_date: str, failures: list[dict]) -> str:
    """The message an alert channel receives. Says what, how far off, and when."""
    lines = ["Partner extract for %s failed %d quality check(s):"
             % (business_date, len(failures))]
    for c in failures:
        lines.append("  %-18s observed %s, expected %s. %s"
                     % (c["check_name"], c["observed"], c["threshold"], c["detail"]))
    return "\n".join(lines)


# -- entry point ----------------------------------------------------------

def run(business_date: str, source: str | Path, db_path: str = DEFAULT_DB) -> dict:
    """Load and check one day. Returns a summary the orchestrator can log."""
    conn = connect(db_path)
    try:
        load = load_csv(conn, source, business_date)
        checks = run_quality_checks(conn, business_date)
        fails = failed(checks)
        return {"load": load.as_dict(), "checks": checks,
                "failed_checks": [c["check_name"] for c in fails],
                "alert": format_alert(business_date, fails) if fails else None}
    finally:
        conn.close()


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--date", default=date.today().isoformat())
    ap.add_argument("--source", required=True)
    ap.add_argument("--db", default=DEFAULT_DB)
    args = ap.parse_args(argv)

    summary = run(args.date, args.source, args.db)
    load = summary["load"]
    print("%s  read %d, accepted %d, rejected %d, in table %d"
          % (args.date, load["read"], load["accepted"], load["rejected"], load["upserted"]))
    for c in summary["checks"]:
        print("  %-18s %-5s observed %-8s threshold %s"
              % (c["check_name"], "pass" if c["passed"] else "FAIL",
                 c["observed"], c["threshold"]))
    if summary["alert"]:
        print("\n" + summary["alert"])
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
