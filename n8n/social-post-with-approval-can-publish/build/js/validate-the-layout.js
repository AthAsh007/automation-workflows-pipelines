// Blocking layout check, run on the HTML before a pixel is rendered.
//
// This is the cheap half of what `validate_linkedin_layout.js` does in the Hermes job. It
// cannot see the rendered pixels — no browser here — so it checks the things that are
// decidable from the source, and the PNG check after the render covers the rest.
//
// Every rule here exists because the mistake it catches actually shipped. The two defects
// found on 2026-08-28 were both obvious in the image and invisible in the HTML, which is why
// the human still looks at the PNG in Discord: this node narrows what reaches them, it does
// not replace them.

const cfg = $('config').first().json;
const p = $json;
const html = p._html || '';
const C = cfg.brand;

const issues = [];
const warnings = [];

// ---------------------------------------------------------------- the accent, three zones
// DESIGN.md: the mark, one phrase in the headline, and the single focal element. A fourth
// zone reads as decoration and was the first round's most common mistake.
const emCount = (p.headline.match(/<em>/gi) || []).length;
if (emCount === 0) {
  warnings.push('no <em> in the headline — the accent phrase is one of the three zones the '
    + 'accent is allowed in, and this post gives it up');
} else if (emCount > 1) {
  issues.push(emCount + ' <em> phrases in the headline. One. Two accent lines out of three '
    + 'reads as shouting.');
}

// The focal class is applied to exactly one element per layout by the builder. If a bank row
// somehow produces none, the post has no focus at all.
const focal = (html.match(/class="[^"]*\bfocal\b/g) || []).length;
if (p.layout !== 'stat' && focal === 0) {
  issues.push('nothing carries the focal accent — the last item should');
}

// ---------------------------------------------------------------- the canvas
if (!html.includes('width: ' + cfg.canvas_width + 'px')
    || !html.includes('height: ' + cfg.canvas_height + 'px')) {
  issues.push('the canvas is not ' + cfg.canvas_width + 'x' + cfg.canvas_height);
}
if (!html.includes(C.bg)) issues.push('the background is not ' + C.bg);
if (html.includes('class="strip"') === false) issues.push('no brand strip');

// ---------------------------------------------------------------- nothing may be fetched
// The renderer loads this with no network. A linked stylesheet, font or image is a blank
// space in a published post, and it looks fine in a browser that has the file cached.
const external = html.match(/(?:src|href)\s*=\s*["'](?!data:|#)([^"']+)/gi) || [];
if (external.length) {
  issues.push('the template references ' + external.length + ' external resource(s): '
    + external.slice(0, 3).join(', ') + '. Everything must be inline — the renderer has no '
    + 'network.');
}
if (/@import|url\(\s*["']?https?:/i.test(html)) {
  issues.push('the stylesheet imports or fetches a remote resource');
}

// ---------------------------------------------------------------- the logo
if (!cfg.logo_present) {
  issues.push('LOGO_SVG is blank in config. The post would render with a text placeholder '
    + 'where the wordmark goes. Paste acme_logo_12.svg into LOGO_SVG.');
} else if (!/<svg[\s>]/i.test(cfg.logo_svg)) {
  issues.push('LOGO_SVG does not contain an <svg> element — a truncated paste is the only '
    + 'way the logo goes missing');
}

// ---------------------------------------------------------------- text that will not fit
// The content box is 932px wide. Bold Arial caps run roughly 0.60em per character, so a line
// at the configured headline size has a character budget. Overrunning it wraps to an orphan
// word, which DESIGN.md says to fix by shortening the words, not the type.
const BOX = cfg.canvas_width - (74 * 2);
const size = Number(p.headline_size) || 94;
const budget = Math.floor(BOX / (size * 0.6));
const lines = String(p.headline).split(/<br\s*\/?>/i)
  .map((l) => l.replace(/<[^>]+>/g, '').trim());
for (const line of lines) {
  if (line.length > budget) {
    issues.push('headline line "' + line + '" is ' + line.length + ' characters at ' + size
      + 'px; about ' + budget + ' fit in the ' + BOX + 'px box. Shorten the words rather '
      + 'than the type.');
  }
}
if (lines.length > 4) {
  warnings.push('the headline is ' + lines.length + ' lines; DESIGN.md says two to four');
}

// ---------------------------------------------------------------- per-layout item counts
// Each layout is designed around a number of items. One more than it expects does not
// overflow — flexbox squeezes it — it just gets progressively unreadable, which is exactly
// the kind of thing that passes an HTML review and fails in the picture.
const EXPECTED = {
  timeline: [3, 4], cards: [3, 3], grid: [4, 4],
  split: [2, 2], stat: [3, 3], stack: [4, 5]
};
const range = EXPECTED[p.layout];
const n = (p.items || []).length;
if (range && (n < range[0] || n > range[1])) {
  issues.push('the ' + p.layout + ' layout takes ' + (range[0] === range[1] ? range[0]
    : range[0] + '-' + range[1]) + ' items, this row has ' + n);
}

// Empty strings inside an item are the other silent one: the cell renders, at full height,
// with nothing in it. That is the "dead void" defect from the first round.
(p.items || []).forEach((item, i) => {
  const parts = Array.isArray(item) ? item : [item];
  parts.forEach((part, j) => {
    if (Array.isArray(part)) {
      part.forEach((sub, k) => {
        if (!String(sub || '').trim()) {
          issues.push('item ' + (i + 1) + ' field ' + (j + 1) + '.' + (k + 1) + ' is empty');
        }
      });
    } else if (!String(part || '').trim()) {
      issues.push('item ' + (i + 1) + ' field ' + (j + 1) + ' is empty — it renders as a '
        + 'full-height blank');
    }
  });
});

if (!String(p.footer || '').trim()) issues.push('no footer takeaway');
if (!String(p.subhead || '').trim()) warnings.push('no subhead');
if (!String(p.category || '').trim()) issues.push('no category label');

return [{
  json: Object.assign({}, p, {
    _layout_ok: issues.length === 0,
    _issues: issues,
    _warnings: warnings,
    _reason: issues.length
      ? issues.length + ' layout issue(s): ' + issues[0]
      : 'layout ok' + (warnings.length ? ' with ' + warnings.length + ' warning(s)' : '')
  })
}];
