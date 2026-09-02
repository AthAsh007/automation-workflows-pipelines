# The tracking sheet

Three CSVs, generated from the `config` node's column list so the sheet and the workflow
can never disagree about a heading. `validate.py` fails if they drift.

| File | Becomes | Why |
|---|---|---|
| `Enquiries.csv` | the **Enquiries** tab | the tracker itself. Headings only. The workflow fills it. |
| `Lists.csv` | the **Lists** tab | the options behind the Stage / Area / Owner dropdowns |
| `Areas.csv` | the **Areas** tab | the postcode-to-person list. Fill this in with the client, then copy it into `config`. |

## Naming it

Two names, and only one of them matters to the workflow.

**The spreadsheet file: `Enquiry Tracker`.** Free choice, n8n addresses the file by its
id, not its name, so this can be renamed any time without breaking anything. Keep it plain
and searchable; it will be shared, and it will be hunted for in Drive by someone in a
hurry. If you keep a copy alongside other clients', use `Enquiry Tracker — <Client>`.

Avoid dates, `v2`, `final`, `copy of` and anyone's initials. It is a living document, so
anything that implies a version will be wrong within a week.

**The tab: `Enquiries`. This one is load-bearing.** It has to match `TRACKER_TAB` in the
`config` node exactly, including capitalisation. Rename the tab and both workflows stop
finding it; if you do rename it, change `TRACKER_TAB` in the same breath.

Same for `Lists` and `Areas`, though those two are only read by humans.

## Import, about five minutes

1. New Google Sheet → **File → Import → Upload → `Enquiries.csv`**.
   Import location: **Replace spreadsheet**. Separator: Detect automatically.
2. Rename the tab to **Enquiries** (it will import as `Enquiries` already if the file
   name is kept).
3. **File → Import → Upload → `Lists.csv`**, location **Insert new sheet**. Rename to
   **Lists**.
4. Same again for `Areas.csv` → **Areas**.
5. **View → Freeze → 1 row** on the Enquiries tab.
6. Copy the sheet id out of the address bar. The long code between `/d/` and `/edit` —
   and paste it into `TRACKER_SHEET_ID` in the `config` node of **both** workflows.

That is enough for it to run. The three below take another five minutes and make it far
nicer to live in.

## Worth doing: the Stage dropdown

This is the one column a human has to keep honest. It is what stops the chaser nagging
about a job you already won.

- Select column **C** on Enquiries (click the header), then **Data → Data validation →
  Add rule**
- Criteria: **Dropdown (from a range)** → `Lists!A2:A9`
- Tick **Show a warning** rather than *Reject the input*, so a stage the workflow writes
  can never be bounced

Do the same for **Area** (column K → `Lists!B2:B7`) and **Owner** (column D →
`Lists!C2:C4`).

## Worth doing: colour the ones going cold

Enquiries → select `A2:T1000` → **Format → Conditional formatting → Add another rule** →
*Custom formula is*:

```
=AND($C2<>"Won", $C2<>"Lost", $C2<>"Not for us", $Q2<>"",
     NOW()-IFERROR(DATEVALUE(LEFT($Q2&"",10)), $Q2) > 2)
```

Set a soft amber fill. `$Q` is **Last touch** and `> 2` is two days, so the sheet shows
you the same thing the 48-hour nudge acts on. Change `2` to match `CHASE_AFTER_HOURS / 24`
if you move it.

The `IFERROR` is not decoration. The workflow writes **Last touch** as plain text
(`2026-08-31 09:14`) so it reads back the same way in every locale; if someone later
formats that column as a date, the cell becomes a number instead. `DATEVALUE` handles the
text, and the fallback handles the number, so the rule keeps working either way.

## Worth doing: the Areas tab

`Areas.csv` ships with a placeholder London split. **This is the one thing that needs the
client**, and it is the only real thinking in the job, "works out roughly what area it is
in" means the rule lives in someone's head rather than written down.

Send them the Areas tab and ask them to fill in the owner and email for each prefix, add
any that are missing, and delete the ones they do not cover. Then transcribe it into the
`AREAS` list in the `config` node.

Longest prefix wins, so you can have a general `SW → Priya` rule and a specific
`SW1 → Sam` exception; `SW1A 1AA` matches the `SW1` rule. Anything unmatched goes to
`FALLBACK`, give that an email, or those enquiries get logged and answered but nobody is
told they exist.

## The columns

| Column | Written by | Notes |
|---|---|---|
| Ref | workflow | `CE-20260831-4821`. The key every update matches on, **do not edit or reorder**. |
| Received | workflow | when the form was submitted |
| **Stage** | **you** | the only column the automation needs a human to maintain |
| Owner / Owner email | workflow | from the postcode. Overwrite by hand to reassign. |
| Company ... Premises | workflow | straight off the form |
| What they said | workflow | their message, trimmed at 4000 characters |
| **Sq ft / Frequency / Access** | **you** | the answers to the three questions, when they reply |
| Last touch | workflow | drives the 48-hour nudge |
| Chases sent | workflow | stops at `CHASE_MAX`. Set to 0 to let it chase again. |
| Next action | workflow | a one-line reminder, shown in the nudge |
| Notes | both | the workflow appends a dated line each time it chases |

You can add your own columns to the right of Notes. The workflow only touches the ones it
knows and leaves everything else alone.
