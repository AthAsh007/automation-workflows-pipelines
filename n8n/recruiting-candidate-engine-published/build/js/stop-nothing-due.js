// Nothing was due this pass. For a runner that fires every fifteen minutes this is the
// normal outcome for most of the day, so it reports the arithmetic rather than a bare
// "0 items" — an empty queue and a broken query look identical otherwise.
const j = $input.first().json;
const deferred = j.deferred || [];

return [{
  json: {
    _outcome: deferred.length ? 'everything due was deferred' : 'nothing due',
    rows_returned_by_the_queue: j.due_rows || 0,
    deferred: deferred.length,
    deferred_by_reason: j.deferred_by_reason || {},
    examples: deferred.slice(0, 8),
    // Deferred rows still need writing back, or they stay due and this node reports the
    // same thing every fifteen minutes forever.
    _has_deferrals: deferred.length > 0,
    _next_step: deferred.length
      ? 'These rows were rescheduled, not dropped. Quiet hours are evaluated in the '
        + 'candidate timezone, so a queue that defers everything at 07:00 Eastern is '
        + 'correct behaviour for a west-coast list.'
      : 'The queue returned no rows. Either no campaign is active, or every enrollment has '
        + 'a null next_attempt_at (replied, opted out, booked, or exhausted).'
  }
}];
