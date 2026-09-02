// The row is marked redesigned but the branch has nothing for this domain.
// Not an error: it means the work has not been pushed yet. Flag it for the dev.
return $input.all().map((i) => ({
  json: Object.assign({}, i.json, { _outcome: 'no_deliverables' })
}));
