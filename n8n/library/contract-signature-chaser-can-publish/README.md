# Chase unsigned contracts listed in Google Sheets with reminder emails

Each weekday, reads a Google Sheets list of contracts out for signature, sends the signer the next reminder on a 3, 7 and 12 day ladder, escalates to the account owner after the last one, stops on signed or declined, and writes the reminder count back to the sheet.

Import `contract-signature-chaser-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Agencies, consultancies and small legal or sales teams that send contracts through any e-signature tool and track them in a Google Sheet. It does the polite chasing so the account owner only steps in when three reminders have not worked.

## How it works

1. Every weekday at 10:00 it reads the Contracts tab, or sample contracts until a sheet is connected.
2. Rows marked signed, declined or voided are skipped. For the rest, days since the contract was sent pick the next step: reminder 1 at 3 days, 2 at 7, 3 at 12.
3. Three days after the third reminder the account owner gets one escalation email with the history. A contract is never chased twice within `MIN_GAP_DAYS`, even after a missed run.
4. Emails go out through Gmail, then Reminders sent and Last reminder are written back to the row, keyed by Contract ID.

## Sections on the canvas

1. **Start and settings.** Weekdays at 10:00, so reminders land during working hours. The ladder, escalation wait and column names live in `config`.
2. **Read the contract list.** `Read contract rows` maps your headers through `COLUMNS` and drops rows without an id. `Load sample contracts` covers every rule until `CONTRACTS_SHEET_ID` is set.
3. **Pick the step and write.** Done statuses are checked first, then `MIN_GAP_DAYS`, so a signed or recently chased contract never gets another email. The step after the last reminder goes to the owner, once.
4. **Send and write back.** A test send goes to `TEST_EMAIL` and leaves the sheet alone, so the real reminder still goes later. Only a live run updates Reminders sent and Last reminder.

## Setup

1. Run it once as imported. It previews against sample contracts and stops at `STOP: preview - nothing sent`.
2. Connect Google Sheets and put the spreadsheet id in `CONTRACTS_SHEET_ID`. The column names are listed in `COLUMNS`.
3. Connect Gmail on `Email the reminder`.
4. Put your address in `TEST_EMAIL` to receive every reminder yourself, then set `TEST_RUN = false` to email signers and update the sheet.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `CONTRACTS_SHEET_ID` | `''` | Google Sheets id with a Contracts tab; blank uses sample rows |
| `COLUMNS` | `{"id":"Contract ID","company":"Company",` | column headers on the Contracts tab |
| `LADDER` | `[{"step":1,"days":3,"subject":"Quick rem` | days after sending that unlock each reminder |
| `ESCALATE_AFTER_DAYS` | `3` | days after the last reminder before the owner is emailed |
| `MIN_GAP_DAYS` | `2` | never two emails to one contract within this many days |
| `DONE_STATUSES` | `["signed","declined","voided","cancelled` | Status values that stop all chasing |
| `DAILY_CAP` | `30` | hard ceiling on emails per run |
| `SENDER_NAME` | `'Contracts team'` | sign-off on reminders |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read the Contracts tab`
- `Email the reminder`
- `Update the Contracts tab`

## Requirements

- A Google Sheet listing contracts out for signature
- A Gmail account

## Customising

- `LADDER` sets the day and wording of each reminder.
- `ESCALATE_AFTER_DAYS` sets the wait between the last reminder and the owner email.
- `DONE_STATUSES` lists the Status values that stop chasing.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 9 | none | `STOP: preview - nothing sent` |
| test send to TEST_EMAIL | 11 | `Email the reminder` | `STOP: not live - sheet untouched` |
| live from the sheet | 13 | `Email the reminder`, `Update the Contracts tab` | `Update the Contracts tab` |
