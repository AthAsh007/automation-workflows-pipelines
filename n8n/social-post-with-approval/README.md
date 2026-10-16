# Acme LinkedIn daily

The `workspace/tutorials` LinkedIn pipeline, as two n8n workflows.

Every weekday at 08:00 it picks the next post from the bank, writes or reads its caption,
renders the 1080×1350 image from HTML, and puts the draft in Discord. A human replies
`post`, and it publishes to the company page. Nothing publishes without that reply.

| | |
|---|---|
| [`01-draft-and-approve.json`](01-draft-and-approve.json) | 48 nodes. Weekdays 08:00 + manual. Draft → render → Discord. **Never publishes.** |
| [`02-publish-on-approval.json`](02-publish-on-approval.json) | 36 nodes. Every 5 min + manual. Reads the reply → publishes → logs. |

**It ships in PREVIEW and runs end to end with no credentials at all.** Import both, hit
*Execute Workflow* on 01, and open the render node's output: there is a real PNG in it,
built from the demo bank in `config`. Nothing was sent anywhere.

---

## What it replaces

`workspace/tutorials/scripts/hermes-job-setup` describes the same pipeline as a Hermes cron
job driven by a 71 KB markdown skill file. Everything it does is here, with three
differences that are worth stating plainly:

| | Hermes job | This |
|---|---|---|
| The image | Playwright inside the agent's host | one HTTP call to a renderer |
| The approval watcher | a long-lived process somebody has to keep alive across reboots, **open question #1 in that doc, never closed** | a 5-minute poll, so there is nothing to keep alive |
| Where the content lives | the agent writes each post from the skill's rules | a bank in a sheet, with the model filling in only what is missing |

The layout engine is a **port of `render/build.js`**, not a reimplementation.
`build/simulate.js` renders all sixteen banked posts through both and asserts the HTML is
byte-identical. That check is the reason the port is trustworthy, and it runs in two
seconds.

What is deliberately **not** carried over: the MCH brand. The two brands never share a
channel, log, token or asset, and the way to add MCH is a second copy of this folder with
its own config, not a brand switch inside this one. A brand argument is a thing that can be
got wrong; a separate workflow is not.

---

## Setup

### 1. Import

Both JSON files. n8n → Workflows → Import from File. Nothing has a credential attached;
every node that needs one is prefixed `[cred]`.

### 2. A renderer

n8n has no browser. Add Browserless to the same `docker-compose.yml` n8n runs in:

```yaml
  browserless:
    image: ghcr.io/browserless/chromium:latest
    restart: unless-stopped
    environment:
      - CONCURRENT: 2
      - TOKEN: ${BROWSERLESS_TOKEN}
    networks: [ default ]
```

Then in `config`: `RENDER_URL = 'http://browserless:3000'` and `RENDER_KEY` = that token.
It does not need to be published to the internet, n8n reaches it over the compose network.

> **Queue mode.** This instance runs Docker Compose in queue mode, so Code nodes execute on
> the *worker* containers. Browserless must be on the network the workers can reach, not
> just the main `n8n` container. This is exactly the failure the `config`-node rule exists
> to avoid for env vars, and it applies to service hostnames too.

htmlcsstoimage.com works as a hosted alternative, set `RENDER_PROVIDER = 'hcti'` and fill
in `RENDER_USER` / `RENDER_KEY`. It is the same two fields either way.

### 3. The logo

Paste the contents of `render/acme_logo_12.svg` into `LOGO_SVG` in `config`. The renderer
loads the HTML with no network, so the SVG has to travel inline. A file path or a URL is a
blank space in a published image.

Leaving it blank does not silently degrade: `validate the layout` blocks the render and says
why. That is on purpose. A missing logo must look missing.

### 4. The sheet

Two tabs, headings exactly as in [`sheet/Bank.csv`](sheet/Bank.csv) and
[`sheet/Log.csv`](sheet/Log.csv). Import [`sheet/seed-bank.csv`](sheet/seed-bank.csv) into
**Bank**. That is the real draft bank, all sixteen posts, exported from the drafts repo by
`build/export_bank.js` rather than retyped. Slots 1–8 arrive marked `posted` because they
are already live; the workflow will never re-draft them.

Put the spreadsheet id in `SHEET_ID`. Leave it blank and the demo bank in `config` is used
instead, which is how the whole thing demos with no Google account.

| Tab | What it is |
|---|---|
| **Bank** | One row per post, in publish order. `Items` is a JSON array whose shape depends on `Layout`. `State` is `ready` until it goes out. |
| **Log** | Append-only. **The source of truth for what has happened.** Never edited by the workflow, only appended to. |

### 5. Discord

A **private** channel, created for this and nothing else.

> Anyone who can send a message in that channel can publish to the company LinkedIn page.
> The workflow has no idea who you are or whether you meant it. Treat send-permission there
> as equivalent to page publishing rights. And never repurpose a general channel, where
> somebody typing a common English word publishes a draft.

The bot needs View Channel, Send Messages, **Attach Files**, Embed Links and Read Message
History. Put the channel id in `DISCORD_CHANNEL_ID`.

**One manual step the JSON cannot carry:** on `[cred] Discord - deliver the draft`, set the
node's **Files** option to the binary property `data`. Without it the draft arrives with no
image and the reviewer approves a post they cannot see.

### 6. LinkedIn

