# The config node

**A workflow reads nothing from `$env`. Every setting lives in one Code node named
`config` at the head of the graph.**

The reference implementation is
[`n8n/crm-data-hygiene/workflow.json`](../n8n/crm-data-hygiene/workflow.json).
Read that file before building a new one. Everything below is what it does and why.

## 1. Why not `$env`, and why not `$vars` either

n8n offers two built-in ways to hold a setting outside the workflow. Both are
closed on a free or starter instance, for different reasons.

**`$env` is blocked by default.** It is not a paid feature. It is a security
setting: `N8N_BLOCK_ENV_ACCESS_IN_NODE` defaults to `true`, so the Code node
cannot read the process environment. A self-hoster can set it to `false` and
restart. On n8n Cloud you do not control the host environment, so there is no way
to turn it on.

**`$vars` is the paid one.** Custom Variables require a licence: self-hosted
Enterprise, or the Pro and Enterprise Cloud plans. They are also read-only from a
workflow and are set through the instance UI, which means they travel with the
instance rather than with the workflow file. Exporting a workflow that reads
`$vars` gives the recipient a JSON file that silently evaluates to `undefined`
until someone recreates each variable by hand.

A `config` node has neither problem, because the settings travel inside the
workflow JSON.

| | Reads `$env` | Reads `$vars` | Reads a `config` node |
| --- | --- | --- | --- |
| n8n Cloud, free or Starter | Unavailable. The host environment is not yours to set | Unavailable. Requires Pro or Enterprise | Runs unchanged |
| Self-hosted Community | Needs `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` and a restart | Unavailable. Requires Enterprise | Nothing |
| Queue mode | The variable has to reach the worker containers, not just the main one. Fails silently when it does not | Fine | Nothing |
| Changing a threshold | Edit `.env`, restart the stack | Edit in the instance UI | Edit the node, save |
| A key is missing | The node returns 401 in the middle of the run | Evaluates to `undefined` | The branch is skipped and the run completes |
| Handing someone the JSON | They have to be told which variables to set, separately | They have to recreate every variable in their own instance | The settings are visible on the canvas |
| Running it before credentials exist | Impossible | Possible, after setup | Works |

The last two rows matter most. A workflow built this way can be imported and run
before anyone has handed over a credential, which is also what makes it
reviewable.

## 2. The shape

One Code node, `typeVersion: 2`, named exactly `config`, placed left of the
trigger's downstream path so it reads as the first thing on the canvas.

```js
// WORKFLOW NAME - CONFIG
// Edit values only in this node. Nothing else in this workflow needs changing.
//
// SOME_API_KEY blank      -> that branch is skipped, the run still completes.
// ALERT_WEBHOOK_URL blank -> no notification is posted.

const LEADS_SHEET_ID = 'YOUR_GOOGLE_SHEET_ID';

const REVERIFY_AFTER_DAYS = 90;
const REVERIFY_BATCH      = 50;

// Optional. Leave blank to skip completely.
const SOME_API_KEY      = '';
const ALERT_WEBHOOK_URL = '';

return [{
  json: {
    leads_sheet_id:      LEADS_SHEET_ID,
    reverify_after_days: REVERIFY_AFTER_DAYS,
    reverify_batch:      REVERIFY_BATCH,
    some_api_key:        SOME_API_KEY,
    alert_webhook_url:   ALERT_WEBHOOK_URL,
    // Derived flags. Never test a key for emptiness downstream, test the flag.
    some_enabled:    SOME_API_KEY.trim() !== '',
    webhook_enabled: ALERT_WEBHOOK_URL.trim() !== ''
  }
}];
```

Conventions inside the node:

- **UPPER_SNAKE constants at the top, one per setting**, each carrying the comment
  a non-developer needs. This block is the document an operator edits.
- **The `return` maps them to lower_snake keys.** Downstream reads lower_snake.
  Nothing downstream reads a constant directly.
- **Every optional integration gets a `*_enabled` boolean here**, rather than an
  emptiness check scattered across five IF nodes.
- **No secrets are committed.** Ship every key as `''`. Before publishing a
  workflow, this must return nothing:

  ```bash
  grep -oE "_(API_)?KEY|_TOKEN|_PASSWORD) *= *'[^']+'" workflow.json
  ```

## 3. Reading it downstream

```
{{ $('config').first().json.leads_sheet_id }}
```

Use `.first()` rather than `$json`, because `config` runs once and the reference
has to survive fan-out. It works from any node at any depth, in a parameter or
inside a Code node:

```js
const staleDays = Number($('config').first().json.reverify_after_days || 90);
```

Wire `config` in front of the first node that needs it. In a node parameter:

```json
"documentId": { "__rl": true, "mode": "id",
                "value": "={{ $('config').first().json.leads_sheet_id }}" }
```

