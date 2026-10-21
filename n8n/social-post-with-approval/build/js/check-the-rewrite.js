// Check the rewrite with exactly the same rules as the first attempt.
//
// Pass -> it joins the normal path at "build the HTML template", as if it had passed first time
// (the log note records that it was rewritten). Fail -> "STOP: caption held", carrying both
// lists of failures, so the person fixing it sees what the model could and could not correct.

// @include lib/caption-rules.js

const cfg = $('config').first().json;
const first = $('build the rewrite brief').first().json;
const state = $('resolve todays state').first().json;

const body = $json || {};
const choice = (body.choices && body.choices[0]) || {};
const raw = String((choice.message && choice.message.content) || body.content || '');

const c = checkCaption(raw, cfg, state._recent_hooks || []);
const problems = raw.trim() ? c.problems
  : ['the rewrite came back empty' + (body.error ? ' — ' + JSON.stringify(body.error).slice(0, 300) : '')];

// Strip the request-only fields; downstream nodes get the same shape "apply the caption" emits.
const out = Object.assign({}, first);
delete out._rewrite_messages;

return [{
  json: Object.assign(out, {
    _caption: c.caption,
    _caption_escaped: c.escaped,
    _caption_words: c.words,
    _caption_hashtags: c.hashtags,
    _caption_fp: c.fp,
    _hook: c.hook,
    _attempt: 2,
    _rewritten: true,
    _caption_ok: problems.length === 0,
    _problems: problems.length
      ? problems.map((p) => 'after the rewrite: ' + p)
        .concat((first._first_problems || []).map((p) => 'first draft: ' + p))
      : [],
    _fixed: problems.length ? [] : (first._first_problems || []),
    _reason: problems.length
      ? 'still failing after one rewrite: ' + problems[0] + ' — held for a human'
      : 'rewrite fixed ' + (first._first_problems || []).length + ' problem(s); caption ok ('
        + c.words + ' words, ' + c.hashtags + ' hashtags)'
  })
}];
