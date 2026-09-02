# CRM Data Hygiene

> **Import `workflow.json`.** It is the only file here that follows
> [../docs/CONFIG-NODE.md](../../docs/CONFIG-NODE.md). Every setting in one `config` node, no `$env`, runs on
> n8n Cloud and demos before a credential exists. `workflow.json` (v1) and `workflow-v2.json`
> are earlier versions kept for history; v1 still reads `$env` and is what `.env.example`
> belongs to. This was archive template **07**, brought out on 2026-09-02 because
> ../docs/CONFIG-NODE.md points at it as the reference implementation.

**Post:** *CRM & Lead Data Specialist, GoHighLevel, Instantly, Data Scraping, Outreach*
(job `022088644290585885140`)

> The worked example is Cedar Land
> Sales, Texas rural land, sourcing from BatchLeads/PropStream/ListSource, SMS through GHL
> and email through Instantly. That is a US campaign governed by **TCPA, 10DLC and
> CAN-SPAM**, not by the Singapore rules in `../archive/_shared/compliance.md`, and they are hiring
> an operator before they are hiring a workflow. The checklist is the deliverable; this
> workflow automates the repetitive slice of it once the process is stable.

## What it does

Runs Sunday evening. Fixes what can't be got wrong, reports everything else, rechecks
addresses that have gone stale, and logs one health score a week so the client can see the
trend.

## The line this template is built on

**Auto-fix only what is information-preserving.**

| Fixed automatically | Reported, never auto-resolved |
|---|---|
| Leading/trailing whitespace | Duplicate emails |
| Email case (`Jane@ACME.example` → lowercase) | Duplicate `lead_id`s |
| Domain normalisation (`https://www.acme.example/` → `acme.example`) | Malformed addresses |
| Missing `lead_id` rebuilt from domain + name | Missing domains |
| | Likely job changes |
| | Live leads that never reached the CRM |
| | CRM contacts with no owner |

**It never merges and never deletes.** Merging is lossy, and a client who loses a real
contact to our cleanup doesn't stay a client. Duplicates get listed with their ids and a
human decides. Say this explicitly in the proposal, "data specialist" posts are usually
written by someone who has already been burned by a dedupe tool.

## Decay detection

Addresses go bad mainly because people change jobs. An address that verified once and fails
now is the strongest job-change signal in the dataset. So those rows are **suppressed and
flagged `needs_reresearch`**, not deleted. The company is still a good target; the person
moved. Feeding those back into template 01 finds their replacement.

`REVERIFY_AFTER_DAYS` (default 90) and `REVERIFY_BATCH` (default 50) control the cost:
50 rechecks a week is about US$0.20.

## Flow

```text
Sunday 20:00
  └─ [cred] Sheets — read leads
      └─ audit and safe autofix       two lists: fixes applied, issues reported
          └─ anything to write back?
              ├─ yes → [cred] Sheets — write safe fixes ─┐
              └─ no  → sheet was already clean ──────────┤
                          merge ◄────────────────────────┘
                            └─ pick stale addresses      (always emits, even when none)
                                └─ anything stale?
                                    ├─ yes → [cred] Verifier — recheck
                                    │           └─ apply recheck results
                                    │               └─ [cred] Sheets — write results ─┐
                                    └─ no  → nothing to recheck ─────────────────────┤
                                                    merge recheck ◄──────────────────┘
                                                      └─ build quality report
                                                          └─ [cred] Sheets — log the score
                                                              └─ [cred] Post the report
```

Note the two merge points. They exist so the **report runs on a perfectly clean sheet too** , 
a hygiene job that only reports when something is wrong teaches the client to assume
silence means broken.

## The report

```text
🧹 Data quality — 2026-08-16
Health 94/100 across 3,412 rows.

Fixed automatically (188): 141 trimmed, 32 lowercased, 12 domains normalised, 3 ids rebuilt.

Needs a human (196, 5.7%):
  - 84 duplicate email
  - 61 likely job change
  - 39 live but never synced to CRM
  - 12 in CRM with no owner

Decay: 412 addresses older than 90 days; rechecked 50, 7 no longer valid and suppressed.
We never merge or delete a record automatically. Duplicates are listed, not resolved.
```

The weekly row in the `Data Quality` tab is what gets this work renewed, a client can see
health going from 71 to 94 over six weeks, which is much harder to argue with than "I
cleaned the data".

## Demo data

[`demo/`](demo/) has three CSVs ready to import as sheet tabs, 26 rows with one planted
defect per audit category, and the **verified** expected output so you know what the run
will report before you press Execute. Start there:
[demo/README.md](demo/README.md).

## Two flows, one file

`workflow.json` holds **two deliberately unconnected flows** on one canvas:

| | Starts from | Runs when |
|---|---|---|
| **Sheet setup** (top) | Manual Trigger | you press **Execute Workflow** |
| **Weekly audit** (bottom) | `Sunday 20:00` | the workflow is **Active** |

n8n starts a manual execution at the Manual Trigger, so pressing Execute runs the setup
and never touches the audit. Activating the workflow arms only the schedule, so the audit
runs weekly and the setup never fires again. To rehearse the audit by hand, use **Execute
step** on the `Sunday 20:00` node.

## The setup flow

It builds the spreadsheet the audit expects, and it is a diff rather than a rebuild - safe
to re-run at any point, including against a sheet a client has already been working in.

