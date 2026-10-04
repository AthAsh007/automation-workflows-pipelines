# Enquiry handling for a commercial cleaning company

Enquiries off the
website form, into the tracking sheet, first reply out instantly, in front of the right
person, chased if it goes quiet.

Two n8n workflows. No CRM, no new monthly subscription. It uses the Gmail, Google Sheets
and WordPress you already pay for.

---

# Part 1. The plan, in plain English

*This half is written for the client. Part 2 is the setup detail.*

## What happens today

Someone reads the inbox, copies the details into the sheet, works out the area, writes the
same first reply, and then it sits there until somebody remembers. Five manual steps, each
one a place where an enquiry can stall. Two to three days to a quote.

## What happens after

Someone fills in the form on your website.

**Within about ten seconds, without anyone touching it:**

1. **It lands in your sheet.** Same columns, same format, every time. The row is written
   *first* (before any email goes out) so an enquiry can never be lost because a mail
   server had a bad morning.
2. **It gets a reference.** `CE-20260831-4821`. Short enough to read down the phone.
3. **It gets an owner.** The postcode decides. `SW1A 1AA` starts with `SW`, so it is
   Priya's. `EN3 7QW` starts with `EN`, so it is Sam's. If the postcode is missing or does
   not match anything, it goes to the office rather than nowhere.
4. **The customer gets a reply** asking your three questions, square footage, how often,
   access times, with the reference on it. It comes from your Gmail and replies land back
   in your inbox as normal.
5. **The owner gets an email** with the details and the customer's message, so they know
   it is theirs before they have opened anything.

**Then, every weekday at 8:30am:**

6. **Anything that has not moved in 48 hours gets chased.** The nudge goes to whoever owns
   it, one email per person listing all of theirs, not six separate reminders. It stops
   after two, so nobody starts ignoring them.
7. **You get a one-screen summary.** How many are at each stage, and what has gone quiet
   and with whom. That is the "what stage is everything at" answer, in your inbox, before
   you have opened the sheet.

## What you have to change about how you work

Almost nothing, and that is deliberate.

**The sheet stays the sheet.** You keep working in it exactly as you do now. The
automation writes new rows in and updates a couple of cells; it never reorganises your
tabs or reformats anything. It matches rows on the reference column, not on row numbers,
so you can sort and filter freely without breaking it.

**One habit, though:** when you have quoted, won or lost a job, change the **Stage** cell.
That is what stops the chaser nagging you about it, and it is what makes the morning
summary true. It is one dropdown, and it is the only thing the system asks of you.

## Why not a CRM

You said you did not want to pay monthly for something you use 10% of, and that is the
right instinct here. A CRM would give you a pipeline view and reminders, which is what
this gives you, plus contact management, deal stages, reporting, integrations and a
per-seat bill for the rest.

The honest trade-off: a CRM gives you a proper interface, and a spreadsheet does not. If
you get to the point of three people working enquiries at once, or you want a mobile app
and call logging, revisit it. Below that, this is the cheaper and simpler answer, and
nothing here locks you in. The data stays in your own sheet, in plain columns, so moving
to a CRM later is an import, not a migration.

## What we would need from you to start

Six things. Nothing technical.

| | What we need | Why |
|---|---|---|
| 1 | **A postcode-to-person list.** Which prefixes belong to whom. | This is the only real thinking in the job, and it is the bit that lives in your heads. `SW, SE, CR → Priya. N, EN, HA → Sam.` A rough list on the back of an envelope is fine; we tidy it. |
| 2 | **Access to the Google Sheet**, or permission to add columns to it | The automation needs a consistent set of columns. We can work with your existing tab. |
| 3 | **The three questions**, in the wording you want | The ones in the brief are square footage, frequency, access times. Your words, not ours. |
| 4 | **Which Gmail account sends the replies**, and where replies should go back to | Usually the shared inbox. |
| 5 | **Access to WordPress**, or fifteen minutes with whoever has it | To point the contact form at the automation. Which plugin it is does not matter. |
| 6 | **Who gets the morning summary** | Usually you. |

That is one phone call and one email with a login. Everything else is our end.

## What it costs and how long

**Build: £950, fixed.** Not hourly. You know the number before we start.

That covers both workflows, connecting your form, setting up the sheet columns, the
postcode routing, writing and testing the emails, and running it in front of you until you
are happy.

**Timeline: about a week.** Two to three days of actual work, spread over a week so there
is room for your feedback:

| | |
|---|---|
| Day 1 | Call to get the postcode list and the question wording. Sheet columns agreed. |
| Days 2–3 | Build. Form connected. |
| Day 4 | You see it working on test enquiries. Nothing reaches a real customer yet. You read the actual emails and tell us what to reword. |
| Day 5 | Changes made, switched live, watched for the day. |
| Week 2 | We stay available for tweaks at no charge. |

**Running cost: about £0.** It runs on your own n8n, and uses the Gmail and Google Sheets
you already pay for. No per-enquiry fee, no per-seat fee.

**Optional afterwards: £75/month** for changes when you want them, new areas, new staff,
reworded emails, a report. Entirely optional, cancel any time, and most clients do not
need it after the first month.

### Worth being straight about

- **Gmail sends roughly 500 emails a day** on a standard Workspace account. Two emails per
  enquiry, plus the morning nudges, means you would need about 200 enquiries a day to get
  near it. It will not be a problem, but you should know the ceiling exists.
- **This does not write your quotes.** It gets the enquiry to the right person with the
  answers already in hand, and it stops things going quiet. The quote is still yours.
- **The chaser is only as honest as the Stage column.** If nobody updates it, the system
  will cheerfully chase a job you won last week. That is the one habit above.

