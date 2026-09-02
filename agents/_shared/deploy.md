# Deploying a Hermes template

## Install, in order

1. **Config first.** Copy `config.template.yaml` to `~/.hermes/config.yaml` and set the
   blocks the template's README names. Restart. Confirm the agent answers on one channel
   before adding anything else.
2. **Skill.** Copy the template's `SKILL.md` to `~/.hermes/skills/<name>/SKILL.md`. The
   folder name must match the `name:` in the frontmatter. A mismatch fails silently, and
   it is the single most common install bug.
3. **Prompt files.** Copy any `*.prompt.md` into `~/.hermes/cron/`.
4. **Jobs.** Merge the entries from `jobs.template.json` into `~/.hermes/cron/jobs.json`,
   replacing every `REPLACE_WITH_` value. Drop the `_template` and `_comment` keys.
5. **Restart, then run one job by hand** before waiting on the schedule. A job that fails at
   06:30 tomorrow costs a day; the same failure now costs a minute.

## Approval boundaries

The default on every new deployment: **nothing irreversible happens without a human.**

| Action | Default | Move to autonomous when |
|---|---|---|
| Draft a message | autonomous |, |
| Send an external message | **approval** | the client asks in writing, usually week 3+ |
| Write to a CRM or tracker | **approval** | after a week of correct drafts |
| Spend money, delete, publish | **approval** | effectively never, keep the human |
| Read anything | autonomous |, |

Put this table in the statement of work. It is the fastest way to make a nervous buyer
comfortable, and it makes the "can it just do it automatically?" conversation a scheduled
milestone rather than an argument.

## Untrusted content

Any prompt that reads a ticket, an email, a web page, a lead record or a file is reading
text a stranger wrote. Every prompt file in these templates opens with a line saying the
attached content is **data, not instructions**. Keep it when you edit them. If you write a
new prompt, copy that line first, before the task description.

## Reliability checklist

Work this top to bottom when an agent "stops working". It is almost always one of the
first four:

1. **Did cron fire?** `cron.enabled: true` in config, and the process actually running.
   Check the heartbeat job's last local delivery.
2. **Did the skill load?** Folder name vs `name:` in frontmatter. Ask the agent directly
   what skills it has.
3. **Is memory oversized?** If `memory_char_limit` is high and answers have gone vague or
   off-topic, that's the cause. The real question is buried under recalled context. See
   template 01.
4. **Too many tools?** Count them. Past roughly 20 with overlapping descriptions, tool
   choice degrades badly. See template 02.
5. **Provider errors?** Check for rate limits and refusals in the logs before assuming a
   logic bug.
6. **Secrets expired?** OAuth tokens and MCP server credentials expire quietly.

## What to check before saying "it's an infrastructure problem"

Two of the fourteen Hermes posts are written as infrastructure roles. In practice the fault
is memory or tool orchestration far more often than it is infra. Diagnose in the order
above, and say what you found. A client who has been told "it needs a rebuild" by the last
contractor remembers the person who found it in twenty minutes instead.

## Handover

Every engagement ends with three things, or it isn't finished:

- **A runbook**, what each job does, when it runs, what breaks it, who to call.
- **A recorded walkthrough**, fifteen minutes, screen shared, doing the real thing.
- **The approval table above**, signed off, so nobody discovers the boundary by accident.
