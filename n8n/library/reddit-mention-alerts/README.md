# Send Reddit mentions of your keywords to Discord

Searches Reddit for each keyword every hour through the public JSON search, keeps whole-word matches from allowed subreddits that are new, safe for work and not yours, and posts them to a Discord channel in messages under the 2,000 character limit.

Import `reddit-mention-alerts-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Community managers and indie founders who want to answer Reddit threads about their product, or their category, while the thread is still active. The alerts land in the Discord channel your team already watches.

## How it works

1. Every hour it searches Reddit for each keyword in `KEYWORDS`, newest first, or uses sample results until live search is on.
2. Each post is checked for the keyword as a whole word in the title or body. Posts from denied subreddits, NSFW posts, your own accounts and posts older than 24 hours are dropped. An allow list can limit alerts to chosen subreddits.
3. Posts already alerted and posts found by two keywords are sent once.
4. Mentions are packed into Discord messages of at most 1,900 characters, with subreddit, score, comment count and link.

## Sections on the canvas

1. **Start and settings.** Runs at 5 past every hour or by hand. Keywords, subreddit lists and the User-Agent Reddit requires are constants in `config`.
2. **Search Reddit.** The public search.json endpoint needs no login, only a descriptive User-Agent header. `Load sample results` returns the same listing shape so every filter can be watched offline.
3. **Filter and pack.** Reddit search matches loosely, so `Pick mentions to post` re-checks the whole word before the subreddit, NSFW, age and score rules. `Pack Discord messages` keeps every message under the 2,000 character limit.
4. **Post to Discord.** Nothing is posted in preview, and a blank channel ends at `STOP: no Discord channel`. Ids are remembered only after a live post, so test runs never hide a mention from the real channel.

## Setup

1. Run it once as imported. It filters sample results and stops at `STOP: preview - nothing posted`.
2. Set `KEYWORDS`, `OWN_REDDIT_USERS` and `USER_AGENT` (Reddit asks for a descriptive one with your username), then set `USE_LIVE_SEARCH = true`.
3. Add a Discord bot credential to `Post to Discord` and set `DISCORD_CHANNEL_ID`.
4. Set `TEST_EMAIL` to any address to post with a [TEST] prefix, then set `TEST_RUN = false` so posted ids are remembered.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_LIVE_SEARCH` | `false` | set true to query reddit.com/search.json (public, no login) |
| `KEYWORDS` | `["Tallyroom","tallyroom.example"]` | words to search for; each is re-checked as a whole word |
| `USER_AGENT` | `'n8n:mention-alerts:v1.0 (by /u/your_u...'` | Reddit rejects requests without a descriptive User-Agent |
| `ALLOW_SUBREDDITS` | `[]` | if not empty, only these subreddits are alerted (lowercase, no r/) |
| `DENY_SUBREDDITS` | `["memes","freekarma4u"]` | subreddits never alerted (lowercase, no r/) |
| `EXCLUDE_TERMS` | `["tally room booking"]` | a post containing any of these is dropped |
| `OWN_REDDIT_USERS` | `["tallyroom_hq"]` | your own accounts; their posts are not alerts |
| `MAX_AGE_HOURS` | `24` | posts older than this are skipped |
| `MIN_SCORE` | `0` | posts below this score are skipped (downvoted spam) |
| `DISCORD_CHANNEL_ID` | `''` | Discord channel id for alerts; blank skips Discord |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Post to Discord`

## Requirements

- A Discord server with a bot that can post in the channel
- Nothing for Reddit: public search JSON, no login

## Customising

- `ALLOW_SUBREDDITS` limits alerts to listed subreddits; `DENY_SUBREDDITS` blocks noisy ones.
- `MAX_AGE_HOURS` and `MIN_SCORE` control how fresh and how popular a post must be.
- `EXCLUDE_TERMS` drops posts about something else with the same name.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 10 | none | `STOP: preview - nothing posted` |
| live search, many mentions split across messages | 15 | `Post to Discord` | `Remember posted ids` |
