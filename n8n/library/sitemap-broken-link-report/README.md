# Check a sitemap for broken pages and email a weekly report with Gmail

Reads your sitemap every Monday, requests up to 200 pages, sorts them into ok, redirect, 4xx, 5xx and unreachable, compares with last week and emails a report only when something broke or got fixed.

Import `sitemap-broken-link-report-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Site owners and marketers who publish often and only learn about a broken page when a customer sends a screenshot. You get one email a week, and only when the list of problems changed.

## How it works

1. Every Monday at 07:00 it reads each sitemap in `SITEMAP_URLS`, or a sample sitemap until live checks are on.
2. Page URLs matching `EXCLUDE_PATTERNS` are dropped and the 200 most recently modified are kept.
3. Each page is requested without following redirects and sorted into ok, redirect, client error (4xx), server error (5xx) or unreachable (timeout or DNS).
4. Results are compared with last week. If a page newly broke or got fixed, an HTML email lists new problems first, then fixes, then problems that remain.

## Sections on the canvas

1. **Start and settings.** Runs every Monday at 07:00 or by hand. Sitemaps, exclusions, the URL cap and the recipient live in `config`.
2. **Read the sitemap.** `Pick URLs to check` drops excluded paths and keeps the most recently modified pages, so a cap of 200 still covers what changed lately. A sitemap index is reported instead of producing an empty run.
3. **Request every page.** Redirects are not followed, so a 301 in the sitemap is visible. A 404 or timeout continues as data instead of stopping the run. `Load sample page results` returns the same error shapes.
4. **Compare with last week.** Problems are compared by class per URL, so a page that stays broken is listed once under still broken, and the email only goes out when something new broke or got fixed.
5. **Send and save the baseline.** Nothing is emailed in preview. A test send goes to `TEST_EMAIL` and keeps last week's baseline, so the live run still sees the same changes.

## Setup

1. Run it once as imported. It checks the sample sitemap and stops at `STOP: preview - nothing sent`.
2. Put your sitemap address in `SITEMAP_URLS` and set `USE_LIVE_CHECKS = true`. For a sitemap index, list the child sitemaps instead.
3. Connect Gmail to `Email the report` and set `REPORT_TO`.
4. Put your address in `TEST_EMAIL` to receive a test report. Set `TEST_RUN = false` to send to `REPORT_TO` and save the weekly baseline.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_LIVE_CHECKS` | `false` | set true to fetch the sitemap and request every page (public GETs) |
| `SITEMAP_URLS` | `["https://www.yourcompany.example/sitema` | sitemaps to read; list child sitemaps rather than an index |
| `EXCLUDE_PATTERNS` | `["/tag/","/author/","?"]` | URLs containing any of these are not checked |
| `MAX_URLS` | `200` | most recently modified pages checked per run |
| `REPORT_REDIRECTS` | `true` | true -> redirects are listed as problems (sitemaps should list final URLs) |
| `ALWAYS_SEND` | `false` | true -> email every week even when nothing changed |
| `REPORT_TO` | `'web-team@yourcompany.example'` | who gets the report |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Email the report`

## Requirements

- A public XML sitemap
- A Gmail account

## Customising

- `MAX_URLS` caps the pages checked per run.
- `REPORT_REDIRECTS` decides whether redirects count as problems.
- `ALWAYS_SEND` true sends the report every week, changed or not.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 15 | none | `STOP: preview - nothing sent` |
| live checks and email | 19 | `Email the report` | `Save this week as the baseline` |
