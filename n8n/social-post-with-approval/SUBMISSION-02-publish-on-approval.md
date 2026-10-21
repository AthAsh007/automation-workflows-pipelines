# Publish Discord-approved posts to LinkedIn with edits and token alerts

**Who's it for**
Teams using the companion drafting workflow who need approved drafts published to a LinkedIn
company page, need reviewers to be able to fix a caption without leaving the chat, and need to
hear about it when publishing silently stops working.

**How it works**
Every five minutes it reads the log. A draft is open until a later row with the same message id
closes it. An open draft past its approval window is closed as **expired** and never published.
Most runs find nothing open and stop there, quietly.

When a draft is open, it reads the Discord channel. Only a human's message after the draft
counts. The bot's own messages, other bots and chatter are ignored, and replies already acted on
are skipped. `post` and `cancel` must be the whole message, so "do not post" is never an
approval. `edit` on the first line, with a new caption below it, is an edit.

An **edit never publishes**. It is checked against the same caption rules as the drafting
workflow. If it passes, the bot re-sends it with the original image as a new draft that needs its
own `post`, and the old one is closed as superseded. If it fails, the bot replies with the reasons
once, and the original draft stays open.

On `post` it confirms the message has not been edited since delivery (fingerprint and Discord's
edit flag), then publishes through the LinkedIn REST API: register the image upload, PUT the
bytes, create the post. The first call publishes nothing and runs with `neverError`, so an expired
or revoked token is caught there and posted as **one alert** in the channel (repeated at most every
six hours). The approval stays open, so after the token is refreshed it publishes without anyone
approving twice. The publish call itself never retries: a timeout may have succeeded, and a retry
would post twice.

The post URN is written to the log and the bank row is marked posted. Once a week it posts a report
built from the log: what was published, cancelled, expired, edited or refused, the median time to
approval, and per-post LinkedIn statistics if your app has access to them.

**How to set up**
1. Import and click **Execute workflow**. With `SHEET_ID` blank it plays a demo reply
   (`DEMO_REPLY`: `post`, `cancel`, `edit` or `bad-edit`) against a demo log, with no credentials.
2. Paste the same `config` as the drafting workflow.
3. Connect Google Sheets and Discord, and add a LinkedIn token with `w_organization_social` and
   your organisation URN.
4. Keep `TEST_RUN = true` until a full approval cycle ends at `STOP: not published`.

**Requirements**
A LinkedIn company page with API access, the Google Sheet and Discord channel used by the drafting
workflow. Slack is optional. Post statistics need `r_organization_social` (Community Management API
approval); without it the weekly report is built from the log alone.

**How to customize**
Approval, cancel and edit words, the approval window, alert spacing, and the report day and hour
are constants in `config`. The gate is `read the approval reply`; read it before changing anything.
