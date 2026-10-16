// STOP: no new replies in this window.
//
// The common case, on an hourly trigger. It still produces a summary item so the run has a
// shape the summary node understands — and so a silent hour and a broken feed do not look
// the same from the outside. A feed that errors throws upstream in 'read the replies'
// rather than arriving here as a quiet hour.
const j = $json;

return [{
  json: {
    _has_replies: false,
    source: j.source,
    read_at: j.read_at,
    headline: j.headline || 'No new replies in this window.',
    recorded_at: new Date().toISOString()
  }
}];
