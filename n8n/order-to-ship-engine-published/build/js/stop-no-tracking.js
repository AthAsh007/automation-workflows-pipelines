// No tracking could be found: nothing was pasted on the row and ShipStation (if
// configured) had nothing for the order. The shipping email is NOT sent — a ship notice
// without a tracking number is worse than none, and this is the row the office sees in
// the execution list.
return $input.all().map((i) => ({
  json: Object.assign({}, i.json, {
    _outcome: 'held',
    _reason: i.json._reason || 'no tracking number available'
  })
}));
