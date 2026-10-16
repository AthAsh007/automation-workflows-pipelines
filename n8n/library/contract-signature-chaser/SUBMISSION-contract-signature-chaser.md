# Chase unsigned contracts listed in Google Sheets with reminder emails

**Who's it for**
Agencies, consultancies and small legal or sales teams that send contracts through any e-signature tool and track them in a Google Sheet. It does the polite chasing so the account owner only steps in when three reminders have not worked.

**How it works**
1. Every weekday at 10:00 it reads the Contracts tab, or sample contracts until a sheet is connected.
2. Rows marked signed, declined or voided are skipped. For the rest, days since the contract was sent pick the next step: reminder 1 at 3 days, 2 at 7, 3 at 12.
3. Three days after the third reminder the account owner gets one escalation email with the history. A contract is never chased twice within `MIN_GAP_DAYS`, even after a missed run.
4. Emails go out through Gmail, then Reminders sent and Last reminder are written back to the row, keyed by Contract ID.

**How to set up**
1. Run it once as imported. It previews against sample contracts and stops at `STOP: preview - nothing sent`.
2. Connect Google Sheets and put the spreadsheet id in `CONTRACTS_SHEET_ID`. The column names are listed in `COLUMNS`.
3. Connect Gmail on `Email the reminder`.
4. Put your address in `TEST_EMAIL` to receive every reminder yourself, then set `TEST_RUN = false` to email signers and update the sheet.

**Requirements**
- A Google Sheet listing contracts out for signature
- A Gmail account

**How to customize**
- `LADDER` sets the day and wording of each reminder.
- `ESCALATE_AFTER_DAYS` sets the wait between the last reminder and the owner email.
- `DONE_STATUSES` lists the Status values that stop chasing.
