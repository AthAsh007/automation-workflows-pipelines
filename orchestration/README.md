# Orchestration

The same pipeline, written six times. Comparing orchestrators by reading their
marketing pages tells you very little; comparing them on one job you understand
tells you a lot in twenty minutes.

Every engine here is open source and self-hostable on a laptop. None of these
examples needs a managed cloud, a licence or a credit card.

```
orchestration/
├── airflow/     Apache Airflow 3, TaskFlow API
├── dagster/     Dagster, asset-based
├── prefect/     Prefect 3, flows and tasks
├── temporal/    Temporal, workflow and activities
├── kestra/      Kestra, declarative YAML
├── windmill/    Windmill, scripts and a flow
└── shared/      the business logic all six call, so the comparison is fair
```

## The pipeline

**Daily partner extract.** A partner drops a CSV per day. Load it, validate it,
upsert it into a table, run quality checks, and alert when a check fails.

```
wait for today's file ──> load ──> validate ──> upsert ──> quality checks ──> alert on failure
                            │         │                          │
                        row count  reject rows            freshness, row count,
                        recorded   to a table             null rate, duplicate keys
```

It is deliberately ordinary. Every real data pipeline is some version of it, and
it exercises the four things that actually differ between orchestrators:

| Concern | Why it separates the tools |
| --- | --- |
| **Waiting for an input** | A sensor that polls, a partition that is unmet, or a signal. This is where deferrable execution matters. |
| **Partitioning and backfill** | Re-running one day, or ninety, without hand-editing anything. |
| **Idempotency** | Running the same day twice must not double the rows. |
| **Data quality as a first-class result** | A check that fails should be visible as a failed check, not as a task that raised. |

## The honest summary

| Engine | Model | Backfill a date range | Best when |
| --- | --- | --- | --- |
| **Airflow** | Tasks in a DAG, scheduled | First-class, built around it | It is already running where you work. The largest operator ecosystem, and the most people who know it |
| **Dagster** | Assets that declare what they produce | First-class, per partition | You think in tables rather than tasks, and you run dbt. Lineage and freshness come free |
| **Prefect** | Ordinary Python functions with decorators | Manual, you write the loop | You want orchestration without operating a scheduler, and your pipeline is already Python |
| **Temporal** | Durable workflow code with activities | Not its model | The job is a long-running business process with retries and human steps, not a data pipeline |
| **Kestra** | Declarative YAML, plugins for the work | First-class | You want pipelines defined as data, editable by people who do not write Python |
| **Windmill** | Scripts in Python, TypeScript or Go, composed into a flow | Manual | You want scripts with generated UIs and a fast runtime, and you dislike DAG boilerplate |

Temporal is on the list because it comes up in orchestration comparisons and it
should not. It is a workflow engine for long-running business processes: durable
state, retries across restarts, waiting weeks for a human. Modelling a daily table
build in it is possible and usually wrong. The example here shows the shape it is
actually good at, so the difference is visible.

## Running one

Each directory has its own README with the exact commands. All six share
[`shared/pipeline.py`](shared/pipeline.py), which holds the actual work: parsing,
validating, upserting and checking. That is deliberate. The orchestrator's job is
scheduling, retries, observability and backfill, and none of them should be
holding your business logic.

That split is also what makes the logic testable without any orchestrator at all:

```bash
cd orchestration
python -m pytest shared/test_pipeline.py -q
python -m shared.pipeline --date 2026-09-01 --source shared/sample/partner-2026-09-01.csv
```

## Idempotency, in all six

Every implementation upserts on `(partner_id, external_id, business_date)` rather
than inserting, and every one deletes the target partition before writing it. Two
runs of the same date produce the same table.

This is the property that makes a backfill safe, and it belongs in the SQL rather
than in the orchestrator. An orchestrator that guarantees exactly-once task
execution still cannot help you when a task is retried after a partial write.

## Prior art

The pipeline shape is the ordinary one taught in every orchestrator's own
tutorial, and the quality checks are the four that dbt's `tests`, Great
Expectations and Soda all ship by default: freshness, row count, null rate and
uniqueness. The implementations here are written for this repository. Where an
engine has an idiom the docs recommend (Airflow's TaskFlow API, Dagster's
partitioned assets, Prefect's task caching), the example uses it rather than
writing the same Python six times in different wrappers.
