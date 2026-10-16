# Audit sitemap pages for missing titles and meta descriptions in Google Sheets

Reads your sitemap, fetches each page, checks the title, meta description, H1, canonical and noindex tags against length and duplicate rules, and writes one audit row per page to a Google Sheets tab with pass, warn or error and the reasons.

Import `seo-missing-meta-audit-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Marketers and site owners who want a page-by-page list of SEO basics to fix, without paying for a crawler subscription. The sheet becomes the to-do list, updated every week.

## How it works

1. Every Sunday at 22:00 it reads your sitemap and fetches up to 150 pages, or 7 sample pages until live fetching is on.
2. Each page is checked for a title of 30-60 characters, a meta description of 70-160, exactly one H1, a canonical that points to itself, and no noindex tag.
3. Titles and descriptions used on more than one page are flagged on every page that shares them.
4. Missing tags, noindex and failed loads are errors, the rest are warnings. One row per page is upserted on the url column of the Audit tab.

## Sections on the canvas

1. **Start and settings.** Runs every Sunday at 22:00 or by hand, so Monday starts with a fresh list. Length ranges, the page cap and which issues are errors are constants in `config`.
2. **Fetch the pages.** The sitemap decides which pages are audited, newest first. A page that fails to load continues as an error row instead of stopping the run. `Load sample pages` returns the same url and HTML pairs.
3. **Audit the tags.** `Audit each page` reads meta tags with attributes in any order, because CMS themes write content before name as often as after. Duplicate titles are counted across the whole run, so both pages get the flag.
4. **Write the audit sheet.** Rows are upserted on url, so next week updates the same row and the sheet stays one line per page. Nothing is written while `DRY_RUN` is true.

## Setup

1. Run it once as imported. It audits the sample pages and stops at `STOP: dry run - sheet untouched`.
2. Set `SITEMAP_URLS` and `USE_LIVE_FETCH = true`, then run it and read the rows in `Audit each page`.
3. Connect Google Sheets, create an Audit tab with a url column, and set `AUDIT_SHEET_ID`.
4. Set `DRY_RUN = false` to write the rows.

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
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Upsert audit rows`

## Requirements

- A public XML sitemap
- A Google Sheet with an Audit tab

## Customising

- `TITLE_LENGTH` and `DESCRIPTION_LENGTH` hold the min and max characters.
- `MAX_PAGES` caps the pages fetched per run.
- `ERROR_RULES` decides which issues count as errors rather than warnings.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 9 | none | `STOP: dry run - sheet untouched` |
| live fetch and sheet upsert | 13 | `Upsert audit rows` | `Upsert audit rows` |
