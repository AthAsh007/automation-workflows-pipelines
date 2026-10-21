// The row that closes a draft.
//
// One row per outcome, appended — the log is never rewritten in place. Each one carries the
// draft's message id, which is what closes it (see "find the pending draft"):
//
//   posted     on the page; silences the rest of the day; its Pillar and Hook feed topic
//              rotation and the repeated-hook check from now on
//   cancelled  a reviewer said no; workflow 01 drafts again the same day
//   expired    nobody answered in time; closed without claiming it went out
//
// The bank row's State is updated separately, and only on a real publish. A cancelled post
// stays `ready` on purpose: cancelling means "not this one, now", not "never".

const cfg = $('config').first().json;
const L = cfg.log_columns;
// On the publish path this node runs after "[cred] Sheets - mark the bank row", whose output is
// the bank row it wrote ({ Slug, State }), not the publish result. Read the publish result by
// name there; the cancel and expiry paths hand their own item straight in.
const fromSheet = $json && $json._outcome === undefined && $json._decision === undefined
  && $json._expired === undefined;
const d = fromSheet ? $('read the publish result').first().json : $json;

const status = d._outcome === 'POSTED' ? 'posted'
  : d._outcome === 'DUPLICATE' ? 'posted'
  : d._decision === 'cancel' ? 'cancelled'
  : d._expired ? 'expired'
  : 'failed';

const row = {};
row[L.date] = d._date || '';
row[L.slug] = d._slug || '';
row[L.slot] = d._slot || '';
row[L.status] = status;
row[L.channel_id] = d._channel_id || cfg.channel_id;
row[L.message_id] = d._message_id || '';
row[L.reply_id] = d._reply_id || '';
row[L.caption_fp] = d._caption_fp_now || d._caption_fp || '';
row[L.pillar] = d._pillar || '';
row[L.hook] = status === 'posted' ? (d._hook || '') : '';
row[L.urn] = d._urn || '';
row[L.note] = [
  d._approver ? 'by ' + d._approver : '',
  d._said ? '"' + d._said + '"' : '',
  d._reason || ''
].filter(Boolean).join(' — ').slice(0, 900);
row[L.at] = new Date().toISOString();

return [{ json: Object.assign(row, {
  _status: status, _slug: d._slug, _outcome: d._outcome, _post_url: d._post_url,
  _approver: d._approver, _reason: d._reason
}) }];
