// Nothing to attach - either the repo had no previews for this domain, or every file
// was over the budget. The email still goes, describing the two directions in text.
return $input.all().map((i) => ({
  json: Object.assign({}, i.json, { _attachment_props: '', _attached: [] })
}));
