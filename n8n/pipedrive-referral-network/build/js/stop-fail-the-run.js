// STOP: end the execution as FAILED.
//
// The alert (if a webhook is set) has already gone out. Throwing here marks the execution
// red in n8n's list and triggers the instance's error workflow, so a broken token cannot
// hide behind a run history full of green ticks.
const f = $('build the read-failure alert').first().json;
throw new Error('Pipedrive read failed — rule not checked: ' + (f.failures || []).join('; '));
