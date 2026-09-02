# Acme, redesign deliverables outreach

Emails a Singapore lead the redesign we already built for them, the two design
directions, the CRO reasoning and the SEO/GEO findings pulled straight out of the
deliverables repo. Then marks the sheet row done.

One row in, one email out, one row written back. Nothing is invented: every sentence in
a generated email is extracted from a file a human wrote, and if a human has already
written the email into the sheet, that copy is sent untouched.

```
Sheet row (Task Progress = Ready for outreach)
   ↓
Email Title / Email Content already filled in?  ──yes──→ send exactly that
   ↓ no
GitHub: client-deliverables/<domain>/
   ├── facelift-cro-and-pitch-notes.txt  → the two directions + the CRO reasoning
   └── seo-geo-tip.txt                   → 2 SEO fixes + 2 GEO fixes
   ↓
email + attached previews  →  SMTP  →  Task Progress = Completed, Contact Status = Contacted
```

## One switch: `TEST_RUN`

`TEST_RUN` is the only safety switch. `TEST_EMAIL` decides how far a test run goes.

| | `TEST_RUN` | `TEST_EMAIL` | What happens |
|---|---|---|---|
| **1. Preview** (shipped default) | `true` | blank | Nothing sent, nothing written. Every lead stops at `STOP: preview - not sent` carrying the finished `subject`, `html` and `text`. |
| **2. Test send** | `true` | `you@…` | Really sends, but only **`TEST_BATCH` leads** (1 by default) and only to **your** address, subject-prefixed `[TEST -> the.real@address]`. BCC suppressed. Sheet still untouched. |
| **3. Live** | `false` |, | Real recipients, BCC applied, row written back. |

Filling in `TEST_EMAIL` can only ever *redirect* a send, never cause one, going live is
always the separate, deliberate act of setting `TEST_RUN = false`.

The batch size differs by mode, and `build run summary` names the mode and the cap it
used every time:

| Mode | How many leads | Capped by |
|---|---|---|
| Preview | the whole batch | `DAILY_CAP` |
| Test | **1** | `TEST_BATCH` |
| Live | the whole batch | `DAILY_CAP` |

A test is for reading one real email, not for filling your inbox, so raise `TEST_BATCH`
only if you deliberately want several.

## What it does, node by node

| Stage | What happens |
|---|---|
| `config` | Every setting. No environment variables anywhere, see [../docs/CONFIG-NODE.md](../../docs/CONFIG-NODE.md). |
| `[cred] Sheets - read lead tracker` | Reads the whole tab once. |
| `pick sendable rows` | Filters, dedupes by email, sorts High → Low priority, caps the batch. Counts **every** skip reason. |
| `Loop over leads` | One lead at a time, so a single bad row cannot take the run down. |
| `[cred] GitHub - list deliverable files` | `GET /repos/{owner}/{repo}/contents/client-deliverables/{domain}?ref={branch}` |
| `pick deliverable files` | Finds the two `.txt` files and derives the design directions from the `.pdf` names. |
| `[cred] GitHub - get pitch notes` / `get seo geo tip` | Raw file contents (`Accept: application/vnd.github.raw`). |
| `build email content` | Uses the sheet's `Email Title` / `Email Content` if they are filled; otherwise parses both files and builds the subject, HTML and plain text. |
| `[cred] LLM - polish subject and intro` | **Optional**, and skipped entirely for sheet-authored copy. |
| `send this one?` | Opens for a live run or a test run; otherwise `STOP: preview - not sent`. |
| `[cred] SMTP - send deliverables` | Sends, redirecting to `TEST_EMAIL` in a test run. |
| `prepare sheet update` | Builds the write-back row, echoing back every column it is not deliberately changing. |
| `write back?` | Only a live run reaches the sheet. |
| `[cred] Sheets - update lead row` | `appendOrUpdate`, matched on the `#` column. |
| `build run summary` | The mode, who was emailed, who was skipped, and why. |

## The email

1. **Greeting.** `Hi <first name>,` when the Business Name is clearly a person
   ("David Ho (Insurance Broker)" → `Hi David,`), `Hi there,` for a firm. The test is
   deliberately strict; a wrong guess here is visible to the client.
2. **Intro** that says plainly these are *sample* redesigns, built from their public site
   unasked, and quotes the CRO diagnosis of the current site.
3. **What is attached**. A preview per direction, and the PDFs when they fit.
4. **The two directions**, named and described from `facelift-cro-and-pitch-notes.txt`.
5. **How the pitch angle was executed**. The "why we built it this way" paragraph.
6. **Two SEO fixes** and **two GEO fixes**, verbatim findings from `seo-geo-tip.txt`.
7. **What happens next**. No obligation, and an open offer of the full SEO/GEO review.
8. **Reach us**, WhatsApp, a Cal.com booking link, and the site.

