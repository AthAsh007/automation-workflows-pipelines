# Deploy runbook: replacing a live main workflow and its sub-workflows

The sequence that keeps a live bot answering while its workflows are swapped underneath
it. Written from a real cutover of [whatsapp-device-booking-agent](../../../n8n/whatsapp-device-booking-agent/)
(one orchestrator, five tools, storage moved from a sheet to n8n data tables).

## 0. Decide what "latest" means

The repo copy and the instance drift. Before anything else:

- Export every workflow in the set (`get_workflow_details`) into a dated backup folder.
- Diff node names and parameters against the repo copy.
- Check `updatedAt` and `get_workflow_history`. A recent `updatedAt` with no new version can
  be a settings flip (for example enabling MCP access), not a code change.

Write down which side is the source of truth. Usually the repo is newer; sometimes someone
fixed something live and never committed it.

## 1. Check the cutover will not silence the bot

Look for anything in the new version that changes the contract with the outside world:

| Change | What breaks | Do this first |
|---|---|---|
| New webhook token or auth | Every inbound call is dropped | Have the new URL ready to paste into the provider |
| New credential type | Every outbound send fails | Owner creates the credential; verify it with a read-only call |
| New input shape on a sub-workflow | The old caller sends the wrong fields | Publish callees and caller in the same session |
| Storage move | The new code reads an empty store | Seed the new store before publishing |

If the owner says the workflow is a sample and nobody uses it, the timing constraints go
away. The ordering constraints do not.

## 2. Sub-workflows first

For each sub-workflow:

1. `update_workflow`: one atomic batch. Prefer `setNodeParameter` for code changes so node
   IDs and connections stay put. Remove and re-add only when the node type changes.
2. Keep node names stable where code refers to them (`$('Node name')`). If you rename a
   node, update every Code node that references it in the same batch.
3. `publish_workflow`.

## 3. Seed before any sync runs

A sync that clears a destination and rewrites it from the source will wipe the destination
if the source is empty. Leave the sync unpublished until the source holds the data.

## 4. The main workflow last

Same as step 2, then publish. Point each tool node's workflow ID at the sub-workflow IDs you
just published; keeping the original IDs (updating in place) means nothing needs repointing.

## 5. Prove it

1. One real request through the production webhook, with the owner's own number as sender.
2. `get_execution` with `includeData`, filtered to the intake, agent and send nodes.
3. Only then the load test (`scripts/webhook_load_test.mjs`), and only with the owner's
   go-ahead on how many messages they will receive.

## 6. Things that looked like bugs and were not

- **Executions start seconds after the webhook answered.** n8n queues production runs past
  its concurrency limit. 50 simultaneous calls ran about 20 at a time.
- **`execute_workflow` in manual mode ran the wrong trigger.** It starts from the first
  trigger on the canvas. Put the demo trigger first or expect the schedule trigger to run.
- **Static data did not persist.** Workflow static data (dedupe IDs, "last synced" hashes)
  only persists in production runs, not manual ones.
- **Kapso answered 422 to every send after the credential was fixed.** WhatsApp only allows
  free-form replies within 24 hours of the person's last real message, and simulated
  webhook calls do not count.
- **The instance returned 502 for a minute.** Installing a community node restarts n8n.
