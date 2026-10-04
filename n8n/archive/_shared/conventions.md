# Conventions

Rules every template in this folder follows, so a client's n8n admin can read one workflow
and predict all five.

## Node naming

- `[cred] <Service> - <verb>` - needs a credential or an env var. Fix these first.
- `<verb>` - pure transform, no external call, safe to re-run.
- `STOP: <condition>` - a gate that intentionally drops items (cap reached, opt-out, low score).
- Sticky notes carry the setup steps, so the canvas is self-documenting after import.

## Two n8n settings these templates assume

1. **`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`** on the n8n host. The templates read API keys via
   `{{ $env.APOLLO_API_KEY }}` so the JSON stays credential-free and portable. If the admin
   will not allow env access, convert each `[cred]` node to a **Header Auth** credential
   instead - a two-minute change per node, and each template README says which header.
2. **`executionOrder: v1`** (set in each workflow's `settings`). Leave it; the batching in
   01 and 04 depends on deterministic order.

## Settings: the `config` node, and why it is replacing `$env`

Newer builds (07, now `../../crm-data-hygiene-published/workflow.json`, and 14 `workflow-v2.json`) put every setting in a single
Code node named `config` at the head of the workflow, and read nothing from `$env`.

```js
const SOME_API_KEY = '';          // blank means "skip this step", never "fail"
// ... derived flags ...
return [{ json: { some_api_key: ..., some_enabled: SOME_API_KEY.trim() !== '' } }];
```

Downstream nodes read `{{ $('config').first().json.some_api_key }}`, and each optional
step sits behind an `IF` on its `*_enabled` flag.

It wins on four counts:

1. **n8n Cloud works.** Cloud blocks `$env` outright, so an env-var template needs a
   find-and-replace before it will run at all.
2. **No host access needed** - no `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`, no restart to
   change a threshold.
3. **A blank key degrades instead of 401-ing**, which is what makes a template
   demonstrable before the client has handed over a single credential.
4. **The numbers agreed on the call live in one visible place**, so the threshold in the
   contract and the threshold in the workflow are the same threshold.

The JSON still ships credential-free: the constants are empty strings and the client pastes
their own in. Check before sending: `grep -o "_API_KEY = '[^']*'" workflow.json`.

Older templates still read `$env` and still work; convert one when you next touch it.

## Error handling

External calls set `onError: continueRegularOutput` only where a failure is expected and
meaningful - a provider returning no match is normal, and the waterfall needs to keep
going. Everything else fails loud. Silent partial runs are how a client ends up emailing a
list that was never verified.

Each workflow routes dropped items into a node named `STOP: ...` so they are visible in the
execution list instead of vanishing.

## The shared lead object

Every template speaks the same shape, so they chain without mapping nodes:

```json
{
  "lead_id": "acme-jane-doe",
  "first_name": "Jane",
  "last_name": "Doe",
  "title": "Head of Operations",
  "company": "Acme Pte Ltd",
  "domain": "acme.example",
  "linkedin_url": "https://www.linkedin.com/in/jane-doe",
  "email": "jane@acme.example",
  "email_status": "valid | risky | unknown | invalid",
  "email_source": "apollo | rocketreach | pattern | client",
  "country": "SG",
  "industry": "Marketing services",
  "size_hint": "~25 staff",
  "fit_score": 82,
  "fit_reason": "One sentence, grounded in a fact we actually found.",
  "evidence": [{"claim": "...", "source_url": "https://..."}],
  "stage": "new | researched | enriched | queued | sent | replied | booked | suppressed"
}
```

`lead_id` is `slug(domain) + "-" + slug(first_name last_name)`. It is the dedupe key
everywhere, including in the CRM. Generate it once, in 01 or 02, and never regenerate it.

## Model calls

`POST {LLM_BASE_URL}/v1/chat/completions`, OpenAI-compatible, `Authorization: Bearer
{LLM_API_KEY}`, model from `{LLM_MODEL}`. Every body sets **`stream: false`** - without it
the gateway appends an SSE `data: [DONE]` terminator to the JSON and n8n's parse fails.

Extraction and classification nodes pin the response with `response_format:
{type: 'json_schema', json_schema: {name, strict: true, schema}}` so downstream nodes never
parse prose. Copywriting nodes do not, because they are supposed to return text.

Parsers read `choices[0].message.content` and are written defensively - a missing choice or
a fenced ```json block must not throw, because the failure mode should be "a human looks at
it", never "the row vanishes".

**Gateway reality, verified 2026-08-20:** `llm.acme.example` (9router) exposes 287 models but
only `modelark/seed-2-0-pro-260328` responds on our key. Every Anthropic route returns 403
(upstream Cloudflare) or 402 (no credits), and the Gemini / GLM / DeepSeek / Kimi routes all
403 too. Tool calling and json_schema both work on seed-2-0-pro. Re-check before assuming a
better model is available.

Keep `max_tokens` generous - 16000 for non-streaming. A truncated extraction that half-fills
a CRM field is worse than an outright failure, because nobody notices it.
