# Create follow-up tasks for stalled HubSpot deals

**Who's it for**
Sales managers whose HubSpot pipeline has deals nobody has touched in weeks. Each rep gets a task on the deals that went quiet, so the follow-up happens in HubSpot where they already work.

**How it works**
1. Every weekday at 07:30 it reads open deals and open follow-up tasks from HubSpot, or sample data until HubSpot is connected.
2. Days idle is counted from the last logged activity. Each stage has its own limit in `STAGE_MAX_IDLE_DAYS` (5 days for Contract sent, 14 for Decision maker bought in), with `DEFAULT_MAX_IDLE_DAYS` for custom stages.
3. A deal over its limit gets one task, due tomorrow, with priority High at twice the limit. A deal that already has an open follow-up task is skipped, so tasks never pile up.
4. Unowned deals go to `FALLBACK_OWNER_ID`. Slack gets one summary grouped by owner.

**How to set up**
1. Run it once as imported. It checks sample deals and stops at `STOP: not live - no tasks created` and `STOP: preview - nothing posted`.
2. Create a HubSpot private app with deals and tasks scopes, add it to the three HubSpot nodes, then set `USE_HUBSPOT = true`.
3. Edit `STAGE_MAX_IDLE_DAYS` with your internal stage ids, and connect Slack with `SLACK_CHANNEL_ID`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel, where the test summary lands. Set `TEST_RUN = false` to create tasks and post to `SLACK_CHANNEL_ID`.

**Requirements**
- A HubSpot account with Sales Hub deals and a private app token
- Optional: a Slack workspace

**How to customize**
- `STAGE_MAX_IDLE_DAYS` holds the limit per stage id.
- `MIN_DEAL_AMOUNT` leaves small deals alone.
- `MAX_TASKS_PER_RUN` caps how many tasks one run can create.
