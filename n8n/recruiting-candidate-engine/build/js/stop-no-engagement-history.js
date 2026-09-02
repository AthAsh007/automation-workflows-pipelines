// Supabase is not connected, so there is no opt-out list and no contact history to check
// against. In demo mode the engine substitutes a small fabricated history — which is what
// makes the opted-out candidate and the cooldown candidate visible in the walkthrough.
//
// With DEMO_MODE off and Supabase unconfigured this returns an EMPTY history and says so
// loudly. An empty opt-out list is not the same as nobody having opted out, and that
// warning is carried through to the end of the run rather than dropped here.
const cfg = $('config').first().json;

if (cfg.demo_mode) {
  return [{
    json: {
      _source: 'demo — fabricated history, not real opt-outs',
      opt_outs: [{ phone_e164: '+16145550188' }],          // Priya, three weeks ago
      last_touch: { '+16145550199': new Date(Date.now() - 6 * 3600 * 1000).toISOString() },
      active_phones: [],
      enrolled_ats_ids: [],
      _warning: ''
    }
  }];
}

return [{
  json: {
    _source: 'none — Supabase not configured',
    opt_outs: [],
    last_touch: {},
    active_phones: [],
    enrolled_ats_ids: [],
    _warning: 'No opt-out list was available for this run, so no suppression could be '
      + 'applied. Nothing was sent — the first touch is scheduled by workflow 2, which '
      + 'checks the opt-out table again before it sends anything.'
  }
}];
