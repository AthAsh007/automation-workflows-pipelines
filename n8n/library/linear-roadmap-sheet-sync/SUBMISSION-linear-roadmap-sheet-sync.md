# Sync Linear issues to a Google Sheets roadmap

**Who's it for**
Product and engineering leads who share a roadmap with sales or leadership in Google Sheets while the real work lives in Linear. It keeps the sheet current without anyone copying issues across on Friday afternoon.

**How it works**
1. Every weekday at 06:30 it queries Linear for one team, filtered to the labels in `ROADMAP_LABELS`, or loads 6 sample issues until Linear is connected.
2. Each issue becomes one roadmap row: state, priority label, estimate, cycle number with its dates, assignee, project and due date.
3. The rows already on the Roadmap tab are compared by issue id. New issues are added, rows with a changed field are updated, unchanged rows are left alone.
4. Rows whose issue was cancelled or no longer matches the filter are marked removed with a date instead of being deleted, so nobody loses a line they were tracking.

**How to set up**
1. Run it once as imported. It plans changes against sample issues and stops at `STOP: dry run - roadmap untouched`.
2. Add a Linear credential to `Query Linear issues`, set `LINEAR_TEAM` and set `USE_LINEAR = true`.
3. Create a Roadmap tab with an `Issue ID` column, connect Google Sheets and paste the spreadsheet id into `ROADMAP_SHEET_ID`.
4. Check the plan in `Plan roadmap changes`, then set `DRY_RUN = false` to write the tab.

**Requirements**
- A Linear workspace and API access
- A Google Sheet with a Roadmap tab

**How to customize**
- `ROADMAP_LABELS` picks which issues belong on the roadmap. An empty list syncs the whole team.
- `COMPARE_FIELDS` decides which columns count as a change worth rewriting.
- Set `CANCELED_AS_REMOVED = false` to keep cancelled issues on the sheet with their state.
