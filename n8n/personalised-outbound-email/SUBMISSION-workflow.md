# Send personalised deliverable emails from GitHub and Google Sheets over SMTP

**Who's it for**
Agencies and freelancers who prepare a small custom deliverable per prospect — an audit, a mockup,
a set of notes — and want the outreach email built from those files automatically, one lead at a
time, from a sheet they already keep.

**How it works**
Each weekday it reads a lead tracker in Google Sheets and picks the rows that are ready to send.
For each lead it derives a folder name from the website column and looks that folder up in a GitHub
repository. The email is assembled from the files it finds there, so the personalisation is a real
artefact rather than a merge field. An optional LLM call polishes only the subject line and the
opening sentence; the body is never rewritten. Files in the folder can be attached. A lead with no
folder is never emailed — it is flagged for whoever prepares the deliverables. After a successful
send the sheet row is written back with its new status, and a run summary is posted.

**How to set up**
1. Open **`config`** and set the sheet id, the GitHub repository and branch, and the from and
   reply-to addresses.
2. Attach Google Sheets OAuth2 (read and update) and SMTP credentials to the `[cred]` nodes.
3. Run once with `TEST_RUN = true` and `TEST_EMAIL` blank, then read **`build run summary`**.

**Requirements**
A Google Sheet lead tracker, a GitHub repository holding one folder per prospect, and an SMTP
account. The LLM polish step and the report webhook are both optional.

**How to customize**
The column names are in `config.COLUMNS` and the email assembly is in **`build email content`**.
To take deliverables from somewhere other than GitHub, replace the two `[cred] GitHub` read nodes.
