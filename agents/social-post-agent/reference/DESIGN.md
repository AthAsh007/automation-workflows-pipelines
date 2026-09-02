# Acme post visual language

Authoritative as of the 2026-08-18 approval. `scripts/build_post_template.js` implements
exactly what is below. If the two ever disagree, the script is the bug.

The rule the first attempt got wrong: **the accent colour has to live in the content**, not
only in a strip at the bottom edge. Flat text-only slides with a pink footer were rejected
as below par.

## Non-negotiables

| Element | Value |
|---|---|
| Canvas | 1080 x 1350, background `#050505` |
| Logo | `assets/acme_logo_12.svg`, pink mark + white wordmark. Inlined as SVG, 306px wide, top left. Never redrawn, recoloured, rasterized, refetched, or regenerated. |
| Category label | Top right, `#A8A8A8`, 19px bold, `letter-spacing: 0.3em`, uppercase. **No pink square.** |
| Brand strip | Pink `#DC2056`, 13px, **full-bleed** along the bottom edge. No inset, no outer border frame. |
| Content inset | 74px, with 88px at the bottom to clear the strip |
| Typeface | Arial / Helvetica. Not the official brand face. No approved Acme typeface exists yet, so do not describe it as one. |
| Footer | `#303030` divider rule above it; takeaway left and `acme.example` right, both 25px **bold white**, not muted. The first attempt greyed these out and they disappeared. |

## Palette. These exact values, nothing else

```
pink       #DC2056     background  #050505     white       #FFFFFF
muted      #A8A8A8     rule        #303030
cardBorder #262626     cardBg      #0B0B0B
```

`#E3245A` appears in `references/linkedin-daily-post-pipeline.md` in the ops repo and is
**stale**. Ignore it.

## Where the pink goes, exactly three zones

1. **The logo mark.**
2. **One phrase inside the headline**, wrapped in `<em>`. The phrase that carries the
   argument (`<em>BLOCKED TEAMS</em>`, `IS THE <em>PRODUCT</em>`). Keep it to roughly one
   line; two pink lines out of three reads as shouting. The builder rejects a headline that
   does not contain exactly one `<em>`.
3. **The single focal element**: last timeline node, last card, the grid band, the right
   split column, the stat figure, or the last bar. The builder applies this from the layout , 
   it is never hand-set in the spec.

Never a fourth. `stat` makes the figure the focal element, so its supporting cells stay
neutral; giving the last cell a pink border too pushed a build to four zones. Everything
else is white, `#A8A8A8` muted, or `#303030` rule.

The builder rejects any spec that carries a colour or a `style=` attribute in the copy , 
pink is structural here, and hand-written colour is always the wrong way to get it.

## The six layouts

| `type` | Shape | Suits | `items` shape |
|---|---|---|---|
| `timeline` | Vertical numbered circles (58px, 1px `#303030`) joined by a 1px connector, last circle **filled pink**. Rows two-tier: 35px bold white title, 25px `#A8A8A8` description. Rows `flex: 1` so connectors stretch; last row `flex: none`. | 4 sequential or escalating checks | `[[title, description] × 4]` |
| `cards` | Three equal columns, 14px radius, `#262626` border, `#0B0B0B` fill. Inside: 17px letterspaced eyebrow, 41px bold title, flex spacer, 23px description pinned bottom. Last card: `#DC2056` border, `rgba(220,32,86,0.07)` tint, pink title. | 3 stages or states | `[[eyebrow, title, description] × 3]` |
| `grid` | 2×2 cells with muted `×` marks, closed by a full-width pink statement band | 4 parallel items, especially negations | `[[title, description] × 4]` plus `band` |
| `split` | Two columns, aligned rows, right column pink | Before/after, or a two-option comparison | `[[label, [row × 4]] × 2]` |
| `stat` | One huge pink figure over three neutral supporting cells | A single number that carries the argument | `statBig`, `statSub`, `[[label, text] × 3]` |
| `stack` | Full-width horizontal bars, label left, text right, last bar pink | 5 items that read as a list | `[[label, text] × 5]` |

Item counts are exact, not minimums. The builder rejects a `stack` with four items or a
`cards` with two, the layouts use `flex: 1` distribution and a short row set leaves a dead
void in the middle of the slide, which is one of the two defects that shipped in round one.

