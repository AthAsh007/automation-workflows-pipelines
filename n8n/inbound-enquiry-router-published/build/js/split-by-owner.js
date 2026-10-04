// One item per owner, so the Gmail node sends one nudge each.
const analysis = $input.first().json;
return (analysis.groups || []).map((g) => ({ json: g }));
