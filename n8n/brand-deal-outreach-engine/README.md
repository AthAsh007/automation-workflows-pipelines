# Brand deal outreach engine

Two n8n workflows for creator-partnership outreach at volume: one that writes, gates and
sends the pitches, one that works the replies and reports weekly.

Built against a brief from Northbeam, a done-for-you programme
landing paid brand deals for creators. **The post is hiring a person, not a system, and
explicitly rules out anyone who "wants to build automations".** Read
[What this is not](#what-this-is-not) before quoting it at anybody.

| File | What it does | Trigger |
|---|---|---|
| [`01-pitch-and-send.json`](01-pitch-and-send.json) | Matches brands to creators, assembles facts, writes, audits, gates on inbox health, sends, logs | Weekdays 08:00 |
| [`02-replies-and-reporting.json`](02-replies-and-reporting.json) | Classifies replies, routes them, suppresses, and produces the weekly per-creator report | Hourly |

Both ship with `TEST_RUN = true` and no credentials. **`node build/simulate.js` runs the
whole thing on this machine right now** — 72 assertions against a built-in demo roster, no
n8n and no accounts.

---

## Why this one was worth building

The post is a labour contract, but its three hard gates are unusually good specifications:

> **Proven at volume** — 10,000+ pitches/month without quality dropping. Proven, not claimed.
> **Deliverability literate** — warmup, domain health, spam are second nature.
> **Sharp written English** — pitches read human and personal from line one. Never templated.

Gates two and three are the interesting ones, because both are normally *claimed* and
neither is normally *checkable*. Here they are both enforced in code, before a send, and the
run reports exactly what they cost.

That is the whole argument this folder makes: **"personalised at volume" is not a promise
about effort, it is a set of gates that hold or do not hold**, and you can read the gates.

---

## Gate three: the personalisation audit

Facts are assembled **in code** from the brand and creator records. The model is handed that
list and told, in the system prompt, to add nothing to it. Then `audit the pitch` checks
five things and **holds** anything that fails — it never softens and sends.

| Check | Held when |
|---|---|
| enough facts | fewer than `MIN_FACTS` (3) usable details, or fewer than `MIN_BRAND_FACTS` (2) about the brand itself |
| no template tells | anything in `BANNED_PHRASES` survives into the copy |
| length | outside `MIN_WORDS`..`MAX_WORDS` (60–160) |
| real recipient | a role mailbox, a suppressed address, or an implausible one |
| **no invention** | a number in the body that does not trace back to a record |

The last one is the sharp end. A model that rounds 84,000 followers up to "nearly 100k" has
fabricated a media kit, and it is the creator's name on it. `simulate.js` proves it bites.

**A brand record too thin to say anything true produces fewer facts, not a vaguer sentence.**
That is the difference between personalisation and mail-merge: mail-merge always has
something to say. In the demo roster one brand contact in seven is a thin scraped row — a
company and a product and nothing else — and every one of them is held.

`budget_band` is deliberately **not** a fact the writer can see. It is real, and it gates the
match upstream, and telling a company what you think their budget is, is the fastest way to
lose the deal you were quoting into.

## Gate two: the deliverability gate fails closed

An inbox sends only if it can be **proved** healthy: warmed past `MIN_WARMUP_DAYS`, under
`MAX_BOUNCE_RATE`, under `MAX_SPAM_RATE`, above `MIN_HEALTH_SCORE`.

`HOLD_UNKNOWN_INBOX` ships **true**. An inbox the platform will not report on is not a
healthy one, and treating silence as a pass is how the whole thing quietly degrades. Leave
it true.

Then two ceilings, both enforced here rather than trusted to the sending platform:

- `MAX_PER_INBOX_DAY` — per mailbox
- `MAX_PER_DOMAIN_DAY` — **across every mailbox on one domain**

The second is the one people forget. Five mailboxes each politely under their own cap will
still cook the domain between them.

The demo roster has six inboxes and three of them are blocked — one still warming, one over
its bounce threshold, one whose health the platform will not report. That is what the gate
looks like when it is working, and a demo where every inbox is clean is not showing you
anything.

**Every other mistake in cold outreach is recoverable. A burnt sending domain is not, and it
takes the creator's name with it.**

## Same-day logging is a check, not an intention

> Log every pitch, reply and booked deal in the student's dashboard — accurate and same day.
> Careless or slow with logging: sloppy data breaks the whole system.

- **Held pitches are logged too**, with the reason. A log that records only successes cannot
  answer *"why did we send 180 of the 400 we planned"*, which is the first thing anybody
  asks on a Friday.
- **`confirm the log`** compares what Airtable says it wrote against what the run produced,
  and reports the difference as a **log gap**. A run that sent mail it could not log is not
  a successful run that wrote a bit less.
- Rows go **ten to a request**, which is Airtable's maximum. One request per pitch is four
  hundred requests for a normal day and rate-limits long before it finishes.
- Replies write back with `performUpsert.fieldsToMergeOn: ["Pitch id"]`, so a reply finds
  its pitch row without this workflow ever having held an Airtable record id. That is why
  the pitch id is deterministic — creator, brand, date — rather than random.

## Replies: precedence, and never guessing

The rules are ordered and the **first match wins**, which is why `unsubscribe` and `bounce`
sit above `interested`. *"The numbers are interesting but please remove me"* is an
unsubscribe, and getting that precedence wrong is a complaint, not a missed deal.

| Route | Class | What happens |
|---|---|---|
| `handover` | interested, **unclear** | a person, now, in their own message |
| `suppress` | unsubscribe, bounce | suppression list and the pitch closed |
| `reroute` | wrong person | pitch closed, brand back to the target list |
| `nurture` | not now | closed, re-pitchable after the window |
| `close` | not interested | closed |
| `ignore` | auto-reply | nothing at all |

**A reply matching nothing is `unclear`, and unclear is urgent** — it is the one most likely
to be a deal nobody recognised. It goes to a person with the same priority as an obvious
yes, and is never guessed at. The demo batch contains two of them on purpose: a classifier
demonstrated only on replies it can classify is a classifier nobody has tested.

An out-of-office writes nothing back and does not consume the follow-up. Counting it as
engagement is a small lie that compounds.

## The weekly report

> Report weekly — clean numbers so students and the team can see progress.

One block per creator, because that is how the engagement is sold. Three rules:

- **Held pitches are shown, not hidden.** They are what the quality gates cost, and the
  client can only decide whether the gates are set right if they can see the number. If 22%
  are held for thin brand records, the answer is better research on the target list, not a
  looser audit.
- **Rates divide by what was sent**, never by what was written. Dividing by the bigger
  number flatters the run and is wrong.
- **The target is pro-rata against working days in the window**, not a monthly figure
  compared against a week.

It runs off the same hourly trigger as the reply handler, behind a gate that is true for one
hour in 168. That is deliberate: two schedule triggers would need two `config` nodes, and
two config nodes disagree about a field name inside a month.

---

## Running it

### Right now, with nothing installed but node

```bash
node build/simulate.js
```

Executes every Code node unmodified against a deterministic demo roster — 6 creators, 60
brand contacts, 6 inboxes with a mixed health picture, a pitch history for the dedupe, 9
replies including two that match no rule, and a fabricated week of log for the report.

### In n8n

1. Import both JSON files. Nothing is configured; nothing will run against anything.
2. Open **config** in either. It is the same node in both files — edit both, or re-run
   `build/build.py`.
3. Press **Run it now** on `01`. With `AIRTABLE_API_KEY` blank it builds the demo roster and
   runs the whole engine. Open **STOP: not sent** to read the batch: the copy, the facts
   each pitch was built from, the inbox it would have gone from, and for every held one, why.
4. Build the Airtable base from [`sheet/`](sheet/) — four tables, headers generated from
   `config` so they cannot disagree with the workflow. Put the key and base id in.
5. `TEST_EMAIL` set → pitches really are sent, all redirected to that address, so you can
   read what a brand would get.
6. `TEST_RUN = false` → live.

`DEMO_ROSTER` on **forces preview**, whatever `TEST_RUN` says. A fabricated brand contact can
never be emailed.

---

## Files

```
brand-deal-outreach-engine/
├── 01-pitch-and-send.json          generated — do not hand-edit
├── 02-replies-and-reporting.json   generated — do not hand-edit
├── build/
│   ├── build.py        compiles js/*.js into both workflows and the table headers
│   ├── validate.py     structure, gates, secrets, gate ordering, table headings
│   ├── simulate.js     runs every Code node outside n8n against the demo roster
│   └── js/             one file per Code node, which is where the logic actually lives
├── sample/             the demo roster and reply batch, exported so you can read them
├── sheet/              the four Airtable tables, headers generated from config
```

```bash
python build/build.py && python build/validate.py && node build/simulate.js
```

---

## What this is not

**This is not an application to that job post, and the post is not a lead.** Under NOT A FIT
they list, in their own words, *"wants to coach students, close deals, or build
automations"*. Answering it with a workflow demo would be doing the thing the post says
disqualifies you. The economics do not work either — $50 per creator per month for 10,000+
pitches, deliverability management, same-day logging, reply handling and weekly reporting is
a headcount priced as a side contract.

There is a real argument underneath their choice, and it is worth taking seriously rather
than as an opening: at that volume across many creators' identities and niches, the
*personalisation is the product*, and they have judged that a human writing from a brief
beats a system filling a template. **This folder does not disagree with that.** What it
argues is narrower: the parts of the job that are *checkable* — deliverability, the
never-templated rule, same-day logging — are better enforced by a gate than by a person's
attention on the four-hundredth pitch of the day. A person writing inside those gates beats
both.

Specifically not built here:

- **The writing itself.** The model rewrites a subject and an opening line around facts
  assembled in code. It is not a substitute for someone who can write, and with no
  `AI_API_KEY` the skeleton is produced and **held**, never sent.
- **Warming and domain provisioning.** The workflow *reads* inbox health from a table you
  keep fed from your sending platform. It does not warm anything.
- **Negotiation.** An interested reply goes to a person. This never quotes, never
  negotiates, and never sends a second email off the back of a reply.
- **Brand research.** The target list is an input. The quality of `recent_signal` is the
  single biggest lever on how many pitches clear the audit, and nothing here fills it in.

Every name, number, creator, brand and reply in the demo fixtures is fabricated. Northbeam
is named because the post names them; nothing here reflects a real Northbeam system, and no
engagement exists.
