# Send AI follow-up email and SMS touches to quiet leads in GoHighLevel

**Who's it for**
Agencies and sales teams on GoHighLevel who lose deals to silence rather than to a no, and want the chasing done by rules instead of reminders: the right channel, at a sensible hour, stopping the moment someone replies or opts out.

**How it works**
1. Every hour it reads the open opportunities, or twelve invented demo leads until GoHighLevel is connected.
2. `Plan who is due a touch` files each lead as due, waiting or stopped. An opt-out tag, a stage outside `OPEN_STAGES`, a recorded reply or reaching `MAX_TOUCHES` ends the sequence, and the reason is recorded.
3. Due leads go through a loop one at a time, with a short pause between them for API rate limits. One lead failing never stops the rest; it is counted as failed.
4. Per lead: quiet hours and weekends in the lead's own timezone, then the channel. The `SEQUENCE` ladder picks email or SMS, falling back to the other when an address is missing; with neither, the lead is unreachable.
5. The lead's conversation is read first. A reply after the last touch stops the sequence, tags the contact and creates a task for the owner. STOP or unsubscribe adds a `do-not-contact` tag.
6. An OpenAI-compatible model drafts the touch from the lead's context. Code guardrails check length, prices, discounts and promises, and that an SMS ends with "Reply STOP to opt out". A draft that fails, or a missing AI key, falls back to the template text, with the reason recorded.
7. After a send it updates the touch counter and date, adds tags and a note. After the final touch it creates a "call this lead" task and moves the opportunity to the nurture stage.
8. A run report (sent, waiting, stopped by reason, failed, AI vs template) can be posted to Slack or Discord and appended to a Google Sheet.

49 nodes in eleven labelled sections. Every external step is skipped when its setting is blank, so the whole run works end to end in demo mode with no credentials.

**How to set up**
1. Run it once as imported. Nothing is sent: `STOP: run finished - report built` shows every decision, and `Keep the touch as a preview` the exact words.
2. In `config`, set the location id, the pipeline and stage ids (including Nurture), the owner user ids and the three `SEQ_*_FIELD_ID` custom fields.
3. Create a Header Auth credential (Name `Authorization`, Value `Bearer <Private Integration token>`), select it on every GoHighLevel node, and set `GHL_CREDENTIAL_ADDED = true`.
4. Optional: a Header Auth credential for your AI provider on `Draft the touch with AI` and `AI_CREDENTIAL_ADDED = true`; `REPORT_WEBHOOK_URL`; `LOG_SHEET_ID` with a Google Sheets credential. A blank setting skips its step.
5. Set `DRY_RUN = false` once the previews read the way you want.

**Requirements**
- A GoHighLevel sub-account
- A Private Integration token with contacts, opportunities and conversations read/write scopes
- Optional: an OpenAI-compatible API key, a Slack or Discord webhook, a Google Sheet
- Pairs with the intake and routing template, which shares the same `config`

**How to customize**
- `SEQUENCE` sets the wording, channel and wait before each touch; `MAX_TOUCHES` and `OPEN_STAGES` decide when chasing stops.
- `SEND_WINDOW_START_HOUR`, `SEND_WINDOW_END_HOUR`, `SEND_ON_WEEKENDS` and `DEFAULT_TIMEZONE` set the sending window.
- `BANNED_WORDS`, the length limits and `AI_MODEL` shape the AI drafts; `OPT_OUT_KEYWORDS` and `OPT_OUT_PHRASES` decide what counts as an opt-out.
