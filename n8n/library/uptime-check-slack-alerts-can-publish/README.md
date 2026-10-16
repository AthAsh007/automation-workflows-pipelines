# Alert Slack when a website fails two uptime checks in a row

Checks a list of URLs every 5 minutes for status code, response time and an expected keyword, keeps a failure streak per URL, and posts to Slack once when a site goes down and once when it recovers.

Import `uptime-check-slack-alerts-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Small teams and agencies running 3 to 50 websites who want to hear about an outage before a customer does, without paying for a monitoring service or getting paged by one slow response.

## How it works

1. Every 5 minutes each URL in `MONITORS` is requested with a `TIMEOUT_MS` limit. A manual run uses sample results until `USE_LIVE_CHECKS` is true.
2. A check fails on a status outside 200-399, a timeout or connection error, or a missing keyword in the page body.
3. A streak of failures is kept per URL. The site is marked down when the streak reaches `FAILS_BEFORE_ALERT` (2 by default), so one blip never alerts.
4. Slack gets one message when a site goes down and one when it comes back, with the reason and how long it was down. Nothing repeats while the state holds.

## Sections on the canvas

1. **Start and settings.** Runs every 5 minutes. The URL list, keyword per URL, timeout and alert threshold all live in `config`, and `List monitors` turns the list into one item per URL.
2. **Check every URL.** `Check each URL` is set to return errors and 5xx responses as data, so one dead site cannot stop the others being checked. `Load sample check results` stands in until `USE_LIVE_CHECKS` is true.
3. **Keep streaks, alert on change.** Only a change of state produces an alert: the failure that completes the streak, or the first success after a down alert. An ongoing outage stays quiet instead of posting every 5 minutes.
4. **Post to Slack.** One message per run holds every down and recovery, with the reason and duration. `Post the alert?` needs a live run and a channel, so the shipped workflow never posts.

## Setup

1. Run it once as imported. It evaluates sample results and stops at `STOP: dry run - nothing posted`.
2. Put your sites in `MONITORS`, with an optional keyword that only appears on a healthy page, and set `USE_LIVE_CHECKS = true`.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `DRY_RUN = false` and activate the workflow. Streaks are kept in workflow static data, which n8n saves for active workflows only.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_LIVE_CHECKS` | `false` | true requests every URL below for real |
| `MONITORS` | `[{"name":"Marketing site","url":"https:/` | what to check; keyword blank skips the body check |
| `TIMEOUT_MS` | `8000` | a response slower than this counts as a failure |
| `FAILS_BEFORE_ALERT` | `2` | consecutive failures before a site is called down |
| `SLACK_CHANNEL_ID` | `''` | channel for down and recovery alerts; blank skips Slack |
| `MENTION` | `'<!here>'` | added to down alerts; blank for none |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Post the alert to Slack`

## Requirements

- Public URLs to check
- A Slack workspace

## Customising

- `FAILS_BEFORE_ALERT` trades speed for noise: 2 means about 10 minutes to the first alert.
- `TIMEOUT_MS` is the slowest response that still counts as up.
- `MENTION` adds a Slack handle such as `<!here>` to down alerts only.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample results, dry run) | 11 | none | `STOP: dry run - nothing posted` |
| live checks with a threshold of 1 | 12 | `Post the alert to Slack` | `Post the alert to Slack` |
