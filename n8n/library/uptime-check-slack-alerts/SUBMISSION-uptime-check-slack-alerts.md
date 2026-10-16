# Alert Slack when a website fails two uptime checks in a row

**Who's it for**
Small teams and agencies running 3 to 50 websites who want to hear about an outage before a customer does, without paying for a monitoring service or getting paged by one slow response.

**How it works**
1. Every 5 minutes each URL in `MONITORS` is requested with a `TIMEOUT_MS` limit. A manual run uses sample results until `USE_LIVE_CHECKS` is true.
2. A check fails on a status outside 200-399, a timeout or connection error, or a missing keyword in the page body.
3. A streak of failures is kept per URL. The site is marked down when the streak reaches `FAILS_BEFORE_ALERT` (2 by default), so one blip never alerts.
4. Slack gets one message when a site goes down and one when it comes back, with the reason and how long it was down. Nothing repeats while the state holds.

**How to set up**
1. Run it once as imported. It evaluates sample results and stops at `STOP: dry run - nothing posted`.
2. Put your sites in `MONITORS`, with an optional keyword that only appears on a healthy page, and set `USE_LIVE_CHECKS = true`.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `DRY_RUN = false` and activate the workflow. Streaks are kept in workflow static data, which n8n saves for active workflows only.

**Requirements**
- Public URLs to check
- A Slack workspace

**How to customize**
- `FAILS_BEFORE_ALERT` trades speed for noise: 2 means about 10 minutes to the first alert.
- `TIMEOUT_MS` is the slowest response that still counts as up.
- `MENTION` adds a Slack handle such as `<!here>` to down alerts only.
