# Turn new blog RSS posts into social post drafts in Google Sheets with OpenAI

**Who's it for**
Content marketers and founders who publish on a blog and then rewrite every post by hand for LinkedIn, X and Threads. The drafts land in a sheet so a person still approves each one before it goes out.

**How it works**
1. Every 3 hours it reads your blog RSS feed, or 5 sample posts until the feed is switched on.
2. Posts already drafted, older than 14 days or missing a link are skipped, and at most 3 new posts are taken per run.
3. Each post gets one draft per platform from OpenAI, or from a template that uses the title, the first two sentences and the link.
4. Every draft is trimmed at a word boundary to the platform limit (X counts links as 23 characters), hashtags come from the post categories, and rows are appended to the Drafts tab with status "needs review".
5. Each draft is booked into the next free slot for its platform: a day and hour from `POST_WINDOWS` in your `TIMEZONE`, at least `MIN_GAP_HOURS` from any other booked post on that platform, including drafts booked by earlier runs. LinkedIn gets one post a day, X can take several.

**How to set up**
1. Run it once as imported. It drafts the sample posts and stops at `STOP: dry run - sheet untouched`.
2. Put your feed address in `FEED_URL` and set `USE_LIVE_FEED = true`.
3. Connect Google Sheets and set `DRAFTS_SHEET_ID` to a sheet with a Drafts tab. Optionally add an OpenAI credential and set `USE_OPENAI = true`.
4. Check the drafts in `Fit drafts to platform limits`, then set `DRY_RUN = false` so rows are written and posts are remembered.

**Requirements**
- A blog with an RSS or Atom feed
- A Google Sheet with a Drafts tab
- Optional: an OpenAI API key

**How to customize**
- `PLATFORMS` holds the character limit and hashtag count for each network. Remove one to stop drafting for it.
- `MAX_POSTS_PER_RUN` and `MAX_AGE_DAYS` control how much backlog one run picks up.
- `BLOCKED_HASHTAGS` drops categories such as "Uncategorized" that make poor tags.
- `POST_WINDOWS`, `MIN_GAP_HOURS` and `TIMEZONE` decide when each platform posts; `LEAD_HOURS` keeps the first slot far enough out for someone to review it.
