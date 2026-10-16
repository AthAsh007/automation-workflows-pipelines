# Summarise PagerDuty incidents weekly to Slack

Every Monday it pulls two weeks of PagerDuty incident analytics, reports last week's count against the week before, MTTA and MTTR, high versus low urgency, pages outside business hours, unacknowledged incidents and the noisiest services with their flapping alerts.

Import `pagerduty-weekly-incident-summary-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Engineering managers and on-call leads at teams of 5 to 60 who review on-call load once a week and currently copy numbers out of PagerDuty by hand. The Monday message shows whether last week was worse, and which service caused it.

## How it works

1. Every Monday at 08:00 it reads raw incident analytics for the last two calendar weeks from PagerDuty, or sample incidents until PagerDuty is connected.
2. Last week (Monday to Sunday, UTC) is compared with the week before. MTTA averages time to first acknowledgement over acknowledged incidents; MTTR averages time to resolve, with the median alongside.
3. Pages outside `BUSINESS_HOURS` in `TIMEZONE`, or on a weekend, count as after-hours. Incidents resolved within `FLAP_SECONDS` count as flapping alerts.
4. The top `TOP_SERVICES` services by count are listed with high-urgency and flapping counts, and one message goes to Slack.

## Sections on the canvas

1. **Start and settings.** Runs every Monday at 08:00, after the week has closed. Time zone, business hours and the flap window live in `config`, because "after hours" only means something in your team's local time.
2. **Read two weeks of incidents.** The raw analytics endpoint returns time to first acknowledgement and time to resolve per incident, so no log entries need fetching. Two weeks come back in one call to give the comparison.
3. **Compute and post.** MTTA only averages acknowledged incidents and reports the unacknowledged ones separately, so silent auto-resolves do not flatter the number. `Post to Slack?` needs a live run and a channel.

## Setup

1. Run it once as imported. It summarises sample incidents and stops at `STOP: dry run - nothing posted`.
2. Add a PagerDuty credential (a read-only API key) to `Fetch incident analytics` and set `USE_PAGERDUTY = true`.
3. Connect Slack and set `SLACK_CHANNEL_ID`. Set `TIMEZONE` and `BUSINESS_HOURS` to your team's working day.
4. Read the numbers on `Compute the weekly numbers`, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_PAGERDUTY` | `false` | set true after adding the PagerDuty credential |
| `TEAM_IDS` | `[]` | PagerDuty team ids to include; empty means every team |
| `TIMEZONE` | `'Europe/London'` | time zone for business hours |
| `BUSINESS_HOURS` | `{"start":9,"end":18}` | local hours counted as working time, Monday to Friday |
| `FLAP_SECONDS` | `300` | incidents resolved faster than this count as flapping |
| `TOP_SERVICES` | `3` | services listed in the noisiest block |
| `SLACK_CHANNEL_ID` | `''` | channel for the weekly summary; blank skips Slack |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Fetch incident analytics`
- `Post the summary to Slack`

## Requirements

- A PagerDuty account with access to the Analytics API
- A Slack workspace

## Customising

- `TEAM_IDS` limits the report to some PagerDuty teams.
- `FLAP_SECONDS` sets how short an incident must be to count as a flapping alert.
- `TOP_SERVICES` sets how many services are listed.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample incidents, dry run) | 9 | none | `STOP: dry run - nothing posted` |
| live with PagerDuty and Slack | 9 | `Post the summary to Slack` | `Post the summary to Slack` |
