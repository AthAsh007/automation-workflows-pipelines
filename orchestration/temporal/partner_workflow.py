"""Partner onboarding, as a Temporal workflow.

This directory deliberately does NOT implement the daily table build. Temporal
turns up in orchestrator comparisons and it should not: it is a durable execution
engine for long-running business processes, and modelling a nightly partition
build in it means writing your own scheduling, partitioning and backfill to get
something Airflow, Dagster or Kestra give you.

So this shows the shape Temporal is actually good at, using the same domain:
onboarding a new partner, which takes days, involves a human, and must survive a
process restart at any point.

    receive application
      -> validate                      (retryable, seconds)
      -> run compliance check          (external API, minutes, may rate limit)
      -> WAIT for a human decision     (a signal, may take days)
      -> provision the drop location   (idempotent)
      -> first extract, then verify    (may need a second attempt)
      -> notify, or compensate and roll back

What Temporal gives you here that a DAG does not: the wait is free, the whole
state survives a worker restart, and a failure after provisioning runs the
compensation rather than leaving a half-onboarded partner behind.

Run:
    pip install temporalio
    temporal server start-dev                       # in one terminal
    python temporal/partner_workflow.py worker      # in another
    python temporal/partner_workflow.py start acme-north
    temporal workflow signal --workflow-id onboard-acme-north \
        --name approve --input '{"approver":"ops@acme.example"}'
"""

from __future__ import annotations

import asyncio
import sys
from dataclasses import dataclass, field
from datetime import timedelta

from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.common import RetryPolicy
from temporalio.exceptions import ApplicationError
from temporalio.worker import Worker

TASK_QUEUE = "partner-onboarding"


@dataclass
class PartnerApplication:
    partner_id: str
    legal_name: str = ""
    contact_email: str = ""
    expected_daily_rows: int = 0


@dataclass
class OnboardingState:
    stage: str = "received"
    compliance_reference: str = ""
    drop_path: str = ""
    approved_by: str = ""
    rejected_reason: str = ""
    first_extract_rows: int = 0
    compensated: bool = False


# -- activities -----------------------------------------------------------
# An activity is the only place a side effect belongs. Workflow code has to be
# deterministic, because Temporal replays it from history after every restart.

@activity.defn
async def validate_application(app: PartnerApplication) -> None:
    problems = []
    if not app.partner_id.strip():
        problems.append("partner_id is empty")
    if "@" not in app.contact_email:
        problems.append("contact_email is not an address")
    if app.expected_daily_rows <= 0:
        problems.append("expected_daily_rows must be positive")
    if problems:
        # non_retryable: a malformed application will still be malformed in 30s.
        raise ApplicationError("; ".join(problems), non_retryable=True)


@activity.defn
async def run_compliance_check(app: PartnerApplication) -> str:
    """Stands in for a third-party screening API.

    Left retryable on purpose: this is the call that rate limits, and Temporal's
    retry policy is the right place to handle that rather than a sleep loop.
    """
    activity.logger.info("screening %s", app.legal_name or app.partner_id)
    return "COMP-" + app.partner_id.upper()


@activity.defn
async def provision_drop_location(partner_id: str) -> str:
    """Idempotent by construction: the path is derived, not allocated.

    Activities can run more than once. Anything that allocates an identifier has
    to derive it from the input, or the retry creates a second one.
    """
    return "/data/partner/%s" % partner_id


@activity.defn
async def deprovision_drop_location(path: str) -> None:
    """The compensation. Runs when a later step fails after provisioning."""
    activity.logger.info("removing %s", path)


@activity.defn
async def run_first_extract(partner_id: str, drop_path: str) -> int:
    """The first real load. Reuses the same logic the daily pipelines run."""
    activity.logger.info("first extract for %s from %s", partner_id, drop_path)
    return 0


@activity.defn
async def notify(to: str, subject: str, body: str) -> None:
    activity.logger.info("notify %s: %s\n%s", to, subject, body)


# -- workflow -------------------------------------------------------------

QUICK = RetryPolicy(initial_interval=timedelta(seconds=1),
                    backoff_coefficient=2.0,
                    maximum_interval=timedelta(minutes=1),
                    maximum_attempts=5)

PATIENT = RetryPolicy(initial_interval=timedelta(seconds=10),
                      backoff_coefficient=2.0,
                      maximum_interval=timedelta(minutes=30),
                      maximum_attempts=20)


