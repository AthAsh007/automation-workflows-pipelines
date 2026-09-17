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

Every weekday morning, or by hand. It reads the pipeline from **GoHighLevel** — or from the
built-in demo pipeline when no key is set — and decides, for **every** lead, one of three things:

- **Due** — quiet for long enough for the next touch, so the touch is composed and sent.
- **Waiting** — not quiet long enough yet. Nothing happens, and the report says how long is left.
- **Stopped** — and *why*: **they replied** (a person takes it from here), **the stage left the open
  list** (a won or lost job is not chased), or **the sequence is finished** (the cap). Each is a
  named reason on the node, not a silent drop.

The ladder is `SEQUENCE` in the config: touch 1 after 24 h, touch 2 after 72 h, touch 3 after
120 h, and email for the first two and SMS for the last. `MAX_TOUCHES` caps it in code, and
`OPEN_STAGES` decides which stages can still be sequenced. **One touch per lead per run**, so a
lead can never be double-touched.

```text
Run the sequence now ─┐
Every weekday 08:00 ──┐
                      └─→ config
                          └─ GoHighLevel connected?
                               ├─ no ──→ use the demo pipeline ─────────────┐
                               └─ yes ─→ [cred] GoHighLevel - read ... ────┤
                                             ├─ ok ───────────────────────┤
                                             └─ err → STOP: could not read the pipeline
                                                                         │
                                                        read the pipeline ◄┘
                                                          └─ plan the sequence
                                                              └─ anything due? ─no─→ STOP: nothing due today
                                                                     │yes
                                                                compose the next touch
                                                                     └─ sending the touches? ─no─→ STOP: preview - touches not sent
                                                                             │yes
                                                               [cred] GoHighLevel - send the touch
                                                                    ├─ ok ──→ STOP: touches sent
                                                                    └─ err ─→ STOP: GoHighLevel rejected the touch
```

## The config node

One `config` node, **identical in both files** — `build.py` regenerates both from the same
`js/config.js` and `validate.py` fails if they drift apart. It holds the location id, API key and
base URL; the pipeline id and the `STAGES` map; the `CUSTOM_FIELDS` map; `BASE_TAGS`; `OWNERS` and
the `ROUTING_RULES` table; the `SEQUENCE` ladder, `MAX_TOUCHES`, `OPEN_STAGES` and
`STOP_ON_STAGE_MOVE`; the three `SEQ_*_FIELD_ID`s that say where the sequence's counter and its
two dates live on the contact, and `PIPELINE_PAGE_LIMIT`; and the `DRY_RUN` safety switch.
Downstream nodes read `{{ $('config').first().json.<setting> }}`.

**A blank id means that step is skipped, never that the run fails** — a blank custom-field id is
left out of the payload rather than written as an empty field, and a blank key sends nothing at all.

## Run the demo (no credentials, no account)

1. Import both JSON files — n8n → Workflows → Import from File. They import clean: no credentials
   attached, no environment variables.
2. In **01**, press **Execute Workflow**. The **Run the demo lead** trigger sends three invented
   leads, one per source, through the whole thing. Open **STOP: GoHighLevel not configured** to
   read the exact contact bodies.
3. In **02**, press **Execute Workflow**. It reads the built-in demo pipeline of six invented
   leads and reports who is due, who is waiting and who stopped — open **STOP: preview - touches
   not sent** to read the exact message each due lead would receive.

## Setup (~5 minutes, when you want it to write for real)

1. In `config` (either file — then re-run `python build/build.py`): set `GHL_LOCATION_ID`,
   `GHL_PIPELINE_ID`, the `STAGES` ids, the `OWNERS` user ids and the `CUSTOM_FIELDS` ids. Set
   `GHL_API_KEY` to a Private Integration token with `contacts.write`, `opportunities.write` and
   `conversations.write`.
2. Set `SEQ_TOUCHES_FIELD_ID`, `SEQ_LAST_TOUCH_FIELD_ID` and `SEQ_LAST_REPLY_FIELD_ID` to the
   custom fields that hold the sequence's counter and its two dates — without them the live read
   sees 0 touches on every lead and nothing is chased.
3. Set `DRY_RUN = false`.
4. Run 01 once against a test lead and check the contact and its tags arrived; run 02 once and
   check the touch arrived.

## Checking a change

The Code nodes live in `build/js/` and are compiled into the two JSON files.

```bash
cd build
python build.py       # js/*.js -> ../01-*.json and ../02-*.json
python validate.py    # connections, branches, no $env, one config, both configs identical,
                      # ships in preview, failures visible
node simulate.js      # runs every Code node against the sample payloads, demo leads and demo pipeline
```

`simulate.js` covers both workflows end to end: all three intake sources, first-match routing, the
spam and unreachable gates, the demo trigger, and — for the sequence — who is due, waiting and
stopped, the stop reasons, and the message and request each touch would send.

## What this is not (say this plainly)

- **Not the six-line brief.** Intake, routing, tagging, the write, the sequence and visible failure.
  The pipeline itself, its stages and the custom fields are still the client's to configure, which
  is why the job was logged `unmatched` before this build.
- **There is no LLM in it.** "Works out what the person actually wants" is a keyword rule
  (`support` / `quote` / `demo` / `general`), not a model reading the enquiry. That is the honest
  gap and the first thing to replace: the model should fill typed fields, with the *routing and the
  score left as rules in code* so a lead it cannot classify goes to a human, not a silent guess.
- **The sequence reads the real pipeline when it can.** With `GHL_LOCATION_ID` and `GHL_API_KEY`
  set, 02 calls `/opportunities/search` and maps it to the same rows the demo pipeline produces —
  one code path either way. It reads **one page** (`PIPELINE_PAGE_LIMIT`, 100); if there are more
  opportunities than that, the plan reports `more_pages` and the total, so a partial read is never
  mistaken for the whole board. Following page 2 is the remaining work, not a silent drop.
- **Sync is one direction.** Contact → GoHighLevel. Two-way sync, and reconciling a lead that
  changed on the GoHighLevel side, are not here.
- **The sequences send through the conversations endpoint** (`/conversations/messages`), which is
  the one integration point to confirm against a live account — a sub-account can restrict which
  channels a Private Integration may send on.

## Known limits

- **The webhook is public.** The spam gates catch bots, but if that matters put a shared secret in
  the form and check it in `read the lead`.
- **Contact matching is by email or phone.** `contact_key` is the email, else the phone digits, else
  a slug of name + company — what GoHighLevel's own upsert matches on.
- **A touch is only ever advanced by the counter.** 02 reads `touches_sent` from the pipeline; if
  nothing ever writes it back after a touch, the sequence will not move on. Wiring that write-back
  is part of the setup, not optional.
- **The live read depends on the `SEQ_*_FIELD_ID`s.** GoHighLevel's opportunities carry the stage
  but not the touch counter or the dates; with those ids blank every lead reads as 0 touches, which
  is honest rather than invented — but it means nothing is chased until they are filled in.
- **One rule per lead, one touch per run.** No round-robin, no load balancing, and the demo
  pipeline's timings are the demo's, not a client's.
- **The opportunity call is built but not wired.** GoHighLevel creates a contact and its opportunity
  in two calls; the second is shown in the payload node, not sent.
