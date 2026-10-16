# Email a daily briefing from Hacker News and RSS on chosen topics

**Who's it for**
Founders, engineers and analysts who skim Hacker News and a handful of blogs every morning to keep up with a few topics. One email replaces a dozen open tabs.

**How it works**
1. Every weekday at 06:45 it reads the top 60 Hacker News stories and every feed in `FEEDS`, or a sample set until live reading is on.
2. Stories older than 30 hours or matching an excluded word are dropped. The same link from two sources (tracking parameters ignored) or two titles sharing 60% of their words count once.
3. Each story is scored per topic: 3 points for a keyword in the title, 1 in the summary, plus a bonus for HN points. It goes under its best topic only.
4. The top 5 per topic are emailed as one HTML briefing with source, points and comment links.

**How to set up**
1. Run it once as imported. It builds a briefing from sample stories and stops at `STOP: preview - nothing sent`.
2. Edit `TOPICS` and `FEEDS`, then set `USE_LIVE_SOURCES = true`. Neither Hacker News nor RSS needs a key.
3. Connect Gmail to `Email your briefing` and set `BRIEFING_TO`.
4. Put your address in `TEST_EMAIL` for a test copy, then set `TEST_RUN = false` for the daily send.

**Requirements**
- A Gmail account
- At least one RSS feed you follow

**How to customize**
- `TOPICS` holds the keywords for each section of the email.
- `TOP_PER_TOPIC` and `MIN_SCORE` decide how much makes the cut.
- `EXCLUDE_KEYWORDS` drops stories you never want, whatever their score.
