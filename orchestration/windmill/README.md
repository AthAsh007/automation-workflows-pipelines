# Windmill

Scripts composed into flows, with generated UIs. AGPL-3.0, self-hostable.

```bash
# docker compose up, see https://windmill.dev
# In the UI: Flows, New, Import from file, pick partner_flow.yaml
# Add scripts/backfill.py as a script under f/partner/
```

## What this example shows

Windmill's model is scripts first. Each step is an ordinary function with a typed
signature, and Windmill generates the input form and the UI from that signature.
There is no DAG object; the flow is the wiring between one step's output and the
next step's input.

- **`schema` generates the run form.** `business_date` typed as `format: date`
  produces a date picker, so nobody has to remember an argument order.
- **`input_transforms`** are the wiring. `results.wait_for_drop.path` is how the
  second step reads the first step's output.
- **`branchone`** for the alert, so a clean day takes the default branch and
  sends nothing.
- **Retry declared per module**, exponential on the sensor and constant on the
  load.
- **[`scripts/backfill.py`](scripts/backfill.py)** is a plain function, so the
  date-range backfill is itself a Windmill script with a generated form, logged
  and permissioned like every other run.

## Where Windmill is the right answer

You want scripts with UIs, a fast runtime, and as little DAG boilerplate as
possible. Python, TypeScript, Go and bash are all first-class in one flow.

## Where it is not

AGPL matters to some organisations, and it is the youngest of the six, so fewer
people already know it.
