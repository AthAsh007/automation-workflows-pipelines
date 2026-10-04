# The working sheet

Two tabs. Import both CSVs into one Google Sheet and put the sheet's id in the `config`
node's `SHEET_ID`. **The headings are generated from that config node** by `build/build.py`,
so they cannot drift apart. If you rename a heading, rename it in `ORG_COLUMNS` /
`CONTACT_COLUMNS` and re-run the build.

| File | Tab | Who writes it |
|---|---|---|
| `Organisations.csv` | `Organisations` | you and your scrapers add rows; the workflow updates the last six columns |
| `Contacts.csv` | `Contacts` | the workflow only |
| `Lists.csv` | `Lists` | reference values for data-validation dropdowns |

## Seed files, start here

The tabs ship empty, and **an empty Organisations tab ends the run at the Sheets node with a
green tick and no explanation**, so paste one of these in before the first run:

| File | Rows | Use it for |
|---|---|---|
| `seed-organisations-demo.csv` | 14 | the first run and the walkthrough video. Deliberately messy: a duplicate, a stale row, one with no website, one out of state, a shared `info@` mailbox, one on the suppression list. Every fabricated address is at a reserved `.example` domain, so a run with real keys cannot mail a real person by accident. |
| `seed-organisations-midstate.csv` | 42 | the real starting list, Midstate hospitals, county JFS and ADAMH boards, treatment centres, behavioral health providers, community non-profits. Contact columns are blank on purpose: Apollo fills them. |

**Google Sheets → File → Import → upload the CSV → Import location: *Append to current
sheet*, with the `Organisations` tab selected.** Do not choose "Replace current sheet" unless
you want the header row rewritten too.

The 42 rows in the Midstate list were compiled from public directories. Spot-check the websites
before a live run. A wrong domain is not dangerous (the row simply comes out as "no contact
found") but it wastes an Apollo call, and the `Source` column is there so a bad batch can be
traced back to where it came from.

Running the demo seed with no keys at all and `DEMO_VERIFIER = true` produces a four-person
sending list and six held rows, each with its reason. `build/simulate.js` asserts exactly
that, so the file cannot rot.

## Organisations, the raw list

This is the tab a scraper, a directory export or a researcher fills in. Only two columns are
really required: **Organisation** and **Website**. Everything else improves the result.

| Column | Fill it in? | What it does |
|---|---|---|
| `Org id` | leave blank | generated from the domain, so the same building is never enriched twice |
| `Organisation` | **required** | also used for classification when there is no website |
| `Category` | optional | a category typed here **overrides** the keyword rules and the AI. Use it when you know better. |
| `Website` | strongly recommended | the domain is what Apollo searches on. No domain means a weaker match. |
| `County`, `City`, `State` | recommended | `State` gates the run, `REQUIRE_STATE = 'MW'` holds anything else |
| `Phone` | optional | goes to the caller as the switchboard fallback |
| `Contact`, `Contact title`, `Contact email` | optional | only used when Apollo is not configured. A scraped staff page usually gives you these, and they are enough to run the whole pipeline. |
| `Source` | recommended | where the row came from. When a batch verifies badly, this is how you find out which source to stop using. |
| `Status` | see below | which rows this run picks up |
| `Enriched at`, `Contacts found`, `Notes` | leave blank | written by the workflow |

**Status is the control.** Only `New`, `Ready`, `Re-enrich` and blank are picked up
(`READY_STATUSES` in config). The workflow sets `Enriched` or `No contact found` when it is
done. Set a row back to `Re-enrich` to force it round again, or `Do not contact` to have it
skipped forever.

## Contacts, the output

One row per person, **including everyone held back**, with the reason in words.

| Column | What it means |
|---|---|
| `Contact id` | `<Org id>-1`, `-2`, `-3`. The workflow matches on this, so a re-run updates rather than duplicates. |
| `Email status` | the verifier's verdict: `ok`, `catch_all`, `unknown`, `invalid`, `unverified` |
| `ICP score` / `Tier` | the arithmetic in `score against the ICP`. A = 70+, X = an excluded title. |
| `Sending list` | `Yes` only if it passed every gate |
| `Hold reason` | why not, in plain words. `risky (catch_all)`, `shared mailbox, not a person`, `outside OH`, `on the suppression list`. |
| `Campaign` / `Pushed at` | filled in only when the sending engine actually accepted the lead |

Sort by `ICP score` descending and filter `Sending list = Yes` and you have the caller's list
for the day, in priority order.

## Two habits that keep it honest

1. **Put replies in the suppression list.** Anyone who says "remove me" goes into
   `SUPPRESSION` in the config node. Nothing else in the system will stop contacting them.
2. **Do not retype `Email status` by hand.** It is the record of what a verifier said. If you
   want to email somebody the verifier does not like, add them to a campaign directly and
   accept the bounce risk knowingly. Do not launder it through this sheet.
