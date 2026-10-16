# Track PageSpeed Insights scores in Google Sheets and alert on drops

**Who's it for**
Developers and marketers who own a site's speed and only notice a slow release when rankings or conversions drop. One Lighthouse run is noisy, so drops are measured against a rolling median instead of yesterday.

**How it works**
1. Every day at 06:00 it runs PageSpeed Insights for each URL in `PAGES` on mobile and desktop, or uses sample results until it is switched on.
2. The last 7 results per page and device are read from the Scores tab and their median becomes the baseline.
3. A score 10+ points under the median, an LCP 25% and 300 ms over it, or CLS crossing 0.1 is a drop. Pages with fewer than 3 past runs are still building a baseline.
4. Drops are posted to Slack with before and after numbers, and every result is appended to the Scores tab.

**How to set up**
1. Run it once as imported. It compares sample results and stops at `STOP: preview - nothing posted` and `STOP: test run - history not written`.
2. List your pages in `PAGES` and set `USE_LIVE_PSI = true`. Add a free API key to `PSI_API_KEY` if you test more than a few pages.
3. Connect Google Sheets, create a Scores tab with date, url, strategy, score, lcp_ms, cls and tbt_ms columns, and set `HISTORY_SHEET_ID`. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `TEST_EMAIL` to any address to post alerts with a [TEST] prefix. Set `TEST_RUN = false` to post and record history.

**Requirements**
- Public pages to test
- A Google Sheet for the history
- A Slack workspace

**How to customize**
- `DROP_POINTS`, `LCP_RISE_PCT` and `CLS_LIMIT` set what counts as a drop.
- `WINDOW` and `MIN_HISTORY` control the baseline.
- `STRATEGIES` can be reduced to mobile only.