---

# Part 2, setup

## The two workflows

| File | Trigger | What it does |
|---|---|---|
| [`01-capture-and-reply.json`](01-capture-and-reply.json) | the website form posts to it | reads the form, rejects spam, routes by postcode, writes the row, emails customer + owner |
| [`02-chase-and-digest.json`](02-chase-and-digest.json) | weekdays 08:30, or run by hand | nudges owners on anything quiet for 48 h, sends the morning summary |

```
form ─→ read the form fields ─→ a real enquiry? ─no─→ STOP: spam or incomplete
                                      │yes
                            assign an owner (postcode)
                                      ↓
                            write the first reply
                                      ↓
                       [cred] Sheets - log the enquiry      ← the row is written first
                                      ↓
                                  sending? ─no─→ STOP: preview - nothing sent
                                      │yes
              [cred] Gmail - reply to the customer ─→ [cred] Gmail - tell the owner
```

## Settings

**Everything lives in the `config` node**, at the head of both workflows. No environment
variables, so it runs on n8n Cloud unchanged. See [`../../docs/CONFIG-NODE.md`](../../docs/CONFIG-NODE.md).

**The `config` node is identical in both files. Change one, paste it into the other** , 
`validate.py` fails if they drift apart.

| Setting | What it is |
|---|---|
| `TRACKER_SHEET_ID` | the long code in the sheet's web address, between `/d/` and `/edit` |
| `TRACKER_TAB` | the tab name, default `Enquiries` |
| `COLUMNS` | your column headings, exactly as they read in row 1 |
| `AREAS` | the postcode-to-owner list. The one thing that needs the client |
| `FALLBACK` | who gets anything unroutable. Never leave this without an email. |
| `QUESTIONS` | the three standard questions, in their wording |
| `CHASE_AFTER_HOURS` / `CHASE_MAX` | 48 and 2 by default |
| `OPEN_STAGES` | which stages count as live and can be chased |
| `DIGEST_TO` | who gets the morning summary. Blank = no digest. |
| `TEST_RUN` / `TEST_EMAIL` | the safety switch, below |

### Postcode matching

Longest prefix wins, so a rule for `SW1` beats a rule for `SW`. Case and spaces are
ignored: `sw1a 1aa` matches `SW1A`, `SW1` or `SW`. Anything unmatched goes to `FALLBACK` —
never nowhere. If an owner has no email set, the enquiry is still logged and the customer
still gets their reply; the missing address is called out in the morning digest.

### The safety switch

| `TEST_RUN` | `TEST_EMAIL` | What happens |
|---|---|---|
| `true` | blank | **Preview**. The sheet row is written so you can watch enquiries land, but no email is sent. Open `STOP: preview - nothing sent` to read exactly what would have gone out. Ships this way. |
| `true` | `you@…` | **Test**, emails really send, but every one goes to you, subject-prefixed `[TEST -> the.real@address]`. |
| `false` |, | **Live.** |

In preview mode the row is logged at stage `New` rather than `Questions sent`, because no
questions actually went out. The sheet never claims something happened that did not.

## Install

**A step-by-step first run, with the commands, is in [TESTING.md](TESTING.md).**


1. **Import both files.** n8n → Workflows → Import from File. They import clean: no
   credentials attached, no environment variables.
2. **Fill in the `config` node** in `01`, then paste the whole block into `02`.
3. **Attach credentials** to the `[cred]` nodes: Google Sheets OAuth2 (three nodes) and
   Gmail OAuth2 (three nodes).
4. **Set up the sheet.** Row 1 needs the headings listed in `COLUMNS`. Copy them from
   [`sample/tracker-rows.json`](sample/tracker-rows.json) if starting fresh.
5. **Point the form at it.** Activate `01`, copy its **Production** webhook URL, and give
   it to the contact form plugin as a webhook or POST target. Contact Form 7, WPForms,
   Gravity Forms, Elementor and Fluent Forms all work; the parser looks for fields by name
   and falls back to matching on the *shape* of the value, so an unknown form still gets
   through.
6. **Send yourself a test enquiry** through the real form. Check the row lands.
7. **Set `TEST_EMAIL`** to your address and send another. Read both emails properly.
8. **Go live**, `TEST_RUN = false`. Activate `02` as well.

## Checking a change

The Code nodes live in `build/js/` and are compiled into the two JSON files.

```bash
cd build
python build.py       # js/*.js -> ../01-*.json and ../02-*.json
python validate.py    # connections, branches, no $env, both configs identical, ships in preview
node simulate.js      # runs every Code node against the sample payloads
```

`simulate.js` covers both workflows end to end: two real form shapes, a honeypot spam
post, postcode routing including the unroutable fallback, the stage difference between
preview and live, the 48-hour cutoff, the chase cap, the missing-owner-email flag, and a
quiet day where nothing is stalled but the digest still sends. It prints the digest and
the nudge as they would arrive.

## Known limits

- **The Stage column is the whole contract.** Nothing is chased once a row leaves
  `OPEN_STAGES`. If nobody updates it, the chaser will nag about a won job.
- **`Last touch` is only updated by this system.** A phone call that moves things along
  will not clear the nudge unless someone touches the row.
- **One owner per postcode prefix.** No round-robin, no load balancing, no holiday cover.
- **The webhook is public.** Anyone who learns the URL can post to it. The spam gates catch
  bots, but if that matters, put a shared secret in the form and check it in
  `read the form fields`.
- **Sheets, not a database.** Two people editing the same row at the same moment can still
  collide. Matching on `Ref` rather than row number makes this rare, not impossible.
