# Remind owners in Slack before SaaS renewals in a Google Sheets register

**Who's it for**
Operations and finance leads who keep a sheet of software subscriptions and still get caught by annual auto-renewals. The reminder is keyed to the last day you can cancel, not the renewal date, because that is the date that matters.

**How it works**
1. Every weekday at 09:00 it reads the Register tab, or sample tools until a sheet is connected.
2. Past renewal dates roll forward by the billing cycle, then the cancel-by date is the renewal date minus the notice days.
3. A tool enters the digest when its cancel-by date is 30, 14 or 3 days away. Each stage is posted once per renewal, even if a run is missed.
4. Tools with no owner, and tools whose notice window has already closed, get their own sections. One Slack message tags each owner.

**How to set up**
1. Run it once as imported. It builds a digest from sample tools and stops at `STOP: preview - nothing posted`.
2. Connect Google Sheets, put the spreadsheet id in `REGISTER_SHEET_ID`, and match the column names in `COLUMNS`.
3. Connect Slack and set `SLACK_CHANNEL_ID`. Owners are tagged by the Slack member id in the owner id column.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel. The test digest lands there with no @mentions. Set `TEST_RUN = false` to post to `SLACK_CHANNEL_ID` and tag owners.

**Requirements**
- A Google Sheet listing your subscriptions
- A Slack workspace

**How to customize**
- `STAGES` sets the reminder days before cancel-by (30, 14 and 3 by default).
- `DEFAULT_NOTICE_DAYS` covers rows with an empty notice column.
- `MIN_ANNUAL_COST` keeps cheap tools out of the digest.
