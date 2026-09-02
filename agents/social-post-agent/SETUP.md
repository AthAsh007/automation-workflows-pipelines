# Setup, `man_lin_pos`

Everything needed to stand up this one job. Hermes is assumed installed and running.

There is a sibling job, `mch_lin_pos`, set up from the `mch-linkedin-content` skill. The two
must not share a Discord channel, a log account, an approval directory, or a token file , 
§2 says why.

---

## 1. Configuration

### 1.1 Fill these in

| Placeholder | What it is | Where it comes from |
|---|---|---|
| `<HERMES_HOME>` | Hermes install root, where skills live | `echo $HERMES_HOME` |
| `<HERMES_DATA>` | Per-user state, `scripts/`, `cron/`, `data/` | normally `~/.hermes` |
| `<NODE_PATH>` | Node modules dir Playwright resolves from | normally `/usr/local/lib/hermes-agent/node_modules` |
| `<DISCORD_APPROVAL_CHANNEL_ID>` | The Acme approval channel | Discord → Developer Mode → right-click channel → Copy Channel ID |
| `<JOB_ID>` | ID of this job | **returned by** `cronjob action=create` (§4). Do not supply one |

### 1.2 Fixed for this job, use exactly these

| Setting | Value |
|---|---|
| Job name | `man_lin_pos` |
| Skill | `acme-linkedin-content` |
| Schedule | `0 8 * * 1-5` (08:00 Mon–Fri) |
| Log account column | `acme` |
| Approval dir | `<HERMES_DATA>/cron/output/linkedin_approval_acme/` |
| Token file | `<HERMES_DATA>/scripts/linkedin_org_token_acme.env` |
| Site (footer) | `acme.example` |

**Log file.** `linkedin_log.sh` writes brand as a *column* of a shared
`<HERMES_DATA>/data/linkedin_posted_log.tsv` unless `LINKEDIN_LOG_PATH` points it
elsewhere. `linkedin_context.py` reads a per-brand `linkedin_posted_log_acme.tsv` when
that file exists and otherwise filters the shared log by the brand column, so both layouts
resolve correctly. To split them, set `LINKEDIN_LOG_PATH` per job.

### 1.3 Telegram notification targets

Sent after a successful publish (§7 step 4). Format:
`NOTIFY:telegram:<chat_id>[:<topic_id>]|<message text>`

| Target | Notify string |
|---|---|
| Community Hub | `telegram:REPLACE_WITH_HUB_CHAT_ID:27` |
| Core Team | `telegram:REPLACE_WITH_CORE_CHAT_ID` |

Topic `1` is a forum group's General topic and is the default, so Core Team omits it. Keep
the Community Hub `:27`, dropping it posts to General instead of the intended topic.

### 1.4 Secrets

`linkedin_org_token_acme.env` holds `LINKEDIN_ACCESS_TOKEN` and `LINKEDIN_PAGE_ID`, mode
`600`. `LINKEDIN_PAGE_ID` is the **numeric** organization id, not the page slug, the
publisher rejects a non-numeric value rather than sending a request that 422s with no useful
message. The token needs `w_organization_social` and Community Management API approval on
the Acme page.

**Never `cat` the token file.** Presence and length are the only checks needed:

```bash
test -f <HERMES_DATA>/scripts/linkedin_org_token_acme.env && echo present
grep -c '^LINKEDIN_ACCESS_TOKEN=' <HERMES_DATA>/scripts/linkedin_org_token_acme.env   # expect 1
awk -F= '/^LINKEDIN_ACCESS_TOKEN=/{print length($2)}' \
  <HERMES_DATA>/scripts/linkedin_org_token_acme.env                                    # expect ~175-350
```

The publisher enforces the same floor: it refuses a token under 100 characters rather than
letting it fail at the API with an opaque 401.

---

## 2. Pre-flight

Every check must pass before creating the job.

```bash
hermes --version
echo "$HERMES_HOME"; echo "$HERMES_DATA"
ls <NODE_PATH>/playwright                    # expect a directory
ls <HERMES_DATA>/scripts <HERMES_DATA>/cron  # expect per-user state
node --version                               # builds and validates the template
python3 --version                            # runs the publisher
```

Plus the §1.4 token check. A missing or short token means the OAuth token expired , 
regenerate before creating the job, not after the first failed run.

