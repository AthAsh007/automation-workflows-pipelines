# Chase stalled enquiries and email a daily digest from Google Sheets

**Who's it for**

Commercial cleaning companies, and any small sales team, that tracks enquiries in a Google Sheet and keeps losing work simply because nobody followed up in time.

**How it works**

Every weekday at 08:30 the workflow reads the whole tracker once. Any enquiry still at an open stage that has had no movement for `CHASE_AFTER_HOURS` (48 by default) is collected and grouped by owner, then each owner gets one nudge listing all of theirs - never one email per enquiry. Chasing stops after `CHASE_MAX` reminders, and the chase count is written back to the sheet so nobody gets a daily drip about the same job. From the same read it builds a morning digest: every open enquiry counted by stage, everything that has gone quiet, and any row with no owner email. Moving a row to Won or Lost takes it out of both.

**How to set up**

1. Attach a Google Sheets credential and a Gmail credential to the four `[cred]` nodes.
2. Open `config` and set `TRACKER_SHEET_ID`, the area-to-owner list and `DIGEST_TO`.
3. Leave `TEST_RUN = true` for the first run, read what the STOP nodes produced, then set it to `false`.

**Requirements**

A Google account for Sheets and Gmail, and a tracker sheet with an `Enquiries` tab whose headings match `COLUMNS`.

**How to customize**

`CHASE_AFTER_HOURS`, `CHASE_MAX` and `OPEN_STAGES` in `config` decide what counts as stalled. The email wording lives in `write the nudge` and `build the morning digest`.
