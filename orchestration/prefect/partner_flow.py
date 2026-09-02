"""Daily partner extract, as a Prefect flow.

Prefect's model is the closest to plain Python of the six: a flow is a function,
a task is a function, and control flow is `if` and `for` rather than a graph you
declare. The cost is that partitioning and backfill are yours to write, which is
the loop at the bottom of this file.

Run one day:
    pip install prefect
    export PYTHONPATH=$PYTHONPATH:/path/to/orchestration
    python prefect/partner_flow.py --date 2026-09-01

Backfill:
    python prefect/partner_flow.py --from 2026-09-01 --to 2026-09-03

Schedule it (needs a Prefect server or Cloud workspace):
    prefect deploy prefect/partner_flow.py:partner_extract \
        --name daily --cron "0 6 * * *"
"""

from __future__ import annotations

import argparse
import os
from datetime import date, timedelta
from pathlib import Path

from prefect import flow, task, get_run_logger
from prefect.tasks import exponential_backoff

from shared.pipeline import (
    connect, load_csv, run_quality_checks, failed, format_alert,
)

DATA_DIR = Path(os.environ.get("PARTNER_DROP_DIR", "data/partner"))
DB_PATH = os.environ.get("PIPELINE_DB", "data/warehouse.db")


@task(retries=6, retry_delay_seconds=exponential_backoff(backoff_factor=30),
      retry_jitter_factor=0.5)
def wait_for_file(business_date: str) -> Path:
    """Poll for the day's drop.

    Jitter matters here. Without it, a backfill of ninety days retries every
    partition on the same schedule and arrives at the partner's endpoint in
    lockstep.
    """
    path = DATA_DIR / ("partner-%s.csv" % business_date)
    if not path.exists():
        raise FileNotFoundError("no drop yet at %s" % path)
    return path


@task(retries=2, retry_delay_seconds=10)
def load(path: Path, business_date: str) -> dict:
    conn = connect(DB_PATH)
    try:
        return load_csv(conn, path, business_date).as_dict()
    finally:
        conn.close()


@task
def quality(business_date: str) -> list[dict]:
    conn = connect(DB_PATH)
    try:
        return run_quality_checks(conn, business_date)
    finally:
        conn.close()


@task
def alert(business_date: str, checks: list[dict]) -> str | None:
    logger = get_run_logger()
    fails = failed(checks)
    if not fails:
        logger.info("all %d checks passed for %s", len(checks), business_date)
        return None
    message = format_alert(business_date, fails)
    logger.error(message)
    return message


@flow(name="partner-extract", log_prints=True)
def partner_extract(business_date: str | None = None, strict: bool = False) -> dict:
    """One day. Returns a summary rather than raising, unless `strict`.

    `strict=False` by default so that a backfill does not stop at the first day
    with a quality problem. In a scheduled deployment, set it true: a silent
    failing check is worse than a failed flow run.
    """
    business_date = business_date or date.today().isoformat()
    path = wait_for_file(business_date)
    load_result = load(path, business_date)
    checks = quality(business_date)
    message = alert(business_date, checks)

    summary = {"business_date": business_date, "load": load_result,
               "failed_checks": [c["check_name"] for c in failed(checks)],
               "alert": message}
    if strict and summary["failed_checks"]:
        raise RuntimeError(message)
    return summary


@flow(name="partner-extract-backfill")
def backfill(start: str, end: str) -> list[dict]:
    """Prefect has no partition primitive, so the range is an ordinary loop.

    Sequential on purpose. The loads write to the same table, and a partner
    endpoint being polled by ninety concurrent runs is a good way to be rate
    limited out of your own backfill.
    """
    logger = get_run_logger()
    d0, d1 = date.fromisoformat(start), date.fromisoformat(end)
    out = []
    day = d0
    while day <= d1:
        logger.info("backfilling %s", day.isoformat())
        out.append(partner_extract(day.isoformat(), strict=False))
        day += timedelta(days=1)
    bad = [s["business_date"] for s in out if s["failed_checks"]]
    logger.info("backfilled %d day(s); %d with failing checks: %s",
                len(out), len(bad), ", ".join(bad) or "none")
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--date")
    ap.add_argument("--from", dest="start")
    ap.add_argument("--to", dest="end")
    args = ap.parse_args()
    if args.start and args.end:
        backfill(args.start, args.end)
    else:
        print(partner_extract(args.date))
