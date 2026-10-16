// THE RULE: no open deal should sit in a stage without the next action that stage calls for.
//
// Zoho's own workflow rules fire on a stage CHANGE. A deal that never moved never fired
// anything — and that is precisely the deal that goes quiet. This asks every open deal,
// every morning, so the ones nothing fired for are the ones it catches. That is the whole
// argument for running this beside Zoho's rules rather than instead of them.
//
// Four verdicts, and only one of them writes anything:
//   create   — open, no next step recorded. The stage's task is created.
//   escalate — open, has a next step, but it is already overdue. Reported, NOT stacked with
//              a second task: piling tasks on a deal is how a pipeline stops being trusted.
//   ok       — open, has a next step, not overdue. Nothing happens.
//   skip     — not in an open stage. The sweep leaves it alone.
//
// `stalled` is orthogonal: a deal can be compliant and still untouched for a month. It is
// reported in the digest and never creates a task on its own.
const cfg = $('config').first().json;
const now = new Date();

const actions = {};
for (const a of cfg.stage_actions || []) actions[a.stage] = a;
const open = cfg.open_stages || [];

function daysBetween(a, b) {
  return Math.floor((a - b) / 86400000);
}

const out = $input.all().map((item) => {
  const d = item.json || {};
  const rule = actions[d.stage] || null;

  if (open.indexOf(d.stage) < 0) {
    return { json: Object.assign({}, d, { verdict: 'skip', why: 'not an open stage' }) };
  }

  const modified = d.modified_time ? new Date(d.modified_time) : null;
  const daysSinceTouch = modified ? daysBetween(now, modified) : null;
  const staleAfter = rule ? Number(rule.stale_after_days || 0) : 0;
  const stalled = staleAfter > 0 && daysSinceTouch !== null && daysSinceTouch > staleAfter;

  const closing = d.closing_date ? new Date(d.closing_date + 'T23:59:59Z') : null;
  const overdue = closing !== null && closing < now;

  let verdict, why;
  if (!d.next_step) {
    verdict = 'create';
    why = 'open deal with no next step recorded';
  } else if (overdue && cfg.escalate_overdue) {
    verdict = 'escalate';
    why = 'next step exists but the close date has passed — escalated, not stacked';
  } else {
    verdict = 'ok';
    why = 'has a next step and is not overdue';
  }

  return {
    json: Object.assign({}, d, {
      verdict,
      why,
      stalled,
      days_since_touch: daysSinceTouch,
      task_title: rule ? rule.task : 'Agree the next step',
      due_in_days: rule ? Number(rule.due_in_days || 2) : 2
    })
  };
});

// One flag the IF node reads, computed once rather than counted in an expression.
const toCreate = out.filter((o) => o.json.verdict === 'create').length;
for (const o of out) {
  o.json._has_work = toCreate > 0;
  o.json._to_create = toCreate;
}
return out;
