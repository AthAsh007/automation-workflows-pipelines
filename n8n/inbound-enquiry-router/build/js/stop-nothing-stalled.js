// Nothing has gone quiet. The digest still goes out on the other branch.
return $input.all().map((i) => ({ json: Object.assign({}, i.json, { _outcome: 'nothing_stalled' }) }));
