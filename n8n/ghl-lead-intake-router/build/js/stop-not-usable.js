// Not a lead this workflow can file: no way to reach the person, or a bot. It is dropped
// here rather than written to GoHighLevel, but the reason is kept so the execution list says
// why instead of the lead just vanishing.
return $input.all().map((i) => ({
  json: {
    _outcome: 'rejected',
    _reason: (i.json._problems || []).join('; ') || 'did not look like a lead',
    contact_key: i.json.contact_key || '(none)',
    source: i.json.source || '(unrecognised)'
  }
}));
