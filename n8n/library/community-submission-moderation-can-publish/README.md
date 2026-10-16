# Moderate community form posts with OpenAI before posting to Discord

Checks each community form submission against house rules (banned words, link count, link shorteners, capitals, duplicates, length, posting rate), optionally asks OpenAI to judge it against your written community rules, posts approved ones to a Discord channel and puts held ones in a Google Sheets review queue.

Import `community-submission-moderation-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Community managers who collect posts, tips or showcase entries through a form and publish them to Discord, and spend their mornings deleting spam and link drops by hand.

## How it works

1. Each form submission (name, email, title, post, optional link) runs the house rules first. A manual run uses 7 sample submissions.
2. Banned phrases, duplicates of a post from the last 7 days and posts under 20 characters are rejected. More than 2 links, shortened links, mostly capital letters or a 4th post in a day are held.
3. With `USE_OPENAI` on, posts that pass the rules are checked by a model against `COMMUNITY_RULES`; the model can hold or reject, never approve something the rules stopped.
4. Approved posts go to Discord with the author and title. Held posts go to the Review queue tab with the reason; rejected posts stop with theirs.

## Sections on the canvas

1. **Start and settings.** The form is the way in; the manual trigger replays sample posts. Every rule, threshold and the community rule text live in `config`.
2. **Read and apply house rules.** Rules are free and explainable, so they run first on every post. Rejections are reserved for certain spam; anything that might be fine is held for a person instead.
3. **Ask the model.** Only posts that passed every rule reach the model, so spam never costs a call. `Settle the verdict` lets the model add a hold or reject but never approve a post a rule stopped.
4. **Post, queue or reject.** Each verdict has its own exit. Discord and the review queue are written only on a live run with their ids set, and the duplicate memory is saved only then, so a dry run can be repeated.

## Setup

1. Run it once as imported. It judges the sample posts and stops at `STOP: dry run - nothing posted`.
2. Add a Discord bot credential to `Post to Discord` and set `DISCORD_CHANNEL_ID`.
3. Create a Review queue tab and put the sheet id in `QUEUE_SHEET_ID`. Optionally add an OpenAI credential and set `USE_OPENAI = true`.
4. Activate the workflow and share the form URL. Set `DRY_RUN = false` to start posting.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_OPENAI` | `false` | set true after adding an OpenAI credential to the model under Judge against the community rules |
| `COMMUNITY_RULES` | `'Posts must be about home baking. No s...'` | what the model checks posts against |
| `BANNED_PHRASES` | `["casino","crypto giveaway","free money"` | any of these rejects the post |
| `SHORTENER_DOMAINS` | `["bit.ly","tinyurl.com","t.co","goo.gl",` | links through these are held, since the target is hidden |
| `MAX_LINKS` | `2` | more links than this holds the post |
| `MIN_CHARS` | `20` | shorter posts are rejected |
| `CAPS_RATIO` | `0.6` | share of capital letters that holds a post (posts with 20+ letters) |
| `DUPLICATE_DAYS` | `7` | the same text posted again inside this window is rejected |
| `DAILY_POSTS_PER_EMAIL` | `3` | a 4th post from one email in a day is held |
| `DISCORD_CHANNEL_ID` | `''` | channel approved posts go to |
| `QUEUE_SHEET_ID` | `''` | Google Sheets id with a Review queue tab |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Judge against the community rules`
- `Judge against the community rules model`
- `Post to Discord`
- `Add to the review queue`

## Requirements

- A Discord server with a bot that can post in the channel
- A Google Sheet for the review queue
- Optional: an OpenAI API key

## Customising

- `BANNED_PHRASES`, `SHORTENER_DOMAINS` and `MAX_LINKS` hold the hard rules.
- `COMMUNITY_RULES` is the plain-language rule text the model judges against.
- `CAPS_RATIO` and `DAILY_POSTS_PER_EMAIL` tune the softer holds.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 18 | none | `STOP: rejected`, `STOP: dry run - nothing posted`, `STOP: dry run - queue untouched` |
| live form post with OpenAI, Discord and the queue | 17 | `Post to Discord`, `Add to the review queue` | `Post to Discord`, `Add to the review queue` |
