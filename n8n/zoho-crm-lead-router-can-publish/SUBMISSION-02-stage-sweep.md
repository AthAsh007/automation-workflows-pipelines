# Create next-action tasks for stalled deals in Zoho CRM

**Who's it for**
Sales and services teams in Zoho CRM whose deals go quiet in a stage without anyone noticing, because a workflow rule only fires when something changes.

**How it works**
Every weekday at 07:00, or by hand, it reads every open deal with one COQL query (or a demo pipeline when Zoho is not connected) and judges each against one rule: no open deal sits in a stage without the next action that stage calls for. A deal with no next step gets the stage's task created. An overdue deal is escalated in the digest rather than given a second task. Stalled deals are reported, never actioned on their own. A digest of every verdict is posted to your channel.

**How to set up**
1. In `config`, set `ZOHO_API_BASE` and `ZOHO_ACCOUNTS_BASE` to your data centre.
2. Paste a Self Client's id, secret and refresh token.
3. Match `OPEN_STAGES` and `STAGE_ACTIONS` to your Deal Stage picklist.
4. Set `DRY_RUN = false`.

**Requirements**
A Zoho CRM org and a Self Client with deal read, task create and COQL read scopes. The demo run needs no credential.

**How to customize**
`STAGE_ACTIONS` sets the task each stage calls for, `ESCALATE_OVERDUE` decides overdue handling, and `NOTIFY_WEBHOOK_URL` sets where the digest goes.
