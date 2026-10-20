// The plan is one item carrying every list. The loop below works one lead at a time, so the due
// list becomes one item per lead here. The waiting and stopped lists stay on the plan, where the
// run report picks them up at the end.
const plan = $input.first().json || {};
return (plan.due || []).map((d) => ({ json: d }));
