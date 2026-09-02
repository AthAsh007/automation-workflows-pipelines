---
name: org-memory
description: What this agent remembers about the organisation, how it decides what is worth keeping, and how it retrieves the right thing at the right time.
---

# Org Memory

Use this skill whenever you are about to write something down, or when answering a question
that depends on something the organisation decided, agreed or learned before this
conversation.

## The store

Memories live as one file per fact under `~/.hermes/memory/`, with frontmatter:

```markdown
---
name: <short-kebab-case-slug>
type: person | decision | process | preference | reference
subject: <who or what this is about>
recorded: <YYYY-MM-DD>
expires: <YYYY-MM-DD or "never">
source: <conversation | document | person who told us>
---

<The fact, in one or two sentences. Absolute dates, never "last week".>

Related: [[other-memory-name]]
```

`~/.hermes/memory/INDEX.md` carries one line per memory, `- [Title](file.md) - hook`, and
is the only memory file loaded on every turn. Everything else is fetched by name when the
index line suggests it is relevant.

## What is worth writing down

Write it down when **all three** are true:

1. It will still matter in a month.
2. It is not derivable from a system we already query. The CRM, the repo, the calendar.
3. Getting it wrong would cost someone real time or credibility.

By type:

- **person**, role, what they own, how they prefer to be contacted, constraints (timezone,
  working hours, what they hate).
- **decision**, what was decided, when, by whom, and *why*. The why is the part that stops
  the decision being relitigated in six weeks.
- **process**, how a recurring thing is actually done here, especially where it differs
  from the obvious way.
- **preference**, how this organisation likes work delivered. Tone, format, channel.
- **reference**, pointers to where the real information lives. A dashboard URL, a ticket,
  a document.

## What is not worth writing down

- Anything the repository, calendar or CRM already answers. Query it instead.
- Anything true only inside the current conversation.
- Anything that will be stale next week, unless you set `expires` on it.
- Secrets, credentials, financial account details, or personal information beyond what is
  needed to work with someone.

## Retrieval

Before answering a question that depends on prior context:

1. Read `INDEX.md`. It is small on purpose.
2. Pull **at most three** memory files whose index lines relate to the question.
3. If nothing in the index relates, say what you do not know rather than guessing, and offer
   to record the answer once someone gives it.

**Pulling more is worse, not better.** Every recalled fact competes with the actual question
for attention. Three relevant memories beat thirty related ones, every time.

## Writing rules

- Convert every relative date to an absolute one at write time. "Next Thursday" is
  meaningless in a file read three months later.
- One fact per file. A file with three facts in it cannot be corrected or expired cleanly.
- Before creating a memory, check the index for one that already covers it. Update the
  existing file rather than adding a near-duplicate.
- When a memory turns out to be wrong, **delete it**. A corrected memory that still contains
  the old claim is worse than no memory.
- Link related memories with `[[name]]`. A link to a memory that does not exist yet is
  fine. It marks something worth recording later.

## When you are asked to remember something not worth remembering

Ask what was non-obvious about it, and record that instead. "Remember that the deploy script
is `deploy.sh`" becomes "deploys must run from the `release` branch, because the script
reads the changelog from it". One is in the repo, the other is not.
