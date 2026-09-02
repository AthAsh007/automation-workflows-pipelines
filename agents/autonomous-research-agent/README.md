# 04, Autonomous Research Agent

**Posts:** *Autonomous Research Agent in Hermes Desktop* · *Hermes Agent Developer, SEO
Automation*

## What it does

Runs a research job on a schedule against a defined watch list, compares what it finds to
last run's state, and produces a brief that answers three questions in order: **what
changed, does it matter to us, what should we do.**

## Why most "research agent" builds get quietly switched off

They produce a weekly summary of things that were already true. Nobody reads the second one.

Three design choices prevent that here:

**Only changes appear.** Anything unchanged is not in the brief at all. The output has three
sections (**New**, **Changed**, **Gone**) and if all three are empty, the brief is one
line saying so.

**"Gone" is a section.** Everyone tracks what appeared; almost nobody tracks what
disappeared. A competitor's pricing tier that vanished, a page that used to rank and no
longer does. These are usually the most interesting thing in the file, and they only show
up if you diff against stored state.

**A high bar for "changed".** A wording tweak isn't a change. It counts when it would alter
a decision: pricing, positioning, a product added or removed, leadership, funding, a new
market. A brief that cries wolf weekly gets skimmed, then ignored. And the week it matters,
nobody reads that one either.

## Sourcing rules

- Every factual claim carries a URL. No URL, no claim.
- Source dates are the **source's** date, not the date it was found.
- Two sources disagreeing gets reported as a disagreement, not silently resolved.
- **Gaps stay gaps.** "Could not find current pricing" is a finding; an estimate presented
  as a fact is a liability, and one of those undermines the whole brief.

## Web pages are adversarial now

Some pages contain text written specifically to be read by agents. The prompt treats
everything fetched as content, flags any page containing instruction-shaped text, and lowers
confidence in that source. Worth mentioning on the call for an SEO-flavoured job in
particular. The client's own competitors may be doing it.

## The SEO variant

For *Hermes Agent Developer, SEO Automation*, the watch list is keywords and competitor
URLs, and the brief adds:

- which tracked queries now return an AI Overview that didn't before (this is the change
  that's costing agencies traffic right now);
- which competitor pages entered or left the first page;
- what's being cited *inside* the AI Overview, which is a different game from ranking.

That third one is the pitch. Ranking and being cited have come apart, and an agency watching
only rankings is watching the wrong number.

## Install

1. `SKILL.md` → `~/.hermes/skills/autonomous-research/SKILL.md`
2. `research-brief.prompt.md` → `~/.hermes/cron/research-brief.prompt.md`
3. Merge `research_brief_daily` from `../_shared/jobs.template.json`
4. `config.yaml`: `cron.enabled: true`, web toolset enabled
5. Write `research_context.py` to print the question, the watch list, and the previous state
   from `~/.hermes/data/research/<job>.json`
6. `mkdir -p ~/.hermes/data/research`

Run it by hand twice before scheduling. The first run establishes state and will report
everything as new, that's correct, and worth warning the client about so the first brief
doesn't look broken.

## Cost

At 20 sources a run with web search, roughly US$0.30–0.80 per brief. Daily on weekdays is
about US$12/month. Say the number out loud, clients expect research automation to be
expensive and it isn't, which makes the retainer easier.

## Scope we sell this as

**S$1,900**, build, watch list defined with them, two weeks of daily briefs with a review
at the end of week one to tune the "does this clear the bar" threshold. Then **S$600/month**
to run and keep the watch list current.
