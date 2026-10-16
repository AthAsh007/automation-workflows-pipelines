// Everyone the plan did not fund passes through here untouched, carrying the reason in
// `_enrich_skip`: tier C, Reject, a duplicate, already has an email, or over the budget.
// Nothing is dropped; they rejoin the enriched prospects in the next node.
return $input.all().map((item) => ({ json: Object.assign({}, item.json, { _enriched: false }) }));
