// No ShipStation configured and the board row has no tracking number pasted. The run
// stops here for this order rather than emailing a ship notice that cannot carry a number.
const cfg = $('config').first().json;
const item = $input.first().json;
return [{
  json: Object.assign({}, item, {
    _tracking_found: false,
    _tracking_source: 'none',
    _reason: 'no ShipStation credentials and no tracking number on the row'
  })
}];
