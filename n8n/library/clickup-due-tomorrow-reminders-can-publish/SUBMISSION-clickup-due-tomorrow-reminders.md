# Remind ClickUp assignees in Slack about tasks due tomorrow

**Who's it for**
Team leads and agency project managers whose ClickUp due dates slip because nobody looks at them until the morning they are due. Each person gets one short Slack message the afternoon before.

**How it works**
1. Every weekday at 16:00 it works out tomorrow in your `TIMEZONE`. On Fridays the window runs from Saturday to the end of Monday, so weekend and Monday work shows up before people log off.
2. It reads open tasks due in that window from ClickUp, or 7 sample tasks until ClickUp is connected.
3. Tasks in a done status are dropped. The rest are grouped per assignee, sorted by priority and capped at `MAX_TASKS_PER_DM`.
4. Each ClickUp user is looked up in `USER_MAP` and sent one Slack DM. Unassigned tasks go to `UNASSIGNED_CHANNEL`. Anyone missing from the map is listed in the run summary.

**How to set up**
1. Run it once as imported. It previews against sample tasks and stops at `STOP: preview - nothing sent`.
2. Add a ClickUp credential to `Fetch tasks due from ClickUp`, fill in `CLICKUP_TEAM_ID` and set `USE_CLICKUP = true`.
3. Connect Slack and map each ClickUp user id to a Slack member id in `USER_MAP`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel: every DM lands there. Set `TEST_RUN = false` to message real people.

**Requirements**
- A ClickUp workspace
- A Slack workspace with a bot that can send DMs

**How to customize**
- `TIMEZONE` decides where tomorrow starts and ends.
- Set `FRIDAY_ROLLUP = false` to send only Saturday tasks on Fridays.
- `DONE_STATUSES` lists the status names that count as finished on your boards.
