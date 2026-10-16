# Turn meeting transcripts into Notion action items with OpenAI

Takes a meeting transcript by webhook, pulls out action items with OpenAI or a rule-based fallback, matches each owner to the attendee list, resolves phrases like "by Friday" into dates and creates one Notion database page per action.

Import `meeting-transcript-action-items-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Team leads and consultants who record calls with a notetaker tool and then retype the follow-ups into Notion. Post the transcript to the webhook and the action items appear in your tasks database with an owner and a date.

## How it works

1. A transcript arrives on the webhook with the meeting title, date and attendee list. A manual run uses a built-in sample meeting.
2. Action items are extracted by OpenAI when `USE_OPENAI` is true. Otherwise rules pick up lines like "Action: ...", "I'll send ... by Friday" and "Dana will book ...".
3. Each owner is matched to an attendee by full or first name. Names that match nobody, or two people, are kept as unassigned with the reason.
4. Due phrases (tomorrow, Friday, end of week, next week, in 3 days, a YYYY-MM-DD date) become real dates counted from the meeting date. Repeated actions are merged.
5. The webhook gets the list back at once, then one Notion page per action is created on a live run.

## Sections on the canvas

1. **Start and settings.** A notetaker posts to `Receive meeting transcript`; `Run manually` replays the sample meeting. The Notion database, default due days and the cap all live in `config`.
2. **Load the transcript.** `Read the incoming transcript` checks that a non-empty transcript arrived before any extraction runs. Without one, `Load sample transcript` supplies a meeting that exercises every extraction rule.
3. **Extract action items.** OpenAI is optional. With `USE_OPENAI` false, `Extract action items by rule` reads Action lines, "I'll" from the speaker and "Name will", so the template works with no model and no cost.
4. **Owners, dates and reply.** Owners must be attendees; a name that matches nobody or two people stays unassigned with the reason, never guessed. The caller gets the list from `Reply with the action items` before any page is written.
5. **Create Notion pages.** `Write to Notion?` needs a live run and a database id, so a test transcript never lands in the shared tasks database. Each action becomes its own page with owner, due date and meeting.

## Setup

1. Run it once as imported. It extracts actions from the sample meeting and stops at `STOP: dry run - Notion untouched`.
2. Create a Notion database with Name, Owner, Due, Status and Meeting properties, share it with your integration, and put its id in `NOTION_DATABASE_ID`.
3. Optionally add an OpenAI credential to `Extract action items with OpenAI` and set `USE_OPENAI = true`.
4. Point your notetaker at the webhook URL, check a few runs, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_OPENAI` | `false` | set true after adding an OpenAI credential to the agent model |
| `NOTION_DATABASE_ID` | `''` | id of the Notion database that receives one page per action |
| `DEFAULT_DUE_DAYS` | `7` | days after the meeting for actions with no due phrase |
| `MAX_ACTIONS` | `15` | pages created per transcript at most |
| `IGNORED_SUBJECTS` | `["We","They","It","This","That","Someone` | capitalised words that are never treated as an owner name |
| `STATUS_VALUE` | `'To do'` | value set on the Status select of each new page |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Extract action items with OpenAI`
- `Extract action items with OpenAI model`
- `Create the Notion action item`

## Requirements

- A Notion workspace and an internal integration
- Optional: an OpenAI API key

## Customising

- `DEFAULT_DUE_DAYS` sets the date for actions where nobody named one.
- `MAX_ACTIONS` caps pages per meeting so a rambling transcript cannot flood the database.
- `IGNORED_SUBJECTS` lists words like "We" that look like names but are not owners.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run, sample meeting) | 13 | none | `STOP: dry run - Notion untouched` |
| live webhook with OpenAI and Notion | 13 | `Create the Notion action item` | `Create the Notion action item` |
