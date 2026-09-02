# Kestra

Declarative YAML orchestration. Apache-2.0, self-hostable in one container.

```bash
docker run --rm -it -p 8080:8080 kestra/kestra:latest server local
# open http://localhost:8080, Flows, Create, paste partner-extract.yml
```

Backfill: open the trigger in the UI and pick a date range. Kestra generates one
execution per day, with `trigger.date` set to that day.

## What this example shows

The pitch is that the pipeline is data, not code. `partner-extract.yml` is the
whole definition, and someone who does not write Python can read it and change
the schedule, a threshold or the alert target without touching a repository.

- **Typed `inputs` with defaults.** They become a form in the UI, so re-running
  one day is a text box rather than a CLI invocation.
- **One `variables.day` expression.** The fallback chain (input, then trigger
  date, then yesterday) is written once and referenced everywhere, rather than
  repeated in five tasks.
- **`retry: exponential`** declared on the task, in the same file as the task.
- **`If` on an output file rather than on an exit code.** The load succeeded even
  when a check failed, so the flow branches to the alert instead of failing.
- **An `errors` block.** A genuine pipeline failure is reported differently from
  a quality-check failure. Collapsing the two is how an operator learns to ignore
  both.

## Where Kestra is the right answer

You want pipelines defined as data, reviewable in a pull request, and editable by
people who are not Python developers. The plugin set covers most of what an
Airflow operator would.

## Where it is not

Logic that is genuinely conditional and stateful. YAML stops being an advantage
about the time you want a real loop.
