---
name: acme-linkedin-content
description: Create, sequence, write, visually design, render, and QA Acme LinkedIn company-page posts. Use when planning the next Acme LinkedIn topic, drafting captions, converting technical news, research, events, or case studies into business-relevant posts, generating branded 1080x1350 graphics, or running the daily Acme LinkedIn approval job.
---

# Acme LinkedIn Content

Create credible LinkedIn posts that connect Acme's technical depth to real business
outcomes. Produce a ready-to-publish caption and a deterministic branded graphic built from
HTML with the official Acme logo.

**Draft only.** Nothing here publishes. A human replies `post` in the approval channel and
the watcher publishes. The full rule set is `reference/GUARDRAILS.md` and it applies to
ad-hoc requests as much as to the scheduled job.

## Positioning

Use this recurring message:

> Acme applies deep technical expertise to build production systems for real business
> problems across AI automation, product engineering, and protocol-critical Web3
> infrastructure.

Every post supports at least one commercial impression:

- Acme understands real workflows.
- Acme can design and build production systems.
- Acme understands technical and operational risk.
- Acme can explain complex technology clearly.

Audiences, in priority order: founders and business owners · product and engineering
leaders · operations and transformation leaders · Web3 protocol and infrastructure teams.

Treat the company page as a proof library. Founder and employee accounts carry additional
distribution and personal commentary; the page carries proof.

## Required inputs

1. The last six to ten Acme posts. The context script prints them
2. The bundled logo pack in `assets/` (never any other source)
3. The proposed topic, claim, product update, research note, event, or case study
4. Primary evidence for any factual or time-sensitive claim
5. Any preferred offer or call to action

If the feed is unavailable, use the posted log and state the limitation. If the logo is
unavailable, **stop**. A caption-only draft is not deliverable. Re-copy the folder whole.

## Select the topic

Target this mix over a rolling month:

- 60% AI workflows, product implementation, and production systems
- 25% engineering insights and product-development decisions
- 15% Web3 research, security, ecosystem, or event content

Sequencing rules:

1. Follow developer news with a business workflow or product-implementation post.
2. Follow a broad opinion with technical proof, architecture, research, or a concrete
   workflow.
3. Never publish two event recaps consecutively.
4. No more than one pure news-summary post in four.
5. Prefer a case study when verified evidence is available.
6. Use an event post only when it carries one concrete lesson for the audience.
7. Keep Web3 research as a specialist authority pillar, not the whole feed.

Prefer: workflow breakdowns · before-versus-after process explanations · production AI
guardrails · human approval and exception handling · CRM, lead-response, support, reporting
or knowledge workflows · product-engineering trade-offs · security and failure-mode
research · case-study lessons · event insights with a specific takeaway.

Avoid generic themes, "the future of AI", broad partnership announcements, technology
lists with no audience implication.

Check the last 6–10 posts and the 7-day topic overlap in the log before choosing. The
builder separately refuses a pillar reused inside five publish slots, so a repeat surfaces
as a `COLLISION` rather than as a stale post.

## Define the post before writing

Fill the post card first. It goes in the spec under `_internal_post_card` and never reaches
the image:

```text
audience:        who this is for
commercial goal: which of the four impressions it lands
takeaway:        one sentence, the single thing a reader keeps
evidence:        first-party, or a primary source URL
pillar:          the argument family — must not repeat inside 5 publish slots
call to action:  the one thing you ask
```

One takeaway per post. Split multiple ideas into separate posts.

## Write the caption

- 120 to 220 words.
- Open with a short, specific point of view. No long introduction.
- Short paragraphs for mobile reading.
- Three to six bullets only when they improve scanning.
- Translate technical detail into product, operational, risk, cost, speed, or maintenance
  implications.
- Include one honest limitation or trade-off when relevant.
- End with one easy-to-answer question or a specific invitation.
- Four to six relevant hashtags.
- Zero or one emoji.

Confident, practical, technically literate. Plain language.

Avoid: "game changer", "revolutionary", "the future is here" and similar hype · vague
claims about innovation · invented urgency · unsupported superlatives · more than one call
to action · hashtag blocks longer than six.

**Never invent** engagement statistics, customer outcomes, project counts, or case-study
metrics. Verify current releases, standards, events and software capabilities against
primary sources before drafting; do not reuse an old release claim without rechecking it.
When evidence is missing, write the post without the claim.

### Default caption pattern

