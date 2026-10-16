# Screen job applications from a form with knockout questions into Airtable

Checks each application against must-have answers, right to work, salary band and notice period, scores the rest out of 100, files every candidate in Airtable with the reason and sends an email that matches the outcome.

Import `job-application-knockout-screen-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Founders and hiring managers at small companies who get 50 to 300 applications per role and read every one, including the ones that fail a basic requirement. The knockouts are applied the same way every time, and every candidate hears back.

## How it works

1. A candidate applies through the n8n form. A manual run uses four sample applications.
2. Knockouts come first: a must-have answered No, no right to work, sponsorship the role cannot offer, too little experience, salary over the band plus `SALARY_STRETCH_PCT`, or a notice period over the limit.
3. Applications that pass get a weighted score out of 100 from experience, salary fit, notice, nice-to-haves and a portfolio link. `SHORTLIST_SCORE` and above goes to review, the rest to hold.
4. The candidate gets an email for their outcome, then a record with score, reasons and answers is created in Airtable.

## Sections on the canvas

1. **Start and settings.** The form is the real entry point; a manual run takes the sample path. Roles, must-have answers, weights and rejection wording all sit in `config`, so a new opening is one more entry in `ROLES`.
2. **Read the application.** `config` records whether the form fired, and `Came from the form?` reads the answers or loads four sample applications that cover a shortlist, a sponsorship knockout, a must-have knockout and a borderline case.
3. **Knock out, then score.** Knockouts run before any scoring, so a strong score can never hide a hard requirement. Every outcome carries its reasons, and `Write the candidate email` uses the first knockout reason in words a candidate can act on.
4. **Email and file.** In test mode the email goes to `TEST_EMAIL` and Airtable is left alone. Only a live run with `AIRTABLE_BASE_ID` set creates the record, and `Remember applicants` stores email and role only after Airtable returns an id.

## Setup

1. Run it once as imported. It scores the sample applications and stops at `STOP: preview - nothing sent`.
2. Create an Airtable table with Name, Email, Role, Outcome, Score, Reasons and Answers fields, add an Airtable token credential to `Create candidate in Airtable`, and set `AIRTABLE_BASE_ID` and `AIRTABLE_TABLE`.
3. Connect Gmail, edit `ROLES` for your open positions and activate the workflow to publish the form.
4. Put your address in `TEST_EMAIL` to read each candidate email yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `ROLES` | `{"Senior Backend Engineer":{"salary_min"` | one entry per open role; salaries are yearly in your currency |
| `MUST_HAVE` | `{"Can you work at least 4 hours overlapp` | form question -> the only answer that passes |
| `SALARY_STRETCH_PCT` | `10` | an ask this far above the band is scored low but not rejected |
| `YEARS_GRACE` | `1` | candidates this many years under the minimum still pass the knockout |
| `WEIGHTS` | `{"experience":30,"salary":25,"notice":15` | points per factor; should add up to 100 |
| `SHORTLIST_SCORE` | `70` | scores at or above this go to review |
| `REJECTION_TEXT` | `{"must_have":"the role needs {question}"` | what the candidate reads for each knockout |
| `AIRTABLE_BASE_ID` | `''` | Airtable base id (starts with app); blank skips the record |
| `AIRTABLE_TABLE` | `'Candidates'` | table name or id inside the base |
| `COMPANY_NAME` | `'Northwind'` | used in candidate emails |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Email the candidate`
- `Create candidate in Airtable`

## Requirements

- An Airtable base
- A Gmail account
- An n8n instance that can serve a public form

## Customising

- `ROLES` sets the salary band, minimum years, maximum notice, sponsorship and nice-to-haves per role.
- `WEIGHTS` changes how the 100 points are split; `SHORTLIST_SCORE` moves the review line.
- `REJECTION_TEXT` maps each knockout to the sentence the candidate reads.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample applications, preview) | 9 | none | `STOP: preview - nothing sent` |
| form application, live with Airtable | 12 | `Email the candidate`, `Create candidate in Airtable` | `Remember applicants` |
