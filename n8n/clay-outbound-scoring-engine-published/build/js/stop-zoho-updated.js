// The leads are updated in Zoho, and the tasks, if any were due, are created. Zoho answers the
// task call per record too, so each is read rather than trusting the 200.
const built = $('build the tasks').first().json;
let taskResults = [];
try {
  const res = $('Zoho CRM - create the tasks').first().json || {};
  taskResults = (res.data || []).map((r) => ({ code: r.code, id: r.details && r.details.id, message: r.code === 'SUCCESS' ? '' : r.message }));
} catch (e) { /* no tasks were due */ }
return [{
  json: {
    _outcome: 'Zoho updated',
    leads_updated: built.leads_updated,
    refused: built.refused,
    tasks_created: taskResults.filter((t) => t.code === 'SUCCESS').length,
    tasks_refused: taskResults.filter((t) => t.code !== 'SUCCESS')
  }
}];
