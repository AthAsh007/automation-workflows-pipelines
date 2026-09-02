// One row's worth of write-back, for both outcomes: sent, or no deliverables in the
// repo. Columns we are not deliberately changing are written back with the value we
// read, so a partial mapping can never blank a cell.
const cfg = $('config').first().json;
const C = cfg.columns;
const j = $input.first().json;

// 'preview' and 'test' compute exactly what a live run would write, so the operator can read
// it in the execution view. It is the 'write back?' gate that stops it reaching the sheet.
const sent = j._outcome === 'sent' || j._outcome === 'preview' || j._outcome === 'test_send';
const stamp = new Date().toISOString().slice(0, 10);

const noteLine = j._outcome === 'sent'
  ? stamp + ': deliverables emailed to ' + j.email
  : j._outcome === 'test_send'
  ? stamp + ': TEST - sent to ' + (j._sent_to || '') + ' instead of ' + j.email
  : j._outcome === 'preview'
  ? stamp + ': PREVIEW - would have emailed ' + j.email
  : stamp + ': skipped - ' + (j._skip_reason || 'no deliverables in repo');

const notes = [j.existing_notes, noteLine].filter(Boolean).join(' | ').slice(0, 900);

// A blank target in config means "leave that column exactly as it was".
const settle = (target, current) => (target ? target : current);

const row = {};
row[C.row_id]        = j.row_id;
row[C.task_progress] = sent
  ? settle(cfg.task_progress_after_send, j.task_progress)
  : settle(cfg.task_progress_no_deliverables, j.task_progress);
row[C.status]        = sent
  ? settle(cfg.status_after_send, j.status)
  : settle(cfg.status_no_deliverables, j.status);
row[C.next_action] = sent
  ? 'Follow up in 3 days if no reply'
  : 'Build deliverables for ' + j.domain + ' and push to ' + cfg.github_branch;
row[C.email_title]   = sent ? j.subject : (j.existing_title || '');
row[C.email_content] = sent ? j.text : (j.existing_body || '');
row[C.notes]         = notes;

return [{
  json: Object.assign({}, row, {
    _outcome: j._outcome,
    _row_id: j.row_id,
    _business: j.business,
    _email: j.email,
    _domain: j.domain,
    _subject: sent ? j.subject : '',
    _sent_to: j._sent_to || '',
    _copy_source: j._copy_source || '',
    _skip_reason: j._skip_reason || ''
  })
}];
