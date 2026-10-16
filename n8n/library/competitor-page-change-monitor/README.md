# Monitor competitor pricing pages for changes and alert Slack

Fetches a list of competitor pricing pages every morning, strips the HTML down to visible text, pulls out every price, compares prices and wording with the last snapshot and posts added and removed prices to Slack.

Import `competitor-page-change-monitor-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Product marketers and founders who check rival pricing pages by hand every few weeks and find out about a price rise from a prospect. This checks every weekday and only speaks up when a price or a meaningful share of the wording changes.

## How it works

1. Every weekday at 08:00 it fetches each page in `PAGES`, or uses 3 sample pages until live fetching is on.
2. Scripts, styles and tags are stripped, then every price such as "$49/mo" or "120 EUR per year" is extracted.
3. Prices are compared with the snapshot from the last run, and the wording is compared word by word. More than 15% changed wording counts as a change.
4. One Slack message lists added and removed prices per page. Pages that failed to load are reported and keep their old snapshot.

## Sections on the canvas

1. **Start and settings.** Runs every weekday at 08:00 or by hand. The watched pages, the wording threshold and the ignore list live in `config`.
2. **Fetch the pages.** Pricing pages are public, so `Fetch each pricing page` needs no credential, but it still waits for `USE_LIVE_FETCH`. Until then `Load sample page HTML` also carries the HTML from the last run so the diff can be watched offline.
3. **Diff against the last snapshot.** Prices are compared as a set, so reordered plans are not a change. A page that failed to load keeps its old snapshot, which stops the next run from reporting every price as new.
4. **Post to Slack.** Nothing is posted while `TEST_RUN` is true and `TEST_EMAIL` is blank. A test post carries a [TEST] prefix. A blank channel ends at `STOP: no Slack channel`.

## Setup

1. Run it once as imported. It compares the sample pages and stops at `STOP: preview - nothing posted`.
2. List the pages you want to watch in `PAGES` and set `USE_LIVE_FETCH = true`. The first live run saves a baseline and posts the prices it found.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `TEST_EMAIL` to any address to post with a [TEST] prefix, then set `TEST_RUN = false` for normal alerts.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_LIVE_FETCH` | `false` | set true to fetch the pages in PAGES (public pages, no credential needed) |
| `PAGES` | `[{"name":"Rival A pricing","url":"https:` | pages to watch: a short name and the full URL |
| `TEXT_CHANGE_PCT` | `15` | percent of words that must change before a page with the same prices is reported |
| `POST_BASELINE` | `true` | true -> the first run for a new page posts the prices found, so you can check extraction |
| `IGNORE_PRICES` | `["$0","$0/mo"]` | prices never reported (normalised form) |
| `SLACK_CHANNEL_ID` | `''` | channel for the change report; blank skips Slack |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Post the report to Slack`

## Requirements

- Public pricing pages that render their prices in HTML
- A Slack workspace

## Customising

- `TEXT_CHANGE_PCT` sets how much wording must change before a page without price changes is reported.
- `POST_BASELINE` controls whether the first run for a new page posts the prices it found.
- `IGNORE_PRICES` drops recurring noise such as "$0" from free tiers.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 10 | none | `STOP: preview - nothing posted` |
| live first run posts the baseline | 13 | `Post the report to Slack` | `Post the report to Slack` |
