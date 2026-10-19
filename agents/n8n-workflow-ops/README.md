# 07, n8n Workflow Ops

An agent that changes live n8n workflows through n8n's own MCP server, and watches them
afterwards, without breaking the thing people are using.

## The problem

Connecting an agent to n8n's MCP server takes five minutes. The trouble starts on the first
real request, "update the bot to the latest version":

- the repo copy and the live instance have drifted, and nobody knows which is newer;
- the new version adds a webhook token, so the moment it is published every inbound message
  is silently dropped;
- the orchestrator is published before its tools, and calls them with fields they do not
  take yet;
- a new "sync to sheet" workflow runs against an empty table and wipes the office sheet;
- the agent hits a missing credential and pastes an API key into a Code node to get past it.

Each of those happened, or nearly happened, during one real cutover. This profile is the set
of rules that would have prevented them, plus a scheduled health sweep for afterwards.

## What is in the folder

| File | What it is |
|---|---|
| [SKILL.md](SKILL.md) | The order of work, the approval boundary, credentials, load tests |
| [workflow-health.prompt.md](workflow-health.prompt.md) | Scheduled prompt: failed and silent workflows, with a proposed fix per item |
| [jobs.entry.json](jobs.entry.json) | The cron entry for the health sweep |
| [mcp-servers.n8n.example.json](mcp-servers.n8n.example.json) | The n8n MCP server with an allow and deny list |
| [scripts/n8n_health_context.py](scripts/n8n_health_context.py) | Read-only REST pull of the last N hours of executions |
| [scripts/webhook_load_test.mjs](scripts/webhook_load_test.mjs) | N simultaneous webhook calls from one named sender |
| [reference/DEPLOY-RUNBOOK.md](reference/DEPLOY-RUNBOOK.md) | The cutover sequence, and the things that looked like bugs and were not |

## The two rules that matter most

**Sub-workflows before the caller, seed before the sync.** Publishing order is the whole
game when a set of workflows changes together. The skill spells out the order; the runbook
explains why.

**No secrets in nodes, ever.** The MCP server cannot create credentials. When one is
missing, the agent stops and asks the owner to create it in the UI, then verifies it with a
read-only call. Writing a key into a parameter to "unblock" itself is the failure this rule
exists for.

## Tool surface

`mcp-servers.n8n.example.json` allows reads, drafts, publishing and test runs, and denies
`archive_workflow` and `restore_workflow_version`. Rolling a live workflow back to an old
version is exactly the kind of irreversible-feeling action a human should do in the UI,
where the version list is in front of them.

Publishing and test runs stay allowed but gated: the skill asks before any change to an
active workflow and before any test that sends real messages, naming who receives them.

## Install

1. `SKILL.md` to `~/.hermes/skills/n8n-workflow-ops/SKILL.md`
2. Merge the `n8n` server from `mcp-servers.n8n.example.json` into `config.yaml` under
   `mcp_servers`. Create the MCP token in n8n under Settings > MCP.
3. Copy `scripts/n8n_health_context.py` to `~/.hermes/scripts/`, set `N8N_BASE_URL` and a
   read-scoped `N8N_API_KEY` in the agent's environment.
4. Copy `workflow-health.prompt.md` to `~/.hermes/cron/`, merge `jobs.entry.json`, and put the
   workflow IDs you care about in `--watch`.
5. Restart. Ask the agent to list its tools; the count should match the allow list.
6. Run the health script by hand once: `python n8n_health_context.py --hours 24 --watch <id>`.
   An empty `failures` list on a workflow you know failed means the API key cannot read
   executions.

## Demo that lands

Ask: *"update the booking bot to the latest version in the repo"*. A well-configured agent
finds the main workflow and its tools, backs them up, diffs live against the repo, tells you
the new version adds a webhook token that the provider is not sending yet, and asks how you
want to handle the cutover before publishing anything. A badly configured one publishes, and
the bot goes quiet.
