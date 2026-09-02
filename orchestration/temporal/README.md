# Temporal

Durable execution. MIT licensed, and `temporal server start-dev` runs locally
with no configuration.

```bash
pip install temporalio
temporal server start-dev                    # terminal 1
python partner_workflow.py worker            # terminal 2
python partner_workflow.py start acme-north  # terminal 3
temporal workflow signal --workflow-id onboard-acme-north \
    --name approve --input '{"approver":"ops@example.com"}'
```

## This example is deliberately a different pipeline

The other five directories build the same daily table. This one does not, on
purpose.

Temporal turns up in orchestrator comparisons and it should not. It is a durable
execution engine for long-running business processes, not a data orchestrator.
Modelling a nightly partition build in it means writing your own scheduling,
partitioning and backfill to get something the other four already give you.

So this shows the shape Temporal is good at, in the same domain: onboarding a
partner, which takes days, involves a human, and has to survive a restart at any
point.

```
validate -> compliance check -> WAIT for a human -> provision -> first extract
                                                        |
                                              on failure, compensate
```

## What this example shows

- **A signal as the human step.** `wait_condition(..., timeout=14 days)` costs
  nothing while it waits. The workflow is not resident in memory, holds no worker
  slot, and resumes exactly where it stopped after a restart.
- **A query.** `state()` is answerable at any time, including mid-wait, with no
  database. The workflow's own history is the state.
- **Retry policy per activity.** Validation is `non_retryable`, because a
  malformed application will still be malformed in thirty seconds. The compliance
  call is patient, because that is the one that rate limits.
- **A saga.** If the first extract fails after the drop location was provisioned,
  the compensation removes it. Without that, a failure leaves a provisioned
  partner that was never onboarded, and nothing remembers to clean it up.
- **Idempotent activities.** `provision_drop_location` derives the path rather
  than allocating one. Activities can run more than once, so anything that
  allocates an identifier has to derive it from its input.

## Where Temporal is the right answer

The job is a business process with waits measured in days, steps that must not be
left half-done, and a hard requirement that state survives deploys.

## Where it is not

Building tables on a schedule.
