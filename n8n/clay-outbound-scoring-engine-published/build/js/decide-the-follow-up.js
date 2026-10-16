// What happens next for each reply, decided from its class and nothing else:
//
//   interested   Zoho status + a task due today + the team is told     (a person calls)
//   referral     Zoho status + a task to contact the named person + told
//   needs_human  Zoho status + a task due today + told                  (a person reads it)
//   not_now      Zoho status + a task in TASK_DUE_DAYS.not_now days
//   unsubscribe  Zoho Email_Opt_Out + status, and suppressed in Smartlead
//   out_of_office nothing: Smartlead carries on with the sequence
//
// The bot never replies to anyone. Every reply that needs an answer becomes a person's task.
const cfg = $('config').first().json;
const S = cfg.reply_status || {};
const due = cfg.task_due_days || {};
const today = new Date();
const dayPlus = (n) => new Date(today.getTime() + Number(n || 0) * 86400000).toISOString().slice(0, 10);

const subjects = {
  interested: (r) => 'Call ' + (r.lead_name || r.lead_email) + ': replied interested',
  referral: (r) => 'Contact the referral from ' + (r.lead_name || r.lead_email) + (r.referral_email ? ': ' + r.referral_email : ''),
  needs_human: (r) => 'Read and answer ' + (r.lead_name || r.lead_email) + "'s reply",
  not_now: (r) => 'Follow up with ' + (r.lead_name || r.lead_email) + ': asked for later'
};

return $input.all().map((item) => {
  const r = Object.assign({}, item.json);
  const c = r.class;
  r._write_zoho = c !== 'out_of_office';
  r._status = S[c] || '';
  r._opt_out = c === 'unsubscribe';
  r._suppress = c === 'unsubscribe';
  r._notify = ['interested', 'referral', 'needs_human'].includes(c);
  r._task = subjects[c] ? {
    subject: subjects[c](r),
    due_date: dayPlus(due[c]),
    priority: c === 'not_now' ? 'Normal' : 'High',
    description: 'Reply (' + c + ', ' + r.classified_by + '): "' + r.text.slice(0, 500) + '"'
  } : null;
  r._action = c === 'out_of_office' ? 'ignored: auto-reply, the sequence continues'
    : c === 'unsubscribe' ? 'opted out in Zoho, unsubscribed in Smartlead'
    : 'Zoho status "' + r._status + '" and a task due ' + r._task.due_date;
  return { json: r };
});
