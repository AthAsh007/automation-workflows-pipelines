// Preview. Everything ran; nothing was written to Supabase and nothing was scheduled.
// Open this node to read the entire launch — who would be enrolled, in what order, with
// what score and for what reason, and everyone who was held back and why.
//
// This is the node to have on screen when a client asks "so what would it actually do".
const cfg = $('config').first().json;
const p = $input.first().json;

return [{
  json: {
    _outcome: 'preview — nothing enrolled',
    _why: cfg.demo_mode
      ? 'DEMO_MODE is on. It forces preview whatever TEST_RUN says, because a fabricated '
        + 'campaign must never be able to schedule a real text.'
      : (!cfg.supabase_enabled
        ? 'Supabase is not configured, so there is nowhere to write the campaign to.'
        : 'TEST_RUN is true with no TEST_PHONE set.'),
    job: p.campaign && p.campaign.name,
    would_enroll: (p.candidates || []).length,
    would_hold: (p.held || []).length,
    summary: p.summary,

    enrolling: (p.candidates || []).map((c, i) => {
      const e = (p.enrollments || [])[i] || {};
      return {
        rank: i + 1,
        name: (c.first_name + ' ' + c.last_name).trim(),
        ats_id: c.ats_candidate_id,
        phone: c.phone_e164,
        title: c.title,
        score: e.match_score,
        why: (e.match_reasons || []).join(' · '),
        first_touch_due: e.next_attempt_at
      };
    }),

    held_back: p.held || [],

    _next_step: 'Set DEMO_MODE = false and fill in SUPABASE_URL and SUPABASE_SERVICE_KEY '
      + 'to write this campaign. Nothing is sent even then — workflow 2 owns every send, '
      + 'and it has its own TEST_RUN gate.'
  }
}];
