// A GoHighLevel call for this lead failed: the conversation could not be read, or the touch was
// refused. Nothing was sent to this lead (a lead whose conversation cannot be read is never
// touched blind, since it might have opted out). The loop carries on with the next lead, and
// the run report counts this one as failed with the step and the response.
const lead = $('check the sending window and channel').first().json;
const j = $input.first().json || {};
const e = j.error || j;
const detail = (e && (e.message || e.description || e.error)) || e;
let step = 'a GoHighLevel call';
try { step = $prevNode.name; } catch (err) { /* not available outside n8n */ }

return [{
  json: {
    contact_key: lead.contact_key,
    name: lead.name,
    owner: lead.owner,
    stage: lead.stage,
    touch: lead.touch,
    channel: lead.channel || '',
    outcome: 'failed',
    reason_key: 'failed',
    reason: 'failed at "' + step + '" — nothing was sent to this lead',
    failed_step: step,
    ghl_response: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600),
    _demo: lead._demo === true
  }
}];
