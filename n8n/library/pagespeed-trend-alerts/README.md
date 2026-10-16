# Track PageSpeed Insights scores in Google Sheets and alert on drops

Runs PageSpeed Insights for each page on mobile and desktop every morning, compares the performance score, LCP and CLS with the median of the last 7 runs stored in Google Sheets, posts drops to Slack and appends the new scores to the history tab.

Import `pagespeed-trend-alerts-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Developers and marketers who own a site's speed and only notice a slow release when rankings or conversions drop. One Lighthouse run is noisy, so drops are measured against a rolling median instead of yesterday.

## How it works

1. Every day at 06:00 it runs PageSpeed Insights for each URL in `PAGES` on mobile and desktop, or uses sample results until it is switched on.
2. The last 7 results per page and device are read from the Scores tab and their median becomes the baseline.
3. A score 10+ points under the median, an LCP 25% and 300 ms over it, or CLS crossing 0.1 is a drop. Pages with fewer than 3 past runs are still building a baseline.
4. Drops are posted to Slack with before and after numbers, and every result is appended to the Scores tab.

## Sections on the canvas

1. **Start and settings.** Runs every day at 06:00 or by hand. Pages, devices and every drop threshold are constants in `config`.
2. **Run PageSpeed Insights.** One API call per page and device, which takes 10 to 30 seconds each. A failed Lighthouse run is passed on as an error and reported, so one broken page never hides the others.
3. **Read the history.** The history lives in your own sheet, so the trend is visible outside n8n too. `Read the Lighthouse results` emits a single item so the sheet is read once, not once per page.
4. **Compare and alert.** A median of 7 runs absorbs normal Lighthouse noise of a few points. Pages with under 3 runs stay quiet while the baseline builds. Alerts go out only when posting is on and a channel is set.
5. **Record today.** Rows are appended only on a live run with a sheet set. Test runs never add rows, so they cannot shift tomorrow's median.

## Setup

1. Run it once as imported. It compares sample results and stops at `STOP: preview - nothing posted` and `STOP: test run - history not written`.
2. List your pages in `PAGES` and set `USE_LIVE_PSI = true`. Add a free API key to `PSI_API_KEY` if you test more than a few pages.
3. Connect Google Sheets, create a Scores tab with date, url, strategy, score, lcp_ms, cls and tbt_ms columns, and set `HISTORY_SHEET_ID`. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `TEST_EMAIL` to any address to post alerts with a [TEST] prefix. Set `TEST_RUN = false` to post and record history.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_LIVE_PSI` | `false` | set true to call the PageSpeed Insights API (public) |
| `PSI_API_KEY` | `''` | optional Google API key for higher quota; blank works for a few pages a day |
| `PAGES` | `["https://www.yourcompany.example/","htt` | pages to test |
| `STRATEGIES` | `["mobile","desktop"]` | devices to test each page on |
| `HISTORY_SHEET_ID` | `''` | Google Sheets id with a Scores tab; blank uses sample history |
| `WINDOW` | `7` | past runs per page and device used for the median |
| `MIN_HISTORY` | `3` | past runs needed before a drop is reported |
| `DROP_POINTS` | `10` | score points under the median that count as a drop (0-100 scale) |
| `LCP_RISE_PCT` | `25` | LCP this many percent over the median (and 300 ms or more) is a drop |
| `CLS_LIMIT` | `0.1` | CLS crossing this from below is a drop |
| `SLACK_CHANNEL_ID` | `''` | channel for alerts; blank skips Slack |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read score history`
- `Post the alert to Slack`
- `Append scores to the history sheet`

## Requirements

- Public pages to test
- A Google Sheet for the history
- A Slack workspace

## Customising

- `DROP_POINTS`, `LCP_RISE_PCT` and `CLS_LIMIT` set what counts as a drop.
- `WINDOW` and `MIN_HISTORY` control the baseline.
- `STRATEGIES` can be reduced to mobile only.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 16 | none | `STOP: test run - history not written`, `STOP: preview - nothing posted` |
| live PSI with history, Slack and sheet | 18 | `Append scores to the history sheet`, `Post the alert to Slack` | `Append scores to the history sheet`, `Post the alert to Slack` |
