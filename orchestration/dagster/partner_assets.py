"""Daily partner extract, as Dagster assets.

The difference from the Airflow version is not syntax. Airflow schedules *tasks*;
Dagster declares *assets*, so the unit the UI shows you, the unit you backfill,
and the unit a downstream model depends on are all the same thing: a table
partition. That is why the quality checks here are `@asset_check` rather than a
task, and why they show up attached to the asset instead of beside it.

Run:
    pip install dagster dagster-webserver
    export PYTHONPATH=$PYTHONPATH:/path/to/orchestration
    dagster dev -f dagster/partner_assets.py

Backfill: pick the asset in the UI, choose the partition range, launch. Or:
    dagster asset backfill -f dagster/partner_assets.py \
        --partition-range 2026-09-01...2026-09-03 partner_orders
"""

from __future__ import annotations

import os

from dagster import (
    AssetCheckResult, AssetCheckSeverity, AssetExecutionContext, Definitions,
    DailyPartitionsDefinition, MetadataValue, Output, ScheduleDefinition,
    asset, asset_check, define_asset_job,
)

from shared.pipeline import (
    connect, load_csv, run_quality_checks, failed, format_alert,
)

DATA_DIR = os.environ.get("PARTNER_DROP_DIR", "data/partner")
DB_PATH = os.environ.get("PIPELINE_DB", "data/warehouse.db")

daily = DailyPartitionsDefinition(start_date="2026-09-01")


@asset(
    partitions_def=daily,
    group_name="partner",
    description="One day of partner orders, upserted on (partner_id, external_id, business_date).",
    compute_kind="sqlite",
)
def partner_orders(context: AssetExecutionContext) -> Output[dict]:
    """Materialise one partition.

    The partition key *is* the business date, so a backfill of ninety days is
    ninety runs of this function with no loop to write and no date arithmetic to
    get wrong. `load_csv` deletes the partition before writing it, which is what
    makes that backfill safe to run twice.
    """
    business_date = context.partition_key
    conn = connect(DB_PATH)
    try:
        result = load_csv(conn, "%s/partner-%s.csv" % (DATA_DIR, business_date),
                          business_date)
    finally:
        conn.close()

    context.log.info("read %d, accepted %d, rejected %d"
                     % (result.read, result.accepted, result.rejected))
    return Output(
        result.as_dict(),
        # Metadata is per materialisation, so the UI plots row count and reject
        # rate over time without anyone building a dashboard.
        metadata={
            "rows": MetadataValue.int(result.upserted),
            "rejected": MetadataValue.int(result.rejected),
            "reject_rate": MetadataValue.float(
                result.rejected / result.read if result.read else 0.0),
            "business_date": MetadataValue.text(business_date),
        },
    )


def _check(name: str, severity: AssetCheckSeverity = AssetCheckSeverity.ERROR):
    """One @asset_check per quality check, so each is separately visible."""

    @asset_check(asset=partner_orders, name=name, blocking=False)
    def _fn(context: AssetExecutionContext) -> AssetCheckResult:
        business_date = context.partition_key
        conn = connect(DB_PATH)
        try:
            result = next(c for c in run_quality_checks(conn, business_date)
                          if c["check_name"] == name)
        finally:
            conn.close()
        return AssetCheckResult(
            passed=bool(result["passed"]),
            severity=severity,
            metadata={"observed": MetadataValue.text(str(result["observed"])),
                      "threshold": MetadataValue.text(result["threshold"]),
                      "detail": MetadataValue.text(result["detail"])},
        )

    _fn.__name__ = "check_" + name
    return _fn


# row_count and unique_key are errors: the partition is wrong.
# The rate checks are warnings: the partition is usable but worth looking at.
check_row_count = _check("row_count")
check_unique_key = _check("unique_key")
check_null_customer_ref = _check("null_customer_ref", AssetCheckSeverity.WARN)
check_reject_rate = _check("reject_rate", AssetCheckSeverity.WARN)


@asset(
    partitions_def=daily,
    deps=[partner_orders],
    group_name="partner",
    description="Sends an alert when a check failed. Nothing is sent on a clean day.",
)
def partner_extract_alert(context: AssetExecutionContext) -> None:
    business_date = context.partition_key
    conn = connect(DB_PATH)
    try:
        fails = failed(run_quality_checks(conn, business_date))
    finally:
        conn.close()
    if not fails:
        context.log.info("all checks passed for %s" % business_date)
        return
    message = format_alert(business_date, fails)
    context.log.error(message)
    # Swap for a Slack resource. Logging keeps this runnable with no secrets.


daily_job = define_asset_job("partner_daily", selection="*", partitions_def=daily)

defs = Definitions(
    assets=[partner_orders, partner_extract_alert],
    asset_checks=[check_row_count, check_unique_key,
                  check_null_customer_ref, check_reject_rate],
    jobs=[daily_job],
    schedules=[ScheduleDefinition(job=daily_job, cron_schedule="0 6 * * *")],
)
