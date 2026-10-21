# Email a weekly overdue-task report from Asana to each project owner

**Who's it for**
Operations leads and agency owners running 5 to 40 Asana projects, where overdue tasks pile up quietly because nobody opens the project view. Each owner gets one list on Monday morning and can fix dates or nudge people from it.

**How it works**
1. Every Monday at 08:00 it reads each project in `PROJECT_GIDS` (name and owner), then its incomplete tasks. Sample projects are used until Asana is connected. A project that fails to load, or has more tasks than one page holds, is reported, not dropped.
2. Tasks due before today are overdue, except those tagged with `SKIP_TAGS`. Each goes into a bucket from `BUCKETS` (1-7, 8-30 and over 30 days by default), oldest first, and unassigned tasks are flagged.
3. Last week's report is kept in workflow static data. Each project shows its change against last week and how many tasks were cleared, each task is marked new, and tasks in `STUCK_WEEKS` or more reports in a row lead the email.
4. Owners get one email each with every project they own. Projects with no owner, and projects that could not be read, go to `FALLBACK_EMAIL`. Only a live run saves the report for next week.

**How to set up**
1. Run it once as imported. It reports on sample projects and stops at `STOP: preview - nothing sent`.
2. Add an Asana credential to `Fetch project details` and `Fetch incomplete tasks`, put your project gids in `PROJECT_GIDS` and set `USE_ASANA = true`.
3. Connect Gmail and set `FALLBACK_EMAIL`.
4. Put your own address in `TEST_EMAIL` to receive every owner email yourself, then set `TEST_RUN = false`.

**Requirements**
- An Asana workspace
- A Gmail account

**How to customize**
- `BUCKETS` sets the overdue ranges and their labels.
- `SKIP_TAGS` keeps parked work, such as tasks tagged on hold, out of the report.
- `MAX_TASKS_PER_PROJECT` caps each project section; the rest is counted. `STUCK_WEEKS` sets when a task counts as stuck.