**Do not reuse the MCH job's channel, log account, approval directory, or token file.** The
per-day state machine (§9) reads the log to decide whether today already has a draft or a
post; shared state makes one brand's post look like the other's and the job silently skips a
day. A shared token file publishes Acme content to the MCH page.

---

## 3. Install

### 3.1 The skill

Copy `SKILL.md`, `assets/` and `reference/` together under the Hermes skills root:

```bash
mkdir -p <HERMES_HOME>/skills/brand-content-pipeline/acme-linkedin-content
cp SKILL.md <HERMES_HOME>/skills/brand-content-pipeline/acme-linkedin-content/
cp -r assets reference <HERMES_HOME>/skills/brand-content-pipeline/acme-linkedin-content/
```

Verify. An **agent tool call**, not shell:

```text
skill_view(name='acme-linkedin-content')
```

Confirm the assets came along. A skill that loads without its logos drafts a caption and
then fails at the build step:

```bash
ls <HERMES_HOME>/skills/brand-content-pipeline/acme-linkedin-content/assets   # expect 3 SVGs
```

> `sync_tencent_snapshot.sh` will **not** mirror this skill. It matches `SKILL.md` at
> `-mindepth 2 -maxdepth 2`, and this sits one level deeper at
> `skills/brand-content-pipeline/<name>/SKILL.md`. Changes made on the live host must be
> copied back by hand. The upside is that a sync will never clobber it.

### 3.2 The scripts

```bash
cp scripts/*.js scripts/*.sh scripts/*.py <HERMES_DATA>/scripts/
chmod +x <HERMES_DATA>/scripts/render_linkedin_post.sh <HERMES_DATA>/scripts/linkedin_log.sh
```

`build_post_template.js` resolves `assets/` relative to its own parent by default, which is
wrong once it lives in `<HERMES_DATA>/scripts/`. Either pass `--assets` explicitly in the
prompt, or symlink:

```bash
ln -s <HERMES_HOME>/skills/brand-content-pipeline/acme-linkedin-content/assets \
      <HERMES_DATA>/assets
```

`render_linkedin_post.sh` and `validate_linkedin_layout.js` are brand-agnostic, they take
an HTML path and measure geometry, not brand colours. So one copy of each serves both
jobs. `build_post_template.js` is Acme-specific: its palette and layouts are the Acme
visual system.

### 3.3 The prompt

```bash
cp man_lin_pos.prompt.md <HERMES_DATA>/cron/
```

### 3.4 The token file

It ships in `token/`, deliberately not in `scripts/`, so a bulk `cp scripts/*` can never
reach it. Install it **only if nothing is there already**, overwriting a working credential
is unrecoverable:

```bash
test -f <HERMES_DATA>/scripts/linkedin_org_token_acme.env \
  && echo "EXISTS — stop, do not overwrite" \
  || { cp token/linkedin_org_token_acme.env <HERMES_DATA>/scripts/
       chmod 600 <HERMES_DATA>/scripts/linkedin_org_token_acme.env; }
```

Mode `600` is required. The publisher refuses any token file that is group or world
readable. Then run the §1.4 checks. Never `cat` it.

---

## 4. Create the job

```text
cronjob action=create
        name="man_lin_pos"
        schedule="0 8 * * 1-5"
        repeat="forever"
        deliver="discord:<DISCORD_APPROVAL_CHANNEL_ID>"
        script="linkedin_context.py --brand acme"
        skills="acme-linkedin-content"
        enabled_toolsets="web,terminal"
```

The call **returns** the job id, record it as `<JOB_ID>`.

| Parameter | Meaning |
|---|---|
| `schedule` | standard 5-field cron; `0 8 * * 1-5` = 08:00 Mon–Fri |
| `deliver` | the Acme approval channel |
| `script` | `linkedin_context.py --brand acme`, resolves today's state, prints draft history and the posted log, and is the scheduler entry point |
| `skills` | loads the writer / designer / renderer rules |
| `enabled_toolsets` | `terminal` runs the build, render and validate scripts; `web` verifies claims |

`--brand acme` is not optional. Without it the script runs in combined mode, emits both
brands' history, and prints **no state verdict at all**. The state machine in §9 silently
stops working and the job drafts over a day that already has a pending draft.

Verify:

```text
cronjob action=list job_id=<JOB_ID>
```

