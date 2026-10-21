// What the guard would do about each deal, decided before anything is written.
//
// Four outcomes, and only two of them create anything:
//
//   create      no next step within the horizon -> schedule the one this stage calls for
//   reengage    a referral partner that has gone quiet -> a different activity entirely
//   escalate    there IS a next step but it is overdue -> tier "owner" (the rep's DM) or,
//               past MANAGER_AFTER_DAYS, tier "manager". Never a second task stacked on
//               top of the one the rep is already ignoring.
//   skip        covered, in its grace window, past the daily cap, or a stage with no rule
//
// Due dates are BUSINESS days from today, then load-levelled per rep: a rep who already has
// MAX_PER_OWNER_PER_DAY open activities due that day gets the new one on the next business
// day with room (at most LEVEL_WITHIN_DAYS later). The cap is enforced here, in code, and
// items are ordered worst-first so that if it bites, it bites on the deals that matter least.
const cfg = $('config').first().json;
const items = $input.all();

/* @include _business-days.js */
const cal = businessCalendar(cfg);

const stageByName = {};
(cfg.stages || []).forEach(function (s) { stageByName[s.name] = s; });

const types = cfg.activity_types || {};
const now = Date.now();

// ---------------------------------------------------------------- each rep's existing load
// Open activities per owner per due date, from the same read the rule used.
const pipeline = $('check the PHI boundary').first().json;
const load = {};
(pipeline.activities || []).forEach(function (a) {
  if (a.done || !a.due_date || a.owner_id === null || a.owner_id === undefined) return;
  const k = String(a.owner_id) + '|' + String(a.due_date).slice(0, 10);
  load[k] = (load[k] || 0) + 1;
});
const perDay = Number(cfg.max_per_owner_per_day || 0);
const levelWindow = Number(cfg.level_within_days || 0);

function scheduleFor(ownerId, businessDays) {
  const first = cal.add(now, businessDays);
  let pick = first;
  let shifted = 0;
  let full = false;
  if (perDay > 0 && ownerId !== null && ownerId !== undefined) {
    full = true;
    for (let i = 0; i <= levelWindow; i++) {
      const day = i === 0 ? first : cal.add(first, i);
      if ((load[String(ownerId) + '|' + cal.ymd(day)] || 0) < perDay) {
        pick = day; shifted = i; full = false; break;
      }
    }
    // Every day in the window is full: keep the stage's own date and say so, rather than
    // pushing a follow-up out indefinitely.
    if (full) { pick = first; shifted = 0; }
  }
  const date = cal.ymd(pick);
  if (ownerId !== null && ownerId !== undefined) {
    const k = String(ownerId) + '|' + date;
    load[k] = (load[k] || 0) + 1;
  }
  return { date: date, shifted: shifted, owner_over_capacity: full };
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
  let dueDays = 0;
  let tier = '';

  const quietPartner = cfg.partner_stages.indexOf(deal.stage) !== -1 &&
    Number(deal.days_quiet || 0) >= Number(cfg.reengage_after_days || 60);

  if (deal.covered && deal.overdue) {
    action = 'escalate';
    tier = Number(deal.overdue_business_days || 0) >= Number(cfg.manager_after_days || 0)
      ? 'manager' : 'owner';
    reason = 'next activity overdue ' + deal.overdue_business_days + ' business day(s) ' +
      '(since ' + deal.overdue_due + ') — escalated to the ' + tier + ', not stacked';
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
    dueDays = 2;
    reason = 'referral partner, quiet for ' + deal.days_quiet + ' days';
  } else if (!stage.next_type) {
    action = 'skip';
    reason = 'stage "' + deal.stage + '" has no next_type configured — deliberately ignored';
  } else {
    action = 'create';
    type = types[stage.next_type] || stage.next_type;
    subject = stage.subject;
    dueDays = stage.due_in_days;
    reason = deal.parked_due
      ? 'only open activity is parked at ' + deal.parked_due + ', past the ' +
        cfg.horizon_days + '-day horizon'
      : 'no open activity at all';
  }

  // A high-value deal gone stale reaches the manager whatever else happens to it (the
  // run summary puts it on the manager list; nothing here changes what is created).
  const highStalled = deal.stale === true && deal.high_priority === true;

  let writes = action === 'create' || action === 'reengage';
  if (writes && cap > 0 && created >= cap) {
    action = 'skip';
    reason = 'daily cap of ' + cap + ' reached — picked up on the next run';
    type = ''; subject = '';
    writes = false;
  } else if (writes) {
    created++;
  }

  // The owner the activity is assigned to. In test mode every activity lands on one user,
  // so a real rep's task list is untouched while the rule is being verified.
  const assignTo = cfg.test_write && cfg.test_owner_id
    ? Number(cfg.test_owner_id) : deal.owner_id;
  const when = writes ? scheduleFor(assignTo, dueDays) : null;
  if (when && when.shifted) {
    reason += '; moved ' + when.shifted + ' business day(s) later — the rep already had ' +
      perDay + ' activities due that day';
  }

  out.push({
    json: Object.assign({}, deal, {
      action: action,
      action_reason: reason,
      escalation_tier: tier,
      high_value_stalled: highStalled,
      activity_type: type,
      activity_subject: subject,
      activity_due: when ? when.date : '',
      due_shifted_by: when ? when.shifted : 0,
      owner_over_capacity: when ? when.owner_over_capacity : false,
      assign_to: assignTo,
      _create: writes && cfg.write_enabled === true,
      _body: writes ? {
        subject: subject,
        type: type,
        due_date: when.date,
        due_time: '09:00',
        duration: '00:30',
        deal_id: deal.id,
        person_id: deal.person_id || undefined,
        org_id: deal.org_id || undefined,
        user_id: assignTo || undefined,
        note: 'Scheduled by the activity guard: ' + reason
      } : null
    })
  });
});

return out;
