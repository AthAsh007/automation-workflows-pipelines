// Scores every prospect on the fields Clay already sent, BEFORE anything is spent on them.
// That ordering is the whole credit argument: the tier decides who is worth enriching, so a
// C or a Reject never costs a credit.
//
// SCORING, DISQUALIFY, TIERS, PERSONAS and RECOMMENDED_ACTION all live in config. The score
// breakdown is kept on the prospect, so a rep (or Zoho) can see why someone is an A.
//
// Duplicates are caught here too, inside the run, on email, then LinkedIn, then name + domain.
// The first row wins; a later copy is held with the row it duplicates. Across runs, Zoho's
// upsert on ZOHO_DUPLICATE_CHECK is what stops a second lead being created.
const cfg = $('config').first().json;
const lower = (v) => String(v === undefined || v === null ? '' : v).toLowerCase().trim();

function matches(p, rule) {
  const v = p[rule.field];
  if (rule.any_of) {
    const list = Array.isArray(v) ? v.map(lower) : [lower(v)];
    return rule.any_of.some((w) => list.some((x) => x.includes(lower(w))));
  }
  if (rule.between) {
    const n = Number(v);
    return v !== null && v !== '' && !Number.isNaN(n) && n >= rule.between[0] && n <= rule.between[1];
  }
  const s = lower(v);
  if (!s) return false;
  if (rule.equals) return rule.equals.map(lower).includes(s);
  if (rule.contains) return rule.contains.some((w) => s.includes(lower(w)));
  return false;
}

function personaFor(p) {
  const names = (cfg.personas || []).map((x) => x.persona);
  const ai = (names.find((n) => lower(n) === lower(p.ai_persona)));
  if (ai) return { persona: ai, by: 'Clay AI column' };
  const t = ' ' + lower(p.title) + ' ';
  for (const x of cfg.personas || []) {
    if (x.words.some((w) => t.includes(lower(w)))) return { persona: x.persona, by: 'title' };
  }
  return { persona: 'Unclassified', by: 'no rule matched' };
}

function actionFor(tier, persona) {
  const map = cfg.recommended_action || {};
  return map[tier + '|' + persona] || map[tier + '|*'] || 'Review by hand';
}

const seen = {};
const keyOf = (p) => [
  p.email && 'email:' + p.email,
  p.linkedin_url && 'li:' + lower(p.linkedin_url).replace(/\/+$/, ''),
  p.full_name && (p.domain || p.company) && 'nd:' + lower(p.full_name) + '@' + lower(p.domain || p.company)
].filter(Boolean);

return $input.all().map((item) => {
  const p = Object.assign({}, item.json);

  if (!p._usable) {
    return { json: Object.assign(p, { score: 0, tier: 'Reject', persona: 'Unclassified',
      recommended_action: actionFor('Reject', ''), score_breakdown: [], _duplicate_of: '' }) };
  }

  const hits = (cfg.scoring || []).filter((r) => matches(p, r));
  const raw = hits.reduce((s, r) => s + Number(r.points || 0), 0);
  const score = Math.max(0, Math.min(100, raw));
  const dq = (cfg.disqualify || []).find((r) => matches(p, r));

  let tier = 'Reject';
  for (const t of cfg.tiers || []) { if (score >= t.min_score) { tier = t.tier; break; } }
  if (dq) tier = 'Reject';

  const who = personaFor(p);
  let dupOf = '';
  for (const k of keyOf(p)) { if (seen[k]) { dupOf = seen[k]; break; } }
  if (!dupOf) for (const k of keyOf(p)) seen[k] = p.clay_row_id;

  return {
    json: Object.assign(p, {
      score: score,
      tier: tier,
      persona: who.persona,
      persona_by: who.by,
      recommended_action: actionFor(tier, who.persona),
      score_breakdown: hits.map((r) => r.label + ' +' + r.points),
      disqualified_by: dq ? dq.label : '',
      _duplicate_of: dupOf,
      _hold: dupOf ? 'duplicate of ' + dupOf + ' in this run' : (dq ? 'disqualified: ' + dq.label : p._hold)
    })
  };
});
