# Report Mailchimp campaign results to Slack a day after sending

Picks up every Mailchimp campaign sent 20 to 48 hours ago, compares open, click, unsubscribe and bounce rates with the list average (or your own benchmarks) and posts one scored report per campaign to Slack, once.

Import `mailchimp-campaign-report-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Email marketers and small teams who send a few Mailchimp campaigns a week and forget to look at the numbers once the day is over. The report arrives when the results have settled, with the weak spots flagged.

## How it works

1. Every day at 10:00 it reads Mailchimp reports for campaigns sent in the last 48 hours, or 4 sample reports until Mailchimp is connected.
2. Campaigns younger than 20 hours are left for tomorrow, and a campaign is only reported once.
3. Open and click rates are compared with that list's own averages. A rate more than 20% below average is flagged, as are unsubscribes above 0.5%, bounces above 2% and any spam complaint.
4. One Slack message lists each campaign with its numbers, its verdict and the reasons.

## Sections on the canvas

1. **Start and settings.** Runs every day at 10:00 or by hand. The window, thresholds and fallback benchmarks all sit in `config`.
2. **Read campaign reports.** One call to the Mailchimp reports endpoint returns opens, clicks, bounces and the list averages together, so no per-campaign request is needed. `Load sample reports` keeps the real fraction and percent formats.
3. **Score against the list average.** Each campaign is judged against its own list, because a 25% open rate is poor on a customer list and normal on a cold one. Too-early and already-reported campaigns are listed as waiting, not dropped silently.
4. **Post and remember.** Nothing is posted in preview. Only a live post records the campaign ids, so testing never stops tomorrow's real report from going out.

## Setup

1. Run it once as imported. It scores the sample reports and stops at `STOP: preview - nothing posted`.
2. Add a Mailchimp credential to `Fetch recent campaign reports`, set `MAILCHIMP_DC` to the data centre in your API key (the part after the dash, e.g. us21) and set `USE_MAILCHIMP = true`.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `TEST_EMAIL` to any address to post with a [TEST] prefix. Set `TEST_RUN = false` to post normally and remember what was reported.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_MAILCHIMP` | `false` | set true after adding the Mailchimp credential |
| `MAILCHIMP_DC` | `'us21'` | data centre from your API key, the part after the dash |
| `MIN_HOURS` | `20` | a campaign is reported once it is at least this many hours old |
| `MAX_HOURS` | `48` | campaigns older than this are not picked up |
| `DROP_PCT` | `20` | open or click rate this many percent below the list average is flagged |
| `UNSUB_ALERT_PCT` | `0.5` | unsubscribe rate (percent of delivered) that is flagged |
| `BOUNCE_ALERT_PCT` | `2` | bounce rate (percent of sent) that is flagged |
| `BENCHMARKS` | `{"open_rate":35,"click_rate":2.5}` | percent; used when the list has no averages yet |
| `SLACK_CHANNEL_ID` | `''` | channel for the report; blank skips Slack |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Fetch recent campaign reports`
- `Post the results to Slack`

## Requirements

- A Mailchimp account with sent campaigns
- A Slack workspace

## Customising

- `MIN_HOURS` and `MAX_HOURS` set the reporting window after the send.
- `DROP_PCT` decides how far below the list average a rate must fall to be flagged.
- `BENCHMARKS` are used when Mailchimp has no list averages yet, for example on a new list.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 10 | none | `STOP: preview - nothing posted` |
| live with Mailchimp and Slack | 14 | `Post the results to Slack` | `Remember reported campaigns` |
