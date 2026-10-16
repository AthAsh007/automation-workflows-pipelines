# Monitor competitor pricing pages for changes and alert Slack

**Who's it for**
Product marketers and founders who check rival pricing pages by hand every few weeks and find out about a price rise from a prospect. This checks every weekday and only speaks up when a price or a meaningful share of the wording changes.

**How it works**
1. Every weekday at 08:00 it fetches each page in `PAGES`, or uses 3 sample pages until live fetching is on.
2. Scripts, styles and tags are stripped, then every price such as "$49/mo" or "120 EUR per year" is extracted.
3. Prices are compared with the snapshot from the last run, and the wording is compared word by word. More than 15% changed wording counts as a change.
4. One Slack message lists added and removed prices per page. Pages that failed to load are reported and keep their old snapshot.

**How to set up**
1. Run it once as imported. It compares the sample pages and stops at `STOP: preview - nothing posted`.
2. List the pages you want to watch in `PAGES` and set `USE_LIVE_FETCH = true`. The first live run saves a baseline and posts the prices it found.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `TEST_EMAIL` to any address to post with a [TEST] prefix, then set `TEST_RUN = false` for normal alerts.

**Requirements**
- Public pricing pages that render their prices in HTML
- A Slack workspace

**How to customize**
- `TEXT_CHANGE_PCT` sets how much wording must change before a page without price changes is reported.
- `POST_BASELINE` controls whether the first run for a new page posts the prices it found.
- `IGNORE_PRICES` drops recurring noise such as "$0" from free tiers.
