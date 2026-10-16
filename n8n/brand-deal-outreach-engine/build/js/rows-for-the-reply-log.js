// Updates the pitch rows these replies belong to, ten at a time.
//
// Airtable's PATCH /v0/{base}/{table} with `performUpsert.fieldsToMergeOn` matches on a
// field rather than a record id, which is what lets this run without having kept every
// record id from the day the pitch was sent. `Pitch id` is that field, and it is why the
// pitch id is deterministic — student, brand, date — rather than random.
//
// An auto-reply writes nothing. It is not a reply.
const cfg = $('config').first().json;
const F = cfg.pitch_fields;
const items = $input.all().filter(function (i) { return i.json.writes_back; });

const BATCH = 10;
const out = [];

for (let i = 0; i < items.length; i += BATCH) {
  const chunk = items.slice(i, i + BATCH).map(function (item) {
    const r = item.json;
    const row = {};
    row[F.pitch_id] = r.pitch_id;
    row[F.reply_at] = r.received_at;
    row[F.reply_class] = r.reply_class;
    row[F.state] = r.new_state;
    row[F.hold_reason] = r.next_step;
    return { fields: row };
  });
  out.push({
    json: {
      _batch: (i / BATCH) + 1,
      _count: chunk.length,
      _body: {
        records: chunk,
        typecast: true,
        performUpsert: { fieldsToMergeOn: [F.pitch_id] }
      }
    }
  });
}

if (!out.length) {
  return [{ json: { _batch: 0, _count: 0,
    _body: { records: [], typecast: true,
             performUpsert: { fieldsToMergeOn: [F.pitch_id] } } } }];
}
return out;
