# GoHighLevel — lead intake, routing and follow-up

> **Import both files.** [`01-intake-and-routing.json`](01-intake-and-routing.json) and
> [`02-follow-up-sequence.json`](02-follow-up-sequence.json) share one `config` node, nothing
> reads `$env`, they run on n8n Cloud, and both demonstrate with **no GoHighLevel account and no
> credential at all** — the payloads are built in full and shown instead of being sent.

**Post:** *GoHighLevel CRM Specialist — Lead Intake, Pipeline Routing & Automation Sync*
(job `022099384698158202221`).

**Two workflows, still not the six-line brief.** The post is a CRM configuration job: intake,
pipeline design, custom fields and tags, routing, follow-up sequencing, sync and error handling.
That is a project. These are the two slices worth demoing first — **a lead in, routed and filed**,
and **a lead that nobody answered, followed up until it stops being a lead**. What is still not
built is named under *What this is not*, below.

## 1 of 2 — a lead in, filed and routed

A lead arrives — a form POST, a forwarded email, or a phone note somebody typed up — and:

1. **It is read whatever shape it arrived in.** The parser detects the source and pulls the same
   facts out of each: a website form (fields matched by name *or* by the shape of the value, so an
   unknown plugin still lands), a forwarded email (`from`/`subject`/`text`), or a phone note
   (`taken_by`/`caller_name`/`caller_phone`/`note`).
2. **A bot or an unreachable lead is dropped, with a reason.** A filled honeypot, an invalid
   address, or no email *and* no phone stops at **STOP: not a usable lead**.
3. **It is routed by a rule table.** First rule that matches wins — on the source, on what the
   person wants, or both — and the last rule matches anything, so a lead never lands on nobody. The
   rule sets the owner, the pipeline stage and the tags.
4. **The GoHighLevel request is built as one object you can read** — the contact upsert body *and*
   the opportunity that would follow it, in a node that sends nothing.
5. **It is written once — or shown.** With a location id and key and `DRY_RUN = false` the contact
   is created or updated; without them **STOP: GoHighLevel not configured** prints the exact body.
6. **A refused write is a visible step**, not a silent half-run.

```text
A lead arrives (webhook) ─┐
Run the demo lead ─ load a demo lead ─┐
                                      └─→ config
                                          └─ read the lead
                                              └─ a usable lead? ─no─→ STOP: not a usable lead
                                                     │yes
                                                route the lead
                                                     └─ build the GoHighLevel payload
                                                         └─ GoHighLevel connected? ─no─→ STOP: ... payload shown
                                                                 │yes
                                                   [cred] GoHighLevel - create the contact
                                                        ├─ ok ──→ STOP: filed in GoHighLevel
                                                        └─ err ─→ STOP: GoHighLevel rejected the write
```

## 2 of 2 — the follow-up sequence

Every hour, or by hand. It reads the pipeline from **GoHighLevel** — or from the built-in demo
pipeline of twelve invented leads when it is not connected — and decides, for **every** lead, one of
three things:

- **Due** — quiet for long enough for the next touch, so the touch goes into the per-lead loop.
- **Waiting** — not quiet long enough yet. Nothing happens, and the report says how long is left.
- **Stopped** — and *why*: **they replied** (a person takes it from here), **opted out** (the
  `do-not-contact` tag), **the stage left the open list** (a won or lost deal is not chased), or **the
  sequence is finished** (the cap). Each is a named reason, not a silent drop.

The ladder is `SEQUENCE` in the config: touch 1 after 24 h, touch 2 after 72 h, touch 3 after
120 h, email for the first two and SMS for the last. `MAX_TOUCHES` caps it in code, and
`OPEN_STAGES` decides which stages can still be sequenced. **One touch per lead per run**, so a
lead can never be double-touched.

