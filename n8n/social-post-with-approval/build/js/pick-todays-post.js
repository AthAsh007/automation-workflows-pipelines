// Pick the one post that goes out today, and prove it is allowed to.
//
// The bank is in publish order. Today's post is the lowest-numbered slot still `ready` that
// has never been published — and then it has to survive three guards, all carried over from
// build.js in the drafts repo, because a bank that was correct when it was built can be
// reordered in a spreadsheet afterwards:
//
//   layout   no two posts within WINDOW_SLOTS slots share a layout
//   pillar   no two posts within WINDOW_SLOTS slots share an argument
//   Thursday a "Design process" post goes out on a Thursday, or not at all
//
// A guard that trips HOLDS the post and moves to the next candidate. It never rewrites the
// bank and never silently publishes anyway — the reason travels with the run and ends up in
// the log, so a held post is visible rather than mysteriously skipped.
//
// Input: every row of the Bank tab, or nothing at all when SHEET_ID is blank.
// Output: exactly one item, always.

const cfg = $('config').first().json;
const state = $('resolve todays state').first().json;
const B = cfg.bank_columns;

const norm = (v) => String(v === undefined || v === null ? '' : v).trim();

// Items may arrive as a JSON string (from a sheet cell) or as a real array (demo bank).
function parseItems(v) {
  if (Array.isArray(v)) return v;
  const s = norm(v);
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return null;   // null means malformed, which is different from empty
  }
}

let bank;
if (cfg.using_demo_bank) {
  bank = cfg.demo_bank.map((p) => Object.assign({}, p, { state: 'ready', _row: 0 }));
} else {
  bank = items
    .map((i, n) => {
      const r = i.json || {};
      return {
        slot: Number(r[B.slot]) || 0,
        slug: norm(r[B.slug]),
        pillar: norm(r[B.pillar]),
        category: norm(r[B.category]),
        headline: norm(r[B.headline]),
        headline_size: Number(r[B.headline_size]) || 0,
        subhead: norm(r[B.subhead]),
        layout: norm(r[B.layout]).toLowerCase(),
        items: parseItems(r[B.items]),
        band: norm(r[B.band]),
        stat_big: norm(r[B.stat_big]),
        stat_sub: norm(r[B.stat_sub]),
        footer: norm(r[B.footer]),
        caption: String(r[B.caption] === undefined || r[B.caption] === null ? '' : r[B.caption]),
        state: norm(r[B.state]).toLowerCase(),
        _row: n + 2   // sheet row, for the reason string — row 1 is the headings
      };
    })
    .filter((p) => p.slug);
}

bank.sort((a, b) => a.slot - b.slot);

// ---------------------------------------------------------------- the three guards
const W = cfg.window_slots;
const designRe = new RegExp('^' + cfg.design_pillar_prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

function guards(p) {
  const held = [];

  // Layout and pillar, measured against every neighbour inside the window — published or
  // not. What matters is what a reader sees inside a week, so a row still sitting `ready`
  // two slots away still counts.
  for (const q of bank) {
    if (q.slug === p.slug) continue;
    if (Math.abs(q.slot - p.slot) >= W) continue;
    if (q.layout && q.layout === p.layout) {
      held.push('layout "' + p.layout + '" repeats: slot ' + p.slot + ' and slot ' + q.slot
        + ' (' + q.slug + ') are only ' + Math.abs(q.slot - p.slot) + ' apart, window is ' + W);
    }
    if (q.pillar && q.pillar === p.pillar) {
      held.push('pillar "' + p.pillar + '" repeats: slot ' + p.slot + ' and slot ' + q.slot
        + ' (' + q.slug + ') are only ' + Math.abs(q.slot - p.slot) + ' apart, window is ' + W);
    }
  }

  // Thursday. build.js derives the weekday from the slot number because at build time there
  // is no date; here there is a real one, so this checks the actual day.
  if (cfg.enforce_design_thursday && designRe.test(p.pillar)
      && state._weekday !== 4
      && !cfg.off_cadence_design_slots.includes(p.slot)) {
    held.push('pillar "' + p.pillar + '" goes out on Thursdays. Today is '
      + state._weekday_name + '. Move the slot, or add ' + p.slot
      + ' to OFF_CADENCE_DESIGN_SLOTS with a reason.');
  }

  // Structural: a row that cannot be rendered is held, not rendered wrong.
  const LAYOUTS = ['timeline', 'cards', 'grid', 'split', 'stat', 'stack'];
  if (!LAYOUTS.includes(p.layout)) {
    held.push('unknown layout "' + p.layout + '" — one of ' + LAYOUTS.join(', '));
  }
  if (p.items === null) {
    held.push('the Items cell is not valid JSON');
  } else if (p.layout !== 'stat' && (!p.items || !p.items.length)) {
    held.push('no items');
  }
  if (!p.headline) held.push('no headline');
  if (p.layout === 'grid' && !p.band) held.push('the grid layout needs a Band');
  if (p.layout === 'stat' && !p.stat_big) held.push('the stat layout needs a Stat big');

  return held;
}

// ---------------------------------------------------------------- choose
const ready = bank.filter((p) =>
  cfg.ready_states.includes(p.state) && !state._posted_slugs.includes(p.slug));

const holds = [];
let chosen = null;

for (const p of ready) {
  const held = guards(p);
  if (!held.length) { chosen = p; break; }
  holds.push({ slot: p.slot, slug: p.slug, reasons: held });
}

if (!chosen) {
  return [{
    json: {
      _has_post: false,
      _today: state._today,
      _reason: ready.length
        ? 'every ready post is held: '
          + holds.map((h) => 'slot ' + h.slot + ' ' + h.slug + ' — ' + h.reasons[0]).join('; ')
        : 'the bank has no ready rows left — ' + bank.length + ' rows, '
          + state._posted_slugs.length + ' already published',
      _holds: holds,
      _bank_size: bank.length,
      _ready_size: ready.length
    }
  }];
}

// The caption decides the next branch. A row that already carries one is delivered as
// written; the model is only ever asked for a caption that does not exist yet.
const caption = chosen.caption.trim();

// ---------------------------------------------------------------- the writing brief
// Built here rather than inside the HTTP node's body, so the rules the model is given are
// readable without opening a JSON blob. These are the caption rules from the
// acme-linkedin-content skill, and they are checked again in code afterwards — a model
// asked for 220 words will sometimes write 340 and say it wrote 220.
const plain = (s) => String(s).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '').trim();