**Creates if missing:** the `Leads`, `Data Quality` and `Suppression` tabs, each with its
header row. `Suppression` is not read by the audit, it belongs to the sending workflow
§6 - and it is created here because a campaign that scrubs against a tab nobody made
scrubs against nothing.

**Never renames, reorders, clears or deletes anything.** Missing columns are appended to
the right of whatever is already in row 1; columns the client added themselves are
reported and left exactly where they are. That matters more than it sounds - a header row
is load-bearing for every formula and filter view pointing at it by letter, and this is a
template whose entire pitch is that it does not damage data it does not understand.

**With `LEADS_SHEET_ID` empty it creates the spreadsheet too**, then prints the id to paste
back into the env. That is the only step it cannot do for you.

**Credential:** the four Google nodes use an n8n **Google API** service-account credential.
Tick *Set up for use in HTTP Request node* on it, set the scope to
`https://www.googleapis.com/auth/spreadsheets`, and share the sheet with the service
account's email - otherwise every Sheets node fails with "file not found". They use the raw
Sheets API rather than the Sheets node because the node cannot list tabs or write a header
row into an empty one.

## Running it without touching the host environment

Every value both flows need can be typed straight into the workflow. Two nodes hold all
of it - there are no literals scattered through the other 36:

| Flow | Node | Holds |
|---|---|---|
| Setup | `define the tabs 07 needs` | `SHEET_ID_OVERRIDE`, `SHEET_TITLE_OVERRIDE` |
| Audit | `config` | sheet id, both reverify settings, verifier key, webhook |

Anything left blank falls back to the environment variable of the same name, so the file
works either way and keeps working if you fix the host later. A value typed into the node
wins over the environment.

**To get a first run with nothing configured anywhere:** open `config`, set
`LEADS_SHEET_ID` and `REVERIFY_BATCH = '0'`. That is it. Batch 0 never calls the verifier,
and the report node is `continueRegularOutput`, so a missing webhook logs one failed step
and lets the run finish. Neither secret is needed.

### The one thing not to type in

`VERIFIER_API_KEY` and `ALERT_WEBHOOK_URL` are real secrets, and anything typed into a node
is saved into `workflow.json` - a file this folder ships to clients as a work sample.
[`../archive/_shared/credentials.md`](../archive/_shared/credentials.md) says keys go in the host
environment or an n8n credential, never in a workflow JSON, and that rule is worth keeping.

The sanctioned alternative is per-node credentials, which
[`../archive/_shared/conventions.md`](../archive/_shared/conventions.md) already describes: convert
`[cred] Verifier - recheck` to a **Header Auth** credential, and give
`[cred] Post the report` either a credential or the one env var. That is two minutes of
work and keeps both secrets out of the file.

The sheet id is a different case - it is an identifier, not a key, and access to the sheet
is controlled by who it is shared with. Hardcoding that one is fine.

## If it fails with `access to env vars denied`

The Code node reports this as *"Cannot assign to read only property 'name' of object
'Error: access to env vars denied'"*, which names neither the cause nor the fix. The cause
is that n8n ships with `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`, and every `$env` read then
throws instead of returning empty.

**The fix is the host setting**, not a workflow change:

```bash
# docker compose - add under environment:, then: docker compose down && docker compose up -d
- N8N_BLOCK_ENV_ACCESS_IN_NODE=false
```

Do this even if you work around it in the setup node. The audit flow reads `$env` in
**eight** nodes - the sheet id in all four Sheets nodes, the verifier key, the webhook and
both reverify settings - and none of them have a fallback. Fixing only the setup node gets
you a correctly built sheet and an audit that still cannot run.

On **n8n Cloud**, where you cannot set host variables, the setup node has two fallbacks and
tries them in this order:

1. **Settings > Variables** - add `LEADS_SHEET_ID` (and optionally `LEADS_SHEET_TITLE`).
   Pro plan and above. This is the route that also fixes the audit flow, by converting its
   `$env` expressions to `$vars`.
2. **`SHEET_ID_OVERRIDE`** at the top of the `define the tabs 07 needs` node. Fastest, and
   fine for a one-off setup run, but it puts an id in the workflow JSON - so do not commit
   it back to this folder.

When the id cannot be read the node **throws rather than defaulting to empty**, on purpose:
an empty id means *create a new spreadsheet*, and silently creating one because we could
not read the id of the sheet a client is already using is the exact class of surprise this
template exists to avoid. To genuinely want a new spreadsheet on a blocked-env host, set
`SHEET_ID_OVERRIDE = 'NEW'`.

## Setup (about 10 minutes)

1. Import `workflow.json`, set env vars from `.env.example`, and set
   `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` on the host (see above - nothing here reads its
   config without it). For the demo, set `REVERIFY_BATCH=0` so you need no verifier key.
2. Press **Execute Workflow** to run the sheet setup. Read the final node's `text` - it
   lists every tab and column it touched.
3. If it created the spreadsheet, put the id it printed into `LEADS_SHEET_ID` and restart
   n8n.
4. Run the audit once by hand (**Execute step** on `Sunday 20:00`) against a copy of the
   sheet before activating the workflow against the real one.

## Scope we sell this as

**S$1,000 fixed** for the build, or **S$450/month** including reading the report and
actioning the human column, which is what most clients actually want, because the report
is only half the job.
