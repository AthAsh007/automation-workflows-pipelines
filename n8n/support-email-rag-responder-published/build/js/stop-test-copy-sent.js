// Test mode: the reply went to TEST_EMAIL as a new email marked [TEST], carrying the thread it
// would have joined. Nothing reached the customer.
return $input.all().map((i, idx) => {
  const sent = $('address the reply').itemMatching(idx).json;
  return { json: {
    outcome: 'test copy sent to ' + sent.test_to,
    would_reply_to: sent.from,
    thread_id: sent.reply_thread_id,
    gmail_message_id: i.json.id || ''
  } };
});
