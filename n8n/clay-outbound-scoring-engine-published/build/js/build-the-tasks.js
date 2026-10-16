// Pairs each upsert result with the reply it was sent for, and builds one Zoho task per reply
// that needs a person, attached to the lead's record id. A record Zoho refused gets no task,
// and is listed by name instead of silently dropping out.
const cfg = $('config').first().json;
const sent = $('build the Zoho updates').first().json;
const token = $('read the access token').first().json._access_token;
const res = $input.first().json || {};
const results = Array.isArray(res.data) ? res.data : [];
const withStatus = sent._replies;

const tasks = [];
const refused = [];
results.forEach((r, i) => {
  const reply = withStatus[i] || {};
  if (r.code !== 'SUCCESS') { refused.push({ email: reply.email, code: r.code, message: r.message }); return; }
  if (!reply.task) return;
  tasks.push({
    Subject: reply.task.subject,
    Due_Date: reply.task.due_date,
    Priority: reply.task.priority,
    Status: 'Not Started',
    Description: reply.task.description,
    What_Id: { id: r.details && r.details.id },
    $se_module: 'Leads'
  });
});

return [{
  json: {
    _access_token: token,
    _task_count: tasks.length,
    leads_updated: results.filter((r) => r.code === 'SUCCESS').length,
    refused: refused,
    _tasks: {
      url: cfg.zoho_api_base + '/crm/' + cfg.zoho_api_version + '/Tasks',
      body: { data: tasks, trigger: cfg.zoho_triggers || [] }
    }
  }
}];
