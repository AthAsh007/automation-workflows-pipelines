# Agent profiles

Six profiles for a filesystem-configured agent runtime: an agent whose behaviour
is a directory of files rather than a prompt in a text box.

| Profile | The problem it solves |
| --- | --- |
| [memory-architecture](memory-architecture/) | The agent forgets everything between sessions, or drags its whole history into every prompt and loses the thread |
| [mcp-tool-orchestration](mcp-tool-orchestration/) | Twelve tools with overlapping descriptions, so it picks the wrong one and then picks wrong again in a loop |
| [customer-service-agent](customer-service-agent/) | Triage an inbox with a real escalation path, and a tone the business can stand behind |
| [autonomous-research-agent](autonomous-research-agent/) | Run a research brief on a schedule and produce a report whose claims carry citations |
| [personal-assistant-setup](personal-assistant-setup/) | A morning brief and a day-close review that a person will actually read twice |
| [social-post-agent](social-post-agent/) | Scheduled posting to a company page, behind a human approval gate and a layout validator |

## The diagnosis that comes first

A brief that reads like an infrastructure problem usually is not one. In order of
how often each turns out to be the real cause:

1. **Memory.** No retrieval policy, so the agent either forgets between sessions
   or loads an entire history into every prompt. Start at
   [memory-architecture](memory-architecture/).
2. **Tool orchestration.** Overlapping tool descriptions, so it selects wrong and
   loops. Start at [mcp-tool-orchestration](mcp-tool-orchestration/).
3. **No approval boundary.** It did something irreversible once and nobody has
   trusted it since. See [`_shared/deploy.md`](_shared/deploy.md) under approval
   boundaries.
4. **Actual infrastructure.** Restarts, cron not firing, secrets. Also
   [`_shared/deploy.md`](_shared/deploy.md).

Working through those four in order settles most cases in one conversation.

## The shape of a profile

Every profile drops into the same layout:

```
~/.agent/
├── config.yaml            model, toolsets, memory, channel and dashboard settings
├── SOUL.md                who the agent is, and what it will not do
├── skills/<name>/SKILL.md one folder per capability, loaded by name
├── cron/jobs.json         scheduled jobs, each pointing at a script or a prompt file
├── cron/*.prompt.md       the prompt a scheduled job runs
└── scripts/               what the jobs execute
```

Installing a profile means copying its `SKILL.md` into `skills/`, merging its
`jobs.json` entry, adding its prompt file, and restarting. Each profile's README
has the exact steps for that profile.

## Before installing anything

- [`_shared/config.template.yaml`](_shared/config.template.yaml) is an annotated
  baseline config, with the settings that matter for each profile called out.
- [`_shared/jobs.template.json`](_shared/jobs.template.json) holds the scheduled
  job entries the profiles share.
- [`_shared/deploy.md`](_shared/deploy.md) covers the parts every profile needs
  and none of them should reimplement: where secrets live, how a job is made
  restart-safe, and where the approval boundary goes.

## Approval boundaries

Any profile that can take an irreversible action ships with the action behind a
human reply in a channel a human already reads. Two properties make that gate
real rather than decorative:

- The draft that gets approved is fingerprinted, and the publish step re-checks
  the fingerprint. What ships is provably what was approved.
- The agent cannot approve itself, including through a retry, a scheduled
  re-run, or a second agent it spawned.

[social-post-agent](social-post-agent/) is the worked example. Its
[reference/GUARDRAILS.md](social-post-agent/reference/GUARDRAILS.md) lists every
check between a draft and a published post.

## Prompts as files

Each profile keeps its scheduled prompts as `.prompt.md` files rather than inside
`jobs.json`. A prompt in a file can be diffed, reviewed and rolled back. A prompt
inside a JSON string cannot, and it is the part most likely to need a change after
the first week of real use.
