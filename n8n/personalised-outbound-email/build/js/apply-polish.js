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

const html = built.html.split(esc(built.intro)).join(esc(intro));
const text = built.text.split(built.intro).join(intro);

return [{ json: Object.assign({}, built, { subject, intro, html, text, _llm_applied: used }) }];