HTML is table-based with inline styles and a hidden preheader; a plain-text alternative
is sent alongside it, wrapped to 78 columns.

**There is no link to the designs in the email.** There is no live redesign site, and the
deliverables repo is private, a `github.com/...` URL would show a recipient a 404. The
`Link to the redesign website` column is internal: it is where *we* find a client's files,
and it never appears in anything that is sent.

## Attachments

The designs travel with the email, because there is nothing to link to.

`MAILBOX_LIMIT_MB` in `config` is the recipient's message limit **as their provider states
it**, Gmail and Microsoft 365 25 MB, Outlook.com 20 MB, plenty of corporate gateways
10 MB. It is deliberately not the file budget: attachments are base64-encoded on the way
out, which adds about **37%**, so a 25 MB mailbox only takes ~18 MB of actual files. The
raw budget is derived, reserving 256 KB for the message body:

```
raw budget = (MAILBOX_LIMIT_MB × 1 MB − 256 KB) ÷ 1.37      # 25 MB → 18.1 MB
```

**PDFs are planned first**. They are the real deliverable, and claiming the budget for
them means a client whose PDFs fit but whose PDFs *plus* previews do not still gets the
PDFs. The desktop previews (2.3 MB median, 4.6 MB worst) take whatever is left.

**Each format is all-or-nothing.** Sending a preview of both directions but a PDF of only
one reads as carelessness, so a set that does not fit whole is left out whole.

Across the 43 client folders at a 25 MB limit:

| What is attached | Clients |
|---|---|
| PDFs + previews | 22 |
| PDFs only | 9 |
| previews only | 12 |
| **receives the PDFs** | **31 of 43** |

The 12 that miss out have PDF sets from 17 MB to 45 MB, `delta-partners.example` alone is 44.8 MB,
which is ~65 MB on the wire and no mailbox will take it. Those need a compressed PDF or a
share link.

The copy always follows what actually got attached, so the email can never promise a file
that is not there:

| | Line in the email |
|---|---|
| PDFs + previews | *"Attached: the print-quality PDF of each direction, plus a full-page preview."* |
| PDFs only | *"Attached: the print-quality PDF of each direction."* |
| previews only | *"Attached: a full-page preview of each direction. The print-quality PDFs are too large to email, say the word and we will get them to you."* |
| nothing | *"Both directions are described below. The files are too large to email..."* |

Turn either format off with `ATTACH_PDFS` / `ATTACH_PNGS`. Raising `MAILBOX_LIMIT_MB`
above what the recipient actually accepts does not help. The message just bounces.

## Which rows go out

A row is emailed only when **all** of these hold:

- `Task Progress` = `Ready for outreach` *(trimmed, case-insensitive)*
- `Email` is a real address (not `TBD`)
- `Method of Contact` mentions Email
- **either** `client-deliverables/<domain>/` exists on the configured branch with the
  pitch notes and at least one design direction, **or** the row already has its own
  `Email Content`

`<domain>` comes from the *Website / Link* column: `https://www.harbor-law.example/about`
→ `harbor-law.example`, which is exactly how the folders in the repo are named.

Everything else is counted and reported, never silently dropped.

**Both stage gates are optional.** `SEND_WHEN_TASK_PROGRESS` and `SEND_WHEN_STATUS` are
independent, and a blank one means "do not look at that column at all". As shipped the
gate is `Task Progress` only; set `SEND_WHEN_STATUS` too if you want a row to have to
clear both.

### Does `Link to the redesign website` have to be filled?

