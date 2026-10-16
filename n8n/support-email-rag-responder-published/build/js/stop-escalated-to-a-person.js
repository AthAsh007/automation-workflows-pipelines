// The support team has the case, with the reason, the customer's words, what was retrieved
// and any draft. The customer has not been answered automatically.
return $input.all().map((i, idx) => {
  const sent = $('prepare the escalation').itemMatching(idx).json;
  return { json: {
    outcome: 'escalated to ' + sent.alert_to,
    reason: sent.escalation_reason,
    from: sent.from,
    subject: sent.subject,
    thread_id: sent.thread_id
  } };
});
