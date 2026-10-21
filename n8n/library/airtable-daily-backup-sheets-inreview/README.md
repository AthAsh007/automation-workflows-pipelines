# Back up Airtable tables to Google Sheets every night

Each night reads every listed Airtable table, flattens attachments, linked records, collaborators and multi-selects into plain text, upserts one row per record into a Google Sheets tab per table, logs row counts and alerts Slack when a table shrinks sharply or hits the page limit.

Import `airtable-daily-backup-sheets-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Teams that run a CRM, content calendar or inventory in Airtable and have no copy outside it. A bulk delete or a broken automation shows up in the morning as a Slack alert, and the rows are still in the sheet.

## How it works

1. Every night at 02:00 it reads each table in `TABLES` from Airtable, 100 records per table, or sample tables until Airtable is connected.
2. Fields are flattened for a spreadsheet: attachments become file name and URL, linked records and multi-selects become a ; list, collaborators become their name, checkboxes become TRUE or FALSE.
3. Row counts are compared with last night's line on the Backup log tab. A drop of more than `DROP_ALERT_PCT` percent (and at least `MIN_DROP_ROWS` rows) is flagged, and so is a table with more than 100 records, because the rest was not copied.
4. Rows are upserted by Airtable record id into a tab named `Backup <table>`, so a deleted record stays in the sheet. Tonight's counts are appended to the Backup log.

## Sections on the canvas

1. **Start and settings.** Runs every night at 02:00, when nobody is editing. Base id, the table list and the alert thresholds all live in `config`.
2. **Read and flatten Airtable.** One request per table with pageSize 100 and no paging loop; a returned offset is reported instead of followed. `Flatten records into rows` turns every Airtable cell type into text a sheet can hold.
3. **Read last night's counts.** Counts live on a Backup log tab rather than in workflow memory, so they survive a re-import and anyone can read the history. `Load sample backup log` makes the Projects drop visible in a preview.
4. **Compare, alert and write.** The comparison runs before anything is written, so tonight's log line can never be compared with itself. Copies are upserted by record id, so a record deleted in Airtable keeps its last row in the sheet.

## Setup

1. Run it once as imported. It flattens sample tables and stops at `STOP: dry run - sheet untouched`.
2. Add an Airtable personal access token credential to `Fetch records from Airtable`, set `AIRTABLE_BASE_ID` and `TABLES`, then set `USE_AIRTABLE = true`.
3. Create a sheet with a Backup log tab and one `Backup <table>` tab per table, each with a Record ID column. Connect Google Sheets and set `BACKUP_SHEET_ID`.
4. Optionally set `SLACK_CHANNEL_ID`, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_AIRTABLE` | `false` | set true after adding the Airtable credential |
| `AIRTABLE_BASE_ID` | `''` | base id, starts with app, from the base URL |
| `TABLES` | `["Clients","Projects","Invoices"]` | table names or ids to back up |
| `BACKUP_SHEET_ID` | `''` | Google Sheets id with a Backup log tab and Backup <table> tabs |
| `DROP_ALERT_PCT` | `20` | alert when a table has this percent fewer rows than last night |
| `MIN_DROP_ROWS` | `3` | and at least this many rows fewer |
| `MAX_CELL_CHARS` | `45000` | longer text is cut to fit in one Sheets cell |
| `SLACK_CHANNEL_ID` | `''` | channel for drop and truncation alerts; blank skips Slack |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Fetch records from Airtable`
- `Read the Backup log tab`
- `Upsert rows into the table tab`
- `Append to the Backup log`
- `Post the alert to Slack`

## Requirements

- An Airtable base and a personal access token
- A Google Sheet for the copies
- Optional: a Slack workspace

## Customising

- `TABLES` lists table names or ids to copy.
- `DROP_ALERT_PCT` and `MIN_DROP_ROWS` decide when a smaller table is worth an alert.
- `MAX_CELL_CHARS` trims long text so a cell stays under the Google Sheets limit.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 17 | none | `STOP: dry run - sheet untouched`, `STOP: no alert posted` |
| live backup with Slack alert | 19 | `Upsert rows into the table tab`, `Post the alert to Slack`, `Append to the Backup log` | `Post the alert to Slack`, `Append to the Backup log` |
