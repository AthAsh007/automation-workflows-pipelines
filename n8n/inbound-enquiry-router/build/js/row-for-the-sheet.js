// One row, in the same shape every time. Written before any email goes out, so an
// enquiry can never be lost to a mail failure.
const cfg = $('config').first().json;
const C = cfg.columns;
const e = $input.first().json;

const row = {};
row[C.ref]         = e.ref;
row[C.received]    = e.received.slice(0, 16).replace('T', ' ');
row[C.stage]       = e.stage;
row[C.owner]       = e.owner;
row[C.owner_email] = e.owner_email;
row[C.company]     = e.company;
row[C.contact]     = e.contact;
row[C.email]       = e.email;
row[C.phone]       = e.phone;
row[C.postcode]    = e.postcode;
row[C.area]        = e.area;
row[C.premises]    = e.premises;
row[C.message]     = String(e.message || '').slice(0, 4000);
row[C.sqft]        = '';
row[C.frequency]   = '';
row[C.access]      = '';
row[C.last_touch]  = e.received.slice(0, 16).replace('T', ' ');
row[C.chases_sent] = 0;
row[C.next_action] = 'Waiting on their answers';
row[C.notes]       = '';

return [{ json: Object.assign({}, row, { _enquiry: e }) }];
