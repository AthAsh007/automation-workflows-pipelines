# The eight mechanisms

Most automation briefs ask for one of about eight mechanisms wearing a different
industry's clothes. Naming the mechanism first tells you which template to start
from, and stops you building a ninth workflow that is the fourth copy of one you
already have.

| Mechanism | What it looks like in a brief | Template |
| --- | --- | --- |
| **Enrich, verify, suppress, push, report** | "Clay to Apollo to Instantly with a Slack digest" | [lead-enrichment-and-verification-published](../n8n/lead-enrichment-and-verification-published/) |
| **Intake, acknowledge, route, chase, digest** | "Nothing should wait on whoever notices the form first" | [inbound-enquiry-router-published](../n8n/inbound-enquiry-router-published/) |
| **Audit, auto-fix the safe class, report the rest** | "Our CRM is a mess but do not merge anything" | [crm-data-hygiene-published](../n8n/crm-data-hygiene-published/) |
| **Personalise from a record, attach, send, write back** | "Email each of them with their own report attached" | [personalised-outbound-email](../n8n/personalised-outbound-email/) |
| **Generate, render, human approval, publish** | "Post daily to our page without embarrassing us" | [social-post-with-approval-can-publish](../n8n/social-post-with-approval-can-publish/) |
| **Webhook, durable state, multi-step ladder, qualify, book, write back** | "SMS then a call, then get them on the recruiter's calendar" | [recruiting-candidate-engine-published](../n8n/recruiting-candidate-engine-published/) |
| **Classify, extract, validate, repair, route** | "Read the inbox and tell me which ones matter" | [prompts/](../prompts/) |
| **Schedule, sense, materialise, test, alert** | "Run this every night and tell me when it breaks" | [orchestration/](../orchestration/) |

## Why the distinction matters

The tool list in a brief is rarely the requirement. "Clay to Apollo to Instantly"
is *enrich, verify, push, report*, and the same graph does the job whether the
enrichment provider is Apollo, RocketReach or a CSV a human uploaded. Building
against the mechanism means the provider becomes a `config` value rather than a
rewrite.

## The parts each mechanism needs

**Enrich, verify, suppress, push, report** needs a batch selector so a run has a
bounded size, an enrichment step that records the provider and the timestamp, a
verification gate that drops rather than degrades, a suppression check, an
idempotent push, and a run summary that lists everything held back with a reason.
The report is the part people skip and the part that makes the workflow
trustworthy: a run that pushes 40 of 100 records and says nothing about the other
60 is indistinguishable from a broken one.

**Intake, acknowledge, route, chase, digest** needs the acknowledgement to be
immediate and unconditional, the routing to be a lookup table rather than a chain
of IF nodes, the chase to be driven by a timestamp column rather than a wait node
(so a restart does not lose it), and the digest to be one message rather than one
per item.

**Audit, auto-fix the safe class, report the rest** turns on one distinction:
which corrections preserve information. Trimming whitespace, lowercasing an email
domain and stripping a URL path do. Merging two records, picking between two phone
numbers and deleting a duplicate do not. Fix the first class silently, list the
second with record ids, and never do the second automatically no matter how
obvious it looks.

**Personalise from a record, attach, send, write back** works when the facts are
assembled in code and the model only rewrites the subject line and the opening
sentence. Inverting that, letting the model state the facts, is how a workflow
sends someone a confident sentence about a page that does not exist.

**Generate, render, human approval, publish** needs the approval to be a real
human action in a channel a human already reads, and needs the draft that gets
approved to be fingerprinted, so that the thing published is provably the thing
approved. The workflow must not be able to approve itself, including through a
retry.

**Webhook, durable state, ladder, qualify, book, write back** is the one that
genuinely needs a database. Wait nodes and workflow-static data do not survive
restarts or scale to concurrent enrollments. The state machine goes in Postgres,
each step records an attempt, and every inbound event is matched to an enrollment
by an id the outbound step generated.

**Classify, extract, validate, repair, route** needs the model output validated
against a schema before it reaches anything else, one repair attempt that shows
the model its own validation error, and a deterministic fallback for the second
failure. See [prompts/README.md](../prompts/README.md).

**Schedule, sense, materialise, test, alert** needs the sensor to be cheap and the
materialisation to be idempotent, so a backfill is a re-run rather than a
migration. See [orchestration/README.md](../orchestration/README.md).

## When to build a ninth

Build new when one of these is true, and not otherwise:

- The target system's object model is the deliverable. A demo against a different
  schema does not answer the question.
- The mechanism genuinely is not in the table. Two-way sync, a document pipeline,
  a payments flow, anything with a state machine that is not here.
- The gap is the first thing anyone would notice, because every node name in the
  nearest template belongs to another industry.

"It would look more tailored" is not on that list.
