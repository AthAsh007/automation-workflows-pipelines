# Dagster

Asset-based orchestration. Apache-2.0, self-hostable.

```bash
pip install dagster dagster-webserver
export PYTHONPATH=$PYTHONPATH:$(pwd)/..
dagster dev -f partner_assets.py
```

Backfill a range:

```bash
dagster asset backfill -f partner_assets.py \
    --partition-range 2026-09-01...2026-09-03 partner_orders
```

## What this example shows

The difference from the Airflow version is not syntax. Airflow schedules tasks,
Dagster declares assets, so the thing the UI shows you, the thing you backfill,
and the thing a downstream dbt model depends on are all one object: a table
partition.

- **`DailyPartitionsDefinition`.** The partition key *is* the business date. A
  ninety-day backfill needs no loop and no date arithmetic.
- **`@asset_check` per quality check.** Each check attaches to the asset and is
  separately visible, with its own severity. `row_count` and `unique_key` are
  errors, the two rate checks are warnings, because a partition slightly over the
  null threshold is usable and a partition with duplicate keys is not.
- **Metadata per materialisation.** Row count and reject rate are recorded every
  run, so the UI plots them over time without anyone building a dashboard.
- **`blocking=False`** on the checks, so a warning does not stop a downstream
  asset that can tolerate it.

## Where Dagster is the right answer

You think in tables rather than tasks, and you run dbt. The asset model lines up
with how dbt already describes your warehouse, so lineage and freshness come out
of the same declaration rather than a second tool.

## Where it is not

If the pipeline is not producing data assets (calling APIs, moving files, driving
a business process) the asset abstraction is friction rather than help.
