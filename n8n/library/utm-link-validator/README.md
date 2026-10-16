# Validate campaign links in Google Sheets before launch

Checks every campaign link in a Google Sheets tab for URL syntax, required and lowercase UTM parameters, allowed mediums, duplicate utm_content within a campaign and a reachable landing page, then writes ok, warn or fail with the reasons back to each row.

Import `utm-link-validator-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Marketing teams who build UTM links in a spreadsheet before a launch and find the broken ones in analytics a week later. Every row gets a status and a plain reason before anything goes out.

## How it works

1. Every weekday at 08:00 it reads the Links tab, or 8 sample links until the sheet is connected. Rows already marked ok are skipped.
2. Each link is checked for a valid https URL, utm_source, utm_medium and utm_campaign present, lowercase values without spaces, and a medium from your allowed list.
3. utm_content used twice in the same campaign is flagged, because the two ads become one row in your reports.
4. Each landing page is requested once (without the query string) and anything other than a 2xx or 3xx fails the row. The status and reasons are written back by link_id.

## Sections on the canvas

1. **Start and settings.** Runs every weekday at 08:00 or by hand. Required parameters, allowed mediums and which checks only warn are constants in `config`.
2. **Read the links.** Reads the Links tab once the sheet id is set. `Load sample links` holds one row per rule, plus a row already marked ok that is skipped unless `RECHECK_OK` is true.
3. **Check the landing pages.** Rule checks run first and cost nothing. Landing pages are then requested once each, without the query string, and a 404 or timeout is read as a result instead of stopping the run.
4. **Write the status back.** `Write a status for each row` decides ok, warn or fail and lists every reason. The sheet is updated by link_id only when `DRY_RUN` is false, so the first runs change nothing.

## Setup

1. Run it once as imported. It checks the sample links and stops at `STOP: dry run - sheet untouched`.
2. Create a Links tab with link_id, url, campaign, status, issues and checked_at columns, connect Google Sheets and set `LINKS_SHEET_ID`.
3. Set `USE_LIVE_CHECKS = true` to request real landing pages.
4. Read the results in `Write a status for each row`, then set `DRY_RUN = false` to fill the status column.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `LINKS_SHEET_ID` | `''` | Google Sheets id with a Links tab; blank uses sample links |
| `USE_LIVE_CHECKS` | `false` | set true to request each landing page (public GET, no credential) |
| `REQUIRED_PARAMS` | `["utm_source","utm_medium","utm_campaign` | parameters every link must carry |
| `ALLOWED_MEDIUMS` | `["email","cpc","paid_social","social","d` | utm_medium values your reports expect |
| `WARN_ONLY` | `["not https","medium not in ALLOWED_MEDI` | checks that warn instead of fail |
| `SLOW_MS` | `3000` | landing pages slower than this are flagged |
| `RECHECK_OK` | `false` | true -> rows already marked ok are checked again |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Read the campaign links`
- `Write status to the sheet`

## Requirements

- A Google Sheet with your campaign links

## Customising

- `REQUIRED_PARAMS` and `ALLOWED_MEDIUMS` hold your naming rules.
- `WARN_ONLY` lists checks that should warn instead of fail, such as http links.
- `SLOW_MS` flags landing pages slower than this.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 12 | none | `STOP: dry run - sheet untouched` |
| live checks and sheet update | 14 | `Write status to the sheet` | `Write status to the sheet` |
