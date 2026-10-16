# Route refund requests from a form by policy rules with Gmail replies

**Who's it for**
Small online shops whose refund inbox is the same five cases every week. Clear cases get an answer in a minute; anything unusual waits for a person, with the policy reason written down.

**How it works**
1. A customer fills in the refund form: order number, email, purchase date, product type, amount, reason and details. A manual run uses 7 sample requests.
2. Past requests are read from the log, so a second request from the same email within 90 days always goes to review.
3. The policy table sets, per product type, the return window, the change-of-mind window and the amount that can be approved without a person. Anything over 300 is always reviewed.
4. Fault reasons (damaged, not as described, late) inside the window are approved up to the limit; change-of-mind requests follow the stricter window, and digital goods are not refundable for change of mind.
5. The customer gets the reply for their outcome, and the request is logged with the rule that decided it.

**How to set up**
1. Run it once as imported. It applies the policy to the samples and stops at `STOP: preview - nothing sent`.
2. Edit `POLICY` and `REVIEW_ALWAYS_OVER` to match your refund policy, and the reply wording in `REPLIES`.
3. Connect Gmail and Google Sheets, create a Refund requests tab, and put the sheet id in `LOG_SHEET_ID`.
4. Activate the workflow and share the form URL. Put your address in `TEST_EMAIL` first, then set `TEST_RUN = false`.

**Requirements**
- A Gmail account
- A Google Sheet for the log

**How to customize**
- `POLICY` holds windows and limits per product type; add a type and its dropdown option on the form.
- `FAULT_REASONS` decides which reasons use the fault rules.
- `REPEAT_DAYS` sets how far back repeat requests are checked.
