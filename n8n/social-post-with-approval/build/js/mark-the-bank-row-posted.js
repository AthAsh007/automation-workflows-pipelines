// Mark the bank row published so it can never be drafted a second time.
//
// Only ever runs on a real POSTED outcome. The log already prevents a re-draft on its own —
// `_posted_slugs` is read from it — so this is the second of two independent guards, not the
// only one. Two guards because the failure it prevents is publishing the same post twice.

const cfg = $('config').first().json;
const B = cfg.bank_columns;
const d = $json;

const row = {};
row[B.slug] = d._slug;
row[B.state] = 'posted';

return [{ json: Object.assign(row, {
  _reason: 'bank row ' + d._slug + ' marked posted'
}) }];
