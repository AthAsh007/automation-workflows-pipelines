# Summarise PagerDuty incidents weekly to Slack

**Who's it for**
Engineering managers and on-call leads at teams of 5 to 60 who review on-call load once a week and currently copy numbers out of PagerDuty by hand. The Monday message shows whether last week was worse, and which service caused it.

**How it works**
1. Every Monday at 08:00 it reads raw incident analytics for the last two calendar weeks from PagerDuty, or sample incidents until PagerDuty is connected.
2. Last week (Monday to Sunday, UTC) is compared with the week before. MTTA averages time to first acknowledgement over acknowledged incidents; MTTR averages time to resolve, with the median alongside.
3. Pages outside `BUSINESS_HOURS` in `TIMEZONE`, or on a weekend, count as after-hours. Incidents resolved within `FLAP_SECONDS` count as flapping alerts.
4. The top `TOP_SERVICES` services by count are listed with high-urgency and flapping counts, and one message goes to Slack.

**How to set up**
1. Run it once as imported. It summarises sample incidents and stops at `STOP: dry run - nothing posted`.
2. Add a PagerDuty credential (a read-only API key) to `Fetch incident analytics` and set `USE_PAGERDUTY = true`.
3. Connect Slack and set `SLACK_CHANNEL_ID`. Set `TIMEZONE` and `BUSINESS_HOURS` to your team's working day.
4. Read the numbers on `Compute the weekly numbers`, then set `DRY_RUN = false`.

**Requirements**
- A PagerDuty account with access to the Analytics API
- A Slack workspace

**How to customize**
- `TEAM_IDS` limits the report to some PagerDuty teams.
- `FLAP_SECONDS` sets how short an incident must be to count as a flapping alert.
- `TOP_SERVICES` sets how many services are listed.
