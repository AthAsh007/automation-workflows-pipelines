# Route time-off requests from a form to managers with approve and decline links

**Who's it for**
Teams of 10 to 150 people who approve leave over chat and track it in a spreadsheet. Managers get the facts with each request and decide with one click, and the sheet stays the record.

**How it works**
1. An employee submits the n8n form with type and dates. Working days are counted without weekends or `PUBLIC_HOLIDAYS`.
2. It reads the Employees and Requests tabs (or sample data), works out the allowance left this year, checks `BLACKOUT_PERIODS` and lists teammates already off on those days.
3. Impossible requests (unknown email, dates in the past, over allowance) are refused by email with the reason. The rest are saved as pending and the manager gets approve and decline links.
4. A click hits the second trigger, `Manager decision link`. The token and status are checked, the row is updated and the employee is told the outcome.

**How to set up**
1. Run it once as imported. It checks a sample request and stops at `STOP: preview - nothing stored or sent`.
2. Create a sheet with an Employees tab (email, name, team, manager_email, allowance_days) and a Requests tab (id, email, name, team, type, first_day, last_day, days, status, token, created_at, decided_at), connect Google Sheets and set `LEAVE_SHEET_ID`.
3. Activate the workflow and copy the production URL of `Manager decision link` into `DECISION_URL`.
4. Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.

**Requirements**
- A Google Sheet for staff and requests
- A Gmail account
- An n8n instance reachable from your managers' browsers

**How to customize**
- `MAX_TEAM_OFF` sets how many people from one team may be off on the same day before the manager is warned.
- `COUNTED_TYPES` lists leave types that use allowance; `REFUSE_OVER_ALLOWANCE` decides whether going over is refused or only flagged.
- `BLACKOUT_PERIODS` takes dates or yearly `MM-DD` ranges.
