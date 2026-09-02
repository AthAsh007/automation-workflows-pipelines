// No AI key set, or the keyword rules already placed this organisation confidently.
// Either way it carries on with the category it has — this branch exists so the canvas
// shows where those items went instead of them appearing to vanish.
return $input.all().map((i) => ({
  json: Object.assign({}, i.json, { _ai_called: false })
}));
