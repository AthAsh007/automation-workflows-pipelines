# Recruiting Candidate Engine

Built for **[the job post](https://example.com/jobs/~022094574938024894619/)** , 
A staffing agency's ATS opens a job order; the
engine finds relevant candidates, runs an SMS and AI-voice outreach ladder, qualifies who
replies, books the recruiter, and writes it all back, with the state in Postgres, not in
n8n.

**This is a capability demo, not a finished platform.** Three workflows that run end to end
with **zero credentials configured**, so the whole thing can be walked through on a
screen-share before anyone hands over a Twilio key. There is a recording script in
the walkthrough below.

| | Workflow | What it does |
|---|---|---|
| 1 | [`01-job-order-to-campaign.json`](01-job-order-to-campaign.json) | Job order in → normalise → AI reads the description → pull and score candidates → **the gate** → enroll with the first touch *scheduled* |
| 2 | [`02-outreach-runner.json`](02-outreach-runner.json) | Every 15 min. Claims a batch from the queue, walks the ladder, sends one touch each via Twilio or Retell, records and reschedules |
| 3 | [`03-inbound-and-qualify.json`](03-inbound-and-qualify.json) | One signed webhook. Replies, delivery receipts, finished AI calls → opt-out, qualification, booking, recruiter alert, ATS write-back |

Plus [`supabase/schema.sql`](supabase/schema.sql). The operating database, which is where
most of the real engineering is.

---

## Run the demo in five minutes

1. **Import the three JSON files** into n8n. They import clean. No credentials attached,
   no environment variables, nothing to fix first.
2. **Open `config` in workflow 1.** It ships with `DEMO_MODE = true` and every key blank.
   Change nothing.
3. **Press "Run it now" on workflow 1.** It reads a hardcoded pool of eleven messy
   candidates, scores them, runs the gate, and stops at
   `STOP: preview - nothing enrolled`, open that node to read the entire launch.
4. **Press "Run it now" on workflow 2.** Open `STOP: preview - nothing sent` to read the
   exact text each candidate would receive, at their local time, with segment counts.
5. **Fire the inbound events**, `bash sample/test-webhooks.sh` (or paste the payloads into
   the webhook node). Six events: an opt-out, a positive reply, a delivery failure, a
   qualified AI call, that same call redelivered, and a no-answer.

Nothing leaves the building at any point. `DEMO_MODE` forces preview whichever way the other
switches are set, because a fabricated Twilio response must never be able to reach a real
phone.

**No Supabase project is needed for any of that**, and none of it half-runs. Every node that
would call an external service (Supabase, the ATS, Claude, Twilio, Retell) sits behind an
`IF` on its own config flag, so with nothing configured they simply do not execute. No node
fires at an empty URL, and there are no warning triangles on the canvas. The false branches
land on named `STOP:` nodes that say what *would* have been written:

| Node | Shows |
|---|---|
| `STOP: using the sample pool` | the eleven fabricated candidates the launch runs on |
| `STOP: no engagement history` | that the suppression list is empty, and that this matters |
| `STOP: using the sample due queue` | five due enrollments spread across the ladder |
| `STOP: not persisted` | every attempt row and state change the runner decided on |
| `STOP: opt-out not persisted` | the exact `stop_all_outreach()` call, and why the gap is not currently reachable |

`validate.py` walks the graph and fails the build if any external call becomes reachable
without its gate, so this property cannot regress.

### Optionally, with a real database

Not required, and not needed for the walkthrough. If you do want the workflows reading real
state: run [`supabase/schema.sql`](supabase/schema.sql) then
[`supabase/seed.sql`](supabase/seed.sql) in the SQL editor, put the client uuid into
`CLIENT_ID`, and fill in `SUPABASE_URL` / `SUPABASE_SERVICE_KEY`. The seed leaves seven
enrollments **already due** and spread across the ladder; `select reset_demo();` puts it back
between takes.

The schema is worth reading on camera either way. It is where most of the design lives, and
it makes the same argument whether or not it has ever been run.

### The safety switch

| `DEMO_MODE` | `TEST_RUN` | `TEST_PHONE` | What happens |
|---|---|---|---|
| `true` |, |, | **Preview.** Everything runs, nothing sends, nothing is written. **Ships this way.** |
| `false` | `true` | blank | Preview, but against your real database. |
| `false` | `true` | your mobile | Messages really send, to you, prefixed with the number they would have gone to. |
| `false` | `false` |, | **Live.** |

Filling in `TEST_PHONE` can only ever *redirect* a message, never cause one. Going live is
the separate, deliberate act of setting `TEST_RUN = false`. Only a live run may touch the
client's ATS or a recruiter's real calendar.

`DEMO_ANY_HOUR` exists so a walkthrough can be recorded at 2am, quiet hours are real, and
at 01:00 the runner correctly defers every single row, which is right and useless to film.
It is ANDed with `DEMO_MODE` in code, so it cannot leak into production.

---

## The six answers the post asks for

### Architecture

**Postgres is the system. n8n is the muscle.** Every durable fact, campaign state, contact
attempts, opt-outs, qualification results, appointments, lives in Supabase. n8n holds no
memory between executions at all, which means an execution can be killed, replayed or run
twice concurrently without corrupting anything.

The split, concretely:

| In the database | In n8n |
|---|---|
| The queue (`v_due_attempts`. A view) | Deciding which rung of the ladder is next |
| Opt-out suppression | Rendering the message |
| Duplicate prevention (unique indexes) | Calling Twilio / Retell / the ATS |
| Cross-campaign contact history | Classifying the response |
| Row-level tenant isolation | Evaluating the qualification rules |
| Atomic claim + opt-out transactions | Formatting the recruiter alert |

The rule: **anything expressible as a set operation belongs in Postgres**, because a rule in
a `where` clause cannot be skipped by a branch that did not run. The queue view already
excludes opted-out numbers, leased rows, terminal enrollments and people being worked by
another live campaign. So the runner cannot contact them even if its own logic is wrong.

### Software

n8n (self-hosted, queue mode) · Supabase/Postgres · Twilio Programmable Messaging ·
Retell AI · Google Calendar (Microsoft 365 is a node swap) · Claude for one extraction step ·
Slack for alerts. The ATS is REST, Bullhorn, Avionté, CEIPAL, JobDiva, Recruit CRM and
Salesforce all fit the same two nodes plus a field map.

### Retries and failures

Two layers, because they solve different problems.

**Transport**. Every network node is `retryOnFail`, 3 tries, and `neverError`, so a 4xx
arrives as *data* rather than ending the run. Nothing in these three workflows can die
because a provider had a bad second.

**Business**, `record the attempt` classifies every result into three outcomes:

- **sent** → advance a rung, schedule the next touch at the ladder's delay
- **transient** (502, rate limit, timeout) → stay on this rung, exponential backoff **with
  jitter**, give up after 4. Without jitter, 300 enrollments that failed on one Twilio blip
  all retry in the same second and fail together again.
- **permanent** (21211 bad number, 30003 unreachable, 21610 carrier opt-out) → stop.
  Retrying these costs money and manufactures a fake "attempted 6 times".

ATS write-backs are **queued to a table before they are attempted**, so a Bullhorn outage
delays a note instead of losing it.

### Preventing duplicate contact

Four defences, deliberately at different layers, because any one of them can be wrong:

1. **`unique (campaign_id, candidate_id)`**. A candidate is enrolled in a campaign once.
2. **`unique (client_id, idempotency_key)` on `contact_attempts`**, the key is
   `sha(enrollment | channel | step)`, computed **before** the send. If n8n dies between
   Twilio accepting the message and the row being written, the next run recomputes the same
   key, the insert conflicts, and nothing is sent. A retry is safe by construction.
3. **The queue view excludes anyone whose *phone* is live in another campaign.** One human
   with three ATS records is one human.
4. **Phone normalisation to E.164 on the way in**, so `(614) 555-0142`, `614.555.0142` and
   `+16145550142` are the same number to the opt-out table.

Plus an optimistic lease (`lease_token` + `SELECT ... FOR UPDATE SKIP LOCKED`) so two
overlapping 15-minute runs take disjoint batches instead of the same one.

### Multi-client

Every table carries `client_id` with an RLS policy; there is no row that belongs to nobody.
One n8n instance runs every client. Onboarding a new one is:

1. Insert a `clients` row (timezone, quiet hours, send cap).
2. Point `ATS_FIELDS` at their field names, [`sample/job-order-bullhorn.json`](sample/) and
   [`sample/job-order-ceipal.json`](sample/) are the same job order in two vendors' shapes,
   and **only the map changes** between them.
3. Set the recruiter calendar, the qualification criteria and the outreach ladder in `config`.
4. Run in preview, then `TEST_PHONE`, then live.

No workflow is copied per client. A client-specific ladder lives on the campaign row, not in
the workflow, so editing the template never changes a campaign already running.

### Where the AI is, and where it is not

One call, once per job order: reading an unstructured job description into a structured skill
list. Most ATS job orders have an empty `skillList` and three paragraphs of prose, and
matching 20,000 candidates against an empty list finds nobody.

Retell's agent is asked **structured questions** and returns typed answers. The pass/fail is
then computed in code from `QUALIFY` in the config node. So changing the bar is a config
edit rather than a prompt rewrite, and a decision from last quarter can be re-explained
against the rules that were in force at the time.

**`null` never passes.** A question the agent could not establish routes to `needs_review`,
which a human sees, rather than to a silent rejection. Quietly rejecting candidates an AI
failed to finish interviewing is how an agency loses good people to an automation nobody
audits.

---

## Checking a change

The Code nodes live in `build/js/` as real `.js` files and are compiled into the workflows.

```bash
cd build
python build.py       # js/*.js -> the three workflow JSON files
python validate.py    # structure, branches, merges, no $env, ships safe, schema parity
```

`validate.py` is the [`../../docs/CONFIG-NODE.md`](../../docs/CONFIG-NODE.md) checklist plus the things
specific to an engine that can text people: that the shipped default cannot send, that the
idempotency key is computed *before* the send and not after, that opt-out is tested before
intent, that the signature check fails closed, that quiet hours use the candidate's timezone,
and that no send node is reachable except through the mode gate. It also walks the graph to
confirm preview cannot reach Twilio or Retell, and checks every table and RPC the workflows
POST to actually exists in `schema.sql`, which is how the missing `engagement_history`
function was caught rather than shipped.

---

## What is deliberately not here

This is a demo of the architecture, not a delivered system. Missing, and honestly so:

- **The ATS search and note nodes are Bullhorn-shaped and untested against a live sandbox.**
  Every vendor's search endpoint differs; the normalisation downstream does not. Those two
  nodes plus the field map are the per-vendor work, and it is a day per ATS, not a rebuild.
- **No retry sweep for `ats_writebacks`.** The table and the queueing exist; the small
  workflow that drains it does not.
- **No re-verification or list hygiene.** Numbers go stale; people change jobs.
- **Qualification criteria are one flat rule set per client**, not per job order. The
  `campaigns.qualification` column is already the right shape for per-job criteria.
- **No inbound conversation.** A reply stops the sequence and routes to a human or to the
  qualifier. Multi-turn SMS negotiation is a bigger piece of work and a worse first version
  than a fast handoff to a recruiter.
- **`stop_all_outreach` is not rate-limited.** Fine at thousands; at millions the opt-out
  path wants its own index review.
