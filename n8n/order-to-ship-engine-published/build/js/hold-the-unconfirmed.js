// A row reached 'Shipped' with no confirmation recorded against it. Never shipped
// unconfirmed: the run stops here and shows the row, instead of emailing a customer
// whose order we cannot prove was confirmed. In the sheet, the fix is to send the
// confirmation (or correct the row) — the gate does not guess.
const cols = $('config').first().json.columns || {};
const h = (k) => cols[k] || k;
const item = $input.first().json;
return (item.unconfirmed || []).map(function (row) {
  return { json: Object.assign({}, row, {
    _outcome: 'held',
    _reason: 'flipped to Shipped but Confirmation sent is blank on the board'
  }) };
});
