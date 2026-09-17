// Dedupe: has this store order already landed on the board? The board rows come in as
// items (from the sheet or the demo board — same shape either way) and are folded into
// one answer. Order keys are 'source|order-no', so the same number on a different store
// is a different order and is never mistaken for one.
const incoming = $('read the order').first().json;
const key = incoming.order_key;
const rows = $input.all().map((i) => i.json);
const found = rows.filter((r) => r['Order key'] === key)[0] || null;
return [{
  json: Object.assign({}, incoming, {
    _known: !!found,
    known_row: found,
    board_rows_read: rows.length
  })
}];
