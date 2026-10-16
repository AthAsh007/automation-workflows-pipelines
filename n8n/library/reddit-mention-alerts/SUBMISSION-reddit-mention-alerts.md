# Send Reddit mentions of your keywords to Discord

**Who's it for**
Community managers and indie founders who want to answer Reddit threads about their product, or their category, while the thread is still active. The alerts land in the Discord channel your team already watches.

**How it works**
1. Every hour it searches Reddit for each keyword in `KEYWORDS`, newest first, or uses sample results until live search is on.
2. Each post is checked for the keyword as a whole word in the title or body. Posts from denied subreddits, NSFW posts, your own accounts and posts older than 24 hours are dropped. An allow list can limit alerts to chosen subreddits.
3. Posts already alerted and posts found by two keywords are sent once.
4. Mentions are packed into Discord messages of at most 1,900 characters, with subreddit, score, comment count and link.

**How to set up**
1. Run it once as imported. It filters sample results and stops at `STOP: preview - nothing posted`.
2. Set `KEYWORDS`, `OWN_REDDIT_USERS` and `USER_AGENT` (Reddit asks for a descriptive one with your username), then set `USE_LIVE_SEARCH = true`.
3. Add a Discord bot credential to `Post to Discord` and set `DISCORD_CHANNEL_ID`.
4. Set `TEST_EMAIL` to any address to post with a [TEST] prefix, then set `TEST_RUN = false` so posted ids are remembered.

**Requirements**
- A Discord server with a bot that can post in the channel
- Nothing for Reddit: public search JSON, no login

**How to customize**
- `ALLOW_SUBREDDITS` limits alerts to listed subreddits; `DENY_SUBREDDITS` blocks noisy ones.
- `MAX_AGE_HOURS` and `MIN_SCORE` control how fresh and how popular a post must be.
- `EXCLUDE_TERMS` drops posts about something else with the same name.
