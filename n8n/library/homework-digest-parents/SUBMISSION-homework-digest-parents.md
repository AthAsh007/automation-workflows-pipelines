# Email weekly homework digests to parents from Google Sheets

**Who's it for**
Small schools, tutoring centres and homeschool co-ops that track homework in a spreadsheet. Parents get one email on Sunday evening that covers every child, instead of one per class or none at all.

**How it works**
1. Every Sunday at 17:00 it reads three tabs: Assignments (class, subject, title, due date), Students (class and parent emails) and Grades (late or missing work). Sample data is used until a sheet is set.
2. Assignments due Monday to Sunday of next week are matched to each student by class.
3. Late and missing items from the Grades tab are added per student, with how many days overdue they are.
4. Students who share a parent email are one family, so siblings in different classes land in one digest sent to both parents.
5. Families with nothing due and nothing outstanding are skipped, as are students with no parent email.

**How to set up**
1. Run it once as imported. It builds digests from sample data and stops at `STOP: preview - nothing sent`.
2. Create Assignments (Class, Subject, Title, Due), Students (Student ID, Student name, Class, Parent email, Second parent email) and Grades (Student ID, Assignment, Status, Due) tabs, connect Google Sheets and set `SCHOOL_SHEET_ID`.
3. Connect Gmail and set `SCHOOL_NAME` and `REPLY_TO_NAME`.
4. Put your address in `TEST_EMAIL` to receive every digest yourself, then set `TEST_RUN = false`.

**Requirements**
- A Google Sheet with Assignments, Students and Grades tabs
- A Gmail account

**How to customize**
- Set `SEND_EMPTY = true` to send a short "nothing due" email to every family.
- `OUTSTANDING_STATUSES` lists the Grades statuses that count as late or missing.
- `MAX_EMAILS` caps digests per run.
