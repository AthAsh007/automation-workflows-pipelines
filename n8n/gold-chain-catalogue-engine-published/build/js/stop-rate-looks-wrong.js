// Today's rate failed the plausibility gate. Nothing is published, nothing is written, and
// no customer sees a price built on it. The owner fixes the source or raises
// MAX_RATE_MOVE_PCT deliberately, then re-runs.
const j = $input.first().json;
return [{ json: {
  _outcome: 'stopped — nothing published',
  _reason: j.rate_note,
  rate_24k: j.rate_24k, last_rate: j.last_rate, rate_source: j.rate_source
} }];
