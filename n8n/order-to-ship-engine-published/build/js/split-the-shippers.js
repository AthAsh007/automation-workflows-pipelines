// One item per order that needs its shipping email, so the downstream send runs once per
// order rather than once per run.
const item = $input.first().json;
return (item.to_ship || []).map((row) => ({ json: Object.assign({}, row, { _ship: true }) }));
