# Prefect

Prefect 3. Apache-2.0, and the self-hosted server is free.

```bash
pip install prefect
export PYTHONPATH=$PYTHONPATH:$(pwd)/..
python partner_flow.py --date 2026-09-01
python partner_flow.py --from 2026-09-01 --to 2026-09-03
```

## What this example shows

Prefect is the closest of the six to plain Python. A flow is a function, a task
is a function, and control flow is `if` and `for` rather than a graph you
declare. There is nothing to learn before the first pipeline runs.

- **Retries with jitter.** `retry_jitter_factor=0.5` on the sensor. Without it a
  ninety-day backfill retries every partition in lockstep and arrives at the
  partner's endpoint all at once.
- **Backfill is a loop you write.** `backfill()` at the bottom of the file. That
  is the honest cost of the model: no partition primitive, so the range, the
  ordering and the failure policy are yours.
- **`strict` defaults to False.** A backfill should not stop at the first day with
  a quality problem. A scheduled deployment should set it True, because a silent
  failing check is worse than a failed flow run.

## Where Prefect is the right answer

You want orchestration without operating a scheduler, the pipeline is already
Python, and the team is small enough that "it is just functions" is worth more
than a partition abstraction.

## Where it is not

Date-partitioned backfill over a long history. You will write the loop, then the
concurrency control, then the per-partition state, and at that point you have
rebuilt part of Dagster.
