// Read the classifier's answer back onto the organisation.
//
// Two rules. The model may only pick a category that exists in config — anything else is
// treated as Unclassified rather than quietly inventing a segment. And a failed or
// unparseable call leaves the organisation exactly as the keyword rules left it, so the run
// continues; an AI outage is not an outage of the pipeline.
const cfg = $('config').first().json;
const allowed = (cfg.category_rules || []).map((r) => r.category);
const src = $('AI classification needed?');
const replies = $input.all();

const orgFor = (i) => {
  try { return src.itemMatching(i).json; } catch (e) { /* fall through */ }
  return (src.all(0)[i] || src.all()[i] || { json: {} }).json;
};

// Claude returns content blocks; with thinking on, the answer is not always block 0.
const firstText = (body) => {
  const blocks = (body && body.content) || [];
  const block = blocks.find((b) => b && b.type === 'text' && String(b.text || '').trim());
  return block ? String(block.text) : '';
};

const parse = (raw) => {
  const s = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch (e) { return null; }
};

return replies.map((reply, i) => {
  const org = orgFor(i);
  const body = reply.json || {};
  const answer = parse(firstText(body));

  const category = answer && allowed.includes(String(answer.category)) ? String(answer.category) : '';
  const confidence = answer && isFinite(Number(answer.confidence)) ? Number(answer.confidence) : 0;
  const usable = category !== '' && confidence >= 0.5;

  return {
    json: Object.assign({}, org, {
      category: usable ? category : (org.category || 'Unclassified'),
      _category_matched_on: usable ? 'ai' : (org._category_matched_on || ''),
      _category_confident: usable ? true : Boolean(org._category_confident),
      _ai_called: true,
      _ai_answer: answer ? (answer.reason || '') : '',
      _ai_confidence: confidence,
      _ai_failed: answer === null,
      _ai_error: body.error ? String(body.error.message || body.error.type || 'error') : ''
    })
  };
});
