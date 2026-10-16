# Create Todoist tasks from starred Gmail emails

**Who's it for**
Freelancers, founders and managers who star emails as a to-do list and then lose them under newer mail. Starring stays the habit; the task with a due date and a link back to the email appears in Todoist.

**How it works**
1. Every 15 minutes it searches Gmail for `GMAIL_QUERY` (starred in the last 7 days), skips message ids it already turned into tasks, and reads the rest. Sample emails are used until Gmail is connected.
2. The title is the subject without Re:, Fwd:, [EXTERNAL] tags or trailing punctuation. A blank subject uses the first line of the body.
3. Due dates come from phrases in the subject or body, counted from when the email arrived: today, EOD, tomorrow, by a weekday, next week, end of month or an ISO date. A date already passed becomes today.
4. Priority is 4 for `VIP_SENDERS` or urgent words, 3 for `IMPORTANT_DOMAINS`, else 1. The task links back to the email.

**How to set up**
1. Run it once as imported. It turns sample emails into tasks and stops at `STOP: dry run - Todoist untouched`.
2. Add a Gmail OAuth2 credential to `List starred messages` and `Fetch each message`, then set `USE_GMAIL = true`.
3. Add a Todoist credential to `Create the Todoist task` and optionally set `TODOIST_PROJECT_ID`.
4. Check the tasks on `Turn emails into tasks`, then set `DRY_RUN = false` and activate the workflow.

**Requirements**
- A Gmail account
- A Todoist account

**How to customize**
- `VIP_SENDERS`, `IMPORTANT_DOMAINS` and `URGENT_WORDS` decide the priority.
- `GMAIL_QUERY` can narrow the search, for example to one label.
- `DEFAULT_DUE` sets the due date when the email names none: blank, today or tomorrow.
