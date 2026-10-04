# Evergreen partnership engine, stage 2: enrich and verify


**[the job post](https://example.com/jobs/~022093767913249678699/)**. Evergreen
Mentorship provides no-cost, Medicaid-backed telehealth mental health care to adults across
Midstate, and needs a partnership engine that gets in front of the people who make referrals:
hospital discharge planners, county job-and-family-services offices, addiction treatment
centres, community non-profits.

The full engine in the brief is six stages. **This is one of them, built end to end**, the
data half. A raw list of Midstate organisations goes in; a verified, scored, deduplicated sending
list comes out, loaded into the campaign, with everyone who was held back recorded and the
reason written next to their name.

| | Stage | Here? |
|---|---|---|
| 1 | Domains, SPF/DKIM/DMARC, 14-day warming | registrar + Instantly console work |
| 2 | **Source, enrich, verify, score, load** | **yes, [`01-enrich-and-verify.json`](01-enrich-and-verify.json)** |
| 3 | CRM pipeline + Calendly | configuration, fed by this stage |
| 4 | Email sequences and Lunch & Learn invitations | copy, written into Instantly |
| 5 | Caller queue off opens and clicks | the natural second workflow |
| 6 | Reporting and Loom SOPs | the run summary this workflow posts |

**Why this stage first.** Of the four KPIs in the brief, three are downstream of list quality
and one *is* list quality. Under 2% bounce with 100% verification is not a copywriting
outcome or a domain-warming outcome. It is one gate, in one workflow, and that gate either
fails closed or it does not. Everything else is easier to argue about on a call.

A six-minute walkthrough that runs the
whole thing with no API keys configured at all.

---

# Part 1. The plan, in plain English

*This half is written for the client. Part 2 is the setup detail.*

## What the manual version costs

Someone searches for Midstate hospitals, opens the staff page, copies a name into a sheet,
guesses an email pattern, and moves on. At a good pace that is four or five organisations an
hour. Two thousand contacts is roughly three weeks of somebody's life, and at the end of it
nobody knows which of those addresses are real. The first campaign then bounces at 8–15%,
the sending domain gets flagged, and the honest answer to "what went wrong" is "the list".

## What happens after

Rows land in a Google Sheet, from a scraper, a directory export, or someone's research. Then,
every weekday at 07:00, without anyone touching it:

1. **A batch is picked.** Twenty-five organisations, skipping anything enriched in the last
   90 days and collapsing the same place scraped twice. That cap is what makes the monthly
   tool spend predictable instead of a surprise.
2. **Each one is identified.** The website is reduced to a clean domain, and the organisation
   is placed into a segment, hospital, county office, treatment centre, non-profit,
   behavioral health provider, by keyword. The handful of names that give nothing away
   ("Southeast Healthcare") go to an AI classifier, which may only answer with a segment from
   your list and is ignored when it is unsure.
4. **The decision makers are found.** Apollo is asked for the specific titles that can make a
   referral, not for everyone in the building, at most three people per organisation.
   Addresses Apollo has not unlocked are discarded rather than sent, because those are
   guaranteed hard bounces.
5. **Every address is verified.** One by one, against a real verifier. `ok` passes.
   Catch-all, unknown, invalid, and *anything the verifier failed to answer* are held back.
6. **Everyone is scored.** Title, segment, whether there is a direct phone number, whether we
   have a real first name. A discharge planner at a hospital scores in the seventies; a
   generic "coordinator" at an unclassified organisation scores in the thirties and stays in
   the database without being emailed.
7. **The gates run.** Suppression list, shared mailboxes (`info@`, `admin@`), duplicates
   across the whole run, anything outside Midstate, anything below the score floor, and a hard
   ceiling on how many can be pushed in one run.
8. **Both tabs are written.** Every contact, held ones included, with the verdict, the score
   and the hold reason. The organisation row is updated so tomorrow's run does not repeat the
   work.
9. **Only the survivors are loaded** into the Instantly campaign, tagged by segment, with the
   merge fields the email needs to read as though it were written for one person.
9. **A summary arrives** in Slack: how many worked, how many people found, the verified rate,
   how much bounce risk was removed, and what needs attention.

## The number that matters

In the sample run in [`build/simulate.js`](build/simulate.js), real shapes, fabricated
people, fourteen addresses come out of ten organisations. Six reach the campaign. The eight
held back are held for reasons you can read: one address the verifier says does not exist, one
catch-all domain, two the verifier could not resolve, a shared `info@` mailbox, an
organisation over the Michigan line, and Evergreen's own domain.

That is the whole trick. **A 2% bounce rate is not achieved, it is arithmetic**, it is what
happens when the only addresses that get sent are the ones a verifier confirmed, and when a
verifier that times out counts as a "no".

## What you have to change about how you work

**Almost nothing.** You work in the sheet as you already do. Add rows, or point a scraper at
it. Two habits:

1. **Reply "remove me" goes into the suppression list.** One line in the config node. Nothing
   else in the system will stop contacting them.
2. **Do not overwrite `Email status` by hand.** It is the record of what a verifier said, and
   it is the thing the bounce-rate promise rests on.

## What you would need to provide

| | What we need | Why |
|---|---|---|
| 1 | **A Google Sheet**, or permission to make one | the whole database lives here, in your Drive, in plain columns |
| 2 | **An Apollo seat** with API access | the people search. A Clay account can replace it, same wiring. |
| 3 | **A verification account**, MillionVerifier, NeverBounce, ZeroBounce, Bouncer | the KPI. Around $30 for 10,000 checks. |
| 4 | **Instantly (or Smartlead) API key and a campaign id** | where the verified list is loaded |
| 5 | **Where the raw list comes from** | directory exports, county sites, an existing partner list. This is the one decision worth a call. |
| 6 | Optional: a Slack webhook, and an AI key | the morning summary; the classifier for awkward names |

Everything except item 5 is an account signup and a copy-paste.

## What it costs to run

The workflow itself runs on n8n, self-hosted, or Cloud, unchanged. Per 1,000 contacts, the
third-party cost is roughly: verification ~$3, Apollo credits per your plan, the AI classifier
under a dollar (it only runs on the names the keyword rules cannot place). The batch cap and
the per-organisation cap exist so those numbers stay where you expect.

### Worth being straight about

- **This does not invent addresses.** If Apollo has not unlocked a person's email and the
  organisation's staff page does not list one, that person is recorded as "not found" rather
  than guessed at as `firstname.lastname@`. Pattern-guessing is where bounce rates come from.
- **Catch-all domains are held, not sent.** Many hospital systems are catch-all, which means
  a verifier cannot tell a real mailbox from a typo. Sending to them is a judgment call, the
  default is not to, and `ACCEPT_STATUSES` is where you change your mind.
- **The score is a prior, not a fact.** It ranks who to call first. It does not know that the
  discharge planner at one hospital is the wrong person and the social work director is the
  right one; two weeks of replies will tell you that, and then you change the weights.
- **It will not fix a bad source.** If a scrape produces rows with no websites, the pipeline
  will faithfully report that it found nobody. The `Source` column is there so you can see
  which source that was.

---

# Part 2, setup

## The shape of it

```
config ─→ [cred] Sheets - read the raw list ─→ pick this run's batch
                                                     ↓
                                            anything to enrich? ─no─→ STOP: nothing to enrich
                                                     │yes
                                          normalise the organisation
                                                     ↓
                              AI classification needed? ─no─→ STOP: keyword rules only ─┐
                                                     │yes                               │
                        AI - classify → apply the AI classification ────────────────────┤
                                                                     one list of organisations
                                                     ↓
                                     Apollo configured? ─no─→ STOP: Apollo not configured ─┐
                                                     │yes                                  │
                    Apollo - find decision makers → read Apollo's people ──────────────────┤
                                                                          one list of contacts
                                                     ↓
                                          score against the ICP
                                                     ↓
                                  verification possible? ─no─→ STOP: unverified - held back ─┐
                                                     │yes                                    │
                   Verifier - check the address → apply the verification ────────────────────┤
                                                                            one list of verdicts
                                                     ↓
                                       decide who is safe to email      ← the gate
                                                     ↓
                          rows for the organisations tab → [cred] Sheets - update
                                                     ↓
                                   any contacts to write? ─no─→ STOP: no contacts found
                                                     │yes
                        rows for the contacts tab → [cred] Sheets - write the contacts
                                                     ↓
                                 pushing to the campaign? ─no─→ STOP: not pushed
                                                     │yes
             payload → Instantly - add to the campaign → record what was pushed → Sheets
                                                     ↓
                                          build the run summary
                                                     ↓
                                     alert configured? ─→ Post the run summary ─→ End
```

Forty-six nodes, one of which you edit.

**Two things about that diagram are load-bearing.** Every optional step has a false branch
that lands on a named `STOP:` node, so a missing key skips a step instead of failing a run.
And every split rejoins at a `one list of…` merge node, because without it a batch that
divides (some organisations need the classifier, some do not) reaches the counting and
deduplicating nodes as two separate executions, each seeing half the data, the per-run
duplicate check and the daily cap would both be quietly wrong.

## Settings

**Everything lives in the `config` node** at the head of the workflow. No environment
variables, so it runs on n8n Cloud unchanged, see [`../../docs/CONFIG-NODE.md`](../../docs/CONFIG-NODE.md).

| Setting | What it is |
|---|---|
| `SHEET_ID` | the long code in the sheet's web address, between `/d/` and `/edit` |
| `ORG_COLUMNS` / `CONTACT_COLUMNS` | your headings, exactly as they read in row 1 |
| `BATCH_SIZE` | organisations per run. 25 × three runs a day ≈ 1,500/month |
| `MAX_CONTACTS_PER_ORG` | 3. More than that out of one building reads as a blast |
| `REENRICH_AFTER_DAYS` | 90. An org already done is left alone this long |
| `DAILY_CAP` | hard ceiling on contacts pushed per run, enforced in code |
| `CATEGORY_RULES` | the segments, and the words that place an organisation in one |
| `TITLE_RULES` | who can make a referral, and what that is worth to the score |
| `EXCLUDE_TITLES` / `ROLE_PREFIXES` | billing managers and `info@` mailboxes |
| `MIN_ICP_SCORE` / `REQUIRE_STATE` | the floor, and the state licence boundary |
| `SUPPRESSION` | never contact. **This is where replies go.** |
| `APOLLO_*` | people search. Blank = use whatever the raw list already has |
| `VERIFIER_*`, `ACCEPT_STATUSES`, `RISKY_STATUSES` | the KPI. Blank = nothing is emailed |
| `HOLD_UNVERIFIED` | true. See below |
| `DEMO_VERIFIER` | demo only, forces preview. See below |
| `AI_*` | the classifier for awkward names. Blank = keyword rules only |
| `INSTANTLY_*`, `CAMPAIGN_BY_CATEGORY` | the sending engine, and a campaign per segment |
| `ALERT_WEBHOOK_URL` | Slack incoming webhook. Blank = no summary posted |
| `TEST_RUN` / `TEST_CAMPAIGN_ID` | the safety switch, below |

### The safety switch

| `TEST_RUN` | `TEST_CAMPAIGN_ID` | What happens |
|---|---|---|
| `true` | blank | **Preview**. The whole pipeline runs and both sheet tabs are written, but nothing is pushed to a campaign. Open `STOP: not pushed` to read the entire sending list with scores, verdicts and hold reasons. **Ships this way.** |
| `true` | a campaign id | **Test**, leads really are pushed, to that campaign instead of the live one. |
| `false` |, | **Live.** |

Filling in `TEST_CAMPAIGN_ID` can only ever *redirect* a push, never cause one. Going live is
the separate, deliberate act of setting `TEST_RUN = false`.

`DEMO_VERIFIER = true` gives every address a deterministic fake verdict so the pipeline can be
watched end to end before any account exists. And **forces preview whichever way the other
two are set**, because a fabricated verdict must never be able to reach a real campaign.

### Why `HOLD_UNVERIFIED` stays true

With it true, an address nobody could verify is written to the sheet and never emailed. Turn
it off and the pipeline will cheerfully load unverified addresses into a campaign, which is
how a project with a 2% bounce target posts 12% in week one and burns three domains it spent
a fortnight warming. It is one boolean, and it is the deliverable.

## Install

1. **Import** `01-enrich-and-verify.json`, n8n → Workflows → Import from File. It imports
   clean: no credentials attached, no environment variables.
2. **Make the sheet.** Import [`sheet/Organisations.csv`](sheet/) and
   [`sheet/Contacts.csv`](sheet/) as two tabs; `sheet/README.md` explains every column.
   Put the sheet id into `config`.
3. **Put rows in the Organisations tab**, File -> Import -> *Append to current sheet* with
   [`sheet/seed-organisations-demo.csv`](sheet/) (14 messy rows, for the first run and the
   video) or [`sheet/seed-organisations-midstate.csv`](sheet/) (42 real Midstate organisations, the
   production start). **Headings alone are not enough:** a tab with only row 1 returns zero
   rows, and the run ends at the Sheets node.
4. **Attach credentials** to the four `[cred]` nodes, Google Sheets OAuth2. That is the only
   n8n credential needed; the API keys live in `config`.
5. **Run it now, with everything else blank.** It will read the sheet, classify by keyword,
   fall back to any contacts already on the rows, hold everything unverified, write both tabs
   and stop at `STOP: not pushed`. Nothing has left the building. This is the state to record
   the walkthrough in.
6. **Add the verifier key** and run again. Watch `Email status` populate and the hold reasons
   change. This is the moment the bounce KPI becomes real.
7. **Add the Apollo key** and run again. Now organisations produce two or three people each.
8. **Add Instantly and a `TEST_CAMPAIGN_ID`**, run once, and check the leads landed in the
   test campaign with the right custom variables.
9. **Go live**, `TEST_RUN = false`, real campaign id, activate the schedule.

## If the run stops at "read the raw list"

A green tick on `[cred] Sheets - read the raw list` and nothing after it is not a failure , 
**it is n8n skipping every downstream node because that node returned zero items.** Almost
always the Organisations tab has nothing but a header row, or the rows were pasted into a
different tab from the one in `ORGS_TAB`.

The read node now ships with **Always Output Data** on, so an empty tab produces one empty
item, the run carries on to `STOP: nothing to enrich`, and that node says which of the two it
was. If you imported the workflow before this change, either re-import it or tick *Settings ->
Always Output Data* on that one node.

Worth knowing generally: any n8n node that returns zero items ends that branch silently. When
a run stops somewhere unexpected with no error, check the item count on the last node that
ran before looking for a bug in the next one.

## Checking a change

The Code nodes live in `build/js/` as real `.js` files and are compiled into the workflow.

```bash
cd build
python build.py       # js/*.js -> ../01-enrich-and-verify.json, and the sheet CSVs
python validate.py    # structure, branches, merges, no $env, ships safe, sheet parity
node simulate.js      # every Code node, against the sample data, with faked providers
```

`simulate.js` runs three whole scenarios and asserts on the outcomes: everything configured;
nothing configured with `DEMO_VERIFIER` on (the state the walkthrough is filmed in); and a
morning with nothing new in the sheet. It covers the duplicate hospital, the row enriched four
days ago, the row enriched in January, the empty scraped row, the locked Apollo email, the
billing manager, the `info@` mailbox, the catch-all, the invalid address, the verifier that
answers nothing at all, the organisation over the state line, the suppression hit, an AI answer
in a code fence, an AI answer that invents a segment, and a campaign that rejects a lead. It
prints the run summary exactly as it would arrive in Slack.

## Known limits

- **One verifier call per address.** Simple, and it is a per-address charge. If you are
  loading tens of thousands, switch to the verifier's bulk file API. It is cheaper and this
  workflow's shape does not change, only that one node.
- **Apollo's coverage is Apollo's coverage.** Discharge planners at small county hospitals are
  frequently absent. Those rows come out as "no contact found", which is the honest answer,
  and they are the ones worth a researcher's afternoon.
- **`Category` is a guess unless you type it.** The keyword rules place most Midstate
  organisations correctly; the classifier handles most of the rest; neither knows that a
  particular non-profit runs an inpatient unit. Typing a category into the sheet always wins.
- **Sheets, not a database.** Two people editing the same row at the same moment can still
  collide. Matching on `Contact id` rather than row number makes that rare, not impossible.
  Past roughly 20,000 contacts, move to Airtable or Postgres. The columns are already the
  right shape for it.
- **No re-verification schedule.** An address verified in March may be gone by September;
  people change jobs. `REENRICH_AFTER_DAYS` brings organisations round again, but a proper
  re-verification sweep is a second, smaller workflow.
- **The caller queue is not in here.** Opens and clicks arrive as Instantly webhooks, which is
  stage 5. A separate workflow that reads this sheet, so the two share the database and
  nothing needs to be reconciled.
