---
name: n8n-workflow-ops
description: How this agent reads, changes, publishes and load-tests live n8n workflows through the n8n MCP server, without breaking a workflow people are using.
---

# n8n Workflow Ops

Use this skill whenever a request touches a workflow on a live n8n instance: "update the
bot", "why did last night's run fail", "add a step", "can it take 50 messages at once".

## The order of work

1. **Find before you touch.** `search_workflows` with the project ID, then
   `get_workflow_details` on each workflow you will change. If the request says "the main
   workflow and its sub-workflows", list every `toolWorkflow` / `executeWorkflow` node in the
   main one and follow their workflow IDs. Never guess an ID from a name.
2. **Back up first.** Save each workflow you will change (`get_workflow_details` output) to a
   dated backup folder before the first write. A backup taken after the first write is not a
   backup.
3. **Check what is live, not what the repo says.** The repo copy and the instance drift. Diff
   node names and parameters between the two before deciding what "latest" means, and say
   which one you are treating as the source of truth.
4. **Change the draft.** `update_workflow` with one atomic batch per workflow. To change a
   node, use `setNodeParameter` or `updateNodeParameters`. Remove and re-add a node only when
   its *type* changes, and then re-add every connection it had, including `ai_tool`,
   `ai_languageModel` and `ai_memory`.
5. **Sub-workflows before the caller.** Update and publish the tools first, the orchestrator
   last, so the caller never calls a tool with an input shape it does not have yet.
6. **Publish explicitly.** An update only changes the draft. Nothing runs until
   `publish_workflow`. Say which workflows you published.
7. **Prove it.** Run one real request end to end and read the execution
   (`get_execution` with `includeData`, filtered to the nodes that matter). "Published" is not
   "working".

## Approval boundary

| Class | Examples | Rule |
|---|---|---|
| Read | search, details, executions, history | Go ahead |
| Draft change | `update_workflow` on a workflow that is **not** active | Go ahead, then show the diff |
| Live change | `update_workflow` + `publish_workflow` on an active workflow | **Ask, naming each workflow and what changes** |
| Outbound | a test that sends real messages, emails or posts | **Ask, naming who receives them and how many** |
| Irreversible | archive, delete, clearing a data table or sheet | **Ask, every time** |

A workflow people depend on gets changed outside its busy hours unless the owner says
otherwise. If they say "it is a sample, nobody uses it", that is the answer: record it and
proceed.

## Credentials and secrets

- The MCP server cannot create credentials. Ask the owner to create them in the n8n UI, then
  find the new ID with `list_credentials` and attach it with `setNodeCredential`.
- Never write an API key into a node parameter, a Code node, a sticky note or a repo file to
  get around a missing credential. Stop and ask instead.
- Verify a new credential with a **read-only** call first (list phone numbers, list
  channels), not with a send.
- Webhook tokens and similar values you generate go in the owner's git-ignored secrets
  folder, never in a committed file.

## Data that a sync will overwrite

Before publishing anything that clears and rewrites a destination (a sheet, a table), make
sure the source already holds the data. Seed first, publish second. A sync that runs against
an empty source wipes the destination on its first tick.

## Load tests

- Every simulated message uses a sender the owner named, so replies only reach them.
- Unique message IDs per request, or dedupe will swallow them and the test proves nothing.
- Report: requests accepted, executions started and finished, errors per workflow, time per
  execution, and how many outbound messages were actually delivered.
- Simulated webhook calls do not open a WhatsApp 24-hour service window. If outbound sends
  come back 422, the recipient has to send a real message first.

## Reporting

Lead with what is live and whether it works. Then what is blocked and who has to unblock it.
Name workflows by their n8n name, not by a label you made up.
