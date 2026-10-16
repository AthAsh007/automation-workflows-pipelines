# Triage new Zendesk tickets by urgency with OpenAI and alert Slack

Scores every new Zendesk ticket with outage, urgency, billing and VIP rules (plus an optional OpenAI read), raises its priority and tags it, and pages a Slack channel for tickets that just became urgent.

Import `zendesk-urgent-ticket-triage-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Support leads on Zendesk whose queue is sorted by arrival time, so an outage report from a key account can sit behind twenty password resets. It checks the new queue every 15 minutes.

## How it works

1. Every 15 minutes it searches Zendesk for new tickets from the last 30 minutes that are not yet tagged `auto_triaged`, or uses 6 sample tickets until Zendesk is connected.
2. Each ticket gets points for outage words (40), urgency words (25), billing words (20), a VIP organisation or domain (30) and a requester with several new tickets (10).
3. With `USE_OPENAI` on, a model also rates each ticket and the higher of the two levels wins. A ticket is never lowered below the priority it already has.
4. A live run sets priority and tags on the ticket with an internal note listing the reasons, and pages Slack for tickets that just became urgent.

## Sections on the canvas

1. **Start and settings.** Runs every 15 minutes or by hand. Word lists, points, thresholds and VIP accounts all live in `config`, so tuning the triage never means editing a Code node.
2. **Read the new queue.** The search excludes tickets already tagged `auto_triaged`, so the overlapping 30 minute window never handles a ticket twice. `Load sample tickets` feeds the same shape until `USE_ZENDESK` is true.
3. **Score by rules, then the model.** Rules run on every ticket first and the model is optional. `Blend model and rule levels` takes the higher of the two, so turning OpenAI on can only add catches, never drop an outage the rules found.
4. **Raise priority and page on-call.** The current priority is a floor, so an agent who set urgent by hand is never overruled and that ticket does not page. Priority is only sent when it rises, tags are added, not replaced, and nothing is written or posted until `DRY_RUN` is false.

## Setup

1. Run it once as imported. It scores the sample tickets and stops at `STOP: dry run - tickets untouched`.
2. Add a Zendesk credential to `Search new Zendesk tickets` and `Set priority and tags in Zendesk`, fill in `ZENDESK_SUBDOMAIN` and set `USE_ZENDESK = true`.
3. Put your key accounts in `VIP_ORGS` and `VIP_DOMAINS`, and a channel id in `SLACK_CHANNEL_ID`.
4. Optionally add an OpenAI credential and set `USE_OPENAI = true`. Set `DRY_RUN = false` once the levels look right.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_ZENDESK` | `false` | set true after adding the Zendesk credential to both Zendesk nodes |
| `ZENDESK_SUBDOMAIN` | `'yourcompany'` | the part before .zendesk.com |
| `LOOKBACK_MINUTES` | `30` | new tickets created in this window are read; overlap with the 15 minute schedule is intended |
| `USE_OPENAI` | `false` | set true after adding an OpenAI credential to the model under Rate urgency with OpenAI |
| `VIP_ORGS` | `["Brightlane Logistics","Northwind Healt` | Zendesk organisation names that count as key accounts |
| `VIP_DOMAINS` | `["brightlane.example","northwind-health.` | requester email domains that count as key accounts |
| `OUTAGE_WORDS` | `["down","outage","cannot log in","unable` | phrases that suggest something is broken |
| `URGENT_WORDS` | `["urgent","asap","immediately","emergenc` | phrases that ask for speed |
| `MONEY_WORDS` | `["charged twice","refund","double charge` | billing problems |
| `POINTS` | `{"outage":40,"urgent":25,"money":20,"vip` | points per rule that fires |
| `LEVEL_THRESHOLDS` | `{"urgent":60,"high":35,"normal":15}` | minimum points for each level; below normal is low |
| `PAGE_LEVELS` | `["urgent"]` | levels that page Slack when this run raised a ticket to them |
| `SLACK_CHANNEL_ID` | `''` | on-call channel; blank pages nobody |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Search new Zendesk tickets`
- `Rate urgency with OpenAI`
- `Rate urgency with OpenAI model`
- `Set priority and tags in Zendesk`
- `Page the on-call channel`

## Requirements

- A Zendesk Support account with API access
- A Slack workspace
- Optional: an OpenAI API key

## Customising

- `OUTAGE_WORDS`, `URGENT_WORDS` and `MONEY_WORDS` hold the phrases; `POINTS` sets what each is worth.
- `LEVEL_THRESHOLDS` decides how many points make a ticket urgent, high or normal.
- `PAGE_LEVELS` lists the levels that page Slack.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 18 | none | `STOP: dry run - tickets untouched`, `STOP: no Slack channel` |
| live with Zendesk, OpenAI and Slack | 20 | `Set priority and tags in Zendesk`, `Page the on-call channel` | `Set priority and tags in Zendesk`, `Page the on-call channel` |
