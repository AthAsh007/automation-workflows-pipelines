# Audit sitemap pages for missing titles and meta descriptions in Google Sheets

Reads your sitemap, fetches each page, checks the title, meta description, H1, canonical and noindex tags against length and duplicate rules, compares every page with last week's audit (regressed, improved, unchanged, and how long each issue has been open), upserts one row per page to Google Sheets and posts the regressions to Slack.

Import `seo-missing-meta-audit-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Marketers and site owners who want a page-by-page list of SEO basics to fix, without paying for a crawler subscription. The sheet becomes the to-do list, updated every week.

## How it works

1. Every Sunday at 22:00 it reads your sitemap and fetches up to 150 pages, or 7 sample pages until live fetching is on.
2. Each page is checked for a title of 30-60 characters, a meta description of 70-160, exactly one H1, a canonical that points to itself, and no noindex tag.
3. Titles and descriptions used on more than one page are flagged on every page that shares them.
4. Missing tags, noindex and failed loads are errors, the rest are warnings.
5. Each page is compared with last week's audit: new issues make it regressed, cleared issues make it improved, and every open issue keeps the date it was first seen, so the row shows how many weeks it has been ignored.
6. One row per page is upserted on the url column of the Audit tab. Slack gets regressions first with their new issues, then the fix count and the error total against last week.

## Sections on the canvas

1. **Start and settings.** Runs every Sunday at 22:00 or by hand, so Monday starts with a fresh list. Length ranges, the page cap and which issues are errors are constants in `config`.
2. **Fetch the pages.** The sitemap decides which pages are audited, newest first. A page that fails to load continues as an error row instead of stopping the run. `Load sample pages` returns the same url and HTML pairs.
3. **Audit and compare.** `Audit each page` reads meta tags with attributes in any order and counts duplicates across the run. `Compare with last week` diffs issues by rule, not by the number in them, and keeps the date each issue first appeared.
4. **Write the sheet and report.** Rows are upserted on url, so the sheet stays one line per page. The baseline is saved only after that write, and Slack hears only when something regressed, got fixed or the error total moved.

## Setup

1. Run it once as imported. It audits the sample pages and stops at `STOP: dry run - sheet untouched`.
2. Set `SITEMAP_URLS` and `USE_LIVE_FETCH = true`, then run it and read the rows in `Audit each page`.
3. Connect Google Sheets, create an Audit tab with a url column, and set `AUDIT_SHEET_ID`.
4. Optionally connect Slack and set `SLACK_CHANNEL_ID` for the weekly change report.
5. Set `DRY_RUN = false` to write the rows. The first live run is the baseline; changes are reported from the second.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_LIVE_FETCH` | `false` | set true to read the sitemap and fetch each page (public GETs) |
| `SITEMAP_URLS` | `["https://www.yourcompany.example/sitema` | sitemaps to read (child sitemaps, not an index) |
| `MAX_PAGES` | `150` | pages fetched per run, newest lastmod first |
| `TITLE_LENGTH` | `[30,60]` | title length range in characters |
| `DESCRIPTION_LENGTH` | `[70,160]` | meta description length range in characters |
| `ERROR_RULES` | `["missing title","missing meta descripti` | issues that make a row an error; everything else warns |
| `AUDIT_SHEET_ID` | `''` | Google Sheets id with an Audit tab; blank means nothing is written |
| `STALE_ISSUE_DAYS` | `28` | open issues older than this are counted as stale in the report |
| `SLACK_CHANNEL_ID` | `''` | channel for the weekly change report; blank skips Slack |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Upsert audit rows`
- `Post the change report to Slack`

## Requirements

- A public XML sitemap
- A Google Sheet with an Audit tab
- Optional: a Slack workspace

## Customising

- `TITLE_LENGTH` and `DESCRIPTION_LENGTH` hold the min and max characters.
- `MAX_PAGES` caps the pages fetched per run.
- `ERROR_RULES` decides which issues count as errors rather than warnings.
- `STALE_ISSUE_DAYS` sets when an open issue is called out as stale in the Slack report.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 10 | none | `STOP: dry run - sheet untouched` |
| live fetch and sheet upsert | 18 | `Upsert audit rows`, `Post the change report to Slack` | `Post the change report to Slack` |
