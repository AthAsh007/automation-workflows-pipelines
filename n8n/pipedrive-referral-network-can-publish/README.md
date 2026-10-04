# Pipedrive referral network

Two n8n workflows for a physician referral pipeline in Pipedrive: one that enforces the
client's own hardest rule, and one that reports on whether the rule is holding.

Built against a brief from Trialbridge, clinical-trial patient
recruitment, building a physician referral network. **Read [What this is not](#what-this-is-not)
before quoting it at anybody**, because most of that job post is Pipedrive configuration and
none of that is here.

| File | What it does | Trigger |
|---|---|---|
| [`01-activity-guard.json`](01-activity-guard.json) | Finds every open deal with no next activity and schedules the one its stage calls for | Weekdays 07:00 |
| [`02-recruitment-reporting.json`](02-recruitment-reporting.json) | Computes the funnel Insights cannot, writes four dashboard tabs, posts a management digest | Mondays 08:00 |

Both ship with `TEST_RUN = true` and no credentials. **`node build/simulate.js` runs the
whole thing on this machine right now** — 49 assertions against a built-in demo pipeline,
no n8n and no Pipedrive account.

---

## The one line this is built around

> **NO OPEN OPPORTUNITY SHOULD EXIST WITHOUT A NEXT ACTIVITY.**
>
> The system should make it very difficult for physician relationships to disappear because
> a representative forgot to follow up.
>
> — the brief, scope item 4

That is a good specification, and it is the one thing in the post that Pipedrive's own
automation builder cannot do.

Pipedrive automations are **event-triggered**: a deal moves stage, a deal is created, a
field changes. Every one of them fires when something *happens*. This rule is about
something **not** happening — a deal sitting in a stage with nothing scheduled against it —
and nothing happens when nothing happens. There is no event to hang an automation on.

So the rule has to be asked, on a schedule, of the whole pipeline. That is workflow 01.

### The horizon is the rule

A deal is **covered** when it has an activity that is:

- not done, **and**
- due on or before `HORIZON_DAYS` (45) from now.

Drop the second half and the rule is satisfied by a task parked eleven months out. Coverage
reads 100%, the pipeline rots, and the report is worse than useless because it is
confidently wrong. `build/simulate.js` proves this both ways: four of the demo pipeline's
deals have an open activity and are still correctly reported as uncovered, and widening the
horizon to 5,000 days flips exactly those four to covered.

An activity with no due date at all counts as parked, for the same reason — it never
surfaces on anyone's day.

### Overdue is escalated, never stacked

A deal whose next activity is already overdue does **not** get a second activity piled on
top of the one the rep is not doing. That is how a rep ends up with sixty open tasks and
stops reading any of them, at which point the rule is enforced on paper and nowhere else.

Those go to a manager instead, in a message that is not the rep-facing summary. Different
audiences, different messages — send both people the same thing and both stop reading it.

### Four outcomes, decided before anything is written

| Outcome | When | What happens |
|---|---|---|
| `create` | no next step inside the horizon | the activity this stage calls for, due in `due_in_days` |
| `reengage` | a referral partner with no activity for `REENGAGE_AFTER_DAYS` | a re-engagement activity instead of the routine check-in |
| `escalate` | there *is* a next step, already overdue | the manager digest; nothing is created |
| `skip` | covered, inside its grace window, past the daily cap, or a stage with no rule | nothing, with the reason recorded |

`DAILY_CAP` is enforced in code, worst-first: if it bites, it bites on the deals that have
been quiet the *shortest*. A misconfigured stage list should cost forty stray activities,
not two thousand.

---

## The PHI boundary, enforced rather than documented

The post draws a compliance line and draws it correctly:

> Pipedrive will be used as Trialbridge's physician/practice business-development CRM. It is
> NOT intended to be our patient clinical database. Do not create fields for identifiable
> patient medical information, diagnoses, medications, screening responses, medical records
> or other patient PHI.

`check the PHI boundary` sits between the read and everything else in **both** workflows,
reads every deal field's *name*, and treats two different problems differently:

1. **The CRM already holds a PHI-shaped field.** Not this workflow's doing. The field is
   added to a blocklist so nothing here reads it, and it is named in every run summary and
   in the weekly digest until someone deals with it.
2. **This workflow is configured to read one.** That is our mistake, and the run **stops**,
   naming the field and the config key. A misconfiguration that quietly copies a diagnosis
   into a dashboard is the exact failure the requirement exists to prevent, and a warning
   in a log is not a control.

Aggregate recruitment results pass through untouched — counts of referrals, screens and
enrolments are in scope. A number of patients is not a patient.

Short tokens (`dob`, `mrn`, `ssn`, `phi`) are matched as whole words. A check that flags
"Method of introduction" gets switched off within a week, and a control that is switched
off is not a control either.

---

## The report is half the build

A rule without the measurement that proves it is a hope. Their scope item 6 asks for
fifteen numbers, and the last one — *"active deals without future activities"* — is the
measurement of item 4. Same build, same definitions, same read.

That matters more than it sounds. If the report computed "next activity" from a second,
slightly different definition, the two would disagree and nobody could tell which was
wrong. `01` and `02` share `config`, `read the pipeline`, `check the PHI boundary` and
`check every deal for a next activity`, all generated from the same source files by
`build/build.py`. `validate.py` asserts the two config nodes are byte-identical.

### What Insights cannot do, and this can

Pipedrive Insights counts deals by stage and activities by type. The **recruitment funnel**
spans deals, activities and aggregate custom fields at once:

```
outreach attempt -> meaningful conversation -> meeting -> referral partner
                 -> referrals -> pre-screen -> sent to site -> screened -> randomised
```

Attempts and conversations are separate columns on purpose. A rep with 200 attempts and 6
conversations and a rep with 40 attempts and 22 conversations have very different problems,
and a single "activity" number hides both. An attempt whose note matches `NO_ANSWER_WORDS`
is an attempt, not a conversation.

### "Not captured" is not zero

Every recruitment number comes from a Pipedrive custom field named in `RESULT_FIELDS`. When
that key is blank, the dashboard writes the literal string **`not captured`** — never `0`,
never an empty cell.

A zero means the practice referred nobody. A blank means nobody wired the field up. Those
are different facts leading to different meetings, and printing the second as the first is
how a dashboard loses a manager in week two. The weekly digest repeats the list at the
bottom, labelled as setup tasks.

### The four tabs

| Tab | One row per | Answers |
|---|---|---|
| `Dashboard` | run | the fifteen KPIs, appended — the tab's own history is the trend |
| `Gaps` | uncovered deal | *"active deals without future activities"*, written even when empty |
| `By rep` | representative | results by marketing representative |
| `By practice` | deal | results by physician/practice, aggregate counts only |

`Gaps` is written on every run including clean ones. An empty tab that was written today is
a result; one that was never written is a broken workflow, and from the outside they look
identical.

---

## Running it

### Right now, with nothing installed but node

```bash
node build/simulate.js
```

Executes every Code node unmodified against a deterministic demo pipeline — 23 deals, 54
activities, a spread that gives every branch something to do. It asserts the horizon rule,
the cap, the escalation rule, the re-engagement branch, the "not captured" rule, and that
the PHI check actually stops a run.

### In n8n

1. Import both JSON files. Nothing is configured; nothing will run against anything.
2. Open **config** in either. Every setting is there, with the comment a non-developer
   needs. It is the same node in both files — edit both, or re-run `build/build.py`.
3. Press **Run it now** on `01`. With `API_TOKEN` blank it builds the demo pipeline and runs
   the entire rule against it. Open **STOP: not created** to read every activity it would
   have created, with the deal, the stage, the due date and the reason.
4. Put a real `COMPANY_DOMAIN` and `API_TOKEN` in. Same nodes, real account, still preview —
   nothing is written until `TEST_RUN` changes.
5. `TEST_OWNER_ID` set → activities are really created but all assigned to that one user, so
   no real rep's task list moves while you check the stage rules.
6. `TEST_RUN = false` → live, assigned to each deal's own owner.

For `02`, create a Google Sheet with the four tabs in [`sheet/`](sheet/) and put its id in
`SHEET_ID`. Blank is fine — the numbers are computed and posted to chat either way.

### The safety property

`DEMO_PIPELINE` on **forces preview**, whatever `TEST_RUN` says. A fabricated deal can never
produce a real Pipedrive write. Filling in `TEST_OWNER_ID` can only ever *redirect* a write;
going live is always the separate deliberate act of setting `TEST_RUN = false`.

---

## Files

```
pipedrive-referral-network-can-publish/
├── 01-activity-guard.json          generated — do not hand-edit
├── 02-recruitment-reporting.json   generated — do not hand-edit
├── build/
│   ├── build.py        compiles js/*.js into both workflows and the sheet headers
│   ├── validate.py     structure, gates, secrets, PHI check placement, sheet headings
│   ├── simulate.js     runs every Code node outside n8n against the demo pipeline
│   └── js/             one file per Code node, which is where the logic actually lives
├── sample/demo-pipeline.json       the fixture, exported so you can read it
├── sheet/                          the four dashboard tabs, headers generated from config
```

Edit `build/js/*.js`, then:

```bash
python build/build.py && python build/validate.py && node build/simulate.js
```

---

## What this is not

**This is not an answer to that job post, and the job post is not a lead.** Nine of their
ten scope items are native Pipedrive configuration — pipelines, custom fields, activity
types, Insights, permissions, CSV import — and they say plainly that the architecture is
already designed and they are hiring hands to execute a written spec. They also pre-reject
cross-CRM applicants by name.

What this folder is: **the automatable tenth of that brief, built properly**, because the
mechanism underneath it — *a rule, plus the report that proves the rule holds* — is one we
meet constantly and had no demo for.

Specifically not built here:

- **Pipeline, stage, custom-field and activity-type creation.** The workflow reads a
  pipeline that already exists. Their items 1, 2, 3 and 5 are configuration.
- **Permissions.** Item 5 is a Pipedrive settings screen.
- **The Excel prospect import.** Item 7 is a one-off. It is a real piece of work — idempotent
  upserts against organisations, persons and deals — and it is not in this folder.
- **The other nine automations.** Item 4 says "approximately 10". The next-activity rule is
  the one that cannot be built in Pipedrive; several of the others (an activity on stage
  change, a reminder before a meeting) genuinely are Pipedrive automations and should be
  built there rather than dragged into n8n for consistency's sake.
- **Anything touching patient data.** By design, and enforced.

Numbers in the demo pipeline are fabricated fixtures. Trialbridge is named because the post
names them; nothing here reflects a real Trialbridge system, and no engagement exists.
