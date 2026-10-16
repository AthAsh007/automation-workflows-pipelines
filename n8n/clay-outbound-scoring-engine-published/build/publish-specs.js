// Writes the two tools/layout.py specs for the n8n template library (GUIDELINES §10).
// Kept as JS so the sticky text is readable here; run: bun build/publish-specs.js
// Then, from n8n/workflows/:
//   python ../tools/layout.py <wf>.json <wf>-publish.json clay-outbound-scoring-engine-published/build/publish-spec-0N.json
//   python ../tools/make_submission_md.py <spec> SUBMISSION-<wf>.md
const fs = require('fs');
const path = require('path');

const T1 = 'Score Clay prospects, enrich only the qualified and route them to Zoho CRM and Smartlead';
const T2 = 'Classify Smartlead replies into Zoho CRM tasks and send a daily call list';

const spec01 = {
  title: T1,
  stickies: [
    { color: 4, band: 'top', from: 'A Clay row arrives', to: 'plan the enrichment', width: 780, content:
`## ${T1}

**Who's it for**
Outbound teams running prospect lists through Clay who pay for enrichment on every row, re-create leads in Zoho CRM by CSV, and paste the good ones into Smartlead by hand.

**How it works**
A Clay HTTP API column posts each row here. \`score and tier\` scores it on the fields already present against a rule table in \`config\`, and sets a fit score, an A/B/C/Reject tier, a persona and a recommended action. Disqualifiers and duplicates are caught before anything is spent. Only A and B rows missing an email are enriched, highest score first, up to \`ENRICH_BUDGET\` a run. Every A/B address is verified, failing closed. A, B and C are upserted to Zoho as Leads matched on email; verified A and B go to a Smartlead campaign per tier. A run summary counts the credits used and saved, and names everyone held back.

**How to set up**
1. Run **Run the demo prospects** first: twelve invented rows, nothing sent.
2. Replace \`SCORING\`, \`TIERS\` and \`PERSONAS\` with your model and map \`CLAY_FIELDS\`.
3. Add the enrichment, verifier, Zoho and Smartlead keys, and a campaign per tier.
4. Run once with \`TEST_CAMPAIGN_ID\`, then set \`TEST_RUN = false\`.

**Requirements**
A Clay table with an HTTP API column, an Apollo key, a MillionVerifier key, a Zoho CRM Self Client, and Smartlead campaigns.

**How to customize**
Every rule, threshold, status and field mapping lives in \`config\`. Import the companion replies workflow for classification and the daily call list.` },
    { color: 7, band: 'above', from: 'config', to: 'plan the enrichment', content:
`### 1. Score first, on what you already have

\`read the prospects\` maps Clay's columns through \`CLAY_FIELDS\`, so a renamed column is a config edit. \`score and tier\` applies \`SCORING\` and \`DISQUALIFY\`, sets the tier, persona and recommended action, keeps the score breakdown, and catches duplicates on email, LinkedIn, or name at the same domain.

\`plan the enrichment\` funds only A and B rows missing an email, highest score first, within \`ENRICH_BUDGET\`. A C, a Reject or a duplicate never costs a credit.` },
    { color: 7, band: 'below', from: 'worth a credit?', to: 'one list of prospects', content:
`### 2. Enrich only what was funded

\`Apollo - enrich the contact\` runs once per funded row; without a key \`use the demo enrichment\` stands in. A locked or missing email comes back empty, never as a pattern guess.

Everyone else passes through \`not worth a credit\` with the reason, and \`one list of prospects\` rejoins the batch so the counts downstream see all of it.` },
    { color: 7, band: 'above', from: 'who needs verifying', to: 'one list of verdicts', content:
`### 3. Verify before anything is sequenced

Only A and B addresses are checked, because only they can reach a campaign. \`apply the verification\` fails closed: an unknown or unanswered check holds the lead. With no verifier key, \`verification without a key\` marks real rows unverified, which also holds them.` },
    { color: 7, band: 'below', from: 'decide what goes where', to: 'STOP: Zoho rejected the write', content:
`### 4. One write to Zoho CRM

\`decide what goes where\` routes every prospect once: Zoho, Smartlead, or held with the reason. \`build the Zoho upsert\` sends A, B and C as one Leads upsert matched on \`ZOHO_DUPLICATE_CHECK\`, so a row sent twice updates its lead.

The refresh-token reply is checked for an \`error\` key, not just the status. \`read Zoho's answers\` reads each record's own code, and a refusal lands on a named STOP.` },
    { color: 7, band: 'above', from: 'build the Smartlead pushes', to: 'STOP: summary posted', content:
`### 5. Sequence, then report

Verified A and B go to their tier's campaign with the score, persona and action as custom fields. Smartlead's block and unsubscribe lists are always respected. In test mode every push is redirected to \`TEST_CAMPAIGN_ID\`.

\`build the run summary\` posts the tiers, credits used and saved, both outcomes and every hold to \`NOTIFY_WEBHOOK_URL\`.` },
    { color: 3, band: 'below', from: 'writing to Zoho?', to: 'STOP: preview - Smartlead payload shown', content:
`## Nothing is written until you say so

This ships with \`TEST_RUN = true\`. Zoho and Smartlead requests are built in full and shown on \`STOP: preview - Zoho payload shown\` and \`STOP: preview - Smartlead payload shown\`.

Set \`TEST_CAMPAIGN_ID\` to redirect pushes to a test campaign, then \`TEST_RUN = false\` to go live. A blank key skips its step; it never fails the run.` }
  ]
};

