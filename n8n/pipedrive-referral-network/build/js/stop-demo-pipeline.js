// STOP: Pipedrive is not configured — build the demo pipeline instead.
//
// Deterministic, so the same run produces the same couple of dozen deals every time and a
// screen-share can be rehearsed. The spread is deliberate: roughly a third of the deals are
// missing a next activity, a few are overdue rather than missing, one referral partner has
// gone quiet past the re-engagement threshold, and one high-value deal has stalled — every
// branch of the guard has something to do.
//
// Nothing here can reach Pipedrive: `demo_data` forces the run into preview in config.
const cfg = $('config').first().json;

if (cfg.pipedrive_enabled) {
  throw new Error('demo pipeline reached with Pipedrive configured — check the IF gate');
}
if (!cfg.demo_data) {
  return [{ json: { source: 'none', read_at: new Date().toISOString(), failures: [],
    deals: [], activities: [], deal_fields: [],
    _note: 'No API token and DEMO_PIPELINE is off. Nothing to work on.' } }];
}

const DAY = 86400000;
const now = Date.now();
function iso(ms) { return new Date(ms).toISOString().slice(0, 19).replace('T', ' '); }
function date(ms) { return new Date(ms).toISOString().slice(0, 10); }

const PRACTICES = [
  ['Riverbend Pain & Spine', 'Dr. A. Whitfield', 'Pain management'],
  ['Northgate Neurology Associates', 'Dr. P. Iyer', 'Neurology'],
  ['Cedar Hollow Orthopaedics', 'Dr. M. Okonkwo', 'Orthopaedics'],
  ['Lakeshore Rehabilitation Group', 'Dr. S. Duval', 'Physical medicine'],
  ['Fairview Family Practice', 'Dr. R. Castellanos', 'Primary care'],
  ['Summit Pain Institute', 'Dr. K. Baruah', 'Pain management'],
  ['Harbour Point Rheumatology', 'Dr. J. Lindqvist', 'Rheumatology'],
  ['Westfield Sports Medicine', 'Dr. T. Nakamura', 'Sports medicine']
];
const REPS = [
  { id: 11, name: 'Dana Reyes' },
  { id: 12, name: 'Marcus Hale' },
  { id: 13, name: 'Priya Venn' }
];

// A tiny deterministic PRNG so the fixture never shifts between runs.
let seed = 20260902;
function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
function pick(list) { return list[Math.floor(rnd() * list.length)]; }

const deals = [];
const activities = [];
let dealId = 3000;
let actId = 9000;

cfg.stages.forEach(function (stage, si) {
  const count = si < 3 ? 4 : 2;   // top of the funnel is wider, as a real pipeline is
  for (let i = 0; i < count; i++) {
    const practice = PRACTICES[(si * 3 + i) % PRACTICES.length];
    const rep = REPS[(si + i) % REPS.length];
    const age = Math.floor(rnd() * 40) + 2;
    const id = ++dealId;

    deals.push({
      id: id,
      title: practice[0] + ' — CRPS referral network',
      stage_id: stage.id,
      stage: stage.name,
      status: 'open',
      value: si >= 6 ? 40000 : Math.floor(rnd() * 20000) + 3000,
      currency: 'USD',
      owner_id: rep.id,
      owner: rep.name,
      org_id: 500 + ((si * 3 + i) % PRACTICES.length),
      organisation: practice[0],
      person_id: 700 + ((si * 3 + i) % PRACTICES.length),
      person: practice[1],
      add_time: iso(now - age * DAY),
      stage_change_time: iso(now - Math.floor(age / 2) * DAY),
      raw: { id: id, specialty: practice[2] }
    });

    // A past activity, always. This is what "days quiet" is measured from.
    const quiet = Math.floor(rnd() * (stage.stale_days + 20));
    activities.push({
      id: ++actId, deal_id: id, type: 'initial_call',
      subject: 'Outreach call', note: rnd() < 0.35 ? 'No answer, left message' : 'Spoke with the practice manager',
      done: true, due_date: date(now - quiet * DAY), due_time: '',
      marked_done_time: iso(now - quiet * DAY), add_time: iso(now - quiet * DAY),
      owner_id: rep.id
    });

    // The interesting part: who has a next step and who does not.
    const roll = rnd();
    if (roll < 0.34) {
      // No open activity at all — this is what the guard exists to catch.
    } else if (roll < 0.5) {
      // Open but overdue. The guard escalates rather than stacking another task on top.
      activities.push({
        id: ++actId, deal_id: id, type: stage.next_type || 'follow_up_call',
        subject: stage.subject || 'Next step', note: '',
        done: false, due_date: date(now - (cfg.overdue_days + 2) * DAY), due_time: '09:00',
        marked_done_time: null, add_time: iso(now - 10 * DAY), owner_id: rep.id
      });
    } else if (roll < 0.6) {
      // Open, but parked so far out it is not a next step in any meaningful sense.
      activities.push({
        id: ++actId, deal_id: id, type: 'follow_up_call',
        subject: 'Check back next year', note: '',
        done: false, due_date: date(now + (cfg.horizon_days + 60) * DAY), due_time: '09:00',
        marked_done_time: null, add_time: iso(now - 3 * DAY), owner_id: rep.id
      });
    } else {
      // Properly covered.
      activities.push({
        id: ++actId, deal_id: id, type: stage.next_type || 'follow_up_call',
        subject: stage.subject || 'Next step', note: '',
        done: false, due_date: date(now + Math.floor(rnd() * 10 + 1) * DAY), due_time: '10:00',
        marked_done_time: null, add_time: iso(now - 2 * DAY), owner_id: rep.id
      });
    }
  }
});

