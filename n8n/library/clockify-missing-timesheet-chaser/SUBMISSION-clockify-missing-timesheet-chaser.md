# Chase missing Clockify hours in Slack every Friday

**Who's it for**
Agencies and consultancies of 5 to 80 people who bill from Clockify and lose hours every week to timesheets nobody filled in. Managers get a short list on Friday afternoon while the week is still fresh.

**How it works**
1. Every Friday at 14:00 it pulls this week's Clockify summary report grouped by user, plus the workspace users, or sample data until Clockify is connected.
2. Expected hours come from `TEAM`: weekly hours spread over each person's working days, minus any `PUBLIC_HOLIDAYS` that fall on one of those days.
3. Anyone short by more than `SHORTFALL_HOURS` and `SHORTFALL_PCT` is listed. People missing from Clockify count as zero hours; Clockify users not in `TEAM` are ignored and reported.
4. Each manager gets one Slack DM listing their people with logged, expected and missing hours, or the lists go to one channel.

**How to set up**
1. Run it once as imported. It checks sample hours and stops at `STOP: dry run - nothing posted`.
2. Add a Clockify credential to `Fetch summary report` and `Fetch workspace users`, set `CLOCKIFY_WORKSPACE_ID` and `USE_CLOCKIFY = true`.
3. Fill `TEAM` with each person's email, weekly hours, working days, Slack id and manager's Slack id. Connect Slack.
4. Check the lists in `Group by manager`, then set `DRY_RUN = false`.

**Requirements**
- A Clockify workspace (any plan with the reports API)
- A Slack workspace with a bot that can DM

**How to customize**
- `SHORTFALL_HOURS` and `SHORTFALL_PCT` decide how short counts as missing; both must be exceeded.
- Set `CHANNEL_ID` to post every manager's list in one channel instead of DMs.
- `PUBLIC_HOLIDAYS` lowers expected hours for anyone who works that day.