## 4. Optional integrations degrade, they never fail

Every optional external call sits behind an `IF` on its `*_enabled` flag, and the
false branch goes to a named NoOp rather than to nothing.

```
config -> ... -> [Verifier configured?] --true--> [cred] Verifier - check -> apply results
                          |
                          +--false--> STOP: verifier not configured -> merge
```

The `IF` node (`typeVersion: 2.2`) reads the flag as a boolean:

```json
{ "leftValue": "={{ $('config').first().json.some_enabled }}",
  "rightValue": "true",
  "operator": { "type": "boolean", "operation": "true", "singleValue": true } }
```

A blank key means *skip this step*. It never means *fail this run*. That property
is what makes a template runnable on import.

## 5. The safety switch

```js
const TEST_RUN   = true;   // Ships true. Nothing reaches a real recipient.
const TEST_EMAIL = '';     // Blank: preview only. Set: sends, redirected here.
const DAILY_CAP  = 25;     // Hard ceiling on outbound actions per run.
```

Derive one `mode` from the first two inside `config`, so the precedence is decided
in a single place and every gate reads the result:

```js
const MODE = TEST_RUN !== true ? 'live' : (TEST_EMAIL.trim() !== '' ? 'test' : 'preview');
```

Two properties make this safe. Filling in `TEST_EMAIL` can only redirect a send,
never cause one, so going live stays the separate deliberate act of setting
`TEST_RUN = false`. And only `live` opens the write-back gate, so a test run can
send real mail while still modifying nothing.

This is not optional. Any workflow that sends, posts, writes to a CRM or moves
money ships with `TEST_RUN = true` and a blank `TEST_EMAIL`, and routes to a named
`STOP: preview - not sent`, so the first execution after import is always safe.
`DAILY_CAP` is enforced in code, not described in a comment.

A workflow with no outward-facing action still ships a `DRY_RUN` in the same
spirit. The name matters less than the property: **the shipped default does
nothing irreversible.**

## 6. What stays out of config

- **Credentials proper.** SMTP passwords, Google OAuth, anything n8n has a
  credential type for. Those live in the n8n credential store, and the node that
  uses one is named `[cred] <Service> - <verb>`. `config` holds ids, URLs,
  thresholds, toggles, and plain API keys for services with no credential type.
- **Per-item data.** `config` is run-level settings only. If a value varies per
  record, it comes from the record.
- **Anything derived.** Compute it in the node that needs it.

## 7. Node naming

- `config`. The settings node. Exactly one, exactly that name.
- `[cred] <Service> - <verb>`. Needs a credential. Fix these first after import.
- `<verb>`. A pure transform with no external call, safe to re-run.
- `STOP: <condition>`. A gate that intentionally drops items, so they appear in
  the execution list instead of vanishing.
- Sticky notes carry the setup steps, so the canvas documents itself on import.

## 8. Before a workflow ships

- [ ] Exactly one node named `config`, and no `$env` anywhere in the JSON.
- [ ] Every key in `config` ships as `''`, and the secret grep in §2 returns nothing.
- [ ] Every optional integration has a `*_enabled` flag and a named false branch.
- [ ] `TEST_RUN = true`, `TEST_EMAIL = ''`, and a `STOP: preview` node in front of
      every send, write, publish and call.
- [ ] `DAILY_CAP` is enforced in code.
- [ ] Every fixture address is under `.example` and every fixture phone number is
      in the `555-01xx` range.
- [ ] `python tools/validate-workflows.py` and `python tools/check-fixtures.py` pass.

## 9. Converting a workflow that reads `$env`

1. Add the `config` node and wire it in front of the first node that needs a value.
2. Move each `$env.FOO` into a constant, and add its lower_snake key to the return.
3. Replace every `{{ $env.FOO }}` with `{{ $('config').first().json.foo }}`.
4. For each optional key, add a `*_enabled` flag, an `IF` on it, and a named
   `STOP:` node on the false branch.
5. Delete the `.env.example`, or reduce it to the credentials that stay in the
   n8n credential store.

## Prior art

The convention is this repository's own. The constraints it works around are
n8n's, and are worth checking rather than taking on trust here, because both have
changed at least once:

- Environment access from the Code node is blocked by default
  (`N8N_BLOCK_ENV_ACCESS_IN_NODE`), and the setting is a host configuration you do
  not control on Cloud. See the security environment variables page in the n8n
  docs.
- Custom Variables (`$vars`) are a licensed feature, available on self-hosted
  Enterprise and on the Pro and Enterprise Cloud plans. See the Custom variables
  page in the n8n docs.
- In queue mode, anything read from the environment has to be present on the
  worker containers, not only on the main process.

Passing run settings through the item stream rather than through the host is the
ordinary answer to all three.
