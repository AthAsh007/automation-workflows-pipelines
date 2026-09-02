# 06, LinkedIn Post Job

**Posts:** *Hermes Agent Developer, content automation* · any "post to our company page on
a schedule" ask

A daily cron that drafts one LinkedIn company-page post, caption **and** a deterministic
branded 1080×1350 graphic, delivers it to a Discord channel, and publishes only after a
human replies `post`.

Everything in this folder is what you hand to Hermes. Nothing else is needed.

## What it does

```
08:00 Mon-Fri
  │
  ├─ linkedin_context.py --brand acme   today's state + recent drafts + posted log
  │      NOTHING YET → draft   ·   AWAITING APPROVAL / POSTED → silent   ·   CANCELLED → draft again
  │
  ├─ caption.txt        120-220 words, one takeaway, one question, 4-6 hashtags
  ├─ spec.json          copy + a layout choice. No colours, no HTML.
  ├─ build_post_template.js   → template.html   self-contained, inline SVG logo
  ├─ render_linkedin_post.sh  → post.png        Playwright, 2x → 2160x2700
  ├─ validate_linkedin_layout.js               blocking geometric check
  └─ vision_analyze on the PNG                 the check that catches what HTML hides
  │
  └─ ONE Discord message ────► human replies `post` ────► linkedin_org_post.py ────► LinkedIn
                                        │
                                        └─ `cancel` → artefacts moved aside, logged
```

## Why the image is built, not generated

Every "AI posts to our LinkedIn" build hits the same wall: the caption is fine and the
graphic is embarrassing. An image model cannot render a logo it has not seen, cannot set a
headline without inventing a letterform, and cannot be relied on to keep a hex value stable
across two runs.

So the graphic here is HTML. `build_post_template.js` takes a JSON spec, copy and a layout
name. And owns everything else: the palette, the inlined official SVG, which element is the
focal one, and all the geometry. The agent writes *words*, never markup. That is the whole
trick, and it is why the output is boringly consistent.

Three things fall out of that, and each of them was a defect first:

**The pink is structural.** Exactly three zones carry the accent, the logo mark, one
`<em>` phrase in the headline, and one focal element the layout picks. The builder rejects a
spec with two `<em>`s or with a hex value in the copy, because a fourth pink zone is how a
slide stops having a focal point. The first round put the accent only in a strip at the
bottom edge and the results were flat enough to be rejected outright.

**Layouts rotate.** Six of them, and the builder refuses to build if the same layout *or the
same argument* appears within five publish slots. One working week. Both checks exist
because both mistakes reached the live page. The window counts publish slots, not build
dates, so banking a month of posts in one sitting is fine.

**Nothing is trusted until the PNG is looked at.** The validator measures the rendered
geometry and is blocking. Then a vision pass reads the actual image. Round one shipped a
dead void in the middle of a slide and sub-labels set in `#303030` on `#050505`, both
obvious in the picture, both invisible in the HTML.

## Why there is no auto-post path

There is one, single, non-negotiable rule in this template: **the agent never publishes.**

LinkedIn has no unsend. A company page post is public the instant it lands, and a wrong one
is a screenshot before you have finished reading it. So the pipeline stops at a Discord
message, and a human types `post`.

The guardrails around that gate are the actual product here, `reference/GUARDRAILS.md`, 29
of them. The ones worth saying on a client call:

- **Never approve your own work.** Not the agent's own message, not another bot's, not
  silence, not a thumbs-up reaction. A human, in the right channel.
- **A publish is never retried.** Success, failure, and *unknown* are three outcomes; most
  systems are built for two. On a timeout the agent checks the page and stops. Blind retry
  is how you get two of the same post.
- **No image is a failure.** A caption-only draft is never deliverable and never
  publishable. After three failed renders the run logs `skipped — render failed` and says
  so. There is no cheaper path it is allowed to fall back to.
- **The approved draft is frozen.** The reviewer approved what they saw. Any edit needs a
  fresh draft and a fresh approval.
- **The log is the source of truth, and it is append-only.** File presence never decides
  state. The PNG is written at draft time, so its existence proves nothing. A rollback is a
  `cancelled` row appended after the `posted` one.

## What's in the folder

