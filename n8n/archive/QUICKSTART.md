# Quickstart, importing these into your n8n dashboard

Start with **[10 - Smartlead, Apollo & Clay Cold Email Expert](smartlead-cold-email/)**. It's the simplest:
12 nodes, two read-only API calls, and the only credential it needs is a Smartlead or
Instantly API key. No Google account, no CRM, no access to anyone's lead list.

---

## 1. Import the workflow

In the n8n editor:

1. **Overview → Workflows → Create Workflow** (or open any blank workflow).
2. Top-right **⋯** menu → **Import from File...**
3. Pick `smartlead-cold-email/workflow.json`.
4. **Save** (Ctrl/Cmd+S). It doesn't run yet, importing never runs anything.

You'll see the canvas with a yellow sticky note in the top-left. That note is the setup
instructions for that specific workflow; read it before anything else.

Nodes prefixed `[cred]` are the ones needing a key. Everything else is pure logic.

---

## 2. Get the secrets in. Pick the path that matches your hosting

**This is the step that decides everything else.** The templates read keys as
`{{ $env.SMARTLEAD_API_KEY }}`, which works on self-hosted n8n but **not on n8n Cloud**.

> **Templates 09 and 14 skip this whole step**, as does 07, now at `../crm-data-hygiene/`. Their `workflow.json` /
> `workflow-v2.json` (07 and 14) and both 09 workflows keep every setting in a `config`
> Code node, so there is nothing to set on the host and nothing that breaks on Cloud. If
> you are on n8n Cloud, start with **14** rather than 10.

### Which do you have?

Settings → look for **Environment Variables**. If there's no such section and your URL ends
in `.app.n8n.cloud`, you're on Cloud.

### Path A, self-hosted (Docker, npm, Railway, Render, a VPS)

Set the variables from the template's `.env.example` on the host, plus one that unlocks env
access in nodes:

```bash
# docker compose — add under environment:
environment:
  - N8N_BLOCK_ENV_ACCESS_IN_NODE=false
  - SMARTLEAD_API_KEY=your-key-here
  - SMARTLEAD_CAMPAIGN_ID=12345
  - ALERT_WEBHOOK_URL=https://hooks.slack.com/services/...
```

Then restart n8n. Without `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` every `$env` expression comes
back empty and the API calls fail with a 401, that's the symptom to recognise.

```bash
docker compose down && docker compose up -d
```

### Path B, n8n Cloud

Cloud blocks `$env` and you can't set arbitrary host variables. Two options:

**B1. Variables** (Pro plan and above), Settings → **Variables** → add
`SMARTLEAD_API_KEY` etc. Then in each `[cred]` node, change `$env.` to `$vars.`:

```text
{{ $env.SMARTLEAD_API_KEY }}   →   {{ $vars.SMARTLEAD_API_KEY }}
```

Find-and-replace inside the node's field. It's 2–4 fields per workflow.

**B2. Credentials** (any plan, and the more n8n-native way), for each `[cred]` HTTP node:

1. In the node, set **Authentication** → *Generic Credential Type* → *Header Auth*.
2. **Create new credential**: Name = `x-api-key` (or `Authorization`), Value = the key.
3. Delete the header row in **Header Parameters** that was carrying the `$env` expression.

Which header each node wants is in its **Notes** field and in the template's README. For
Smartlead the key rides in a query parameter rather than a header, so B1 is easier there;
for the Anthropic nodes it's `x-api-key`, which is a clean Header Auth credential.

---

## 3. Attach the Google credential (only for workflows with Sheets nodes)

Template 10 doesn't need this. Most of the others do.

1. Credentials → **New** → *Google Sheets OAuth2* (quickest) or *Service Account*.
2. If service account: copy its email (`…@….iam.gserviceaccount.com`) and **share the Sheet
   with that address as Editor**. This is the step everyone forgets. The node then fails
   with "file not found", which reads like a wrong ID.
3. Open each Sheets node and pick the credential from the dropdown.

---

## 4. Run it once, by hand

Click **Execute Workflow** (bottom centre). Watch the nodes go green.

If one goes red, click it, n8n shows the exact request and response on the right. The three
failures you'll actually hit:

| Symptom | Cause |
|---|---|
| 401 / empty key in the request | `$env` not readable → step 2, Path A or B |
| "file not found" on a Sheets node | Sheet not shared with the service account |
| Node has no input data | An upstream node returned zero items, usually correct, not a bug |

---

## 5. Turn it on

Toggle **Active** (top right). From then on:

- **Schedule-triggered** workflows (10, 12, 13, 04, 06, 07, 09-daily) just start running on
  their cron.
- **Webhook-triggered** ones (01, 03, 11, 14, 15, 02, 09-webhook) expose a URL. Open the
  Webhook node. There are two URLs:
  - **Test URL**, only live while you're clicking "Listen for test event". Use it once to
    check the shape of what the sender posts.
  - **Production URL**, live whenever the workflow is Active. **This is the one that goes
    into Clay, Instantly, Cal.com or the form.** Pasting the test URL and wondering why it
    works once is the single most common mistake with these.

---

## 6. Then what

Once 10 is running, the natural order is:

1. **14 enrichment waterfall**, needs Apollo + a verifier key. Gives you a webhook URL to
   paste into Clay.
2. **08 list builder**, first one needing a Google Sheet. Set the sheet up here and every
   later template reuses it.
3. **12 sender + 03 replies**. The pair that actually produces meetings.
4. **04 orchestrator**. Once three or more are running, this is what tells you they still
   are.

Read `_shared/conventions.md` before number 2. It defines the sheet columns everything
downstream expects, and adding them up front saves redoing the header row four times.
