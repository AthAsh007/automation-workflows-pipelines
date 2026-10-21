// The one rewrite: the same brief, the caption that failed, and the exact list of failures.
//
// Asking a model to "try again" gets a different caption with different problems. Showing it
// its own answer and the rules that answer broke, one per line, gets the same caption fixed —
// which is the point, because the first draft was otherwise on-brief.
//
// There is exactly one rewrite (REWRITE_ATTEMPTS). If it fails too, the draft is held for a
// human with both lists of failures. A loop that keeps asking until something passes is a loop
// that eventually passes something nobody would have written.

const cfg = $('config').first().json;
const d = $json;

const fixes = (d._problems || []).map((p, i) => (i + 1) + '. ' + p).join('\n');

const messages = [
  { role: 'system', content: d._llm_system },
  { role: 'user', content: d._llm_user },
  { role: 'assistant', content: d._caption || '(no caption)' },
  {
    role: 'user',
    content: 'That caption was rejected by an automated check. Fix exactly these problems and '
      + 'keep everything else as close to your draft as you can:\n\n' + fixes + '\n\n'
      + 'Rules again: ' + cfg.caption_min_words + '-' + cfg.caption_max_words + ' words, '
      + cfg.hashtags_min + '-' + cfg.hashtags_max + ' hashtags on the last line only, no '
      + 'links, no @mentions. Return the corrected caption and nothing else.'
  }
];

return [{
  json: Object.assign({}, d, {
    _rewrite_messages: messages,
    _attempt: 2,
    _reason: 'rewriting once against ' + (d._problems || []).length + ' failure(s)'
  })
}];
