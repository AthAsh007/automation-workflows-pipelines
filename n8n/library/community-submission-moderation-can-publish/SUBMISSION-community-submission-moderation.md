# Moderate community form posts with OpenAI before posting to Discord

**Who's it for**
Community managers who collect posts, tips or showcase entries through a form and publish them to Discord, and spend their mornings deleting spam and link drops by hand.

**How it works**
1. Each form submission (name, email, title, post, optional link) runs the house rules first. A manual run uses 7 sample submissions.
2. Banned phrases, duplicates of a post from the last 7 days and posts under 20 characters are rejected. More than 2 links, shortened links, mostly capital letters or a 4th post in a day are held.
3. With `USE_OPENAI` on, posts that pass the rules are checked by a model against `COMMUNITY_RULES`; the model can hold or reject, never approve something the rules stopped.
4. Approved posts go to Discord with the author and title. Held posts go to the Review queue tab with the reason; rejected posts stop with theirs.

**How to set up**
1. Run it once as imported. It judges the sample posts and stops at `STOP: dry run - nothing posted`.
2. Add a Discord bot credential to `Post to Discord` and set `DISCORD_CHANNEL_ID`.
3. Create a Review queue tab and put the sheet id in `QUEUE_SHEET_ID`. Optionally add an OpenAI credential and set `USE_OPENAI = true`.
4. Activate the workflow and share the form URL. Set `DRY_RUN = false` to start posting.

**Requirements**
- A Discord server with a bot that can post in the channel
- A Google Sheet for the review queue
- Optional: an OpenAI API key

**How to customize**
- `BANNED_PHRASES`, `SHORTENER_DOMAINS` and `MAX_LINKS` hold the hard rules.
- `COMMUNITY_RULES` is the plain-language rule text the model judges against.
- `CAPS_RATIO` and `DAILY_POSTS_PER_EMAIL` tune the softer holds.
