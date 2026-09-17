// Take the model's subject + opening paragraph, or keep ours.
// The model never sees or writes a link, a tip or a direction name, so a bad
// response can only ever cost us the intro, never a fact.
const built = $('build email content').first().json;

let polished = {};
try {
  const raw = $input.first().json;
  const content = raw?.choices?.[0]?.message?.content ?? '';
  const stripped = String(content).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  polished = stripped ? JSON.parse(stripped) : {};
} catch (e) {
  polished = {};
}

const subject = typeof polished.subject === 'string' && polished.subject.trim().length > 8
  ? polished.subject.trim().slice(0, 120)
  : built.subject;

const intro = typeof polished.intro === 'string' && polished.intro.trim().length > 40
  ? polished.intro.trim()
  : built.intro;

const used = subject !== built.subject || intro !== built.intro;

// Swap the intro inside both bodies rather than rebuilding them.
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Same wrapper "build email content" used, so the replacement sits at the same width as
// the paragraphs around it.
const wrap = (s, width) => {
  const cols = width || 78;
  const out = [];
  for (const para of String(s ?? '').split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    const words = para.trim().split(/\s+/);
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      if ((line + ' ' + words[i]).length > cols) { out.push(line); line = words[i]; }
      else line += ' ' + words[i];
    }
    out.push(line);
  }
  return out.join('\n');
};

const html = built.html.split(esc(built.intro)).join(esc(intro));

// The plain-text body was already wrapped to 78 columns before it got here, so an exact
// match on the unwrapped `intro` never lands and the text part silently kept the old
// opening while the HTML part showed the new one. Swap on the wrapped form the builder
// recorded, and wrap the replacement to match.
const wrappedOld = built._intro_wrapped || built.intro;
const text = built.text.indexOf(wrappedOld) !== -1
  ? built.text.split(wrappedOld).join(wrap(intro, 78))
  : built.text.split(built.intro).join(wrap(intro, 78));

// If either body still carries the old intro, the swap missed and the two parts of the
// message would disagree. Ship ours in that case - a plain email beats a contradictory one.
const swapFailed = used && (html.indexOf(esc(built.intro)) !== -1 || text.indexOf(wrappedOld) !== -1);

return [{
  json: Object.assign({}, built, swapFailed
    ? { _llm_applied: false, _llm_swap_failed: true }
    : { subject, intro, html, text, _llm_applied: used })
}];