Expect `enabled: true`, the right schedule, and a `deliver` channel that is **not** the MCH
one.

> **The job prompt must say "deliver to Discord for approval."** If it ever says
> "auto-post", the approval gate is bypassed. That is the single most damaging
> misconfiguration in this system.

**Gate the channel first.** Discord is channel-gated; add `<DISCORD_APPROVAL_CHANNEL_ID>` to
the allow-list in `<HERMES_DATA>/config.yaml` and restart the gateway **before** creating
the job. Skipping this fails quietly: the run generates caption, spec, template and PNG,
then fails at delivery, logs `skipped … "draft generated (awaiting approval)"`, and the
state machine reads that as `AWAITING APPROVAL`. So the next day goes silent waiting on a
draft nobody ever saw. Never `#general`.

**Timing.** MCH runs at 08:30, half an hour after this job, so the two renders never
overlap. If a Acme run ever overruns 30 minutes, widen the gap rather than debugging the
race.

> **A rebuild wipes this job.** Rebuilding from a Tencent snapshot copies `jobs.live.json`
> over `jobs.json` wholesale, so any job created after that snapshot was taken is silently
> removed. Re-run this step afterwards, or refresh the snapshot once the job exists.

---

## 5. What each run does

1. **Resolve today's state** (§9). If `[SILENT]`, log the reason and exit, generate
   nothing.
2. **Select the topic**, pillar mix and sequencing rules in `SKILL.md`. Check the last
   6–10 posts and 7-day topic overlap in the log.
3. **Write the caption** → `{YYYY-MM-DD}_caption.txt`
4. **Write the visual spec** → `{YYYY-MM-DD}_spec.json`
5. **Build the template** → `{YYYY-MM-DD}_template.html`
6. **Render** → `{YYYY-MM-DD}.png`, **then validate** the template
7. **Look at the PNG** with `vision_analyze`
8. **Deliver one Discord message** and log the day as drafted

Artefacts for the day, all in `<HERMES_DATA>/cron/output/linkedin_approval_acme/`:

```
{YYYY-MM-DD}_caption.txt      caption, copy-paste ready
{YYYY-MM-DD}_spec.json        the visual spec — the editable source
{YYYY-MM-DD}_template.html    generated HTML, kept for audit
{YYYY-MM-DD}.png              rendered image
design_history.json           layout + pillar rotation state
```

---

## 6. The three commands

```bash
# 1. spec -> template. Owns palette, logo, focal element, geometry.
node <HERMES_DATA>/scripts/build_post_template.js \
  <approval_dir>/{YYYY-MM-DD}_spec.json \
  <approval_dir>/{YYYY-MM-DD}_template.html \
  --assets <HERMES_HOME>/skills/brand-content-pipeline/acme-linkedin-content/assets

# 2. template -> PNG. The 2x device scale factor is set INSIDE the script, so the
#    export is 2160x2700 from the 1080x1350 canvas. Absolute paths required.
NODE_PATH=<NODE_PATH> \
  bash <HERMES_DATA>/scripts/render_linkedin_post.sh \
    <approval_dir>/{YYYY-MM-DD}_template.html \
    <approval_dir>/{YYYY-MM-DD}.png

# 3. blocking geometric check on the template that produced that PNG.
NODE_PATH=<NODE_PATH> \
  node <HERMES_DATA>/scripts/validate_linkedin_layout.js \
    <approval_dir>/{YYYY-MM-DD}_template.html
```

**Builder exit codes:** `0` built · `1` spec rejected or rotation collision, nothing written
· `2` usage error.

| Builder output | Meaning | Fix |
|---|---|---|
| `REJECTED` | the spec breaks a rule, missing field, wrong item count, no `<em>` or more than one, inline colour, bad date | fix the **spec**, not the HTML |
| `COLLISION` | this layout or pillar repeats inside 5 publish slots | change the layout or the argument |
| `WARNING: headline line …` | the length estimate thinks it may overflow | non-blocking; the validator decides |

`--force` overrides a collision loudly and exists for re-running a genuinely cancelled day.
It is not a way to push a repeat through.

**The validator is blocking.** Acceptance: exits `0` with `OK`. It checks the 1080×1350 fit,
horizontal and vertical scroll overflow, elements outside the canvas, horizontally clipped
text, a 20px minimum font size on any element with its own text, and external references. It
does **not** check colour, brand rules are the vision pass.