@workflow.defn
class PartnerOnboarding:
    def __init__(self) -> None:
        self._state = OnboardingState()
        self._decision: str | None = None
        self._approver = ""
        self._reason = ""

    # Signals are how the outside world talks to a running workflow. This is the
    # human step, and it costs nothing while it waits.
    @workflow.signal
    async def approve(self, approver: str = "") -> None:
        self._decision, self._approver = "approved", approver

    @workflow.signal
    async def reject(self, reason: str = "") -> None:
        self._decision, self._reason = "rejected", reason

    @workflow.query
    def state(self) -> OnboardingState:
        """Queryable at any time, including mid-wait. No database needed."""
        return self._state

    @workflow.run
    async def run(self, app: PartnerApplication) -> OnboardingState:
        self._state.stage = "validating"
        await workflow.execute_activity(
            validate_application, app,
            start_to_close_timeout=timedelta(seconds=30), retry_policy=QUICK)

        self._state.stage = "compliance"
        self._state.compliance_reference = await workflow.execute_activity(
            run_compliance_check, app,
            start_to_close_timeout=timedelta(minutes=5), retry_policy=PATIENT)

        self._state.stage = "awaiting_approval"
        await workflow.execute_activity(
            notify, args=["ops@example.com",
                          "Approve partner %s" % app.partner_id,
                          "Compliance reference %s" % self._state.compliance_reference],
            start_to_close_timeout=timedelta(seconds=30), retry_policy=QUICK)

        # Waiting for days is ordinary here. The workflow is not resident in
        # memory, holds no worker slot, and resumes exactly here after a restart.
        try:
            await workflow.wait_condition(lambda: self._decision is not None,
                                          timeout=timedelta(days=14))
        except asyncio.TimeoutError:
            self._state.stage = "expired"
            self._state.rejected_reason = "no decision within 14 days"
            return self._state

        if self._decision == "rejected":
            self._state.stage = "rejected"
            self._state.rejected_reason = self._reason
            return self._state

        self._state.approved_by = self._approver
        self._state.stage = "provisioning"
        self._state.drop_path = await workflow.execute_activity(
            provision_drop_location, app.partner_id,
            start_to_close_timeout=timedelta(minutes=2), retry_policy=QUICK)

        try:
            self._state.stage = "first_extract"
            self._state.first_extract_rows = await workflow.execute_activity(
                run_first_extract, args=[app.partner_id, self._state.drop_path],
                start_to_close_timeout=timedelta(minutes=30), retry_policy=PATIENT)
        except Exception:
            # The saga. Without this, a failure here leaves a provisioned drop
            # location for a partner that was never onboarded, and nothing
            # remembers to clean it up.
            self._state.stage = "compensating"
            await workflow.execute_activity(
                deprovision_drop_location, self._state.drop_path,
                start_to_close_timeout=timedelta(minutes=2), retry_policy=QUICK)
            self._state.compensated = True
            self._state.stage = "failed"
            raise

        self._state.stage = "live"
        await workflow.execute_activity(
            notify, args=[app.contact_email, "You are live",
                          "Drop files at %s each day." % self._state.drop_path],
            start_to_close_timeout=timedelta(seconds=30), retry_policy=QUICK)
        return self._state


# -- entry points ---------------------------------------------------------

async def _worker() -> None:
    client = await Client.connect("localhost:7233")
    async with Worker(client, task_queue=TASK_QUEUE,
                      workflows=[PartnerOnboarding],
                      activities=[validate_application, run_compliance_check,
                                  provision_drop_location, deprovision_drop_location,
                                  run_first_extract, notify]):
        print("worker running on %s. Ctrl-C to stop." % TASK_QUEUE)
        await asyncio.Future()


async def _start(partner_id: str) -> None:
    client = await Client.connect("localhost:7233")
    handle = await client.start_workflow(
        PartnerOnboarding.run,
        PartnerApplication(partner_id=partner_id,
                           legal_name=partner_id.replace("-", " ").title(),
                           contact_email="ops@%s.example" % partner_id,
                           expected_daily_rows=120),
        id="onboard-%s" % partner_id, task_queue=TASK_QUEUE)
    print("started %s. Send the approval signal to continue:" % handle.id)
    print("  temporal workflow signal --workflow-id %s --name approve"
          " --input '{\"approver\":\"ops@example.com\"}'" % handle.id)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "worker"
    if cmd == "worker":
        asyncio.run(_worker())
    elif cmd == "start":
        asyncio.run(_start(sys.argv[2] if len(sys.argv) > 2 else "acme-north"))
    else:
        print(__doc__)
