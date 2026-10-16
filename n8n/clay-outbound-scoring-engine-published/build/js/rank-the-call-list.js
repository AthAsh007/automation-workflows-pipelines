// Today's call list, in the order to ring: every interested reply first (the most recent at the
// top, they are warmest), then referrals, then A-tier leads by fit score. Capped at
// CALL_LIST_SIZE so it is a list someone can finish before lunch. A lead with no phone stays on
// it, marked "email instead", rather than disappearing.
const cfg = $('config').first().json;
const S = cfg.reply_status || {};
const merged = $input.all().map((i) => i.json);
const src = merged.find((m) => m.rows) || { rows: [], source: 'none' };

const rank = (r) => r.status === S.interested ? 0 : (r.status === S.referral ? 1 : 2);
const sorted = src.rows.slice().sort((a, b) =>
  rank(a) - rank(b) ||
  (rank(a) < 2 ? String(b.modified).localeCompare(String(a.modified)) : (Number(b.score || 0) - Number(a.score || 0))));
const list = sorted.slice(0, Number(cfg.call_list_size || 25));

const why = (r) => r.status === S.interested ? 'replied interested'
  : r.status === S.referral ? 'referred to by a prospect' : 'A tier, fit ' + (r.score === null ? '?' : r.score);
const lines = list.map((r, i) => (i + 1) + '. ' + r.name + ', ' + r.company + (r.title ? ' (' + r.title + ')' : '') +
  ': ' + why(r) + '. ' + (r.phone ? r.phone : 'no phone, email ' + r.email) + (r.action ? '. ' + r.action : ''));
const day = new Date().toISOString().slice(0, 10);
const text = (cfg.mode === 'live' ? '' : '[' + cfg.mode.toUpperCase() + '] ') + 'Call list for ' + day +
  ' (' + list.length + (sorted.length > list.length ? ' of ' + sorted.length : '') + ', from ' + src.source + ')\n' + lines.join('\n') +
  (src.more ? '\nZoho had more rows than one page: the list is from the most recent 200.' : '');

return [{ json: { source: src.source, count: list.length, list: list.map((r) => Object.assign({ why: why(r) }, r)),
  text: text, _notify_body: { text: text } } }];
