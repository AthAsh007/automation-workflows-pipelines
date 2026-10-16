// Everything the workflow will not answer on its own ends here: a handoff intent, a classifier
// that was unsure, not enough knowledge, a failed knowledge search, or a reply that could not
// be trusted. The support team gets one email per case with the reason, the customer's words,
// what was retrieved and the draft if there was one, so nobody starts from nothing.
//
// Nothing is sent to the customer from this path. The email stays in their inbox thread for a
// person to answer.
const cfg = $('config').first().json;

return $input.all().map((i, idx) => {
  const e = i.json;
  const reason = e.route === 'person' ? e.route_reason
    : (e.knowledge_ok === false ? e.knowledge_reason
    : (e.reply_ok === false ? e.reply_problem : 'needs a person'));

  const matches = (e.matches || []).slice(0, 3)
    .map((m) => '- ' + m.title + ' (score ' + m.score + ')').join('\n') || '- none';
  const body = [
    'This support email needs a person. It has NOT been answered.',
    '',
    'Why: ' + reason,
    'From: ' + (e.from_name ? e.from_name + ' <' + e.from + '>' : e.from),
    'Subject: ' + e.subject,
    'Classified by ' + (e.classified_by || '-') + ' as ' + (e.intent || '-') + ' (confidence ' + (e.confidence ?? '-') + ')',
    'Open the thread: https://mail.google.com/mail/u/0/#all/' + e.thread_id,
    '',
    'Their message:',
    e.body,
    '',
    'Knowledge retrieved:',
    matches,
    e.reply_text ? '\nDraft that was not sent:\n' + e.reply_text : ''
  ].join('\n');

  const test = cfg.mode === 'test';
  return { json: {
    escalation_reason: reason,
    from: e.from,
    subject: e.subject,
    thread_id: e.thread_id,
    message_id: e.message_id,
    alert_to: test ? cfg.test_email : cfg.support_team_email,
    alert_subject: (test ? '[TEST] ' : '') + '[Needs a person] ' + e.subject,
    alert_body: body,
    held_by_cap: test && idx >= cfg.test_cap
  } };
});
