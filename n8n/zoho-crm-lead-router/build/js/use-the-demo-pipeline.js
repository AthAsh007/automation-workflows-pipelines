// Six invented deals so workflow 02 runs end to end with no Zoho account, and so one run
// shows every verdict the sweep can reach: two needing a task created, one escalated because
// its next step is already overdue, one stalled, one compliant, one in a stage that is not
// open at all.
//
// A read that FAILS does not fall back to these. A fabricated deal must never be swept
// against a real org — see STOP: could not read the pipeline.
function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function dateIn(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

return [
  // No next step at all, sitting in Qualification -> a task is created.
  { json: { _demo: true, id: '4876876004100000001', Deal_Name: 'Northgate Clinics — platform rollout',
            Stage: 'Qualification', Owner: { id: '', name: 'Ada' }, Amount: 18000,
            Closing_Date: dateIn(40), Next_Step: '', Modified_Time: daysAgo(3) } },

  // No next step, in Proposal -> a task is created, and it is also stalled.
  { json: { _demo: true, id: '4876876004100000002', Deal_Name: 'Ferris Group — annual licence',
            Stage: 'Proposal', Owner: { id: '', name: 'Ben' }, Amount: 42000,
            Closing_Date: dateIn(12), Next_Step: '', Modified_Time: daysAgo(21) } },

  // Has a next step but the close date has already passed -> escalated, NOT stacked.
  { json: { _demo: true, id: '4876876004100000003', Deal_Name: 'Calder Pharmacy — onboarding',
            Stage: 'Negotiation', Owner: { id: '', name: 'Ben' }, Amount: 9500,
            Closing_Date: dateIn(-6), Next_Step: 'Waiting on their legal review',
            Modified_Time: daysAgo(8) } },

  // Compliant: a next step, and the close date is still ahead.
  { json: { _demo: true, id: '4876876004100000004', Deal_Name: 'Whitlock & Co — pilot',
            Stage: 'Needs Analysis', Owner: { id: '', name: 'Cara' }, Amount: 6000,
            Closing_Date: dateIn(25), Next_Step: 'Scoping call booked for Thursday',
            Modified_Time: daysAgo(1) } },

  // Compliant but untouched for a long time -> reported as stalled, no task created.
  { json: { _demo: true, id: '4876876004100000005', Deal_Name: 'Hale Medical — data migration',
            Stage: 'Qualification', Owner: { id: '', name: 'Ada' }, Amount: 15000,
            Closing_Date: dateIn(60), Next_Step: 'Chasing an intro to their CTO',
            Modified_Time: daysAgo(30) } },

  // Not an open stage -> the sweep leaves it alone entirely.
  { json: { _demo: true, id: '4876876004100000006', Deal_Name: 'Ardent Labs — renewal',
            Stage: 'Closed Won', Owner: { id: '', name: 'Cara' }, Amount: 30000,
            Closing_Date: dateIn(-2), Next_Step: '', Modified_Time: daysAgo(5) } }
];
