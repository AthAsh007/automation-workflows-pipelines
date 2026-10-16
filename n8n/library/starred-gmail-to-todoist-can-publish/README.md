# Create Todoist tasks from starred Gmail emails

Every 15 minutes it finds newly starred Gmail messages, cleans the subject into a task title, reads due dates like today, tomorrow, by Friday or next week from the email, sets priority from a sender list and urgent words, and creates one Todoist task per email, never twice.

Import `starred-gmail-to-todoist-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Freelancers, founders and managers who star emails as a to-do list and then lose them under newer mail. Starring stays the habit; the task with a due date and a link back to the email appears in Todoist.

## How it works

1. Every 15 minutes it searches Gmail for `GMAIL_QUERY` (starred in the last 7 days), skips message ids it already turned into tasks, and reads the rest. Sample emails are used until Gmail is connected.
2. The title is the subject without Re:, Fwd:, [EXTERNAL] tags or trailing punctuation. A blank subject uses the first line of the body.
3. Due dates come from phrases in the subject or body, counted from when the email arrived: today, EOD, tomorrow, by a weekday, next week, end of month or an ISO date. A date already passed becomes today.
4. Priority is 4 for `VIP_SENDERS` or urgent words, 3 for `IMPORTANT_DOMAINS`, else 1. The task links back to the email.

## Sections on the canvas

1. **Start and settings.** A 15-minute search rather than the Gmail trigger, because starring usually happens on mail that is already read and the trigger only sees new arrivals. Sender lists and the search live in `config`.
2. **Read starred emails.** `Keep unseen message ids` drops ids that already became tasks before any message is downloaded. `Load sample starred emails` gives the decoded shape, including a reply chain, a VIP, an urgent subject and a blank subject.
3. **Build the tasks.** Dates are counted from when the email arrived, so "tomorrow" in yesterday's email means today. A date that already passed becomes today rather than an overdue task nobody sees.
4. **Create and remember.** Only a live run creates tasks. `Remember added emails` records a message id only when Todoist returned a task id, so a failed create is retried on the next run.

## Setup

1. Run it once as imported. It turns sample emails into tasks and stops at `STOP: dry run - Todoist untouched`.
2. Add a Gmail OAuth2 credential to `List starred messages` and `Fetch each message`, then set `USE_GMAIL = true`.
3. Add a Todoist credential to `Create the Todoist task` and optionally set `TODOIST_PROJECT_ID`.
4. Check the tasks on `Turn emails into tasks`, then set `DRY_RUN = false` and activate the workflow.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_GMAIL` | `false` | set true after adding the Gmail credential to both Gmail nodes |
| `GMAIL_QUERY` | `'is:starred newer_than:7d'` | Gmail search for emails that should become tasks |
| `VIP_SENDERS` | `["ceo@northwind.example","board@northwin` | senders whose emails become priority 4 |
| `IMPORTANT_DOMAINS` | `["bigclient.example"]` | sender domains whose emails become priority 3 |
| `URGENT_WORDS` | `["urgent","asap","action required"]` | words in the subject that make priority 4 |
| `DEFAULT_DUE` | `''` | due date when none is found: '', 'today' or 'tomorrow' |
| `TODOIST_PROJECT_ID` | `''` | Todoist project for the tasks; blank uses the Inbox |
| `TASK_LABELS` | `["email"]` | labels added to every task |
| `MAX_PER_RUN` | `20` | hard ceiling on tasks per run |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `List starred messages`
- `Fetch each message`
- `Create the Todoist task`

## Requirements

- A Gmail account
- A Todoist account

## Customising

- `VIP_SENDERS`, `IMPORTANT_DOMAINS` and `URGENT_WORDS` decide the priority.
- `GMAIL_QUERY` can narrow the search, for example to one label.
- `DEFAULT_DUE` sets the due date when the email names none: blank, today or tomorrow.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample emails, dry run) | 10 | none | `STOP: dry run - Todoist untouched` |
| live with Gmail and Todoist | 14 | `Create the Todoist task` | `Remember added emails` |
