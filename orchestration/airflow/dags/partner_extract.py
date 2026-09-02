"""Daily partner extract, as an Airflow DAG.

Uses the TaskFlow API, which is the idiom the Airflow docs recommend and which
removes most of the XCom boilerplate. The business logic lives in
`shared/pipeline.py`; this file is scheduling, sensing, retries and alerting.

Install:
    cp -r orchestration/airflow/dags/* $AIRFLOW_HOME/dags/
    export PYTHONPATH=$PYTHONPATH:/path/to/orchestration
    airflow dags test partner_extract 2026-09-01

Backfill a range:
    airflow backfill create --dag-id partner_extract \
        --from-date 2026-09-01 --to-date 2026-09-03
"""

from __future__ import annotations

import os
from datetime import timedelta

import pendulum
from airflow.sdk import dag, task
from airflow.exceptions import AirflowSkipException
from airflow.sensors.filesystem import FileSensor

from shared.pipeline import (
    connect, load_csv, run_quality_checks, failed, format_alert,
)

DATA_DIR = os.environ.get("PARTNER_DROP_DIR", "/opt/airflow/data/partner")
DB_PATH = os.environ.get("PIPELINE_DB", "/opt/airflow/data/warehouse.db")


@dag(
    dag_id="partner_extract",
    schedule="0 6 * * *",
    start_date=pendulum.datetime(2026, 9, 1, tz="UTC"),
    catchup=True,
    max_active_runs=1,
    default_args={
        "retries": 3,
        # Exponential, so a partner API that is briefly down is not hammered.
        "retry_delay": timedelta(minutes=5),
        "retry_exponential_backoff": True,
        "max_retry_delay": timedelta(hours=1),
    },
    tags=["partner", "daily", "elt"],
    doc_md=__doc__,
)
def partner_extract():

    # `deferrable=True` frees the worker slot while waiting. On a long poke
    # interval this is the difference between one idle slot and a full pool.
    wait_for_file = FileSensor(
        task_id="wait_for_todays_file",
        filepath=DATA_DIR + "/partner-{{ ds }}.csv",
        poke_interval=300,
        timeout=60 * 60 * 6,
        mode="reschedule",
        deferrable=True,
    )

    @task
    def load(ds: str = None) -> dict:
        """Parse, validate and upsert the partition.

        `load_csv` deletes the partition before writing it, so a retry after a
        partial write and a manual re-run of an old date both produce the same
        table. Airflow's retry guarantees do not cover a task that died halfway
        through an insert; the SQL has to.
        """
        conn = connect(DB_PATH)
        try:
            result = load_csv(conn, "%s/partner-%s.csv" % (DATA_DIR, ds), ds)
        finally:
            conn.close()
        return result.as_dict()

    @task
    def quality(load_result: dict, ds: str = None) -> list[dict]:
        """Record the check results. Does not raise on a failure.

        A failing check is a recorded result, not an exception. Raising here
        would show the operator a stack trace where they want 'null rate 14%,
        threshold 10%', and would hide the three checks that passed.
        """
        conn = connect(DB_PATH)
        try:
            return run_quality_checks(conn, ds)
        finally:
            conn.close()

    @task
    def alert(checks: list[dict], ds: str = None) -> str:
        """Skip when everything passed, so the UI shows green rather than noise."""
        fails = failed(checks)
        if not fails:
            raise AirflowSkipException("all %d checks passed" % len(checks))
        message = format_alert(ds, fails)
        # Swap for SlackWebhookOperator, an email, or PagerDuty. Printing keeps
        # the DAG runnable with no connection configured.
        print(message)
        return message

    @task(trigger_rule="all_done")
    def summary(load_result: dict, checks: list[dict], ds: str = None) -> None:
        """Runs whether or not alerting fired, so every run leaves one log line."""
        n_failed = len(failed(checks or []))
        print("%s loaded %d row(s), %d rejected, %d check(s) failed"
              % (ds, load_result.get("upserted", 0),
                 load_result.get("rejected", 0), n_failed))

    loaded = load()
    checks = quality(loaded)
    wait_for_file >> loaded
    alert(checks)
    summary(loaded, checks)


partner_extract()