Order matters: fix the spec, rebuild, re-render, **then** re-validate. The PNG on disk is
stale until the render is repeated.

**Retry policy:** up to three attempts, changing something between each. Build, render and
validate are the only stages where retrying is safe, because nothing has been published.
**No image is a failure**. After three attempts, log `skipped — render failed` and report
it. Never deliver a caption-only draft and never fall back to a generated image.

---

## 7. Approve → publish

1. A reviewer replies **`post`** in the Acme approval thread.
2. The watcher (§8) verifies the channel, confirms the reply came from a **human** and not a
   bot, and confirms this draft has not already been published. Then:

```bash
python3 <HERMES_DATA>/scripts/linkedin_org_post.py \
  --caption-file <approval_dir>/{YYYY-MM-DD}_caption.txt \
  --image        <approval_dir>/{YYYY-MM-DD}.png \
  --token-env    <HERMES_DATA>/scripts/linkedin_org_token_acme.env
```

`--token-env` is required, so the two brands cannot share a token by accident. The publisher
also refuses to run when the caption and image filenames carry different dates, a current
caption paired with a stale PNG publishes silently and looks correct in the log.

`--dry-run` (or `DRY_RUN=1`) validates the caption length, the draft dates, the token file
and the page id, then stops before the API call. Use it once per brand on first setup.

| Output | Meaning | Action |
|---|---|---|
| `POSTED:urn:li:share:…` | published | log it, then notify |
| `ERROR:…` (stderr, exit 1) | failed before or during the call | check the page and the log before anything else |

**Publishing is not retried.** Retries end when the publisher is called. On a timeout,
dropped connection, or missing `POSTED:` line, check the company page and the log to
establish whether the post went out before doing anything else, blind-retrying is how
duplicates happen. One approved draft publishes exactly once; a second `post` reply on an
already-published draft is acknowledged and ignored.

3. Log it:

```bash
bash <HERMES_DATA>/scripts/linkedin_log.sh posted acme "{YYYY-MM-DD} <topic> (with image)"
```

4. Notify the §1.3 targets, **exactly** the template below, nothing more.

### 7.1 Telegram notification template

Both targets receive the same message. The body is exactly this, including the blank lines:

```
<title in bold>

🔗 URL: <url to the post>

Please Like 👍, Share 🔗, Comment 💬 and Repost 🔁.
```

| Field | Value |
|---|---|
| `<title>` | The post's headline. The one rendered on the image. Plain text, bold applied by the formatter, no markdown characters inside it. |
| `<url to the post>` | The public LinkedIn URL, **not** the URN. |

Nothing else goes in the notification: no caption body, no hashtags, no preamble, no
"posted successfully", no image, no run details, no error output. If a field cannot be
filled, send nothing and report the problem rather than improvising a message.

**Turning the URN into a URL.** The publisher returns `POSTED:urn:li:share:<ID>`, which is
an identifier, not a link. The URN is kept **whole** and appended to a fixed base:

```bash
urn="${posted_line#POSTED:}"
url="https://www.linkedin.com/feed/update/${urn}"
```

```python
urn = posted_line.split(":", 1)[1].strip()
url = "https://www.linkedin.com/feed/update/" + urn
```

Split on the **first** colon only. The URN itself contains colons and they must all survive
into the URL. No trailing slash, query string, or fragment.

**Keep whatever URN type the publisher returned.** Normally `urn:li:share:…`, but a
company-page post can also come back as `urn:li:ugcPost:…` or `urn:li:activity:…`. The
`/feed/update/` path accepts all three. Never rewrite one URN type into another.

**Validate before sending.** All of these must hold, or send no notification and report
instead:

- the line starts with `POSTED:`
- the URN matches `urn:li:(share|ugcPost|activity):[0-9]+`
- the final URL contains no whitespace, no newline, and no leftover `POSTED:`
- the URL is exactly one line

A malformed URL is worse than a missing one. It looks published and links nowhere. Never
paste the bare `urn:li:share:…` into the notification; it is not clickable.

**CONFIRM once per deployment:**

- **The parse mode.** Bold is `*title*` under Markdown, `<b>title</b>` under HTML. The wrong
  one leaks literal asterisks or tags into the message.
