# Create next activities for uncovered open deals in Pipedrive

**Who's it for**
Sales and partnership teams running a referral or business-development pipeline in Pipedrive who
need one rule enforced without exception: **no open deal should exist without a next activity.**

**How it works**
Pipedrive's own automations fire on an event — a stage change, a deal created. They cannot answer
*"which deals have nothing scheduled right now"*, because that is a question about absence, and
nothing happens when nothing happens. This runs every weekday morning, asks that question of every
open deal, and schedules the activity the deal's stage calls for. A deal counts as covered only when
it has an activity that is not done **and** due inside the horizon, so a task parked eleven months
out reads as uncovered rather than as compliance. Deals whose next activity is already overdue are
escalated to a manager instead of having a second task piled on top. A daily cap keeps a bad morning
from flooding a rep's task list.

**How to set up**
1. Open **`config`** and set `COMPANY_DOMAIN`, `HORIZON_DAYS`, `DAILY_CAP` and the stage-to-activity map.
2. Add your Pipedrive `API_TOKEN` when you are ready to read a real account.
3. Leave `TEST_RUN = true` and `TEST_OWNER_ID` blank for the first run — it writes nothing.

**Requirements**
A Pipedrive account with API access. The alert and escalation webhooks (Slack or Discord) are
optional; blank means that branch is skipped, not that the run fails.

**How to customize**
The stage-to-activity map and the horizon live in `config`. To change what gets scheduled, edit
**`decide the next activity`** — everything downstream is unchanged.
