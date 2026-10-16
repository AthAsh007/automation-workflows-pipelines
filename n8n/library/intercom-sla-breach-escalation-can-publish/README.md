# Escalate Intercom conversations waiting past SLA to Slack

Every 10 minutes measures how long each open Intercom conversation has waited since the customer last wrote, against a per-tier SLA counted in business hours, and posts each breach to Slack once, with a second, louder post at twice the SLA.

Import `intercom-sla-breach-escalation-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Support managers on Intercom who promise reply times by plan (one hour for enterprise, four business hours for pro) and only find out about a miss when the customer complains.

## How it works

1. Every 10 minutes it searches Intercom for open conversations, or uses 7 sample conversations until Intercom is connected.
2. Each conversation gets a tier from its tags or priority flag, and the time since the customer last wrote is measured on that tier's clock: around the clock for enterprise, weekdays 09:00 to 18:00 for the rest.
3. Past 80% of the SLA it is at risk; past 100% it is breached; past 200% it escalates with a mention.
4. Each breach level posts once. The key is the conversation and the moment the customer started waiting, so a new customer message starts a new clock.

## Sections on the canvas

1. **Start and settings.** Checks every 10 minutes. Tiers, SLA targets, the business-hours clock and the timezone sit in `config`, so a new plan or a changed rota is one edit.
2. **Read open conversations.** One search call returns up to 150 open conversations with `waiting_since`, which already marks when the customer last wrote. `Load sample conversations` gives the same shape until `USE_INTERCOM` is true.
3. **Measure against the SLA.** A Friday 17:55 message on a business clock has used 5 minutes by Monday morning, not 64 hours. `Keep new breaches only` checks static memory so each breach level is announced exactly once.
4. **Post and remember.** Three gates keep a quiet run, a blank channel and a dry run silent. Breaches are remembered only after `Post the escalation to Slack` succeeds, so a failed post is retried next run.

## Setup

1. Run it once as imported. It measures the sample conversations and stops at `STOP: dry run - nothing posted`.
2. Add an Intercom credential to `Search open Intercom conversations` and set `USE_INTERCOM = true`.
3. Set `SLACK_CHANNEL_ID`, and check `TIER_TAGS`, `SLA_BY_TIER` and `BUSINESS_HOURS` match your plans and team.
4. Set `DRY_RUN = false` and activate the workflow. Escalation memory is kept in workflow static data, which n8n only saves on activated runs.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_INTERCOM` | `false` | set true after adding the Intercom credential to the search node |
| `TIER_TAGS` | `{"Enterprise":"enterprise","VIP":"enterp` | Intercom tag name -> tier; untagged conversations are standard |
| `PRIORITY_TIER` | `'enterprise'` | tier for conversations marked priority in Intercom |
| `SLA_BY_TIER` | `{"enterprise":{"minutes":60,"clock":"24x` | reply target per tier and which clock it runs on |
| `BUSINESS_HOURS` | `{"days":[1,2,3,4,5],"start_hour":9,"end_` | business clock: ISO weekdays (1 = Monday) and hours in TIMEZONE |
| `TIMEZONE` | `'Europe/London'` | IANA timezone of the support team |
| `WARN_AT_PCT` | `80` | conversations past this share of their SLA are listed as at risk |
| `ESCALATE_AT_PCT` | `200` | past this share the breach is posted again with a mention |
| `ESCALATION_MENTION` | `'<!here>'` | Slack mention for the second level |
| `INTERCOM_APP_URL` | `'https://app.intercom.com/a/inbox/your...'` | prefix for conversation links in Slack |
| `SLACK_CHANNEL_ID` | `''` | escalation channel; blank posts nothing |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Search open Intercom conversations`
- `Post the escalation to Slack`

## Requirements

- An Intercom workspace with API access
- A Slack workspace

## Customising

- `SLA_BY_TIER` sets minutes and clock (`24x7` or `business`) per tier.
- `WARN_AT_PCT` and `ESCALATE_AT_PCT` set the at-risk and second-level lines.
- `ESCALATION_MENTION` is who gets tagged at the second level, for example `<!here>` or a user group.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 11 | none | `STOP: no Slack channel` |
| live with Intercom and Slack | 14 | `Post the escalation to Slack` | `Remember escalated breaches` |
