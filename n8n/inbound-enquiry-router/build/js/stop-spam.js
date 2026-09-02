// Not a real enquiry. It is dropped here rather than reaching the sheet, but the
// reason is kept so you can see in the execution list why.
return $input.all().map((i) => ({
  json: Object.assign({}, i.json, {
    _outcome: 'rejected',
    _reason: (i.json._problems || []).join('; ') || 'did not look like an enquiry'
  })
}));
