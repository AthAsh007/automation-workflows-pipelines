# Airflow

Apache Airflow 3, TaskFlow API. Apache-2.0, self-hostable.

```bash
export PYTHONPATH=$PYTHONPATH:$(pwd)/..        # so `shared` imports
cp -r dags/* $AIRFLOW_HOME/dags/
airflow dags test partner_extract 2026-09-01
```

Backfill:

```bash
airflow backfill create --dag-id partner_extract \
    --from-date 2026-09-01 --to-date 2026-09-03
```

## What this example shows

- **TaskFlow.** `@task` functions pass return values directly. The XCom is still
  there, you just stop writing `xcom_pull`.
- **A deferrable sensor.** `FileSensor(deferrable=True, mode="reschedule")` frees
  the worker slot while waiting. On a six-hour timeout with a five-minute poke,
  that is the difference between one idle slot and a saturated pool.
- **Exponential retry** with a `max_retry_delay`, so a partner endpoint that is
  briefly down is not hammered.
- **A skipped alert.** The alert task raises `AirflowSkipException` on a clean
  day, so the UI shows a skip rather than a green task that did nothing. A run
  that always looks identical teaches an operator to stop reading it.
- **`trigger_rule="all_done"`** on the summary task, so every run leaves one log
  line whether or not the alert fired.

## Where Airflow is the right answer

It is already running where you work, and someone there knows it. That is a
better reason than any feature comparison. The operator ecosystem is the largest
of the six, and date-partitioned backfill is what the scheduler was built around.

## Where it is not

The unit is a task, not a table. If you want "this table is stale" rather than
"this task failed", you are building that yourself, and Dagster gives it to you.