```
06-linkedin-post-job/
├── README.md                      this file
├── SETUP.md                       bring-up, per-day state machine, troubleshooting, acceptance
├── SKILL.md                       → ~/.hermes/skills/brand-content-pipeline/acme-linkedin-content/
├── man_lin_pos.prompt.md          → ~/.hermes/cron/
├── jobs.entry.json                the cron entry, plus the sibling MCH job for reference
├── assets/                        the three official logo SVGs — never fetch another
│   ├── acme_logo_12.svg        default: white wordmark + pink mark
│   ├── acme_logo_11.svg        all-white fallback
│   └── acme_logo_04.svg        symbol only, tight layouts
├── scripts/                       → ~/.hermes/scripts/
│   ├── build_post_template.js     spec.json → self-contained template.html  ← the one new script
│   ├── render_linkedin_post.sh    template.html → 2160x2700 PNG (Playwright)
│   ├── validate_linkedin_layout.js   blocking geometric check
│   ├── linkedin_context.py        state machine + draft history + posted log
│   ├── linkedin_log.sh            append-only outcome log
│   └── linkedin_org_post.py       the publisher — called by the watcher, never by the job
├── reference/
│   ├── DESIGN.md                  palette, three pink zones, six layouts, sizing, rotation
│   └── GUARDRAILS.md              all 29, and why each one exists
└── example/                       a complete worked instance, rendered and inspected
    ├── 2026-08-25_spec.json
    ├── 2026-08-25_caption.txt
    ├── 2026-08-25_template.html
    ├── 2026-08-25.png
    └── design_history.json
```

## Install

1. `SKILL.md`, `assets/`, `reference/` →
   `~/.hermes/skills/brand-content-pipeline/acme-linkedin-content/`, copy them together;
   a skill that loads without its logos drafts a caption and then fails at the build step
2. `scripts/*` → `~/.hermes/scripts/`
3. `man_lin_pos.prompt.md` → `~/.hermes/cron/`
4. Gate the approval channel in `config.yaml` and restart the gateway, **before** creating
   the job, because skipping it fails silently
5. Install the token file at mode `600`
6. Create the job (`SETUP.md` §4) and record the returned job id
7. `linkedin_org_post.py --dry-run` once, before any draft is approved

Full detail, including the four-state machine and the acceptance checklist, is in
`SETUP.md`. Run it by hand once before trusting the schedule.

## Try it in 30 seconds

```bash
node scripts/build_post_template.js example/2026-08-25_spec.json /tmp/t.html --assets assets
```

Then open `/tmp/t.html` in a browser. The rendered result is `example/2026-08-25.png`.

To see the rejection path, delete an item from the spec's `items` array and run it again , 
`cards` takes exactly three.

## Adapting it for a client

Three files carry all the brand-specific content:

- `assets/`. Their logo pack, white variants for a dark canvas
- `reference/DESIGN.md`, palette and layout geometry
- `SKILL.md`, voice, pillars, sequencing rules

`build_post_template.js` needs its `C` palette object and the CSS block changed; the six
layouts, the validation, and the rotation guard are brand-agnostic. `render_linkedin_post.sh`,
`validate_linkedin_layout.js`, `linkedin_context.py`, `linkedin_log.sh` and
`linkedin_org_post.py` need nothing changed at all. They already take a brand argument or
measure geometry only.

Everything in `reference/GUARDRAILS.md` transfers unchanged. It is the part that took the
longest to get right and the part a client will not think to ask for.

**Never run two brands through one set of state.** Separate approval channel, approval
directory, log account, and token file, always. A shared log makes one brand's post look
like the other's and the job silently skips a day; a shared token file publishes to the
wrong page.

## Cost

One post a day, weekdays: the caption and topic selection are a few thousand tokens, the
vision pass one image. Roughly **US$0.10–0.25 per post**, so **US$3–6/month**. The render is
free. It is a headless browser, not a model.

Worth saying out loud on a call, because clients price this against a social-media retainer
and expect it to be the expensive part. It isn't. The expensive part is the approval
discipline, and that is a one-time build.

## Scope we sell this as

**S$2,400**, build, brand assets and voice defined with them, the approval gate wired to
whichever channel they already live in, and two weeks of daily drafts with a review at the
end of week one to tune topic selection and the visual system.

Then **S$700/month** to run it, keep the pillar mix honest, and rotate the layouts.

The upsell is the second brand. The state separation is already built; a sibling job is a
day's work and roughly S$900.
