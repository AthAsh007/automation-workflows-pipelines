# Screen job applications from a form with knockout questions into Airtable

**Who's it for**
Founders and hiring managers at small companies who get 50 to 300 applications per role and read every one, including the ones that fail a basic requirement. The knockouts are applied the same way every time, and every candidate hears back.

**How it works**
1. A candidate applies through the n8n form. A manual run uses four sample applications.
2. Knockouts come first: a must-have answered No, no right to work, sponsorship the role cannot offer, too little experience, salary over the band plus `SALARY_STRETCH_PCT`, or a notice period over the limit.
3. Applications that pass get a weighted score out of 100 from experience, salary fit, notice, nice-to-haves and a portfolio link. `SHORTLIST_SCORE` and above goes to review, the rest to hold.
4. The candidate gets an email for their outcome, then a record with score, reasons and answers is created in Airtable.

**How to set up**
1. Run it once as imported. It scores the sample applications and stops at `STOP: preview - nothing sent`.
2. Create an Airtable table with Name, Email, Role, Outcome, Score, Reasons and Answers fields, add an Airtable token credential to `Create candidate in Airtable`, and set `AIRTABLE_BASE_ID` and `AIRTABLE_TABLE`.
3. Connect Gmail, edit `ROLES` for your open positions and activate the workflow to publish the form.
4. Put your address in `TEST_EMAIL` to read each candidate email yourself, then set `TEST_RUN = false`.

**Requirements**
- An Airtable base
- A Gmail account
- An n8n instance that can serve a public form

**How to customize**
- `ROLES` sets the salary band, minimum years, maximum notice, sponsorship and nice-to-haves per role.
- `WEIGHTS` changes how the 100 points are split; `SHORTLIST_SCORE` moves the review line.
- `REJECTION_TEXT` maps each knockout to the sentence the candidate reads.
