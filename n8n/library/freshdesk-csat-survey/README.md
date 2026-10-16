# Send CSAT surveys after Freshdesk tickets close and log scores in Google Sheets

Emails a one-click 1 to 5 satisfaction survey for every Freshdesk ticket resolved in the last day, skipping repeats and internal requesters, records each click through the same workflow's webhook into Google Sheets, and flags 1 and 2 scores to Slack.

Import `freshdesk-csat-survey-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Support teams on Freshdesk plans without built-in surveys, or who want CSAT scores in a sheet they own. One workflow sends the survey and records the answer.

## How it works

1. Every day at 10:00 it lists Freshdesk tickets updated in the last 24 hours and keeps the resolved and closed ones, or 9 sample tickets until Freshdesk is connected.
2. A ticket is skipped if it was resolved under 2 hours ago, already surveyed, tagged `no_survey`, from an internal domain, or if the requester had a survey in the last 30 days.
3. Each survey email has five signed links that point back to this workflow's own webhook.
4. A click records the score against the ticket in the Surveys tab, shows a thank-you message, and posts any 1 or 2 to Slack with a link to the ticket.

## Sections on the canvas

1. **Start and settings.** Three ways in: by hand, the 10:00 schedule, or a customer clicking a score link. All three read the same `config`, so the link signature and sheet id are set once.
2. **Record a clicked score.** `Read the clicked score` recomputes the link signature before anything is saved, and the customer gets a reply either way. The score is written onto the ticket's existing Surveys row; only 1 and 2 go to Slack.
3. **Read resolved tickets.** Freshdesk has no resolved-since filter, so `Fetch recently updated tickets` lists the last day of updates and the status check happens in code. `Load sample tickets` stands in until `USE_FRESHDESK` is true.
4. **Skip anyone already asked.** The Surveys tab is the memory: a ticket in it is never asked twice, and a requester asked inside `COOLDOWN_DAYS` is held. Every skipped ticket carries its reason in `Pick tickets to survey`.
5. **Send and log.** Nothing goes out while `TEST_RUN` is true and `TEST_EMAIL` is blank. A test send reaches you and leaves the log alone, so the real customer still gets asked once you go live.

## Setup

1. Run it once as imported. It previews against sample tickets and stops at `STOP: preview - nothing sent`.
2. Add a Freshdesk credential to `Fetch recently updated tickets`, fill in `FRESHDESK_DOMAIN` and set `USE_FRESHDESK = true`.
3. Create a sheet with a Surveys tab (ticket_id, requester_email, subject, sent_at, score, scored_at, mode) and put its id in `SURVEY_SHEET_ID`.
4. Activate the workflow, copy the production URL of `Score link clicked` into `WEBHOOK_URL` and change `LINK_SALT` to any phrase.
5. Put your address in `TEST_EMAIL` to receive the surveys yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_FRESHDESK` | `false` | set true after adding the Freshdesk credential to the fetch node |
| `FRESHDESK_DOMAIN` | `'yourcompany'` | the part before .freshdesk.com |
| `LOOKBACK_HOURS` | `24` | tickets resolved in this window are considered |
| `MIN_HOURS_AFTER_RESOLVE` | `2` | wait this long after resolution before asking |
| `COOLDOWN_DAYS` | `30` | one survey per requester in this many days |
| `SKIP_DOMAINS` | `["yourcompany.example"]` | requester domains that never get a survey (your own staff) |
| `DAILY_CAP` | `100` | hard ceiling on surveys per run |
| `SURVEY_SHEET_ID` | `''` | Google Sheets id with a Surveys tab; blank uses a sample log and records nothing |
| `WEBHOOK_URL` | `'https://your-n8n.example/webhook/fres...'` | production URL of the Score link clicked node |
| `LINK_SALT` | `'change-this-phrase'` | any phrase; signs survey links so scores cannot be forged by editing the URL |
| `COMPANY_NAME` | `'Acme Support'` | shown in the email and the thank-you message |
| `ALERT_AT_OR_BELOW` | `2` | scores at or below this are posted to Slack |
| `SLACK_CHANNEL_ID` | `''` | channel for low scores; blank skips Slack |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Record the score in Google Sheets`
- `Flag the low score in Slack`
- `Fetch recently updated tickets`
- `Read the survey log`
- `Email the survey`
- `Log the survey as sent`

## Requirements

- A Freshdesk account with API access
- A Gmail account
- A Google Sheet
- Optional: a Slack workspace

## Customising

- `COOLDOWN_DAYS` stops frequent requesters getting a survey after every ticket.
- `MIN_HOURS_AFTER_RESOLVE` waits before asking, in case the customer reopens.
- `ALERT_AT_OR_BELOW` sets which scores reach Slack.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 14 | none | `STOP: preview - nothing sent` |
| live survey run with Freshdesk and the sheet | 18 | `Email the survey`, `Log the survey as sent` | `Log the survey as sent` |
| customer clicks a 2 (live) | 13 | `Record the score in Google Sheets`, `Flag the low score in Slack` | `Flag the low score in Slack` |
| tampered link is rejected | 8 | none | `STOP: link not recognised` |
