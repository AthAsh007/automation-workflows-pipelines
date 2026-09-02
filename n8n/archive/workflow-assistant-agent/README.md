# 15, Lead Gen AI Agent

**Post:** *AI Agent n8n Expert for Automation*

## What it does

Ask the pipeline a question in plain language, *"who replied but never got a follow-up?"*,
*"which of last week's leads are worth calling?"*, *"how many sendable leads do we have in
logistics?"*. And get an answer back that came from actually looking, not from guessing.

## Built from core nodes, on purpose

No LangChain node, no community package. The agent loop is four core nodes and **one
backward connection**:

```text
Webhook /agent
  └─ [cred] Sheets — read leads          snapshot, read once
      └─ set up the conversation         system prompt + tool definitions
          └─ [cred] Claude — agent turn ◄──────────────┐
              └─ asked for a tool?                     │
                  ├─ yes → run the tools ──────────────┘   (this is the loop)
                  └─ no  → final answer → Respond
```

That backward edge from `run the tools` into `[cred] Claude — agent turn` *is* the agent.
Everything else is plumbing.

Why it matters commercially: a template built on the LangChain node breaks when n8n bumps
it, and half of "AI agent in n8n" jobs are someone whose agent stopped working after an
upgrade. This one has nothing to break.

## The three tools

| Tool | Returns |
|---|---|
| `search_leads` | Free-text + stage + min-fit + has-email filters, top 25 by fit |
| `pipeline_stats` | Counts by stage, sendable count, how many still need an email |
| `get_lead` | One complete record by `lead_id` |

**All read-only.** An agent that can't write can't damage a client's pipeline while
everyone is still learning what it does. Write tools are a week-three conversation, and by
then the client has watched it work.

## How loop state survives an HTTP node

An HTTP Request node replaces the item, so the conversation can't ride along on the JSON.
Instead, `run the tools` **rebuilds the transcript from run history** each round:
`$runIndex` says which round we're in, and every earlier round is still addressable as
`$('[cred] Claude — agent turn').all(0, k)`.

This is the part worth walking through in an interview. It's the difference between "I
wired up the agent node" and "I know how n8n executes a cycle".

## Guards

- `AGENT_MAX_ITERATIONS` (default 6), throws rather than looping forever on a question the
  tools can't answer.
- Lead data is declared as **data, never instructions** in the system prompt. Company names
  and quoted replies are untrusted text going into a model prompt.
- Assistant turns are echoed back **unchanged**, thinking blocks included.
- All tool results for a turn go back in **one** user message. Splitting them across
  messages silently trains the model to stop making parallel tool calls.
- The tool list is built once and carried forward byte-identical, which also keeps the
  prompt cache valid across rounds.

## Setup (about 15 minutes)

1. Import, set env vars from `.env.example`.
2. Activate, then:

```bash
curl -X POST https://YOUR-N8N/webhook/agent \
  -H "Content-Type: application/json" \
  -d '{"question":"which replied leads never got a follow-up?"}'
```

3. Response includes `tool_rounds` and token `usage`, worth keeping in the demo, because
   "answered in 2 tool rounds for US$0.04" is a different conversation from "the AI
   answered".

## Demo script

Ask three questions in a row, escalating: a counting question (`pipeline_stats` only), a
filtering question (`search_leads`), and a judgement question (`search_leads` then
`get_lead`, then an actual recommendation). Watching the tool count go 1 → 1 → 3 is what
makes it land as an agent rather than a chatbot.

## Scope we sell this as

**S$1,500 fixed**, build, tools fitted to their data, three questions tuned live on the
call. The upsell is write tools (update a stage, queue a follow-up, add a note to the CRM),
quoted separately at **S$600 per tool**, once they trust the read-only version.