```text
[Strong opening point.]

[The real business or product problem.]

[Three to five practical components, decisions, or checks.]

[Why this matters in production.]

[The lesson connected to Acme, without overselling.]

[One relevant question.]

#[4-6 relevant hashtags]
```

### Research pattern

The concrete failure mode or technical lesson → why the edge case matters → the author or
research source → a link to the full research → a narrowly relevant service call to action.

### Event pattern

Lead with one insight learned at the event and what it changes for the audience. Attendance
and partnerships come after the insight, if at all. Never publish a gratitude-only recap.

## Build the image

The visual system is `reference/DESIGN.md`, palette, the three pink zones, the six
layouts, headline sizing, and the rotation rule. Read it before writing a spec.

The pipeline is three commands and the order matters:

```bash
node scripts/build_post_template.js  <date>_spec.json <date>_template.html
bash scripts/render_linkedin_post.sh <date>_template.html <date>.png
node scripts/validate_linkedin_layout.js <date>_template.html
```

Write the spec as JSON, not HTML. The builder owns the palette, the logo inlining, the
focal element and the layout geometry; the spec supplies only copy and a layout choice.
Hand-writing a template bypasses every check in the builder.

Never ask an image model to render the logo, headline, labels, numbers, or body copy. Image
generation is not a fallback here. If the deterministic render fails three times, the run
is logged `skipped — render failed`, not downgraded.

A validator failure is blocking. Fix the template, re-render, **then** re-validate, the
PNG on disk is stale until the render is repeated.

Then inspect the actual PNG, not the HTML, with `vision_analyze`: official logo unchanged,
exactly one pink focal element, no clipping or overlap, no missing glyphs, headline
readable at thumbnail size.

## Quality gate

Before delivering anything:

**Content**. One clear takeaway · caption and visual say the same thing · specific opening
· explicit business implication · easy-to-answer CTA · every factual claim checked against a
primary source · nothing invented.

**Brand**, official SVG used unchanged · adequate clear space · palette matches · does not
imitate generic AI artwork.

**Visual**, canvas is 1080×1350 · all text readable at mobile-feed size · nothing crosses
the safe area · no clipping, overlap, missing glyphs, or broken logo · headline clear as a
thumbnail · the PNG was visually inspected after the final render.

**Package**, `caption.txt` matches the delivered caption · the spec and template are on
disk for audit · no temporary QA images left behind.

## Deliver

For the scheduled job, one Discord message in exactly this format. The watcher parses it,
so no extra labels and no reordering:

```
{caption text}

MEDIA:{absolute path to the PNG}

Draft ready for review. Reply **post** to publish or **cancel** to discard.
```

Then log the day as drafted:

```bash
bash scripts/linkedin_log.sh skipped acme "draft generated (awaiting approval)"
```

For an ad-hoc request, return: the recommended topic and its role in the sequence · the
ready-to-paste caption · the final PNG · the source links for any time-sensitive claim.
Lead with the output; keep production detail brief unless asked.

## Bundled logo assets

Ship with the skill in `assets/`. Use them directly; never fetch, regenerate, or substitute
a logo from anywhere else.

| File | Geometry | Use |
|---|---|---|
| `acme_logo_12.svg` | 958 × 152, white wordmark + `#DC2056` mark | **Default.** The mark is pink zone 1. |
| `acme_logo_11.svg` | 958 × 152, all white | Fallback when the layout needs a fully neutral lockup. |
| `acme_logo_04.svg` | 1001 × 441, white | Symbol only, for tight layouts. |

Only white variants are bundled, because the canvas is always `#050505`. If a layout ever
needs a dark-background variant, request the official file rather than recolouring one of
these.

## Reference posts

Patterns, not mandatory wording.

**AI agent ≠ chatbot**, connect AI-agent interest to production engineering. A chatbot
generates an answer; a production agent retrieves, applies business rules, recognises low
confidence, routes exceptions to a human, updates the systems the team already uses, and
logs every decision. The model is one component; the workflow, integrations, guardrails and
fallback paths are what make it a business system.

**Don't automate chaos**, map the workflow before adding AI. Trigger, decision, action,
exception, metric. If inputs are inconsistent and exceptions live in someone's head,
automation makes the ambiguity move faster.

**Engineering news**, state the exact technical change, explain what is genuinely new,
include an honest limitation, translate it into product-team implications (delivery speed,
native UX, architecture, maintenance), end with a question for builders. Verify the release
against official documentation before reusing any claim.

**Three outcomes, not two**, `example/` in this template is a complete worked instance:
spec, caption, template, and rendered PNG.
