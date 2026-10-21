# Email a weekly overdue-task report from Asana to each project owner

Every Monday it reads incomplete tasks from a list of Asana projects, buckets overdue ones by days late, compares each project with last week's report (new, cleared and tasks overdue several weeks running), and sends each project owner one email covering all their projects, with unreadable or truncated projects reported instead of skipped.

Import `asana-overdue-status-email-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Operations leads and agency owners running 5 to 40 Asana projects, where overdue tasks pile up quietly because nobody opens the project view. Each owner gets one list on Monday morning and can fix dates or nudge people from it.

## How it works

1. Every Monday at 08:00 it reads each project in `PROJECT_GIDS` (name and owner), then its incomplete tasks. Sample projects are used until Asana is connected. A project that fails to load, or has more tasks than one page holds, is reported, not dropped.
2. Tasks due before today are overdue, except those tagged with `SKIP_TAGS`. Each goes into a bucket from `BUCKETS` (1-7, 8-30 and over 30 days by default), oldest first, and unassigned tasks are flagged.
3. Last week's report is kept in workflow static data. Each project shows its change against last week and how many tasks were cleared, each task is marked new, and tasks in `STUCK_WEEKS` or more reports in a row lead the email.
4. Owners get one email each with every project they own. Projects with no owner, and projects that could not be read, go to `FALLBACK_EMAIL`. Only a live run saves the report for next week.

## Sections on the canvas

1. **Start and settings.** Runs every Monday at 08:00. Projects, buckets, skip tags and the stuck threshold live in `config`. `Load the previous report` reads last week from static data, and `List projects` makes one item per gid so details and tasks stay paired.
2. **Read projects and tasks.** The owner comes from the project, the tasks from a second call that asks only for incomplete ones. Both calls continue on error, so one broken project becomes a line in the fallback email instead of a silent gap. A next_page marks a partial list.
3. **Compare with last week.** Tasks are grouped by owner email, so someone who owns four projects gets one message. Each task carries how many reports in a row it has appeared in, and each project its change and cleared count since last Monday.
4. **Write, send and save.** Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. In test mode every owner email comes to you with the real owner in the subject. The report is saved for next week only after a live send.

## Setup

1. Run it once as imported. It reports on sample projects and stops at `STOP: preview - nothing sent`.
2. Add an Asana credential to `Fetch project details` and `Fetch incomplete tasks`, put your project gids in `PROJECT_GIDS` and set `USE_ASANA = true`.
3. Connect Gmail and set `FALLBACK_EMAIL`.
4. Put your own address in `TEST_EMAIL` to receive every owner email yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_ASANA` | `false` | set true after adding the Asana credential to both Asana nodes |
| `PROJECT_GIDS` | `["1204000000000001","1204000000000002","` | Asana project gids (the number in the project URL) |
| `BUCKETS` | `[{"max":7,"label":"1-7 days late"},{"max` | overdue ranges, checked in order |
| `SKIP_TAGS` | `["on hold","someday"]` | tasks with any of these tags are not reported |
| `MAX_TASKS_PER_PROJECT` | `15` | most tasks listed per project; the rest is counted |
| `STUCK_WEEKS` | `3` | a task overdue in this many weekly reports in a row is listed first as stuck |
| `FALLBACK_EMAIL` | `'ops@northwind.example'` | gets reports for projects without an owner email |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Fetch project details`
- `Fetch incomplete tasks`
- `Email the owner`

## Requirements

- An Asana workspace
- A Gmail account

## Customising

- `BUCKETS` sets the overdue ranges and their labels.
- `SKIP_TAGS` keeps parked work, such as tasks tagged on hold, out of the report.
- `MAX_TASKS_PER_PROJECT` caps each project section; the rest is counted. `STUCK_WEEKS` sets when a task counts as stuck.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample projects, preview) | 12 | none | `STOP: preview - nothing sent` |
| live with Asana | 16 | `Email the owner` | `Save this week as the previous report` |
| week two: trend, stuck task, failed and truncated projects | 16 | `Email the owner` | `Save this week as the previous report` |
