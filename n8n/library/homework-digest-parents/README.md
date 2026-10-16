# Email weekly homework digests to parents from Google Sheets

Every Sunday reads assignments, students and grades from one Google Sheet, builds a single digest per family covering every sibling with homework due next week plus any late or missing work, and emails both parents.

Import `homework-digest-parents-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Small schools, tutoring centres and homeschool co-ops that track homework in a spreadsheet. Parents get one email on Sunday evening that covers every child, instead of one per class or none at all.

## How it works

1. Every Sunday at 17:00 it reads three tabs: Assignments (class, subject, title, due date), Students (class and parent emails) and Grades (late or missing work). Sample data is used until a sheet is set.
2. Assignments due Monday to Sunday of next week are matched to each student by class.
3. Late and missing items from the Grades tab are added per student, with how many days overdue they are.
4. Students who share a parent email are one family, so siblings in different classes land in one digest sent to both parents.
5. Families with nothing due and nothing outstanding are skipped, as are students with no parent email.

## Sections on the canvas

1. **Start and settings.** Runs every Sunday at 17:00 so the digest is in inboxes before the school week. School name, the outstanding statuses and the empty-week rule live in `config`.
2. **Read the three tabs.** Assignments, Students and Grades are read in parallel into one merge. Rows are told apart by their columns, so `Load sample school data` can stand in for all three with one node.
3. **Build family digests.** Grouping by parent email rather than by student means two siblings produce one email, not two. Outstanding work is listed under each child with days overdue, so parents see what to chase first.
4. **Email parents.** Nothing is sent while `TEST_RUN` is true and `TEST_EMAIL` is blank. In test mode every digest goes to you with the real parent addresses in the subject.

## Setup

1. Run it once as imported. It builds digests from sample data and stops at `STOP: preview - nothing sent`.
2. Create Assignments (Class, Subject, Title, Due), Students (Student ID, Student name, Class, Parent email, Second parent email) and Grades (Student ID, Assignment, Status, Due) tabs, connect Google Sheets and set `SCHOOL_SHEET_ID`.
3. Connect Gmail and set `SCHOOL_NAME` and `REPLY_TO_NAME`.
4. Put your address in `TEST_EMAIL` to receive every digest yourself, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `SCHOOL_SHEET_ID` | `''` | Google Sheets id with Assignments, Students and Grades tabs; blank uses sample data |
| `SCHOOL_NAME` | `'Riverside Learning Centre'` | shown in the subject and sign-off |
| `REPLY_TO_NAME` | `'Ms Alvarez, homework coordinator'` | who parents should reply to |
| `OUTSTANDING_STATUSES` | `["missing","late","incomplete"]` | Grades statuses listed as outstanding (case ignored) |
| `SEND_EMPTY` | `false` | true sends a short email even when a family has nothing due |
| `MAX_EMAILS` | `300` | hard ceiling on digests per run |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read the Assignments tab`
- `Read the Students tab`
- `Read the Grades tab`
- `Email the family digest`

## Requirements

- A Google Sheet with Assignments, Students and Grades tabs
- A Gmail account

## Customising

- Set `SEND_EMPTY = true` to send a short "nothing due" email to every family.
- `OUTSTANDING_STATUSES` lists the Grades statuses that count as late or missing.
- `MAX_EMAILS` caps digests per run.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 10 | none | `Summarise the run`, `STOP: preview - nothing sent` |
| live send from the sheet | 12 | `Email the family digest` | `Summarise the run`, `Email the family digest` |
