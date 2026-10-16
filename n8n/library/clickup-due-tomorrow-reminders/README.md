# Remind ClickUp assignees in Slack about tasks due tomorrow

Every weekday afternoon finds open ClickUp tasks due tomorrow in your timezone (Saturday to Monday on Fridays), groups them per assignee and sends each person one Slack DM, with unassigned tasks going to a team channel.

Import `clickup-due-tomorrow-reminders-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Team leads and agency project managers whose ClickUp due dates slip because nobody looks at them until the morning they are due. Each person gets one short Slack message the afternoon before.

## How it works

1. Every weekday at 16:00 it works out tomorrow in your `TIMEZONE`. On Fridays the window runs from Saturday to the end of Monday, so weekend and Monday work shows up before people log off.
2. It reads open tasks due in that window from ClickUp, or 7 sample tasks until ClickUp is connected.
3. Tasks in a done status are dropped. The rest are grouped per assignee, sorted by priority and capped at `MAX_TASKS_PER_DM`.
4. Each ClickUp user is looked up in `USER_MAP` and sent one Slack DM. Unassigned tasks go to `UNASSIGNED_CHANNEL`. Anyone missing from the map is listed in the run summary.

## Sections on the canvas

1. **Start and settings.** Runs every weekday at 16:00 or by hand, late enough that today is mostly done and early enough to replan. The timezone, user map and done statuses all live in `config`.
2. **Read tasks due in the window.** `Work out the due window` turns tomorrow in `TIMEZONE` into the epoch range ClickUp filters on, and widens it on Fridays. `Load sample ClickUp tasks` uses that same window, so the sample always has work.
3. **Group per person and report.** One message per person instead of one per task keeps the DMs readable. Done statuses, tasks outside the window and people missing from `USER_MAP` are held with a reason, and `Summarise the run` lists them.
4. **Send in Slack.** Nothing is posted while `TEST_RUN` is true and `TEST_EMAIL` is blank. In test mode every DM is redirected to `TEST_SLACK_CHANNEL`, so the wording can be checked without pinging the team.

## Setup

1. Run it once as imported. It previews against sample tasks and stops at `STOP: preview - nothing sent`.
2. Add a ClickUp credential to `Fetch tasks due from ClickUp`, fill in `CLICKUP_TEAM_ID` and set `USE_CLICKUP = true`.
3. Connect Slack and map each ClickUp user id to a Slack member id in `USER_MAP`.
4. For a test, set `TEST_EMAIL` to any address and `TEST_SLACK_CHANNEL` to a private channel: every DM lands there. Set `TEST_RUN = false` to message real people.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_CLICKUP` | `false` | set true after adding the ClickUp credential to the ClickUp node |
| `CLICKUP_TEAM_ID` | `''` | workspace (team) id, the number after app.clickup.com/ in your browser |
| `TIMEZONE` | `'America/New_York'` | IANA timezone that decides where tomorrow starts and ends |
| `FRIDAY_ROLLUP` | `true` | on Fridays remind about Saturday, Sunday and Monday in one message |
| `DONE_STATUSES` | `["complete","closed","done","shipped"]` | status names (lower case) that never get a reminder |
| `USER_MAP` | `{"81001":"U01AAAA0001","81002":"U01AAAA0` | ClickUp user id -> Slack member id |
| `UNASSIGNED_CHANNEL` | `''` | Slack channel for tasks with no assignee; blank lists them in the summary only |
| `MAX_TASKS_PER_DM` | `12` | longer lists are cut with a count of the rest |
| `TEST_SLACK_CHANNEL` | `''` | test mode posts every reminder here instead of DMing the assignee |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Fetch tasks due from ClickUp`
- `Send the reminder in Slack`

## Requirements

- A ClickUp workspace
- A Slack workspace with a bot that can send DMs

## Customising

- `TIMEZONE` decides where tomorrow starts and ends.
- Set `FRIDAY_ROLLUP = false` to send only Saturday tasks on Fridays.
- `DONE_STATUSES` lists the status names that count as finished on your boards.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 11 | none | `Summarise the run`, `STOP: preview - nothing sent` |
| test mode into a test channel | 11 | `Send the reminder in Slack` | `Summarise the run`, `Send the reminder in Slack` |
| live with ClickUp | 11 | `Send the reminder in Slack` | `Summarise the run`, `Send the reminder in Slack` |
