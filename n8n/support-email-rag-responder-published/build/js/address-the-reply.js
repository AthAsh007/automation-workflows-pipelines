// Decides where each reply goes, in one place:
//   live    -> a reply on the customer's own Gmail message, so it stays in their thread
//   test    -> a new email to TEST_EMAIL, marked [TEST], saying which thread it would have
//              gone into; at most TEST_CAP per run
//   preview -> nowhere; the reply is shown on STOP: preview - reply not sent
// REPLY_CAP_PER_RUN is enforced here. Anything over it is held, with the reason, on
// STOP: preview - reply not sent, for a person to answer. The trigger only picks up new mail.
const cfg = $('config').first().json;
const cap = cfg.mode === 'test' ? Math.min(cfg.test_cap, cfg.reply_cap_per_run) : cfg.reply_cap_per_run;

return $input.all().map((i, idx) => {
  const e = i.json;
  const held = idx >= cap;
  const out = Object.assign({}, e, {
    mode: cfg.mode,
    live: cfg.mode === 'live',
    held_by_cap: held,
    hold_reason: held ? 'over the ' + cfg.mode + ' cap of ' + cap + ' replies per run' : '',
    // Thread continuity: the live reply is attached to message_id (Gmail's id), which puts it in
    // thread_id and sets In-Reply-To / References from the original's RFC Message-ID.
    reply_to_message_id: e.message_id,
    reply_thread_id: e.thread_id,
    reply_in_reply_to: e.rfc_message_id,
    reply_subject: /^re:/i.test(e.subject) ? e.subject : 'Re: ' + e.subject
  });
  if (cfg.mode === 'test') {
    out.test_to = cfg.test_email;
    out.test_subject = '[TEST] ' + out.reply_subject;
    out.test_body = 'Would reply to ' + e.from + ' in thread ' + e.thread_id + ' (message ' + e.message_id + ').\n'
      + 'Classified by ' + e.classified_by + ' as ' + e.intent + ' (' + e.confidence + '). '
      + e.knowledge_reason + '. Written by ' + e.written_by + '.\n\n----\n\n' + e.reply_text;
  }
  return { json: out };
});