## Layout rotation. No reuse inside a publishing week

The cron is `0 8 * * 1-5`, so a week is five consecutive posts and `WINDOW_SLOTS = 5`. No
two posts within 5 slots may share a **layout** or a **pillar**. The builder enforces both
against `design_history.json`; on collision it prints `COLLISION`, writes nothing, exits 1.

The window is measured in **publish slots, not build dates**. An earlier version keyed on
the build date, which meant a bank rendered in one sitting collided with itself even though
the posts would go out weeks apart. What matters is what a reader sees inside a week.

Both checks exist because both mistakes reached the live page: two posts shipped the same
`timeline` layout on one day, and two shipped the same pillar on one day. Rotate the layout
**and** the argument. Do not re-skin the same one.

`--force` overrides the check loudly, and exists for re-running a genuinely cancelled day.
It is not a way to push a repeat through.

## Headline sizing

Shipped sizes: 82–106px, driven by line length. The constraint is the 932px content box.
Bold Arial caps run roughly 0.60em per character, so a 16-character line needs about 90px
maximum.

The builder **warns** on a line that looks too long and does not block on it. The estimate
is crude, punctuation and spaces are far narrower than 0.60em, and `SUCCESS. FAILURE. /
UNKNOWN.` at 96px is a shipped post that fits despite tripping the estimate. The blocking
check is `validate_linkedin_layout.js`, which measures the real rendered geometry.

If a headline wraps to an orphan word, **shorten the words rather than the type**:
`THE BEST TOOL IS ONE THEY ALREADY OPEN` became `NO NEW TOOL TO LEARN`.

## Content limits

One headline. One supporting sentence. Three to five short supporting items. One footer
takeaway. Nothing else.

Never use: generated or approximated logos; robots, glowing brains, holograms, or generic
AI imagery; gradients and lens effects; dense paragraph text; tiny diagrams; fake
dashboards; decorative elements that carry no meaning.

## Rendering

Two paths, same 1080×1350 canvas:

**Hermes box**, Playwright, `deviceScaleFactor: 2`, so the export is 2160×2700:

```bash
NODE_PATH=/usr/local/lib/hermes-agent/node_modules \
  bash scripts/render_linkedin_post.sh <absolute template.html> <absolute out.png>
```

**Windows box**, Chrome headless, scale factor 1, so the export is 1080×1350. Playwright
is not installed there:

```bash
chrome --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1080,1350 \
  --screenshot=<ABSOLUTE WINDOWS PATH>.png file:///.../template.html
```

A relative `--screenshot` path writes nothing and leaves the previous PNG in place. That
happened once and the stale image was almost inspected as if it were the new render, the
timestamp gave it away, not the picture. Delete the old PNG first and re-read the header
dimensions afterwards. **Never trust a PNG you did not just watch get written.**

## Always look at the PNG

Not the HTML. Check:

- Official logo, unchanged, with clear space
- **Exactly one** pink focal element, plus the logo mark and the headline `<em>`
- No clipping, overlap, missing glyphs, or mojibake
- Headline still readable at feed-thumbnail size
- Nothing touching or crossing the safe area
- No dead void in the middle of the slide
- No low-contrast text, `#303030` on `#050505` is effectively invisible

The last two both shipped in round one. Both were obvious in the image and invisible in the
HTML. That is the whole reason this step exists.

## Superseded, do not follow

These appear in older copies of the skill and predate the 2026-08-18 approval:

- Outer 1px border inset 28px, and a bottom brand strip inset 28px → the strip is now
  **full-bleed** and there is **no outer border**.
- Category label with a 12×12 pink square → **no square**.
- `acme_logo_11.svg` (all white) as default → the default is **`acme_logo_12.svg`**
  (pink mark). `11` is the all-white fallback; `04` is the symbol-only variant for tight
  layouts. Only white variants are bundled because the canvas is always `#050505`, if a
  layout ever needs a dark-on-light lockup, request the official file rather than
  recolouring one of these.
- "Capture at device scale factor 1" as a universal rule → true for the Windows Chrome
  path, but `render_linkedin_post.sh` deliberately uses **2** to produce the 2160×2700
  export. The canvas is 1080×1350 either way.