const system = [
  'You write LinkedIn captions for Acme, a company that builds AI workflow automation',
  'and production systems for small and mid-sized businesses.',
  '',
  'Voice: specific, concrete, slightly understated. You are explaining something you have',
  'actually built to somebody who runs a business. Short sentences. No preamble.',
  '',
  'Hard rules:',
  '- ' + cfg.caption_min_words + '-' + cfg.caption_max_words + ' words, not counting hashtags.',
  '- Open with one specific point of view, not a definition and not a question.',
  '- Bullets only where they genuinely help scanning. Three to six if used.',
  '- Translate any technical detail into an operational, cost, risk, speed or maintenance',
  '  consequence. The reader does not care what the tool is called.',
  '- Include exactly one honest trade-off or limitation. Not a disclaimer — a real one.',
  '- Close with ONE easy-to-answer question or one specific invitation. Never two calls',
  '  to action.',
  '- End with ' + cfg.hashtags_min + '-' + cfg.hashtags_max + ' hashtags on the last line,',
  '  the last of which is #Acme. At most ' + cfg.max_emoji + ' emoji in the whole caption.',
  '',
  'Never write: ' + cfg.banned_phrases.join(', ') + '.',
  'Never write a long throat-clearing intro, an invented urgency, or an unsupported superlative.',
  '',
  'NEVER INVENT: engagement numbers, client names, outcomes, prices, timelines, headcounts,',
  'certifications, partners or case studies. You have not been given any, so there are none',
  'to use. Write about the mechanism, not about results you cannot support.',
  '',
  'Return the caption text and nothing else. No preamble, no markdown headings, no quotes',
  'around it, no explanation of what you wrote.'
].join('\n');

const user = [
  'Write the caption for this post. The image is already designed and says the following —',
  'the caption must not simply repeat it, it should be what a person says underneath it.',
  '',
  'Category: ' + chosen.category,
  'Pillar: ' + chosen.pillar,
  'Headline on the image: ' + plain(chosen.headline),
  'Subhead on the image: ' + chosen.subhead,
  'Footer takeaway on the image: ' + chosen.footer,
  '',
  'The supporting items on the image:',
  (chosen.items || []).map((it) => '- ' + (Array.isArray(it) ? it.map(plain).join(' — ') : plain(it))).join('\n'),
  chosen.band ? '\nThe statement band on the image: ' + chosen.band : ''
].join('\n');

return [{
  json: Object.assign({}, chosen, {
    _has_post: true,
    _llm_system: system,
    _llm_user: user,
    _today: state._today,
    _weekday_name: state._weekday_name,
    _caption: caption,
    _needs_caption: caption === '',
    _caption_source: caption === '' ? 'model' : 'bank',
    _holds: holds,
    _bank_size: bank.length,
    _ready_size: ready.length,
    _reason: holds.length
      ? 'chose slot ' + chosen.slot + ' after holding ' + holds.length + ' earlier row(s)'
      : 'chose slot ' + chosen.slot
  })
}];
