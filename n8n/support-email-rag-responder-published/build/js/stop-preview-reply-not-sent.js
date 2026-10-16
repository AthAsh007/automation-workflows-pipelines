// Preview mode (TEST_RUN = true, TEST_EMAIL blank), or over the per-run cap. The reply is
// built in full and shown here, exactly as the customer would get it, and nothing is sent.
// Read these before switching anything on.
const cfg = $('config').first().json;
return $input.all().map((i) => ({ json: {
  outcome: i.json.held_by_cap ? 'held: ' + i.json.hold_reason : 'preview: reply not sent (mode ' + cfg.mode + ')',
  to: i.json.from,
  subject: i.json.reply_subject,
  would_reply_to_message: i.json.reply_to_message_id,
  thread_id: i.json.reply_thread_id,
  in_reply_to: i.json.reply_in_reply_to,
  classified_by: i.json.classified_by,
  knowledge: i.json.knowledge_reason,
  sources: i.json.used_sources,
  written_by: i.json.written_by,
  reply: i.json.reply_text
} }));
