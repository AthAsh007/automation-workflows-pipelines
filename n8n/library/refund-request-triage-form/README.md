# Route refund requests from a form by policy rules with Gmail replies

Takes refund requests through an n8n form, applies a policy table by product type (days since purchase, reason, amount), auto-approves, declines or sends to review, flags repeat requesters and large amounts, replies by Gmail with wording for each outcome, and logs every request to Google Sheets.

Import `refund-request-triage-form-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Small online shops whose refund inbox is the same five cases every week. Clear cases get an answer in a minute; anything unusual waits for a person, with the policy reason written down.

## How it works

1. A customer fills in the refund form: order number, email, purchase date, product type, amount, reason and details. A manual run uses 7 sample requests.
2. Past requests are read from the log, so a second request from the same email within 90 days always goes to review.
3. The policy table sets, per product type, the return window, the change-of-mind window and the amount that can be approved without a person. Anything over 300 is always reviewed.
4. Fault reasons (damaged, not as described, late) inside the window are approved up to the limit; change-of-mind requests follow the stricter window, and digital goods are not refundable for change of mind.
5. The customer gets the reply for their outcome, and the request is logged with the rule that decided it.

## Sections on the canvas

1. **Start and settings.** The form is the front door; the manual trigger replays sample requests. The whole refund policy, including reply wording, lives in `config`, so a policy change never touches the logic.
2. **Read the request.** Form answers are keyed by their labels, so `Read the form submission` renames them once. `Collect the requests` gathers them into one item so the log is read a single time.
3. **Check history and policy.** Past requests are read before deciding, because a repeat requester is the case a rule table gets wrong most often. Escalation rules run before approval rules, so a large or repeat claim can never be auto-approved.
4. **Reply and log.** Nothing is emailed while `TEST_RUN` is true and `TEST_EMAIL` is blank. The log is written only on a live run with a sheet set, so test requests never count as a customer's earlier request.

## Setup

1. Run it once as imported. It applies the policy to the samples and stops at `STOP: preview - nothing sent`.
2. Edit `POLICY` and `REVIEW_ALWAYS_OVER` to match your refund policy, and the reply wording in `REPLIES`.
3. Connect Gmail and Google Sheets, create a Refund requests tab, and put the sheet id in `LOG_SHEET_ID`.
4. Activate the workflow and share the form URL. Put your address in `TEST_EMAIL` first, then set `TEST_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `POLICY` | `{"Physical":{"window_days":30,"change_mi` | per product type: return window, change-of-mind window (0 = never), most that is approved without review |
| `FAULT_REASONS` | `["Damaged or faulty","Not as described",` | reasons that use the fault rules |
| `REVIEW_ALWAYS_OVER` | `300` | any request above this amount goes to a person |
| `REPEAT_DAYS` | `90` | a second request from the same email inside this many days goes to review |
| `REPLIES` | `{"approve":"Your refund of {amount} for ` | reply text per outcome; {order}, {amount} and {why} are filled in |
| `SHOP_NAME` | `'Northwind Goods'` | used in the subject and sign-off |
| `LOG_SHEET_ID` | `''` | Google Sheets id with a Refund requests tab; blank uses sample history and logs nothing |
| `TEST_RUN` | `true` | ships true. Nothing reaches a real recipient or system. |
| `TEST_EMAIL` | `''` | blank means preview only; set it and sends are redirected there |

## Nodes that need a credential

- `Read past requests`
- `Email the customer`
- `Log the request`

## Requirements

- A Gmail account
- A Google Sheet for the log

## Customising

- `POLICY` holds windows and limits per product type; add a type and its dropdown option on the form.
- `FAULT_REASONS` decides which reasons use the fault rules.
- `REPEAT_DAYS` sets how far back repeat requests are checked.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (preview) | 14 | none | `STOP: preview - nothing sent` |
| live form submission | 16 | `Email the customer`, `Log the request` | `Log the request` |
