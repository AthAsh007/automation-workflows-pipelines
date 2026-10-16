# Sync Linear issues to a Google Sheets roadmap

Pulls roadmap-labelled Linear issues for one team each weekday, maps state, priority, estimate and cycle into sheet columns, upserts changed rows by issue id and marks rows whose issue left Linear as removed.

Import `linear-roadmap-sheet-sync-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Product and engineering leads who share a roadmap with sales or leadership in Google Sheets while the real work lives in Linear. It keeps the sheet current without anyone copying issues across on Friday afternoon.

## How it works

1. Every weekday at 06:30 it queries Linear for one team, filtered to the labels in `ROADMAP_LABELS`, or loads 6 sample issues until Linear is connected.
2. Each issue becomes one roadmap row: state, priority label, estimate, cycle number with its dates, assignee, project and due date.
3. The rows already on the Roadmap tab are compared by issue id. New issues are added, rows with a changed field are updated, unchanged rows are left alone.
4. Rows whose issue was cancelled or no longer matches the filter are marked removed with a date instead of being deleted, so nobody loses a line they were tracking.

## Sections on the canvas

1. **Start and settings.** Runs every weekday at 06:30 or by hand. Team key, labels and the columns that count as a change all live in `config`, so the sync can be pointed at another team by editing one node.
2. **Read Linear issues.** `Build the Linear query` adds the label filter only when labels are set. Until `USE_LINEAR` is true, `Load sample Linear issues` returns the same GraphQL shape, so `Map issues to roadmap rows` is tested on every run.
3. **Read the roadmap tab.** The current tab is read before anything is written, because the diff needs it. A blank `ROADMAP_SHEET_ID` routes to `Load sample roadmap rows`, a tab that is one week out of date.
4. **Plan, write and summarise.** Only new, changed and removed rows leave `Plan roadmap changes`, so an idle week writes nothing. Rows are marked removed rather than deleted. `Write to the roadmap?` needs a live run and a sheet id.

## Setup

1. Run it once as imported. It plans changes against sample issues and stops at `STOP: dry run - roadmap untouched`.
2. Add a Linear credential to `Query Linear issues`, set `LINEAR_TEAM` and set `USE_LINEAR = true`.
3. Create a Roadmap tab with an `Issue ID` column, connect Google Sheets and paste the spreadsheet id into `ROADMAP_SHEET_ID`.
4. Check the plan in `Plan roadmap changes`, then set `DRY_RUN = false` to write the tab.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_LINEAR` | `false` | set true after adding the Linear credential to Query Linear issues |
| `LINEAR_TEAM` | `'ENG'` | team key as shown in issue identifiers (ENG-123 -> ENG) |
| `ROADMAP_LABELS` | `["roadmap"]` | only issues with one of these labels are synced; [] syncs every issue in the team |
| `ROADMAP_SHEET_ID` | `''` | Google Sheets id holding the Roadmap tab; blank uses sample rows |
| `COMPARE_FIELDS` | `["Title","State","Priority","Estimate","` | a row is rewritten only when one of these columns changed |
| `CANCELED_AS_REMOVED` | `true` | cancelled and duplicate issues are marked removed on the sheet |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Query Linear issues`
- `Read current roadmap rows`
- `Upsert roadmap rows`

## Requirements

- A Linear workspace and API access
- A Google Sheet with a Roadmap tab

## Customising

- `ROADMAP_LABELS` picks which issues belong on the roadmap. An empty list syncs the whole team.
- `COMPARE_FIELDS` decides which columns count as a change worth rewriting.
- Set `CANCELED_AS_REMOVED = false` to keep cancelled issues on the sheet with their state.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 13 | none | `Summarise the sync`, `STOP: dry run - roadmap untouched` |
| live sync with Linear and the sheet | 14 | `Upsert roadmap rows` | `Summarise the sync`, `Upsert roadmap rows` |