**No.** It is internal (where we find a client's deliverables) and it never appears in
an email. `REQUIRE_REDESIGN_LINK` ships `false`, so a blank one changes nothing. Set it
to `true` only if you want the column policed as a data-quality rule.

## Copy the sheet already has

`Email Title` and `Email Content` are honoured **per field**:

| Sheet cells | Subject | Body | AI pass |
|---|---|---|---|
| both blank | generated | generated | runs if configured |
| `Email Title` only | **used verbatim** | generated | skipped |
| `Email Content` only | generated | **used verbatim** | skipped |
| both filled | **used verbatim** | **used verbatim** | skipped |

A sheet-authored body is sent inside the same branded wrapper, blank lines become
paragraphs and bare URLs become links. But not one word is rewritten, and none of the
generated sections (directions, SEO, GEO, next steps) are appended to it. The AI polish
step is gated on `_copy_source === 'built'`, so it can never touch copy a human wrote.

A body under 40 characters is treated as a leftover, not as real copy.

## What gets written back

Only in a **live** run.

| Column | Sent | No deliverables in the repo |
|---|---|---|
| `Task Progress` | `Completed` | unchanged |
| `Contact Status` | `Contacted` | unchanged |
| `Next Action` | `Follow up in 3 days if no reply` | `Build deliverables for <domain> and push to <branch>` |
| `Email Title` | the subject actually sent | unchanged |
| `Email Content` | the plain-text body actually sent | unchanged |
| `Notes` | existing notes + `<date>: deliverables emailed to <address>` | existing notes + `<date>: skipped - <reason>` |

A row the repo has nothing for keeps its place in the pipeline: it gets a note and a next
action, and both stage columns are written back with the values they already had. Any of
the four target values in `config` can be blanked to leave that column alone.

**`Contact Status` is a dropdown**, so `STATUS_AFTER_SEND` has to match one of its options
exactly, same spelling, same capitalisation, no stray space. A mismatch gets flagged by
the sheet's data validation, or refused outright if it is set to *Reject input*. It ships
as `Contacted`; change it in `config` if your dropdown says something else.

Matched on the `#` column. Rename that header and you must change it in **two** places:
`config.COLUMNS.row_id` and the *Column to match on* field of
`[cred] Sheets - update lead row`.

## Getting at a private repo, the GitHub token

`website-growth-services` is private and stays private. The client never needs access to
it, and nothing in the email points at it. n8n reads the repo, downloads the previews,
and attaches them. The client receives files, never a URL.

You need a **fine-grained personal access token**, and it takes about a minute.

1. Sign in to GitHub as an account with access to `acmetechnology/website-growth-services`.
2. Go to **https://github.com/settings/personal-access-tokens/new**
   *(the click path: your avatar → Settings → Developer settings → Personal access tokens
   → Fine-grained tokens → Generate new token)*.
3. **Token name:** something you will recognise later, e.g. `n8n-outreach-read`.
4. **Resource owner:** select **`acmetechnology`**, not your personal account. This is
   the step people miss, get it wrong and the token cannot see the repo at all.
5. **Expiration:** pick a date you will actually renew. 90 days is a reasonable default;
   the workflow starts flagging every row as "no deliverables" the day it expires.
6. **Repository access:** *Only select repositories* → pick **`website-growth-services`**.
7. **Permissions** → *Repository permissions* → find **Contents** → set it to
   **Read-only**. Leave every other permission at *No access*. (Metadata: Read-only
   switches itself on and is required, that is fine.)
8. **Generate token**, then copy it. It is shown once. It starts `github_pat_`.
9. Paste it into `GITHUB_TOKEN` in the workflow's `config` node and save.

If step 4 offered no organisation, you are not a member of it, or the org requires
approval for fine-grained tokens. An org owner then has to approve the token under
*Organisation settings → Personal access tokens → Pending requests* before it works.

**Check it before you rely on it:**

```bash
curl -s -o /dev/null -w "%{http_code}
"   -H "Authorization: Bearer github_pat_xxx"   "https://api.github.com/repos/acmetechnology/website-growth-services/contents/client-deliverables/d-ho-legal.example?ref=main"
```

`200` is good. `404` means the token cannot see the repo, usually the wrong resource
owner in step 4, the wrong branch in `?ref=`, or a pending org approval. `401` means the
token is wrong or expired.

The workflow sends it as `Authorization: Bearer <token>` to `api.github.com`, and reads
file bodies through the contents API with `Accept: application/vnd.github.raw` rather
than `raw.githubusercontent.com`, precisely because the API endpoint honours that header
on a private repo. Nothing needs to be made public, and no deploy key or SSH key is
involved.

If the token is blank the run stops at `STOP: GitHub not configured` and touches nothing.
A 401 or 404 from GitHub is treated as "no deliverables for this domain": the row is
flagged, not emailed.

**The token is a credential in a Code node**, which is the one compromise in this design
(GitHub has no built-in n8n credential type covering the contents API cleanly). Keep
`workflow.json` out of anywhere it does not belong once a real token is in it; the file
in this repo ships blank, and `validate.py` fails if it is not.

## Setup

**1. Import.** n8n → Workflows → Import from File → `workflow.json`. It imports clean:
no credentials attached, no environment variables, runs on n8n Cloud unchanged.

**2. Fill in `config`.** It is the first node on the canvas and the only one you edit.

| Setting | What to put in it |
|---|---|
| `LEAD_SHEET_ID` | the id from the sheet URL, between `/d/` and `/edit` |
| `LEAD_SHEET_TAB` | the tab name, default `Lead Tracker` |
| `GITHUB_TOKEN` | the fine-grained PAT from the section above |
| `GITHUB_BRANCH` | the branch the deliverables are on (`main`, or e.g. `Acme-Redesigns`) |
| `FROM_EMAIL` / `FROM_NAME` / `REPLY_TO` | the sending identity |
| `BCC_EMAIL` | your own address, so every live send is filed |
| `SITE_URL` / `BOOKING_URL` / `WHATSAPP` | the contact block at the foot of every email |
| `MAILBOX_LIMIT_MB` | the recipient's message limit, default 25 |
| `TEST_EMAIL` | your inbox, for step 5 below. Blank means preview only. |
| `TEST_BATCH` | how many leads a test run mails, default 1 |
| `DAILY_CAP` | sends per execution, default 10 |
| `SEND_WHEN_TASK_PROGRESS` | which stage means go, default `Ready for outreach` |
| `TASK_PROGRESS_AFTER_SEND` / `STATUS_AFTER_SEND` | what a sent row becomes, default `Completed` / `Contacted` |

**3. Attach credentials** to the three `[cred]` nodes that need one:

| Node | Credential |
|---|---|
| `[cred] Sheets - read lead tracker` | Google Sheets OAuth2 |
| `[cred] Sheets - update lead row` | the same Google Sheets OAuth2 |
| `[cred] SMTP - send deliverables` | SMTP |

The GitHub and LLM nodes authenticate from `config`, so they need nothing attached.

**4. Preview.** Execute as shipped (`TEST_RUN = true`, `TEST_EMAIL` blank). Read
`build run summary`: it names everyone who *would* have been emailed and counts every
skip. Open a `STOP: preview - not sent` item and read its `text` and `html`, that is the
exact email.

**5. Test send.** Put your address in `TEST_EMAIL`, leaving `TEST_RUN = true`. One email
,  the highest-priority eligible row, lands in your inbox, subject-prefixed with who it
was meant for. Check rendering in the clients you care about, then run it again for the
next one, or raise `TEST_BATCH`. The sheet is still untouched.

**6. Go live.** Set `TEST_RUN = false`. Consider leaving `DAILY_CAP` low for the first
real run.

The schedule trigger is set to weekdays 09:00 and is inactive until you activate the
workflow; the manual trigger is there for testing.

## Optional bits, all off by default

| Setting | Blank means |
|---|---|
| `LLM_API_KEY` | no AI pass. The copy is used exactly as built. |
| `REPORT_WEBHOOK_URL` | no run report posted. |
| `ONLY_DEV` | every dev's rows. Set to `Acme` or `Scarxity` to send one person's batch. |

The AI pass rewrites **only** the subject line and the opening paragraph of a *generated*
email, and never sees a link, a tip or a direction name. A malformed response falls back
to the built copy, so the worst case is a slightly duller intro, never a wrong fact.

## Verifying a change

The Code nodes live in `build/js/` and are compiled into `workflow.json` by `build/build.py`.
Edit the `.js`, rebuild, then check and simulate:

```bash
cd build
python build.py       # js/*.js -> ../workflow.json
python validate.py    # connections, branches, no $env, no secrets, ships in preview mode
node simulate.js      # runs the Code nodes on the real CSV + real deliverables folder
```

`simulate.js` serves the GitHub calls from a local checkout
(`D:/Work/website-redesign-services/website-growth-services/client-deliverables`, or pass
another path as the first argument) and writes rendered emails to `build/preview/`.
Open a `.html` in a browser to see exactly what the client will get. It also covers the
paths that have no local stand-in: the AI polish and its fallback, `mark sent`, the
greeting heuristic, sheet-authored copy, and the test-run redirect, the last by
evaluating the SMTP node's real expressions out of `workflow.json`.

Four things the sample CSV cannot supply, which the simulator stands in and says so:
every `Email` in it is `TBD`, the *Link to the redesign website* column was added after
that export, its `Task Progress` values predate the `Ready for outreach` stage, and its
`Status` column has since been renamed `Contact Status`. The live sheet has all four.

## Known limits

- **12 of 43 clients cannot get the PDFs.** Their PDF sets are 17-45 MB, past any mailbox
  limit. They receive the previews and an offer to send the PDFs another way. Raising
  `MAILBOX_LIMIT_MB` past what the recipient accepts just bounces the message.
- **Every send downloads the files again.** Two to four files per lead, straight from the
  GitHub API each run. Fine at a `DAILY_CAP` of 10; it would want caching at a few hundred.
- **One address per row.** The sheet has one `Email` column; there is no CC of a second
  contact.
- **No reply handling.** This sends and marks the row. Replies are a separate workflow.
- **Re-sending reuses what was written.** A live send writes the generated copy back into
  `Email Title` / `Email Content`. Set that row's `Task Progress` back to `Ready for outreach` and
  it will send that stored copy verbatim rather than rebuilding it, which is usually what
  you want, but clear both cells if you want it regenerated.
- **`Task Progress` is trusted.** A row marked `Ready for outreach` whose folder was never
  pushed is flagged, not sent. But a row wrongly moved to that stage with a complete
  folder will go out.
