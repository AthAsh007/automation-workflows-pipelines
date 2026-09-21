// STOP: the matcher produced no candidates.
//
// Almost always a real, reportable state rather than a fault: every brand in a creator's
// niche has already been pitched inside the re-pitch window, or the day's per-student
// budget is already spent. The summary says which, by count, so a quiet morning can be
// told apart from a broken one.
const j = $json;
const s = j.skipped || {};

const reasons = [];
if (s.already_pitched) reasons.push(s.already_pitched + ' already pitched');
if (s.too_recent) reasons.push(s.too_recent + ' inside the re-pitch window');
if (s.budget) reasons.push(s.budget + ' under the creator’s minimum rate');
if (s.suppressed) reasons.push(s.suppressed + ' suppressed');
if (s.no_brands) reasons.push(s.no_brands + ' creators with no brands in their niche');
if (s.student_cap) reasons.push(s.student_cap + ' creators already at today’s budget');

return [{
  json: {
    _has_work: false,
    source: j.source,
    read_at: j.read_at,
    skipped: s,
    headline: reasons.length
      ? 'Nothing to pitch today: ' + reasons.join(', ') + '.'
      : 'Nothing to pitch today, and nothing was filtered out — check the roster is loading.',
    // No brands left in a niche is the one that needs a person. The rest are the system
    // working.
    needs_attention: (s.no_brands || 0) > 0 || reasons.length === 0,
    recorded_at: new Date().toISOString()
  }
}];
