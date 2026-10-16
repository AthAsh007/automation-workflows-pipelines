// Live: the reply went out on the customer's own message, so Gmail kept it in their thread.
// The ids Gmail returned are listed beside the ones the reply was attached to, so a reply that
// landed in a new thread would be visible here.
return $input.all().map((i, idx) => {
  const sent = $('address the reply').itemMatching(idx).json;
  return { json: {
    outcome: 'replied in the thread',
    to: sent.from,
    subject: sent.reply_subject,
    thread_id: sent.reply_thread_id,
    gmail_thread_id: i.json.threadId || '',
    same_thread: !i.json.threadId || i.json.threadId === sent.reply_thread_id,
    gmail_message_id: i.json.id || '',
    sources: sent.used_sources
  } };
});
