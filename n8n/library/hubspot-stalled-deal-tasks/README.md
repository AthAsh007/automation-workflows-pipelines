# Create follow-up tasks for stalled HubSpot deals

Each weekday, compares every open HubSpot deal's days since last activity with a limit for its stage, creates one follow-up task per stalled deal (never a second while one is open), and posts a per-owner summary to Slack.

Import `hubspot-stalled-deal-tasks-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Sales managers whose HubSpot pipeline has deals nobody has touched in weeks. Each rep gets a task on the deals that went quiet, so the follow-up happens in HubSpot where they already work.

## How it works

1. Every weekday at 07:30 it reads open deals and open follow-up tasks from HubSpot, or sample data until HubSpot is connected.
2. Days idle is counted from the last logged activity. Each stage has its own limit in `STAGE_MAX_IDLE_DAYS` (5 days for Contract sent, 14 for Decision maker bought in), with `DEFAULT_MAX_IDLE_DAYS` for custom stages.
3. A deal over its limit gets one task, due tomorrow, with priority High at twice the limit. A deal that already has an open follow-up task is skipped, so tasks never pile up.
4. Unowned deals go to `FALLBACK_OWNER_ID`. Slack gets one summary grouped by owner.

## Sections on the canvas

1. **Start and settings.** Runs before the working day so tasks are waiting when reps log in. Stage limits, the fallback owner and the task cap live in `config`.
2. **Read deals and open tasks.** Open follow-up tasks are fetched alongside deals, because the duplicate check has to happen before anything is created. `Load sample deals` supplies both until `USE_HUBSPOT` is true.
3. **Find stalled deals and report.** `Find stalled deals` compares idle days with the limit for that stage, skips small deals and deals already covered by an open task, and applies `MAX_TASKS_PER_RUN`. Slack gets the same list grouped by owner. A test summary goes only to `TEST_SLACK_CHANNEL`, and stops at a STOP if that is blank.
4. **Create tasks.** Tasks are created only on a live run, each associated with its deal and assigned to the deal owner. The deal id in the subject is what stops tomorrow's run from making a second one.

## Setup

1. Run it once as imported. It checks sample deals and stops at `STOP: not live - no tasks created` and `STOP: preview - nothing posted`.
2. Create a HubSpot private app with deals and tasks scopes, add it to the three HubSpot nodes, then set `USE_HUBSPOT = true`.
3. Edit `STAGE_MAX_IDLE_DAYS` with your internal stage ids, and connect Slack with `SLACK_CHANNEL_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel, where the test summary lands. Set `TEST_RUN = false` to create tasks and post to `SLACK_CHANNEL_ID`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_HUBSPOT` | `false` | set true after adding the HubSpot credential to the HubSpot nodes |
| `STAGE_MAX_IDLE_DAYS` | `{"appointmentscheduled":10,"qualifiedtob` | internal stage id -> days without activity before a task is made |
| `DEFAULT_MAX_IDLE_DAYS` | `14` | limit for stages not listed above |
| `MIN_DEAL_AMOUNT` | `500` | deals below this amount are skipped |
| `FALLBACK_OWNER_ID` | `'101'` | HubSpot owner id that gets tasks for unowned deals |
| `OWNER_NAMES` | `{"101":"Maya Ortiz","102":"Theo Grant","` | owner id -> name for the Slack summary |
| `MAX_TASKS_PER_RUN` | `30` | hard ceiling on tasks created in one run |
| `TASK_PREFIX` | `'Stalled deal follow-up'` | start of every task subject; also used to find open tasks |
| `SLACK_CHANNEL_ID` | `''` | channel for the owner summary; blank posts nothing |
| `TEST_SLACK_CHANNEL` | `''` | test mode posts here instead of the real channel; blank means test mode posts nothing |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Search open deals`
- `Search open follow-up tasks`
- `Post the owner summary`
- `Create the task in HubSpot`

## Requirements

- A HubSpot account with Sales Hub deals and a private app token
- Optional: a Slack workspace

## Customising

- `STAGE_MAX_IDLE_DAYS` holds the limit per stage id.
- `MIN_DEAL_AMOUNT` leaves small deals alone.
- `MAX_TASKS_PER_RUN` caps how many tasks one run can create.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 12 | none | `STOP: not live - no tasks created`, `STOP: preview - nothing posted` |
| test mode with no test channel | 13 | none | `STOP: not live - no tasks created`, `STOP: test - TEST_SLACK_CHANNEL blank` |
| test mode into the test channel | 13 | `Post the owner summary` | `STOP: not live - no tasks created`, `Post the owner summary` |
| live with HubSpot and Slack | 16 | `Create the task in HubSpot`, `Post the owner summary` | `Create the task in HubSpot`, `Post the owner summary` |
