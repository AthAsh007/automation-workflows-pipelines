// Pairs each drafted reply back to its email and decides whether it may be sent. It may not
// when: the call failed after its retries, the answer does not parse, the model asked to
// escalate, the reply is empty, or it claims a source that was not among the excerpts it was
// given. Each of those goes to a person with the reason, and the draft (if any) is attached so
// the person starts from it.
return $input.all().map((item, idx) => {
  const email = Object.assign({}, $('build the reply request').itemMatching(idx).json);
  delete email._body;
  const res = item.json || {};
  const given = new Set(email.matches.map((m) => m.id));

  let reply = '';
  let used = [];
  let problem = '';
  if (res.error) problem = 'reply generation failed: ' + String(res.error.message || res.error).slice(0, 200);
  else {
    try {
      const p = JSON.parse(res.choices[0].message.content);
      reply = String(p.reply || '').trim();
      used = Array.isArray(p.used_sources) ? p.used_sources.map(String) : [];
      if (p.escalate === true) problem = 'the model said the knowledge does not answer it: ' + String(p.reason || '').slice(0, 160);
      else if (!reply) problem = 'the model returned an empty reply';
      else if (!used.length) problem = 'the reply cites no knowledge source';
      else if (used.some((u) => !given.has(u))) problem = 'the reply cites a source it was not given: ' + used.filter((u) => !given.has(u)).join(', ');
    } catch (e) { problem = 'the reply did not parse'; }
  }

  return { json: Object.assign(email, {
    reply_text: reply,
    used_sources: used,
    written_by: 'AI (' + $('config').first().json.openai_chat_model + ')',
    reply_ok: problem === '',
    reply_problem: problem
  }) };
});