`LINKEDIN_ORG_URN` is already the Acme page. `LINKEDIN_ACCESS_TOKEN` needs a token with
`w_organization_social`.

`LINKEDIN_VERSION` is `202608`. Versions are retired on a rolling basis, `202512` and
earlier already return HTTP 426, and when this one goes the same way the failure says so by
name rather than looking like an auth problem.

### 7. Going live

Two separate acts, in this order:

1. `TEST_CHANNEL_ID = '<a test channel>'` → drafts are delivered there. **Still cannot
   publish.**
2. `TEST_RUN = false` → the live channel, and an approval there publishes.

Filling in a test channel can only ever *redirect* a delivery. Going live is the second,
deliberate act. Both workflows must carry the same `config` — `validate.py` fails the build
if they drift, because one in preview and one live is a pipeline that drafts every morning
and then refuses to publish.

---

## How a day actually goes

```text
08:00  workflow 01
       ├─ read the log ──> resolve todays state
       │                     nothing yet? draft. posted, or already awaiting? silent.
       │                     cancelled today? draft AGAIN.
       ├─ pick todays post   lowest ready slot, then three guards:
       │                     layout repeat, pillar repeat, Design-process-on-a-Thursday
       ├─ caption            from the bank, or written by the model if the cell is empty
       │                     checked either way: length, hashtags, banned phrases
       ├─ build the HTML ──> validate the layout ──> render ──> check the PNG bytes
       └─ Discord            caption + image, and nothing else
                             then one `awaiting` row in the log

…       workflow 02, every 5 minutes
        ├─ nothing awaiting? stop. (this is most executions, and it is correct)
        ├─ read the channel, find the reply
        │    only after the draft · never the bot's own · never another bot's
        │    whole-message match · first decision wins
        ├─ post   ──> re-verify the draft is unchanged ──> 3 LinkedIn calls ──> log posted
        ├─ cancel ──> log cancelled. The bank row stays `ready`.
        └─ neither ──> wait
```

### The four states

A date is in exactly one of them, and **the log decides, never the presence of a rendered
image**:

| State | Evidence | Action |
|---|---|---|
| Nothing yet | no row for today | draft it |
| Awaiting | an `awaiting` row today | silent. One is already in front of a human |
| Posted | a `posted` row today | silent, done for the day |
| Cancelled | a `cancelled` row today | **draft again** |

Two rules that must not be reintroduced, both carried over from the Hermes setup doc:

- **A rendered image is not evidence of a post.** It is written at draft time. Treating
  "output exists" as "already posted" makes a cancelled day unrecoverable.
- **There is no cascade rule.** "The last run was silent, so this one is too" is
  self-perpetuating with nothing to clear it.

`build/simulate.js` asserts both.

---

## The approval gate

`read the approval reply` is the node that matters. Every rule in it is a refusal:

| Rule | Why |
|---|---|
| Only messages after the draft | anything already in the channel cannot be a reply to it |
| Never the bot's own message | it posted the draft. That is the system agreeing with itself |
| Never another bot | a second automation is not a second opinion |
| Whole message only | substring matching makes **"do not post"** an approval |
| First decision wins | a cancel is not reopened by a later `post` |

The bot's identity is taken from the author of the draft message itself, not from a
configured id. There is nothing to fill in and nothing to get wrong.

Then, before publishing, `the approved draft` re-reads the message and refuses if anything
changed: the caption is taken **from the Discord message**, not from the bank, because the
message is what the human actually read; a fingerprint written at draft time proves it has
not been edited since; and the image is the attachment on that same message.

All ten refusals and all four freeze checks are asserted in `simulate.js`.

---

## Working on it

```bash
cd build
node simulate.js            # 54 checks, no network, ~2s
node simulate.js --render   # + a real Chrome screenshot into sample/preview.png
python build.py             # js/*.js  ->  ../01-*.json, ../02-*.json
python validate.py          # structure, connections, the safety switch
node export_bank.js         # regenerate sheet/seed-bank.csv from the drafts repo
```

The Code nodes live in `build/js/` as real `.js` files. **Nothing is hand-edited in the
JSON**, `build.py` compiles it, and editing the JSON directly loses the change on the next
build.

`simulate.js` runs the actual node bodies through a small n8n shim; it is not a second copy
of the logic. If you change a rule, the check that covers it should fail before you look at
anything else.

---

## Known limits

Stated rather than discovered later:

- **The poll is five minutes.** An approval waits up to that long. Faster costs an execution
  every minute for a channel that is used once a day; a Discord trigger node would be
  event-driven but needs an app with an interactions endpoint, which is more surface than
  this earns.
- **The caption cannot exceed 2000 characters**, Discord's message limit. Over that the
  draft is held rather than split or truncated. At 120–220 words this has room, but a
  bulleted caption with long lines gets close.
- **`validate the layout` cannot see pixels.** It checks what is decidable from the source.
  The two defects that shipped in the first round were both invisible in the HTML and
  obvious in the image, which is why a human still looks at the PNG in Discord. This
  narrows what reaches them; it does not replace them.
- **No image-model fallback, on purpose.** This canvas is a logo, a headline and small body
  copy, which is exactly what an image model cannot be trusted with. A failed render is a
  failure.
- **One brand.** MCH is a second copy of this folder, not a switch in this one.
- **The Discord Files option is a manual step** after import. n8n's Discord node stores that
  binding in a way the exported JSON does not reliably carry.
