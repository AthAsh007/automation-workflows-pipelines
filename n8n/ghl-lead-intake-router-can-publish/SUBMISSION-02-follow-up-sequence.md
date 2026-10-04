# Send follow-up touches to quiet leads in GoHighLevel

**Who's it for**
Agencies and sales teams running GoHighLevel who lose deals to silence rather than to a no, and want the chasing handled by a rule instead of a reminder.

**How it works**
Every weekday at 08:00 it reads the pipeline, then sorts every lead three ways. **Due**: quiet for longer than the ladder allows, so the next touch is written and sent. **Waiting**: not quiet long enough yet. **Stopped**: they replied, the stage left the open list, or the sequence is finished. One touch per lead per run, `MAX_TOUCHES` in total, and the run reports what it did either way.

**How to set up**
1. Import it alongside the intake and routing workflow; both share the same `config` node.
2. Run it once exactly as it ships. Six demo leads exercise every decision and nothing is sent.
3. Open `config`: set the location id, the pipeline and stage ids, and an API key scoped `conversations.write`.
4. Point `SEQ_TOUCHES_FIELD_ID`, `SEQ_LAST_TOUCH_FIELD_ID` and `SEQ_LAST_REPLY_FIELD_ID` at your custom fields.
5. Set `DRY_RUN = false` only once the previews read the way you want them to.

**Requirements**
A GoHighLevel sub-account and a Private Integration token with `contacts.write` and `conversations.write`. Left blank, the workflow stays in preview instead of failing.

**How to customize**
`SEQUENCE` sets the wording and the wait before each touch. `OPEN_STAGES` and `MAX_TOUCHES` set the stops.
