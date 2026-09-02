# 02, MCP and Tool Orchestration

**Posts:** *AI Automation Engineer, Hermes, ChatGPT, Claude, MCP, ClickUp* · *Hermes Agent
Consultant, Memory Design, MCP Integration, Tool Orchestration* · *AI & Automation Expert , 
OpenClaw, Hermes, AI Agents* · *Senior Agent Infrastructure Engineer* · *Program Manager , 
Agentic AI & MCP*.

Five of the fourteen Hermes posts are this one.

## The problem

Connecting an MCP server is the easy half and everybody's proposal says it. The half that
decides whether the agent is useful is **what happens once twelve tools are connected**:

- it picks the wrong tool, gets a bad result, picks wrong again, and loops;
- it calls a write tool without reading current state first, and overwrites someone's work;
- it does something irreversible once, and nobody trusts it again.

## Tool count is the variable nobody controls

Past roughly **20 tools with overlapping descriptions**, tool selection degrades sharply.
Every MCP server you attach brings its whole surface. A ticket server alone can be fifteen
tools, most of which nobody wants an agent touching.

So: **add one server at a time, and allow-list its tools.** `mcp-servers.example.json` shows
the shape, an `_allow` list per server and a `_deny` list for the tools that shouldn't
exist as far as the agent is concerned.

The distinction that matters:

- **Denied**. The tool is not exposed. Deletes go here. Nobody has ever needed an agent to
  delete a ticket, and the failure mode is unrecoverable.
- **Allowed but gated**. The tool exists; the orchestration skill decides when it fires.
  Sends, posts and external writes go here.
- **Allowed**, reads.

And for anything backed by a database: **connect with a read-only role.** Don't rely on the
agent choosing not to write. Rely on the credential being unable to.

## The approval boundary

From `SKILL.md`, and worth putting in the statement of work verbatim:

| Class | Rule |
|---|---|
| Read | Go ahead |
| Local write (draft a file, prepare a message) | Go ahead, then show it |
| External write (ticket, CRM, message) | **Ask, showing exactly what will change** |
| Irreversible (send, pay, delete, publish, deploy) | **Ask, every time** |

Ask **specifically**: *"I'll move ticket 412 from Review to Done and add the note below , 
go ahead?"* A confirmation nobody can evaluate isn't a confirmation, and "shall I proceed?"
trains people to say yes without reading.

## Failure handling

- Fail **once**, report, stop. No silent retries.
- **Never retry an external write after a timeout**. You don't know whether it landed. Read
  the state first.
- **Empty is an answer.** "No open tickets match that" is correct and useful.
- **Never route around a broken tool.** If the ticket API is down, say so; don't go edit the
  database underneath it.

## Install

1. `SKILL.md` → `~/.hermes/skills/tool-orchestration/SKILL.md`
2. Merge one server from `mcp-servers.example.json` into `config.yaml` under `mcp_servers`
3. Restart. Ask the agent to list its tools and confirm the count matches what you expect.
4. Run five real requests. Watch which tool it picks. Only then add the second server.

That third step catches the most common install failure: a server exposing far more tools
than you meant to attach.

## Demo that lands

Ask the agent to do something that requires reading before writing, *"close the ticket
Priya raised about the invoice bug"*. A well-orchestrated agent searches, shows you the
ticket it found, and **asks before closing it**. A badly orchestrated one closes something
plausible.

Show both if you can. The second one is what the client already has.

## Scope we sell this as

**S$1,800** for the first server, allow-listing, orchestration policy and the approval
table signed off. **S$500 per additional server**, priced that way on purpose, it's the
honest cost, and it makes the "just connect everything" instinct visible as a decision
rather than a default.
