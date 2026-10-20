// One summary for the whole run: the leads the plan set aside (waiting, stopped) plus every
// lead the loop worked through (sent, previewed, waiting on quiet hours, stopped on a reply or
// an opt-out, failed). It also counts how many touches the AI wrote against the template, and
// shapes the same summary for a Slack or Discord webhook and for one Google Sheets row.
const cfg = $('config').first().json;
const plan = $('plan the sequence').first().json;
const worked = $input.all().map((i) => i.json || {}).filter((o) => o.outcome);

const waiting = (plan.waiting || []).map((w) => ({ name: w.name, reason_key: w.reason_key, reason: w.reason }))
  .concat(worked.filter((o) => o.outcome === 'waiting'));
const stopped = (plan.stopped || []).map((s) => ({ name: s.name, reason_key: s.reason_key, reason: s.reason }))
  .concat(worked.filter((o) => o.outcome === 'stopped'));
const sent = worked.filter((o) => o.outcome === 'sent');
const previewed = worked.filter((o) => o.outcome === 'previewed');
const failed = worked.filter((o) => o.outcome === 'failed');
const written = sent.concat(previewed);

const byReason = {};
for (const s of stopped) byReason[s.reason_key || 'other'] = (byReason[s.reason_key || 'other'] || 0) + 1;
const fallbacks = {};
for (const t of written) if (t.text_source !== 'ai' && t.fallback_reason) {
  const k = t.fallback_reason.split(':')[0];
  fallbacks[k] = (fallbacks[k] || 0) + 1;
}

const counts = {
  leads_read: plan.rows_read || 0,
  due: plan.due_count || 0,
  sent: sent.length,
  previewed: previewed.length,
  waiting: waiting.length,
  stopped: stopped.length,
  failed: failed.length,
  write_back_failed: sent.filter((s) => s.write_back_failed).length,
  ai_written: written.filter((t) => t.text_source === 'ai').length,
  template_written: written.filter((t) => t.text_source !== 'ai').length
};

const list = (arr, f) => arr.map(f).join('; ') || 'none';
const lines = [
  'Follow-up sequence run (' + (cfg.mode === 'live' ? 'live' : 'preview, nothing sent') + ') from ' + plan.source,
  'Read ' + counts.leads_read + ' leads, ' + counts.due + ' due.' + (plan.more_pages ? ' More pages exist: only the first page was read.' : ''),
  'Sent: ' + counts.sent + (counts.previewed ? ' | Previewed: ' + counts.previewed : '') +
    ' | Waiting: ' + counts.waiting + ' | Stopped: ' + counts.stopped + ' | Failed: ' + counts.failed,
  'Stopped by reason: ' + (Object.keys(byReason).map((k) => k + ' ' + byReason[k]).join(', ') || 'none'),
  'Text: AI ' + counts.ai_written + ', template ' + counts.template_written +
    (Object.keys(fallbacks).length ? ' (' + Object.keys(fallbacks).map((k) => k + ' ' + fallbacks[k]).join(', ') + ')' : ''),
  'Touches: ' + list(written, (t) => t.name + ' #' + t.touch + ' ' + t.channel),
  'Waiting: ' + list(waiting, (w) => w.name + ' (' + w.reason_key + ')'),
  'Failed: ' + list(failed, (f) => f.name + ' (' + f.failed_step + ')') +
    (counts.write_back_failed ? ' | write-back failed after a send: ' + counts.write_back_failed : '')
];
const text = lines.join('\n');
const discord = /discord(app)?\.com\/api\/webhooks/i.test(cfg.report_webhook_url || '');
const runAt = new Date().toISOString();

return [{
  json: Object.assign({ run_at: runAt, mode: cfg.mode, source: plan.source }, counts, {
    stopped_by_reason: byReason,
    fallback_reasons: fallbacks,
    summary: text,
    touches: written,
    waiting_leads: waiting,
    stopped_leads: stopped,
    failed_leads: failed,
    _webhook_body: discord ? { content: text.slice(0, 1900) } : { text: text },
    _sheet_row: Object.assign({ run_at: runAt, mode: cfg.mode, source: plan.source }, counts, {
      stopped_by_reason: Object.keys(byReason).map((k) => k + ' ' + byReason[k]).join(', '),
      summary: text })
  })
}];
