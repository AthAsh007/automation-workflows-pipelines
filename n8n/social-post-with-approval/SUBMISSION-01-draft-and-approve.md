# Draft LinkedIn posts with AI and send them to Discord for approval

**Who's it for**
Teams posting daily to a LinkedIn company page who want the drafting, quality checks, image
rendering and approval loop automated, but are not willing to let anything reach the page without
a person saying yes.

**How it works**
Every weekday it reads the post log and works out whether today needs a draft. The log is
append-only, so a draft counts as open until a later row closes it: an open draft keeps the day
silent, a cancelled one is drafted again, and one past its approval window does not block today.

It picks the next idea from a bank in Google Sheets and checks it against what was actually
published, by date: a pillar published in the last 21 days is held, a topic family already used
twice in the last seven days is held, and layout or pillar repeats inside the publishing week are
held. Each hold is recorded with its reason and the next row is tried.

The caption comes from the bank, or an LLM writes it. Either way it is checked in code: word
count, hashtag count and position, emoji, banned phrases, no links in the body, no typed
@mentions, and an opening line that does not repeat the hook of a recent post. A model caption
that fails gets **one** rewrite, with its own answer and the exact failures fed back. If the
rewrite still fails, the draft is held for a human with both lists of failures. A banked caption is
never rewritten.

The image is built as HTML, checked for layout, and rendered by Browserless or HCTI. The PNG
bytes are checked (signature, dimensions, size) rather than the HTTP status. The finished draft,
image attached, goes to a private Discord channel and an `awaiting` row is logged.

**It never publishes.** The companion workflow does, after a person replies `post`.

**How to set up**
1. Import and click **Execute workflow**. With `SHEET_ID` blank it runs on a demo log and demo
   bank: you will see topic rotation hold one post, a model draft fail four rules, the rewrite fix
   them, and the run stop safely in preview. No credentials are needed.
2. Create the **Bank** and **Log** tabs with the headings in the README, and set `SHEET_ID`.
3. Connect Google Sheets and Discord, add an OpenAI-compatible key, and set a renderer in `config`.
4. Set `TEST_CHANNEL_ID` to a private test channel. Going live is the separate act of setting
   `TEST_RUN = false`.

**Requirements**
A Google Sheet for the bank and the log, a Discord bot, an OpenAI-compatible endpoint, and a
Browserless or HCTI renderer. A Slack webhook for the run summary is optional.

**How to customize**
Every rule and threshold is a constant in `config`: the cooldowns, word and hashtag limits, banned
phrases, hook similarity, and the number of rewrites. The image design is the HTML in
`build the HTML template`; the caption voice is the brief built in `pick todays post`.
