# Send follow-up touches to quiet leads in GoHighLevel

**Who's it for**
Agencies and sales teams on GoHighLevel who lose deals to silence rather than to a no, and want the chasing done by a rule instead of a reminder.

**How it works**
1. Every weekday at 08:00 it reads the open opportunities, or six demo leads until GoHighLevel is connected.
2. `Plan who is due a touch` files each lead as due, waiting or stopped. A reply, a stage outside `OPEN_STAGES` or reaching `MAX_TOUCHES` ends the sequence, and the reason is recorded.
3. Each due lead gets one touch per run from the `SEQUENCE` ladder. `Write the next touch` builds the message and the exact request.
4. Touches go out only when the credential is added and `DRY_RUN` is false. Every outcome ends on its own STOP node, so the execution log reads as a report.

**How to set up**
1. Run it once as imported. Six demo leads exercise every decision and stop at `STOP: preview - touches not sent`.
2. In `config`, set the location id, the pipeline and stage ids, and the three `SEQ_*_FIELD_ID` custom fields.
3. Create a Header Auth credential (Name `Authorization`, Value `Bearer <Private Integration token>`), select it on both GoHighLevel nodes, and set `GHL_CREDENTIAL_ADDED = true`.
4. Set `DRY_RUN = false` once the previews read the way you want.

**Requirements**
- A GoHighLevel sub-account
- A Private Integration token with `contacts.write` and `conversations.write`
- Pairs with the intake and routing template, which shares the same `config`

**How to customize**
- `SEQUENCE` sets the wording and the wait before each touch.
- `OPEN_STAGES` and `MAX_TOUCHES` decide when chasing stops.