- **How `NOTIFY:` encodes newlines.** The line format is single-line
  (`NOTIFY:telegram:<chat_id>[:<topic_id>]|<message>`), so a four-line message needs its
  newlines escaped and unescaped by whoever forwards it. If the pipeline cannot carry
  newlines, fix that. Do not collapse the message onto one line.

---

## 8. The approval watcher

A separate, non-cron session watches the approval thread and publishes on a matching reply.
It must key off the **channel** the reply landed in, with the MCH draft arriving 30 minutes
later, matching on reply text alone can publish the wrong brand.

**CONFIRM before relying on the schedule:**

1. How it is started, and what keeps it alive across reboots.
2. Poll interval, or whether it is event-driven.
3. Must the reply be a *threaded reply* to the bot's message, or is any channel message
   enough? Is matching case-insensitive? Is trailing text tolerated (`post please`)?
4. If the watcher is down when someone replies, is the reply picked up on restart, or is
   that approval lost?
5. Whether one watcher instance covers both brands' channels.
6. **That it ignores its own and other bots' messages.** A watcher matching on text alone
   can be triggered by the bot echoing the word `post`, self-approving a draft no human
   reviewed.
7. **That it publishes a given draft only once**, even if `post` is replied more than once.

Until these are answered, check the watcher is running before trusting the schedule.

---

## 9. Per-day state machine

A date is in exactly one of four states. `linkedin_context.py --brand acme` resolves it
and prints the verdict at the top of the run's context.

| State | Evidence | Action |
|---|---|---|
| **Nothing yet** | no `posted`/`cancelled` line today, no draft artefacts | draft it |
| **Awaiting approval** | draft artefacts present, no `posted`/`cancelled` line | `[SILENT]`. A draft is pending |
| **Posted** | `posted` line for today | `[SILENT]`, done for the day |
| **Cancelled** | `cancelled` line for today, artefacts moved aside | **draft again** |

**The log is the source of truth; file presence alone never decides.** Two rules that must
not be reintroduced:

- Draft artefacts are **not** evidence of a post, `{YYYY-MM-DD}.png` is written at draft
  time. Treating it as "output exists" makes a cancelled date unrecoverable.
- There is **no cascade rule**. "If the previous run was `[SILENT]`, this run is silent too"
  is self-perpetuating with nothing to clear it.

The log is append-only, so a rollback is a `cancelled` row appended after the `posted` one.
`resolve_state()` takes the **last decisive** row rather than letting `posted` win by
precedence, which is what makes that work. `skipped` is not decisive. It covers both "draft
generated" and "skipped, reason".

Remaining checks, all before any content is generated:

| Check | Verify |
|---|---|
| 7-day topic overlap | `grep -i "<topic>" <log path>` |
| Schedule window | `date` against `0 8 * * 1-5` |
| Job enabled | `cronjob action=list job_id=<JOB_ID>` |
| Token present + plausible length | §1.4, never `cat` it |

If a check fails, log `skipped — <reason>` and create nothing. Only a fatal condition
(missing or expired token) notifies a human.

### On `cancel`

1. Move the day's artefacts to `linkedin_approval_acme/cancelled/{YYYY-MM-DD}/`, do
   **not** leave `{YYYY-MM-DD}.png` in place, or the next pre-flight reads it as existing
   output.
2. `linkedin_log.sh cancelled acme "{YYYY-MM-DD} draft discarded"`
3. Acknowledge in the thread so the state is visible.

Note that `design_history.json` still carries the cancelled slot. The replacement draft
needs a different layout and pillar, or `--force` if it genuinely re-uses the cancelled
one's, that is what `--force` is for.

### It posted and it is wrong

1. Delete the post on LinkedIn (company page → post → Delete), or via the API using the
   returned URN.
2. `linkedin_log.sh cancelled acme "{YYYY-MM-DD} rolled back — <reason>"`. Nothing needs
   removing by hand: the log is append-only and the state machine reads the last decisive
   row.
3. Move the artefacts aside as above.
4. Post a correction in the approval thread so the record matches reality.

---

