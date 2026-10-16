// Every pitch, sent or held, as an Airtable row. Same day, which is the point.
//
// > Log every pitch, reply and booked deal in the student's dashboard — accurate and same
// > day. Careless or slow with logging: sloppy data breaks the whole system.
//
// Held pitches are logged too, with the reason. A log that only records successes cannot
// answer "why did we only send 180 of the 400 we planned", which is the first question
// anybody asks on a Friday.
//
// Batched ten to a request, because that is Airtable's maximum for POST /records. One
// request per pitch is four hundred requests for a normal day's run and will rate-limit
// long before it finishes.
const cfg = $('config').first().json;
const F = cfg.pitch_fields;
const items = $input.all();

const BATCH = 10;
const out = [];

for (let i = 0; i < items.length; i += BATCH) {
  const chunk = items.slice(i, i + BATCH).map(function (item) {
    const p = item.json;
    const row = {};
    row[F.pitch_id] = p.pitch_id;
    row[F.student_id] = p.student_id;
    row[F.student] = p.student;
    row[F.brand_id] = p.brand_id;
    row[F.brand] = p.brand;
    row[F.contact] = p.contact;
    row[F.email] = p.email;
    row[F.inbox] = p.inbox || '';
    row[F.subject] = p.subject;
    row[F.body] = p.body;
    row[F.facts_used] = (p.facts || []).map(function (f) {
      return f.label + '=' + f.value;
    }).join(' | ');
    row[F.sent_at] = p.sent_at || '';
    row[F.state] = p.send_state;
    row[F.hold_reason] = p.send_reason || '';
    return { fields: row };
  });
  out.push({
    json: {
      _batch: (i / BATCH) + 1,
      _count: chunk.length,
      // typecast lets Airtable create a missing single-select option rather than 422ing the
      // whole batch. A new hold reason should not stop the day's log being written.
      _body: { records: chunk, typecast: true }
    }
  });
}

if (!out.length) {
  return [{ json: { _batch: 0, _count: 0, _body: { records: [], typecast: true } } }];
}
return out;
