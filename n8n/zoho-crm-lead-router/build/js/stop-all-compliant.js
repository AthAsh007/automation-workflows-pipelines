// Every open deal already has a next step, so nothing was created. This is a named stop
// rather than an empty branch because "the sweep ran and found nothing to do" and "the sweep
// did not run" must never look the same in the execution list.
const deals = $input.all().map((i) => i.json || {});
return [{
  json: {
    _outcome: 'nothing to create',
    _reason: 'every open deal already has a next step recorded',
    open_deals_checked: deals.filter((d) => d.verdict !== 'skip').length,
    escalated: deals.filter((d) => d.verdict === 'escalate').length,
    stalled: deals.filter((d) => d.stalled && d.verdict !== 'skip').length
  }
}];