// One referral partner that has gone quiet well past the re-engagement threshold, built
// explicitly rather than left to the random spread — the re-engagement branch has to have
// something to do every single time this is demonstrated.
const quietStage = cfg.stages.filter(function (s) {
  return cfg.partner_stages.indexOf(s.name) !== -1;
}).pop() || cfg.stages[cfg.stages.length - 1];
const quietAge = cfg.reengage_after_days + 15;
const quietId = ++dealId;
deals.push({
  id: quietId,
  title: 'Marchetti Interventional Pain — CRPS referral network',
  stage_id: quietStage.id,
  stage: quietStage.name,
  status: 'open',
  value: 38000,
  currency: 'USD',
  owner_id: REPS[0].id,
  owner: REPS[0].name,
  org_id: 599,
  organisation: 'Marchetti Interventional Pain',
  person_id: 799,
  person: 'Dr. L. Marchetti',
  add_time: iso(now - 400 * DAY),
  stage_change_time: iso(now - 300 * DAY),
  raw: { id: quietId, specialty: 'Pain management' }
});
activities.push({
  id: ++actId, deal_id: quietId, type: 'referral_follow_up',
  subject: 'Referral check-in', note: 'Practice has not referred since the spring',
  done: true, due_date: date(now - quietAge * DAY), due_time: '',
  marked_done_time: iso(now - quietAge * DAY), add_time: iso(now - quietAge * DAY),
  owner_id: REPS[0].id
});

// Activity inside the reporting window, so the weekly dashboard has real numbers rather
// than the two that happen to fall inside seven days by chance. Roughly a third of these
// are no-answers, which is what makes "attempts" and "conversations" different columns.
deals.forEach(function (d, i) {
  if (d.id === quietId) return;   // the whole point of that one is that it is quiet
  if (i % 2 !== 0) return;
  const daysAgo = (i % Number(cfg.report_window_days || 7));
  const noAnswer = i % 3 === 0;
  activities.push({
    id: ++actId, deal_id: d.id,
    type: i % 4 === 0 ? 'follow_up_call' : 'email',
    subject: i % 4 === 0 ? 'Follow-up call' : 'Study information email',
    note: noAnswer ? 'No answer, left message with the front desk'
                   : 'Spoke with the practice manager about the CRPS protocol',
    done: true, due_date: date(now - daysAgo * DAY), due_time: '',
    marked_done_time: iso(now - daysAgo * DAY), add_time: iso(now - daysAgo * DAY),
    owner_id: d.owner_id
  });
  if (i % 6 === 0) {
    activities.push({
      id: ++actId, deal_id: d.id, type: 'physician_meeting',
      subject: 'Physician meeting', note: 'Reviewed inclusion criteria',
      done: true, due_date: date(now - daysAgo * DAY), due_time: '',
      marked_done_time: iso(now - daysAgo * DAY), add_time: iso(now - daysAgo * DAY),
      owner_id: d.owner_id
    });
  }
});

return [{
  json: {
    source: 'demo',
    read_at: new Date().toISOString(),
    failures: [],
    deals: deals,
    activities: activities,
    // Field names only, which is all the PHI check needs. Deliberately clean — see the
    // README for how to prove the check bites by pointing a config key at a bad field.
    deal_fields: [
      { key: 'title', name: 'Title' },
      { key: 'value', name: 'Value' },
      { key: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', name: 'Specialty' },
      { key: 'b2c3d4e5f60718293a4b5c6d7e8f90123456789a', name: 'Territory' },
      { key: 'c3d4e5f60718293a4b5c6d7e8f90123456789ab2', name: 'Study code' },
      { key: 'd4e5f60718293a4b5c6d7e8f90123456789ab2c3', name: 'Referrals sent (count)' }
    ],
    _note: 'DEMO PIPELINE — ' + deals.length + ' fabricated deals. The run is forced into ' +
           'preview; nothing here can reach a Pipedrive account.'
  }
}];
