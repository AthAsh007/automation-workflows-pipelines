# 01, Memory Architecture

**Posts:** *Hermes Agent Consultant, Memory Design, MCP Integration, Tool Orchestration* ·
*Hermes Architecture Project* · and (more often than the post admits) *Hermes Agent
Engineer: Bugs, Reliability & Optimization*.

## The problem this actually solves

Two complaints, one root cause:

- *"It doesn't remember anything."* No write policy. Nothing gets recorded, so every
  conversation starts from zero.
- *"It remembers too much and loses the thread."* No retrieval policy, everything gets
  recalled, so the actual question competes with thirty stale facts for attention.

The second is far more common in agents that have been running six months, and it's almost
always misdiagnosed as "the model got worse".

## The design

**One fact per file. A small index. At most three retrievals per answer.**

```text
~/.hermes/memory/
├── INDEX.md                    one line per memory — the only file loaded every turn
├── jane-owns-billing.md
├── deploy-runs-from-release.md
└── client-prefers-friday-updates.md
```

Three rules do most of the work:

1. **Write only what passes all three tests**, still matters in a month, not derivable
   from a system we already query, and expensive to get wrong.
2. **Retrieve at most three files.** More recalled context is not more helpful; it's
   competition for attention. This single constraint fixes most "it lost the thread"
   complaints.
3. **Delete what's wrong.** A corrected memory that still contains the old claim is worse
   than no memory at all.

## Why `memory_char_limit` is the first thing to check

In `config.yaml`, `memory_char_limit` is the character budget memory may spend inside a
prompt. Set it high and every answer arrives buried under recalled context, which reads
exactly like a model getting worse, and gets diagnosed as everything except what it is.

**2200 is the starting point** in `../_shared/config.template.yaml`. If an agent has gone
vague, halve it before touching anything else and see what happens. That five-minute test
has resolved more "reliability" engagements than any amount of infrastructure work.

## Weekly hygiene

`memory-hygiene.prompt.md` runs Sunday evening and returns a structured audit: what to
expire, merge, split, rewrite, and which memories have index hooks so vague that nothing
will ever retrieve them.

It is capped at recommending **20% of the store** in one pass. If more than that looks
stale, it says so and asks for a human. A store that loses a fifth of itself in one audit
has a bigger problem than any individual file, and an agent that quietly deletes its own
history is not one anyone will trust again.

## Install

1. `SKILL.md` → `~/.hermes/skills/org-memory/SKILL.md`
2. `memory-hygiene.prompt.md` → `~/.hermes/cron/memory-hygiene.prompt.md`
3. Merge the `memory_hygiene_weekly` job from `../_shared/jobs.template.json`
4. Set the `memory:` block from `../_shared/config.template.yaml`
5. `mkdir ~/.hermes/memory && touch ~/.hermes/memory/INDEX.md`
6. Restart, then run the audit job by hand once against whatever is already there

## The consulting version of this

For *Memory Design* and *Architecture Project* posts, the deliverable isn't the files, it's
the decision record. Four questions, answered in writing with the client:

1. **What must this agent never forget?** (usually 5–15 facts, not 500)
2. **What must it never store?** (PII, credentials, anything under a retention policy)
3. **What expires, and when?** (project context vs standing constraints)
4. **Who can correct a memory?** (if the answer is "no one", the store will rot)

Then the schema, then a two-week pilot with the audit running weekly, then a review of what
it actually recorded. The review is the part clients remember, because it's the first time
they see what their agent has been carrying around.

## Scope we sell this as

**S$2,200** for design + implementation + two-week pilot with a review session. As a
diagnostic on an existing broken agent: **S$800** for a two-day audit, which converts to the
full engagement about half the time. And when it doesn't, it's because the fix was
`memory_char_limit` and they didn't need us.
