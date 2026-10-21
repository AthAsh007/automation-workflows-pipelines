# Turn new blog RSS posts into social post drafts in Google Sheets with OpenAI

Reads your blog feed, picks posts it has not drafted before, writes a LinkedIn, X and Threads draft for each (OpenAI or a built-in template) inside each platform limit, books each draft into the next free posting slot for its platform (your posting days and hours, a minimum gap, slots already taken by earlier drafts), and appends them to a Google Sheets review tab.

Import `blog-rss-to-social-drafts-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Content marketers and founders who publish on a blog and then rewrite every post by hand for LinkedIn, X and Threads. The drafts land in a sheet so a person still approves each one before it goes out.

## How it works

1. Every 3 hours it reads your blog RSS feed, or 5 sample posts until the feed is switched on.
2. Posts already drafted, older than 14 days or missing a link are skipped, and at most 3 new posts are taken per run.
3. Each post gets one draft per platform from OpenAI, or from a template that uses the title, the first two sentences and the link.
4. Every draft is trimmed at a word boundary to the platform limit (X counts links as 23 characters), hashtags come from the post categories, and rows are appended to the Drafts tab with status "needs review".
5. Each draft is booked into the next free slot for its platform: a day and hour from `POST_WINDOWS` in your `TIMEZONE`, at least `MIN_GAP_HOURS` from any other booked post on that platform, including drafts booked by earlier runs. LinkedIn gets one post a day, X can take several.

## Sections on the canvas

1. **Start and settings.** Runs every 3 hours or by hand. Feed address, platform limits and the hashtag block list all sit in `config`, so nothing downstream needs editing.
2. **Read the feed.** `Live feed switched on?` reads the real feed only once `USE_LIVE_FEED` is true. `Load sample posts` returns the same fields the RSS node does, so the rest of the run behaves identically offline.
3. **Pick posts worth drafting.** `Pick new posts` drops posts with no link, old posts and guids already drafted, then caps the batch before any model call is made. An empty batch ends at `STOP: no new posts` instead of calling OpenAI with nothing.
4. **Write and fit the drafts.** OpenAI is optional; the template path writes from the title and first two sentences. Both feed `Fit drafts to platform limits`, which enforces the character limit in code because a model does not count reliably.
5. **Book a slot per platform.** `Book posting slots` walks forward hour by hour in `TIMEZONE` and takes the first posting hour that keeps `MIN_GAP_HOURS` from every booked post, so three new posts become a spread-out queue, not three posts at 09:00.
6. **Save for human review.** Rows are appended only when `DRY_RUN` is false and a sheet id is set. `Remember drafted posts` runs after the append and stores the post ids and booked slots, so a failed write books nothing.

## Setup

1. Run it once as imported. It drafts the sample posts and stops at `STOP: dry run - sheet untouched`.
2. Put your feed address in `FEED_URL` and set `USE_LIVE_FEED = true`.
3. Connect Google Sheets and set `DRAFTS_SHEET_ID` to a sheet with a Drafts tab. Optionally add an OpenAI credential and set `USE_OPENAI = true`.
4. Check the drafts in `Fit drafts to platform limits`, then set `DRY_RUN = false` so rows are written and posts are remembered.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_LIVE_FEED` | `false` | set true to read FEED_URL instead of the sample posts |
| `FEED_URL` | `'https://blog.yourcompany.example/feed'` | your blog RSS or Atom feed |
| `USE_OPENAI` | `false` | set true after adding an OpenAI credential to the model node |
| `DRAFTS_SHEET_ID` | `''` | Google Sheets id with a Drafts tab; blank means nothing is written |
| `PLATFORMS` | `{"linkedin":{"limit":3000,"hashtags":3},` | one draft per platform: character limit and how many hashtags to add |
| `MAX_POSTS_PER_RUN` | `3` | newest posts drafted per run; the rest wait for the next run |
| `MAX_AGE_DAYS` | `14` | posts older than this are never drafted |
| `BLOCKED_HASHTAGS` | `["uncategorized","news","blog"]` | categories that never become hashtags (lowercase) |
| `TIMEZONE` | `'Europe/London'` | IANA time zone the posting hours are in |
| `POST_WINDOWS` | `{"linkedin":{"days":[2,3,4],"hours":[8,1` | per platform: weekdays (1 = Monday) and local hours a post may go out |
| `MIN_GAP_HOURS` | `{"linkedin":24,"x":4,"threads":8}` | least time between two booked posts on the same platform |
| `LEAD_HOURS` | `4` | no slot is booked sooner than this, so there is time to review |
| `BRAND_VOICE` | `'plain, specific, no hype, first perso...'` | tone hint given to OpenAI |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Write drafts with OpenAI`
- `Write drafts with OpenAI model`
- `Append drafts to the sheet`

## Requirements

- A blog with an RSS or Atom feed
- A Google Sheet with a Drafts tab
- Optional: an OpenAI API key

## Customising

- `PLATFORMS` holds the character limit and hashtag count for each network. Remove one to stop drafting for it.
- `MAX_POSTS_PER_RUN` and `MAX_AGE_DAYS` control how much backlog one run picks up.
- `BLOCKED_HASHTAGS` drops categories such as "Uncategorized" that make poor tags.
- `POST_WINDOWS`, `MIN_GAP_HOURS` and `TIMEZONE` decide when each platform posts; `LEAD_HOURS` keeps the first slot far enough out for someone to review it.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run, template drafts) | 15 | none | `STOP: dry run - sheet untouched` |
| live feed, OpenAI and sheet write | 17 | `Append drafts to the sheet` | `Remember drafted posts` |