## 10. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| No draft created | job prompt says "auto-post" | fix the job prompt (§4) |
| Job silent every run, nothing pending | stale artefacts from a cancelled day | move them aside (§9); check the log, not the files |
| Job silent every run | old cascade rule still in the prompt | remove it, §9 |
| No state verdict in the context | `--brand` missing from `script` | §4, add it |
| Acme content on the MCH page | publisher read the wrong token file | §7, `--token-env` per brand |
| `REJECTED` from the builder | spec breaks a rule | read the message; fix the spec, not the HTML |
| `COLLISION` from the builder | layout or pillar repeats inside 5 slots | change the layout or the argument |
| `logo not found` | skill copied without `assets/`, or `--assets` not passed | §3.1, §3.2 |
| `Cannot find module 'playwright'` | `NODE_PATH` unset or wrong | export it; reinstall Playwright there |
| Validator reports overflow | element outside the 1080×1350 canvas | fix the spec, rebuild, re-render, **then** re-validate |
| Generic image, wrong text | an image model was used instead of the builder | use the three commands in §6 |
| Token file missing | deleted, or OAuth expired | regenerate; the draft artefacts stay valid |
| Publisher: `LINKEDIN_PAGE_ID must be numeric` | page slug used instead of the org id | use the numeric organization id |
| Publisher: token length error | expired or truncated token | regenerate, never retry a 4xx |
| Approval malformed | missing `MEDIA:` line or extra labels | match §5 step 8 exactly |
| Reply `post` did nothing | watcher down, or reply shape not matched | §8, check the watcher first |
| Reports `ok`, nothing posted | agent aborted before writing files | read the run log; resolve state per §9 **before** re-running |

---

## 11. Acceptance checklist

1. `skill_view(name='acme-linkedin-content')` returns the full skill.
2. `…/acme-linkedin-content/assets/` holds the 3 SVGs.
3. `cronjob action=list job_id=<JOB_ID>` shows `enabled: true`, schedule `0 8 * * 1-5`.
4. `deliver` points at the Acme channel, and it is **not** the MCH channel.
5. Approval dir, log and token file are the §1.2 Acme-specific ones and exist.
6. Token check passes, present, one `LINKEDIN_ACCESS_TOKEN` line, plausible length.
7. `linkedin_context.py --brand acme` prints a state verdict as its first section.
8. `linkedin_org_post.py … --dry-run` prints `DRYRUN:would post …` and exits 0.
9. A manual `cronjob action=run job_id=<JOB_ID>` produces: a caption (120–220 words, 4–6
   hashtags, ends on a question or invitation), a spec, a template, a 2160×2700 PNG
   (`file {date}.png`), a passing validator on the template that produced that PNG, a log
   line `skipped acme "draft generated (awaiting approval)"`, and one Discord message in
   the exact delivery format.
10. The approval watcher is running and covers this channel.
11. Replying `post` publishes to the **Acme** page and writes a `posted` line to the log.

---

## 12. Open questions

Resolved against the shipped scripts:

| # | Question | Answer |
|---|---|---|
| 1 | Does `linkedin_context.py` take a brand argument? | **Yes**, `--brand acme\|mch`. Per-brand mode also prints the state verdict; combined mode does not. Omitting it silently disables the state machine. |
| 2 | Does `linkedin_org_post.py` accept `--token-env`? | **Yes**, and it is required. |
| 3 | Does the spec→HTML step have a script? | **Yes**, `build_post_template.js`, in this folder. Previously the spec→HTML step was done by hand. |
| 4 | Is `linkedin_log.sh` append-only? How is a `posted` line retracted? | Append-only. Append a `cancelled` row; the state machine takes the last decisive row. |
| 5 | Does the publisher emit `DUPLICATE:`? | **No.** Older docs describe a `DUPLICATE:` response; the shipped `linkedin_org_post.py` has no duplicate check. Duplicate prevention is entirely the log plus the watcher, treat that as the only line of defence. |

Still open, and they belong to the deployment rather than to these scripts:

| # | Question | Blocks |
|---|---|---|
| 6 | How is the approval watcher started and kept alive? Can one instance cover both channels? | §8 |
| 7 | Threaded reply required? Case-insensitive? Trailing text tolerated? | §7, §8 |
| 8 | If the watcher is down, is the approval recovered on restart? | §8 |
| 9 | Telegram parse mode, and how `NOTIFY:` encodes newlines? | §7.1 |
| 10 | Which scripts honour `DRY_RUN`? | Confirmed for `linkedin_org_post.py`; unverified elsewhere. |
