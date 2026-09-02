# 05, Personal Assistant Setup

**Posts:** *Hermes Personal Assistant Setup* · *AI Assistant Developer, Hermes Agent* ·
*Senior AI Forward-Deployed Software Engineers* · *Hermes Agent Expert, Ongoing Work* ·
*Program Manager, Agentic AI & MCP*

Five of the fourteen posts. It's the most common Hermes job there is, and the one where the
work is least about code.

## What it does

A morning brief before their day starts, an end-of-day close, and drafts for anything they
need to send. Four sections in the brief (**Today, Owed, Waiting, One thing**) and any
section with nothing in it is omitted entirely rather than printed with "nothing today".

Under 200 words. It batches, and that's the point: the value of this agent is that it *isn't*
another thing pinging all day.

## The interview is the deliverable

[setup-interview.md](setup-interview.md) is ninety minutes with the person the agent belongs
to, before any config is written. Everything else in this folder is a template; that
conversation is the actual work.

Three things it produces that cannot be guessed:

- **What they carry in their head.** The answer "it's in my head" marks exactly what the
  agent is for. The answer "it's in the CRM" marks something the agent should query, not
  duplicate.
- **Their voice**, from three things they've actually written. A brief in the wrong register
  gets deleted unread, and no amount of prompt tuning fixes it afterwards.
- **The approval table**, signed off in writing.

**The person who will use it must be in the room.** Not their chief of staff. If they can't
spare ninety minutes, they won't use the agent either, better to find that out on day one
than in week six.

## One capability in week one

The failure mode of these engagements is configuring nine capabilities on day one, none of
which fit, and losing the person's attention before any get corrected.

So: **one brief, one channel, nothing else, for a week.** Then add. Say this in the
proposal. It reads as experience, and it's the thing that makes the difference between an
assistant that's still running in month six and one that got muted in week two.

## The rules that keep it from being annoying

From `SKILL.md`, and each one exists because of a specific way these agents fail:

- **Never summarise their inbox.** A summary of email is email with a delay.
- **Never report activity as progress.** "Six emails sent" is not something that moved.
- **Never congratulate.** No "great job today".
- **Never invent a commitment.** If you can't point to them saying they'd do it, it doesn't
  go in **Owed**. Someone else asking for something isn't a commitment.
- **Only interrupt** for something time-critical, something they asked to be told, or a
  reply to them. Everything else waits for the next brief.

## Install

1. `SKILL.md` → `~/.hermes/skills/personal-assistant/SKILL.md`
2. Both prompt files → `~/.hermes/cron/`
3. Merge `morning_brief` and `end_of_day_close` from `../_shared/jobs.template.json`
4. `config.yaml`: `cron.enabled: true`, their channel enabled, memory block on (this
   template depends on template 01. The voice and preference memories live there)
5. Write `morning_context.py` and `day_close.py` to print calendar, commitments and waiting
   items
6. Send the first brief **to yourself** for two days before it goes to them

Step 6 matters. The first brief a person receives sets whether they read the second one.

## Week-one review

Fifteen minutes at the end of week one, and ask exactly two questions:

- **Which line did you actually act on?**
- **Which line did you skip every day?**

Then cut the skipped one. Ruthlessly. A four-section brief where all four get read beats a
seven-section one that gets skimmed, and cutting a section you built is the fastest way to
show the client whose side you're on.

## Scope we sell this as

**S$2,400**, interview, build, one capability in week one, week-one review, then two more
capabilities in weeks two and three. Then **S$700/month** ongoing, which is where the
*Hermes Agent Expert, Ongoing Work* post ends up: the assistant needs someone adjusting it
as the person's job changes, and that's a retainer, not a bug.
