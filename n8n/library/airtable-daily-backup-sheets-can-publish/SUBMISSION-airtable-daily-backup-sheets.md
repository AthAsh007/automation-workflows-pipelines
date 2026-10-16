# Back up Airtable tables to Google Sheets every night

**Who's it for**
Teams that run a CRM, content calendar or inventory in Airtable and have no copy outside it. A bulk delete or a broken automation shows up in the morning as a Slack alert, and the rows are still in the sheet.

**How it works**
1. Every night at 02:00 it reads each table in `TABLES` from Airtable, 100 records per table, or sample tables until Airtable is connected.
2. Fields are flattened for a spreadsheet: attachments become file name and URL, linked records and multi-selects become a ; list, collaborators become their name, checkboxes become TRUE or FALSE.
3. Row counts are compared with last night's line on the Backup log tab. A drop of more than `DROP_ALERT_PCT` percent (and at least `MIN_DROP_ROWS` rows) is flagged, and so is a table with more than 100 records, because the rest was not copied.
4. Rows are upserted by Airtable record id into a tab named `Backup <table>`, so a deleted record stays in the sheet. Tonight's counts are appended to the Backup log.

**How to set up**
1. Run it once as imported. It flattens sample tables and stops at `STOP: dry run - sheet untouched`.
2. Add an Airtable personal access token credential to `Fetch records from Airtable`, set `AIRTABLE_BASE_ID` and `TABLES`, then set `USE_AIRTABLE = true`.
3. Create a sheet with a Backup log tab and one `Backup <table>` tab per table, each with a Record ID column. Connect Google Sheets and set `BACKUP_SHEET_ID`.
4. Optionally set `SLACK_CHANNEL_ID`, then set `DRY_RUN = false`.

**Requirements**
- An Airtable base and a personal access token
- A Google Sheet for the copies
- Optional: a Slack workspace

**How to customize**
- `TABLES` lists table names or ids to copy.
- `DROP_ALERT_PCT` and `MIN_DROP_ROWS` decide when a smaller table is worth an alert.
- `MAX_CELL_CHARS` trims long text so a cell stays under the Google Sheets limit.
