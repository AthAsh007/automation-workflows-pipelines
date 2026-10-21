# Schedule missing next activities for open Pipedrive deals with Slack escalation

For sales and partnership teams who want one rule enforced in Pipedrive: no open deal without a next activity.

**How it works**
1. Every weekday it reads all open deals and activities, page by page. A failed or cut-short read raises an alert and fails the run instead of passing as a clean day.
2. Fields named like patient or medical data are blocked before anything is read.
3. A deal counts as covered only by an open activity due within `HORIZON_DAYS`.
4. Uncovered deals get the activity their stage calls for, due in business days and moved to a lighter day when the rep is already full.
5. Overdue deals never get a second task: 3 business days late goes to the rep, 7 to the manager, who hears about each deal once plus a reminder if it stays open.
6. A team summary with the coverage trend, a manager escalation and one Slack DM per rep are sent.

**Setup**
1. Run it as imported: a demo pipeline runs end to end and nothing is written.
2. In `config` set `COMPANY_DOMAIN`, `API_TOKEN` and the stage map.
3. Add Slack webhook URLs; for rep DMs add a Slack credential, `SLACK_DMS` and `OWNER_SLACK_IDS`.
4. Set `TEST_OWNER_ID` to test on one user, then `TEST_RUN = false` to go live.

**Requirements**
A Pipedrive API token. Slack is optional; a blank setting skips that branch.

**How to customize**
Stage rules, escalation tiers, `HOLIDAYS`, `MAX_PER_OWNER_PER_DAY` and `DAILY_CAP` are all in `config`.
