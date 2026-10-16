# Route time-off requests from a form to managers with approve and decline links

Checks each time-off request against the employee's remaining allowance, blackout periods and teammates already off, emails the manager one-click approve and decline links, and records the decision in Google Sheets when a link is clicked.

Import `time-off-request-approval-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Teams of 10 to 150 people who approve leave over chat and track it in a spreadsheet. Managers get the facts with each request and decide with one click, and the sheet stays the record.

## How it works

1. An employee submits the n8n form with type and dates. Working days are counted without weekends or `PUBLIC_HOLIDAYS`.
2. It reads the Employees and Requests tabs (or sample data), works out the allowance left this year, checks `BLACKOUT_PERIODS` and lists teammates already off on those days.
3. Impossible requests (unknown email, dates in the past, over allowance) are refused by email with the reason. The rest are saved as pending and the manager gets approve and decline links.
4. A click hits the second trigger, `Manager decision link`. The token and status are checked, the row is updated and the employee is told the outcome.

## Sections on the canvas

1. **Two entry points and settings.** The form and the decision link share one `config`, which records which trigger fired. `Which entry point?` sends each to its reader; a manual run takes the sample request so the checks can be watched.
2. **Read the request or the click.** Both readers emit one item with an `entry` field, so everything after `Combine entry` handles requests and decisions with the same team data.
3. **Read staff and leave.** `Collect employees` folds the Employees rows into one item before `Read Requests tab`, so the second read runs once. Without a sheet, `Load sample team data` has two Platform teammates off in the requested week.
4. **Decide and answer the click.** `Decide the outcome` refuses only what a manager could never approve and turns the rest into warnings. A decision link must match the stored token and still be pending, so a forwarded or reused link changes nothing.
5. **Write the sheet and email.** The pending row is saved before the manager email goes out, so a link can never point at a missing request. In test mode every email goes to `TEST_EMAIL` with the real recipient in the subject.

## Setup

1. Run it once as imported. It checks a sample request and stops at `STOP: preview - nothing stored or sent`.
2. Create a sheet with an Employees tab (email, name, team, manager_email, allowance_days) and a Requests tab (id, email, name, team, type, first_day, last_day, days, status, token, created_at, decided_at), connect Google Sheets and set `LEAVE_SHEET_ID`.
3. Activate the workflow and copy the production URL of `Manager decision link` into `DECISION_URL`.
4. Put your address in `TEST_EMAIL` to receive every email yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `LEAVE_SHEET_ID` | `''` | Google Sheets id holding the Employees and Requests tabs; blank uses sample data |
| `DECISION_URL` | `'https://your-n8n.example/webhook/time...'` | production URL of the Manager decision link trigger |
| `COUNTED_TYPES` | `["Vacation","Personal"]` | leave types that use the yearly allowance |
| `REFUSE_OVER_ALLOWANCE` | `true` | true refuses a request that would go below zero; false only warns the manager |
| `MAX_TEAM_OFF` | `2` | warn the manager when this many teammates are already off on an overlapping day |
| `BLACKOUT_PERIODS` | `[{"from":"12-15","to":"12-31","reason":"` | periods managers should think twice about: 'YYYY-MM-DD' or yearly 'MM-DD' |
| `PUBLIC_HOLIDAYS` | `["2026-12-25","2026-12-28","2027-01-01"]` | dates that do not count as working days |
| `COMPANY_NAME` | `'Northwind'` | used in email sign-offs |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read Employees tab`
- `Read Requests tab`
- `Save the pending request`
- `Email the manager approve and decline links`
- `Update the request status`
- `Email the employee the decision`
- `Email the employee why it was refused`

## Requirements

- A Google Sheet for staff and requests
- A Gmail account
- An n8n instance reachable from your managers' browsers

## Customising

- `MAX_TEAM_OFF` sets how many people from one team may be off on the same day before the manager is warned.
- `COUNTED_TYPES` lists leave types that use allowance; `REFUSE_OVER_ALLOWANCE` decides whether going over is refused or only flagged.
- `BLACKOUT_PERIODS` takes dates or yearly `MM-DD` ranges.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample request, preview) | 13 | none | `STOP: preview - nothing stored or sent`, `STOP: no browser to reply to` |
| form request in test mode, blackout and over allowance | 19 | `Save the pending request`, `Email the manager approve and decline links` | `STOP: no browser to reply to`, `Email the manager approve and decline links` |
| manager clicks approve (live) | 19 | `Update the request status`, `Email the employee the decision` | `Reply to the manager`, `Email the employee the decision` |
| reused link with a wrong token | 13 | none | `STOP: preview - nothing stored or sent`, `Reply to the manager` |
