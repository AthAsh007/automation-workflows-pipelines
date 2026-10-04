// What the guard would do about each deal, decided before anything is written.
//
// Four outcomes, and only the first one creates anything:
//
//   create      no next step within the horizon -> schedule the one this stage calls for
//   escalate    there IS a next step but it is already overdue -> tell a manager, do not
//               stack a second task on top of the one the rep is already ignoring
//   skip        covered, in its grace window, or past the daily cap
//   reengage    a referral partner that has gone quiet -> a different activity entirely
//
// The cap is enforced here, in code, not in a comment. Items are ordered worst-first so
// that if the cap does bite it bites on the deals that matter least.
const cfg = $('config').first().json;
const items = $input.all();

const stageByName = {};
(cfg.stages || []).forEach(function (s) { stageByName[s.name] = s; });

const types = cfg.activity_types || {};
const DAY = 86400000;
const now = Date.now();

function dueDate(days) {
  return new Date(now + Number(days || 1) * DAY).toISOString().slice(0, 10);
}

// Worst first: longest quiet, then highest value. A cap that truncates the tail should
// truncate the least urgent tail.
const ranked = items.map(function (i) { return i.json; }).sort(function (a, b) {
  const q = Number(b.days_quiet || 0) - Number(a.days_quiet || 0);
  if (q !== 0) return q;
  return Number(b.value || 0) - Number(a.value || 0);
});

let created = 0;
const cap = Number(cfg.daily_cap || 0);
const out = [];

ranked.forEach(function (deal) {
  const stage = stageByName[deal.stage] || {};
  let action = 'skip';
  let reason = '';
  let type = '';
  let subject = '';
  let due = '';

  const quietPartner = cfg.partner_stages.indexOf(deal.stage) !== -1 &&
    Number(deal.days_quiet || 0) >= Number(cfg.reengage_after_days || 60);

  if (deal.covered && deal.overdue) {
    action = 'escalate';
    reason = 'has a next activity, overdue since ' + deal.overdue_due +
      ' — escalated rather than stacked';
  } else if (deal.covered) {
    action = 'skip';
    reason = 'covered — next activity due ' + deal.next_due;
  } else if (deal.in_grace) {
    action = 'skip';
    reason = 'created in the last ' + cfg.grace_hours + 'h — left alone';
  } else if (quietPartner) {
    action = 'reengage';
    type = types[cfg.reengage_type] || cfg.reengage_type;
    subject = cfg.reengage_subject;
    due = dueDate(2);
    reason = 'referral partner, quiet for ' + deal.days_quiet + ' days';
  } else if (!stage.next_type) {
    action = 'skip';
    reason = 'stage "' + deal.stage + '" has no next_type configured — deliberately ignored';
  } else {
    action = 'create';
    type = types[stage.next_type] || stage.next_type;
    subject = stage.subject;
    due = dueDate(stage.due_in_days);
    reason = deal.parked_due
      ? 'only open activity is parked at ' + deal.parked_due + ', past the ' +
        cfg.horizon_days + '-day horizon'
      : 'no open activity at all';
  }

  const writes = action === 'create' || action === 'reengage';
  if (writes && cap > 0 && created >= cap) {
    action = 'skip';
    reason = 'daily cap of ' + cap + ' reached — picked up on the next run';
    type = ''; subject = ''; due = '';
  } else if (writes) {
    created++;
  }

  out.push({
    json: Object.assign({}, deal, {
      action: action,
      action_reason: reason,
      activity_type: type,
      activity_subject: subject,
      activity_due: due,
      // The owner the activity is assigned to. In test mode every activity lands on one
      // user, so a real rep's task list is untouched while the rule is being verified.
      assign_to: cfg.test_write && cfg.test_owner_id
        ? Number(cfg.test_owner_id) : deal.owner_id,
      _create: (action === 'create' || action === 'reengage') && cfg.write_enabled === true,
      _body: (action === 'create' || action === 'reengage') ? {
        subject: subject,
        type: type,
        due_date: due,
        due_time: '09:00',
        duration: '00:30',
        deal_id: deal.id,
        person_id: deal.person_id || undefined,
        org_id: deal.org_id || undefined,
        user_id: (cfg.test_write && cfg.test_owner_id
          ? Number(cfg.test_owner_id) : deal.owner_id) || undefined,
        note: 'Scheduled by the activity guard: ' + reason
      } : null
    })
  });
});

return out;
