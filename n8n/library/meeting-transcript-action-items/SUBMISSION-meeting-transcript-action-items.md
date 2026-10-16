# Turn meeting transcripts into Notion action items with OpenAI

**Who's it for**
Team leads and consultants who record calls with a notetaker tool and then retype the follow-ups into Notion. Post the transcript to the webhook and the action items appear in your tasks database with an owner and a date.

**How it works**
1. A transcript arrives on the webhook with the meeting title, date and attendee list. A manual run uses a built-in sample meeting.
2. Action items are extracted by OpenAI when `USE_OPENAI` is true. Otherwise rules pick up lines like "Action: ...", "I'll send ... by Friday" and "Dana will book ...".
3. Each owner is matched to an attendee by full or first name. Names that match nobody, or two people, are kept as unassigned with the reason.
4. Due phrases (tomorrow, Friday, end of week, next week, in 3 days, a YYYY-MM-DD date) become real dates counted from the meeting date. Repeated actions are merged.
5. The webhook gets the list back at once, then one Notion page per action is created on a live run.

**How to set up**
1. Run it once as imported. It extracts actions from the sample meeting and stops at `STOP: dry run - Notion untouched`.
2. Create a Notion database with Name, Owner, Due, Status and Meeting properties, share it with your integration, and put its id in `NOTION_DATABASE_ID`.
3. Optionally add an OpenAI credential to `Extract action items with OpenAI` and set `USE_OPENAI = true`.
4. Point your notetaker at the webhook URL, check a few runs, then set `DRY_RUN = false`.

**Requirements**
- A Notion workspace and an internal integration
- Optional: an OpenAI API key

**How to customize**
- `DEFAULT_DUE_DAYS` sets the date for actions where nobody named one.
- `MAX_ACTIONS` caps pages per meeting so a rambling transcript cannot flood the database.
- `IGNORED_SUBJECTS` lists words like "We" that look like names but are not owners.
