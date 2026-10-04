# Classify Smartlead replies into Zoho CRM tasks and send a daily call list

**Who's it for**
Sales teams sequencing leads in Smartlead and tracking them in Zoho CRM, whose replies pile up in an inbox and whose reps decide who to call from memory.

**How it works**
A Smartlead reply webhook, or six demo replies, arrive here. `read the reply` cuts off the quoted history. Keyword rules classify it as interested, not now, referral, unsubscribe, out of office or needs a person. With an OpenAI key a model classifies into the same list in a strict schema, and is checked rather than trusted. Nothing replies automatically: interested, referral and unclear replies become a Zoho task and a team alert, not now becomes a task in 60 days, an unsubscribe is opted out in Zoho and removed from every Smartlead campaign. Every weekday at 07:30 a COQL read builds the call list: interested, then referrals, then A tier by score.

**How to set up**
1. Run **Run the demo replies** and **Build the call list now** first.
2. Point a Smartlead EMAIL_REPLY webhook at **A Smartlead reply arrives**.
3. Add the Zoho Self Client values, the Smartlead key and `NOTIFY_WEBHOOK_URL`.
4. Set `TEST_RUN = false`.

**Requirements**
Zoho CRM with a Self Client (modules and COQL scopes), a Smartlead account, and optionally an OpenAI key and a Slack incoming webhook.

**How to customize**
`REPLY_STATUS`, `TASK_DUE_DAYS`, `CALL_LIST_STATUSES` and `CALL_LIST_SIZE` in `config` decide what each reply writes and who gets called first.