Each due lead then goes through a **loop, one lead at a time** (`SplitInBatches`, batch 1, with
`PAUSE_BETWEEN_LEADS_SECONDS` between leads for GoHighLevel's rate limits). A failed GoHighLevel
call for one lead lands on **record a lead failure** and the loop carries on; the report counts it.

1. **Quiet hours and channel** (`check the sending window and channel`). The lead's local time from
   the contact's `timezone` (else `DEFAULT_TIMEZONE`); outside `SEND_WINDOW_START_HOUR`–
   `SEND_WINDOW_END_HOUR`, or on a weekend with `SEND_ON_WEEKENDS = false`, it is **waiting: quiet
   hours**. The ladder's channel is used if it can be: an email touch with no address goes by SMS,
   an SMS touch with no phone goes by email, and neither is **stopped: unreachable**.
2. **Replies and opt-outs** (`check replies and opt-outs`). The contact's conversation is read
   fresh before every touch: `GET /conversations/search?contactId=…`, then
   `GET /conversations/{id}/messages` (header `Version: 2021-04-15`). An inbound message after the
   last touch is **stopped: replied** — tagged `REPLIED_TAG` and a task created for the owner. A
   message that is only `STOP`/`unsubscribe`/… (`OPT_OUT_KEYWORDS`), or contains "remove me",
   "opt out"… (`OPT_OUT_PHRASES`), is **stopped: opted out** and tagged `DNC_TAG`; the plan never
   touches a contact carrying that tag again. Demo leads bring their own `demo_messages`.
3. **The words** (`compose the next touch` → `[cred] AI - draft the touch` → `apply the guardrails`).
   The template text (the ladder line, a greeting, and for SMS `SMS_OPT_OUT_LINE`) is always built.
   With `AI_CREDENTIAL_ADDED = true`, an OpenAI-compatible chat endpoint (`AI_API_BASE`,
   `AI_MODEL`) drafts the touch from the lead's context: service wanted, source, stage, notes, touch
   number. Code then enforces the guardrails: length per channel, no prices / amounts / percentages /
   `BANNED_WORDS` (discounts, offers, promises…), no placeholders, and an SMS must end with the
   opt-out line. AI not configured, the call failing, an unreadable reply or a broken guardrail all
   send the template instead, with `fallback_reason` recorded. **AI text that failed a guardrail is
   never sent.**
4. **Send or preview.** Only with the credential added and `DRY_RUN = false`; otherwise **keep the
   touch as a preview** shows the exact request and every write that would follow.
5. **Write back.** After a send: the `SEQ_TOUCHES_FIELD_ID` counter and `SEQ_LAST_TOUCH_FIELD_ID`
   date (`PUT /contacts/{id}`), the tags `sequence-touch-N` + `SEQUENCE_TAGS`, and a note. After the
   **final** touch: a "call this lead" task for the owner (due in `TASK_DUE_HOURS`) and the
   opportunity moved to `NURTURE_STAGE` (skipped if its id in `STAGES` is blank). A write that fails
   does not undo the send; **confirm the write-back** lists it and the report counts it.
6. **Run report.** When the loop is done, **build the run report** combines the plan's waiting and
   stopped leads with every loop outcome: sent, previewed, waiting, stopped by reason, failed, AI vs
   template. It is posted to `REPORT_WEBHOOK_URL` (Slack or Discord, detected from the URL) and
   appended to `LOG_SHEET_ID` when those are set, and always ends on **STOP: run finished**.

```text
Run the sequence now ─┐
Every hour ───────────┴─→ config ─ GoHighLevel connected?
                                     ├─ no ──→ use the demo pipeline ──────┐
                                     └─ yes ─→ [cred] read the pipeline ───┤ (err → STOP: could not read the pipeline)
                                                                read the pipeline ─ plan the sequence
                                                                  └─ anything due? ─no─→ STOP: nothing due today
                                                                        │yes
                                                       split the due leads ─→ loop over the due leads ◄────────────┐
                                                                               │ done → build the run report       │
                                                                               │        ├ post to Slack/Discord?   │
                                                                               │        ├ append to Google Sheets? │
                                                                               │        └ STOP: run finished       │
                                                    check the sending window and channel                           │
                                                      └ ready to contact now? ─no (quiet hours / unreachable)─┐     │
                                                            │yes                                              │     │
                                       read the conversation (live) / demo messages ── err ─→ record a lead failure ┤
                                                      └ check replies and opt-outs                             │     │
                                                          ├ replied / opted out → tag (+ owner task) ─────────┤     │
                                                          └ send → compose → [AI draft] → apply the guardrails │     │
                                                                     └ sending switched on? ─no─→ preview ─────┤     │
                                                                            │yes                               │     │
                                                         [cred] send the touch ── err ─→ record a lead failure ┤     │
                                                           └ fields → tags → note → final? → task → nurture    │     │
                                                                 └ confirm the write-back ─────────────────────┤     │
                                                                                     record the lead outcome ◄─┘     │
                                                                                       └ pause between leads ────────┘
```

In the demo run (no credentials): 12 leads read, 8 due. Four touches are previewed (Rachel touch 1
by email, Tom touch 2 by email, Marcus touch 3 by SMS — the final one, with the task and nurture
move listed — and Lee by SMS because he has no email), two are waiting (Ravi not due yet, Priya at
22:00 in Kolkata), six are stopped (Elena and Owen replied, Sofia texted STOP, Sam is unreachable,
June is Won, Dana is finished). AI 0, template 4, because no AI key is set.

## The config node

One `config` node, **identical in both files** (and in both `-publish.json` files), generated from
the same `js/config.js`; `validate.py` and the self-check fail if they drift apart. It holds the location id, API key and
base URL; the pipeline id and the `STAGES` map; the `CUSTOM_FIELDS` map; `BASE_TAGS`; `OWNERS` and
the `ROUTING_RULES` table; the `SEQUENCE` ladder, `MAX_TOUCHES`, `OPEN_STAGES` and
`STOP_ON_STAGE_MOVE`; the three `SEQ_*_FIELD_ID`s that say where the sequence's counter and its
two dates live on the contact, and `PIPELINE_PAGE_LIMIT`; the sending window (`DEFAULT_TIMEZONE`,
`SEND_WINDOW_START_HOUR`, `SEND_WINDOW_END_HOUR`, `SEND_ON_WEEKENDS`) and
`PAUSE_BETWEEN_LEADS_SECONDS`; the opt-out words, `DNC_TAG`, `REPLIED_TAG`, `SEQUENCE_TAGS`,
`NURTURE_STAGE` and `TASK_DUE_HOURS`; the AI writer (`AI_CREDENTIAL_ADDED`, `AI_API_BASE`,
`AI_MODEL`, `AI_TEMPERATURE`) and its guardrails (`EMAIL_MAX_CHARS`, `SUBJECT_MAX_CHARS`,
`SMS_MAX_CHARS`, `SMS_OPT_OUT_LINE`, `BANNED_WORDS`); the run report (`REPORT_WEBHOOK_URL`,
`LOG_SHEET_ID`, `LOG_SHEET_TAB`); and the `DRY_RUN` safety switch.
Downstream nodes read `{{ $('config').first().json.<setting> }}`.

**A blank id means that step is skipped, never that the run fails** — a blank custom-field id is
left out of the payload rather than written as an empty field, and a blank key sends nothing at all.

## Run the demo (no credentials, no account)

1. Import both JSON files — n8n → Workflows → Import from File. They import clean: no credentials
   attached, no environment variables.
2. In **01**, press **Execute Workflow**. The **Run the demo lead** trigger sends three invented
   leads, one per source, through the whole thing. Open **STOP: GoHighLevel not configured** to
   read the exact contact bodies.
3. In **02**, press **Execute Workflow**. It reads the built-in demo pipeline of twelve invented
   leads and works every due one through the loop — open **STOP: run finished** for the run report
   and **keep the touch as a preview** for the exact message each lead would receive.

## Setup (~5 minutes, when you want it to write for real)

1. In `config` (`build/js/config.js`, then regenerate both files — see *Checking a change*): set `GHL_LOCATION_ID`,
   `GHL_PIPELINE_ID`, the `STAGES` ids, the `OWNERS` user ids and the `CUSTOM_FIELDS` ids. Set
   a Header Auth credential (Name `Authorization`, Value `Bearer <Private Integration token>`) on every GoHighLevel node and `GHL_CREDENTIAL_ADDED = true`. The token needs `contacts.write`, `opportunities.write`,
   `conversations.readonly`, `conversations.write`,
   `conversations/message.readonly` and `conversations/message.write`. Add a
   `Nurture` stage id to `STAGES` for the end-of-sequence move.
2. Set `SEQ_TOUCHES_FIELD_ID`, `SEQ_LAST_TOUCH_FIELD_ID` and `SEQ_LAST_REPLY_FIELD_ID` to the
   custom fields that hold the sequence's counter and its two dates — without them the live read
   sees 0 touches on every lead and nothing is chased. 02 writes the counter and the last-touch date
   back after every send.
3. Optional: an OpenAI-compatible key as a Header Auth credential on **[cred] AI - draft the touch**
   and `AI_CREDENTIAL_ADDED = true`; a Slack or Discord `REPORT_WEBHOOK_URL`; a `LOG_SHEET_ID` with
   a Google Sheets credential on **[cred] Google Sheets - append the run log**. Blank skips each.
4. Set `DRY_RUN = false`.
5. Run 01 once against a test lead and check the contact and its tags arrived; run 02 once and
   check the touch, the tags, the note and the counter arrived.

## Checking a change

The Code nodes live in `build/js/` and are compiled into the JSON files.

```bash
cd build
bun simulate.js       # runs every Code node against the sample payloads, demo leads and demo pipeline
python validate.py    # connections, branches, no $env, one config, both configs identical,
                      # ships in preview, failures visible
python build.py       # js/*.js -> ../01-*.json (02 is NOT regenerated by it any more, see below)
```

`simulate.js` covers both workflows end to end: all three intake sources, first-match routing, the
spam and unreachable gates, the demo trigger, and — for the sequence — the whole demo run through
the loop (due / waiting / stopped, quiet hours, channel fallback, replies and opt-outs from the
conversation, the final touch), the AI guardrails against faked model replies (clean, too long,
prices, promises, unreadable, failed call, SMS without the opt-out line), the live conversation and
write-back responses, and the run report.

**02 was rebuilt on 2026-10-20 on a machine without Python**, so `build.py` no longer writes 02 (its
old 17-node layout is kept, disabled, for reference). The code is still in `build/js/`; the JSON was
generated with a Bun script from those files, the publish file renamed with the map in
`build/publish-spec-02.json`, and its stickies written by `bun ../tools/restyle_stickies.mjs
../tools/stickies-ghl-2026-10.json`. Port the layout into `build.py` before relying on it for 02.

## What this is not (say this plainly)

- **Not the six-line brief.** Intake, routing, tagging, the write, the sequence and visible failure.
  The pipeline itself, its stages and the custom fields are still the client's to configure, which
  is why the job was logged `unmatched` before this build.
- **The intake has no LLM in it.** In 01, "works out what the person actually wants" is a keyword
  rule (`support` / `quote` / `demo` / `general`), not a model reading the enquiry. That is the
  honest gap and the first thing to replace: the model should fill typed fields, with the *routing
  and the score left as rules in code* so a lead it cannot classify goes to a human, not a silent
  guess. 02 does use a model, but only to word a touch, behind guardrails enforced in code and
  with the template as the fallback; it never decides who is touched.
- **The sequence reads the real pipeline when it can.** With `GHL_LOCATION_ID` set and `GHL_CREDENTIAL_ADDED = true`
  set, 02 calls `/opportunities/search` and maps it to the same rows the demo pipeline produces —
  one code path either way. It reads **one page** (`PIPELINE_PAGE_LIMIT`, 100); if there are more
  opportunities than that, the plan reports `more_pages` and the total, so a partial read is never
  mistaken for the whole board. Following page 2 is the remaining work, not a silent drop.
- **Sync is one direction.** Contact → GoHighLevel. Two-way sync, and reconciling a lead that
  changed on the GoHighLevel side, are not here.
- **The sequences send and read through the conversations endpoints** (`/conversations/messages`,
  `/conversations/search`, `/conversations/{id}/messages`), which are the integration points to
  confirm against a live account — a sub-account can restrict which channels a Private Integration
  may send on, and the message shape (`direction`, `body`, `dateAdded`) is read defensively.

## Known limits

- **The webhook is public.** The spam gates catch bots, but if that matters put a shared secret in
  the form and check it in `read the lead`.
- **Contact matching is by email or phone.** `contact_key` is the email, else the phone digits, else
  a slug of name + company — what GoHighLevel's own upsert matches on.
- **A touch is only ever advanced by the counter.** 02 reads `touches_sent` from the pipeline and
  writes it back (with the last-touch date) after every send. If that write fails, the touch is
  still sent; **confirm the write-back** lists the failure and the report counts it, because the next
  run would see the old count.
- **Quiet hours need the contact's timezone.** The opportunities search may not return the
  contact's `timezone`; without it `DEFAULT_TIMEZONE` is used. The demo uses a simulated local time.
- **The AI writer is optional and fenced.** A draft is used only if it passes every guardrail; the
  rejected draft is kept on the item (`ai_draft_rejected`) for review, never sent.
- **The live read depends on the `SEQ_*_FIELD_ID`s.** GoHighLevel's opportunities carry the stage
  but not the touch counter or the dates; with those ids blank every lead reads as 0 touches, which
  is honest rather than invented — but it means nothing is chased until they are filled in.
- **One rule per lead, one touch per run.** No round-robin, no load balancing, and the demo
  pipeline's timings are the demo's, not a client's. 02 runs hourly so the sending window can be
  met in every timezone; the ladder's `after_hours` and the counter stop a lead being touched twice.
- **The opportunity call is built but not wired.** GoHighLevel creates a contact and its opportunity
  in two calls; the second is shown in the payload node, not sent.

## Resubmission changes (2026-10-16)

The first submission was rejected in human review. The `-publish.json` files were regenerated with
`library/_kit/republish.ts` and checked with `library/_kit/diff.ts` (identical logic apart from the
renames below). What changed:

- **No API key in the HTTP nodes.** The GoHighLevel nodes now use an n8n Header Auth credential.
  `GHL_API_KEY` is gone from `config`; `GHL_CREDENTIAL_ADDED = false` replaces it.
- **Node names follow n8n's naming guidance**: verb first, sentence case, no `[cred]` prefix
  (`read the lead` is now `Read the lead from any source`). The working files keep the old names.
- **No generic `End` sink.** Every branch already ends on a named `STOP:` node; the shared `End`
  dragged long edges across the canvas.
- **Sticky notes** are laid out the way n8n's template 13868 does it: one section sticky around its
  nodes with room for the heading, the yellow description to the left. Nothing overlaps, no
  connection is drawn through a node, and the copy has no em dashes.

## Rebuild of 02 (2026-10-20)

n8n rejected *Send follow-up touches to quiet leads in GoHighLevel* (17 nodes) as "too basic to meet
our publishing criteria". 02 is now **49 nodes in eleven sections**, published as *Send AI follow-up
email and SMS touches to quiet leads in GoHighLevel*. Everything it did is kept (live or demo
pipeline, due / waiting / stopped with named reasons, the `SEQUENCE` ladder, `MAX_TOUCHES`,
`OPEN_STAGES`, one touch per lead per run, preview mode that sends nothing), and it adds:

- a per-lead loop with a pause between leads, and a counted failure path so one lead never stops the rest
- a fresh reply / opt-out check from the GoHighLevel conversation before every touch
- quiet hours and weekends per lead timezone
- channel choice with fallback (email ↔ SMS, unreachable when neither)
- an AI-drafted touch with code guardrails and the template as the named fallback
- write-back after a send (counter, date, tags, note) and, after the final touch, an owner task and a move to nurture
- a run report to Slack / Discord and a Google Sheet, both optional

Also fixed on the way: the old 02 fed the single plan item straight into "compose the next touch",
so a live run would have built one empty touch instead of one per due lead; the new **split the due
leads** node makes it one item per lead. Demo timestamps are now full ISO, and a zone-less date is
read as UTC, so the demo decides the same way on any server timezone.

Both `-publish.json` files now carry stickies to n8n's Creator-hub rules (one yellow `color: 1`
overview with `### How it works` and `### Setup`, white `color: 7` section notes under 50 words),
written by `tools/restyle_stickies.mjs` from `tools/stickies-ghl-2026-10.json`.
