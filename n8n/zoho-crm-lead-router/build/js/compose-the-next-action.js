// Builds the Zoho Task for every deal the sweep judged `create`, as one request, before
// anything is sent — so the exact body can be read on a STOP node when nothing is configured.
//
// Zoho specifics:
//   * POST /crm/v8/Tasks takes { data: [ ... ] }, up to 100 records per call.
//   * Relating a task to a deal needs BOTH What_Id (the deal) and $se_module ('Deals').
//     Sending What_Id alone creates an orphan task that appears nowhere on the deal — the
//     single most common mistake when wiring Zoho tasks over the API.
//   * Due_Date is a date, not a datetime.
const cfg = $('config').first().json;
const base = cfg.zoho_api_base + '/crm/' + cfg.zoho_api_version;

const due = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + Number(days || 2));
  return d.toISOString().slice(0, 10);
};

const create = $input.all()
  .map((i) => i.json || {})
  .filter((d) => d.verdict === 'create');

const records = create.map((d) => {
  const rec = {
    Subject: d.task_title,
    Status: 'Not Started',
    Priority: 'Normal',
    Due_Date: due(d.due_in_days),
    Description: 'Raised by the stage sweep: ' + d.why + '. Deal has been in ' + d.stage +
                 (d.days_since_touch === null ? '' : ' and untouched for ' + d.days_since_touch + ' days') + '.',
    What_Id: d.id,
    $se_module: 'Deals'
  };
  if (d.owner_id) rec.Owner = { id: d.owner_id };
  return rec;
});

// One item carrying the whole batch — Zoho takes up to 100 records in a single call, and one
// call is both faster and easier to read in an execution than N of them.
return [{
  json: {
    _count: records.length,
    _deals: create.map((d) => ({ id: d.id, name: d.name, stage: d.stage, owner: d.owner })),
    _zoho: { url: base + '/Tasks', body: { data: records } }
  }
}];