const spec02 = {
  title: T2,
  stickies: [
    { color: 4, band: 'top', from: 'A Smartlead reply arrives', to: 'read the reply', width: 780, content:
`## ${T2}

**Who's it for**
Sales teams sequencing leads in Smartlead and tracking them in Zoho CRM, whose replies pile up in an inbox and whose reps decide who to call from memory.

**How it works**
A Smartlead reply webhook, or six demo replies, arrive here. \`read the reply\` cuts off the quoted history. Keyword rules classify it as interested, not now, referral, unsubscribe, out of office or needs a person. With an OpenAI key a model classifies into the same list in a strict schema, and is checked rather than trusted. Nothing replies automatically: interested, referral and unclear replies become a Zoho task and a team alert, not now becomes a task in 60 days, an unsubscribe is opted out in Zoho and removed from every Smartlead campaign. Every weekday at 07:30 a COQL read builds the call list: interested, then referrals, then A tier by score.

**How to set up**
1. Run **Run the demo replies** and **Build the call list now** first.
2. Point a Smartlead EMAIL_REPLY webhook at **A Smartlead reply arrives**.
3. Add the Zoho Self Client values, the Smartlead key and \`NOTIFY_WEBHOOK_URL\`.
4. Set \`TEST_RUN = false\`.

**Requirements**
Zoho CRM with a Self Client (modules and COQL scopes), a Smartlead account, and optionally an OpenAI key and a Slack incoming webhook.

**How to customize**
\`REPLY_STATUS\`, \`TASK_DUE_DAYS\`, \`CALL_LIST_STATUSES\` and \`CALL_LIST_SIZE\` in \`config\` decide what each reply writes and who gets called first.` },
    { color: 7, band: 'above', from: 'building the call list?', to: 'apply the AI reading', content:
`### 1. Read and classify the reply

\`building the call list?\` sends the schedule to the call list and replies to classification. \`read the reply\` reads the webhook under every field name Smartlead has used.

\`classify by keywords\` always works. With a key, \`OpenAI - classify the reply\` answers in a strict schema; \`apply the AI reading\` drops an invented referral address, sends low confidence to a person, and lets an unsubscribe the rules catch always win.` },
    { color: 7, band: 'above', from: 'build the Zoho updates', to: 'STOP: Zoho updated', content:
`### 2. Update the lead, then give a person the task

\`decide the follow-up\` picks the action from the class alone. \`build the Zoho updates\` upserts each lead's status, and an opt-out for an unsubscribe, matched on email.

A task hangs off the lead's record id, which the upsert returns, so \`build the tasks\` pairs them after the write. A refused record gets no task and is named on \`STOP: Zoho updated\`.` },
    { color: 7, band: 'below', from: 'unsubscribes for Smartlead', to: 'STOP: alert posted', content:
`### 3. Suppress and alert

\`Smartlead - unsubscribe the lead\` removes an unsubscribe from every campaign, not just the one they replied to. A reply without a lead id is listed for manual removal.

\`compose the team alert\` quotes each interested, referral and unclear reply to \`NOTIFY_WEBHOOK_URL\`, so nobody opens Smartlead to see what was said.` },
    { color: 7, band: 'below', from: 'Zoho connected for the call list?', to: 'STOP: call list posted', content:
`### 4. The morning call list

One COQL read of Zoho for every lead whose status is in \`CALL_LIST_STATUSES\`. \`rank the call list\` puts interested replies first, newest at the top, then referrals, then A tier by fit score, capped at \`CALL_LIST_SIZE\`. A lead with no phone stays on it, marked email instead. Without Zoho, \`use the demo pipeline\` stands in.` }
  ]
};

fs.writeFileSync(path.join(__dirname, 'publish-spec-01.json'), JSON.stringify(spec01, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'publish-spec-02.json'), JSON.stringify(spec02, null, 2) + '\n');
console.log('wrote publish-spec-01.json, publish-spec-02.json');
