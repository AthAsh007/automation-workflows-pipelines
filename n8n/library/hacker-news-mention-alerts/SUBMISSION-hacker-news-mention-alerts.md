# Alert Slack on Hacker News mentions of your brand

**Who's it for**
Founders, developer relations and support leads at products that get discussed on Hacker News. You hear about a thread while it is still on the front page instead of the next day.

**How it works**
1. Every 30 minutes it searches Hacker News stories and comments for each keyword in `KEYWORDS`, from the last check onward, through the free Algolia search API.
2. Algolia matches prefixes, so each hit is checked again for the keyword as a whole word. Hits containing an exclusion term, posted by your own accounts, or stories under 3 points are dropped.
3. A hit found by two keywords is posted once, and ids already alerted are skipped.
4. One Slack message lists stories with points and comment counts, and comments with a 160-character snippet around the match.

**How to set up**
1. Run it once as imported. It filters sample search results and stops at `STOP: preview - nothing posted`.
2. Set `KEYWORDS` to your brand and product names, `OWN_HN_USERS` to your team accounts, then set `USE_LIVE_SEARCH = true`.
3. Connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `TEST_EMAIL` to any address to post with a [TEST] prefix, then set `TEST_RUN = false` so the checkpoint moves forward.

**Requirements**
- A Slack workspace
- Nothing for Hacker News: the Algolia API is public

**How to customize**
- `EXCLUDE_TERMS` drops hits about something else with the same name.
- `MIN_STORY_POINTS` hides brand-new stories nobody has voted on; comments are always kept.
- `MAX_LOOKBACK_HOURS` limits how far back a run looks after a long pause.
