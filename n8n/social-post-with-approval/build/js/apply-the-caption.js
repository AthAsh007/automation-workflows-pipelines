// Take whichever caption we ended up with and check it against the rules.
//
// Four writers reach this node, and every one is checked identically:
//
//   bank   the row's Caption cell, written by a person
//   model  the LLM's answer (OpenAI-compatible response in $json)
//   demo   the demo writer's canned answer, same shape as the model's (demo bank only)
//   none   no caption and nobody configured to write one -> held with that reason
//
// The rules are the shared block below: length, hashtag count and placement, emoji, banned
// phrases, no links, no @mentions, and an opening line that does not repeat a hook published
// in the last HOOK_LOOKBACK_DAYS. A caption that fails is NEVER trimmed to fit. A model or
// demo caption gets one rewrite with these exact failures fed back ("rewrite allowed?"); a
// banked caption is held for the person who wrote it.

// @include lib/caption-rules.js

const cfg = $('config').first().json;
const post = $('pick todays post').first().json;
const state = $('resolve todays state').first().json;

let raw = post._caption || '';
const pre = [];

if (post._writer === 'none') {
  pre.push('slot ' + post.slot + ' has no caption in the bank and no model is configured to '
    + 'write one. Fill in the Caption cell, or set LLM_API_KEY.');
} else if (post._writer === 'model' || post._writer === 'demo') {
  // A gateway error arrives as a 200 with an `error` key as often as a 4xx, so check for
  // content rather than for the absence of an error.
  const body = $json || {};
  const choice = (body.choices && body.choices[0]) || {};
  raw = String((choice.message && choice.message.content) || body.content || '');
  if (!raw.trim()) {
    pre.push('the model returned no caption. Response keys: ' + Object.keys(body).join(', ')
      + (body.error ? ' — ' + JSON.stringify(body.error).slice(0, 300) : ''));
  }
}

const c = checkCaption(raw, cfg, state._recent_hooks || []);
const problems = pre.length ? pre : c.problems;

const canRewrite = (post._writer === 'model' || post._writer === 'demo')
  && cfg.rewrite_attempts >= 1 && problems.length > 0;

return [{
  json: Object.assign({}, post, {
    _caption: c.caption,
    _caption_escaped: c.escaped,
    _caption_source: post._writer,
    _caption_words: c.words,
    _caption_hashtags: c.hashtags,
    _caption_fp: c.fp,
    _hook: c.hook,
    _attempt: 1,
    _caption_ok: problems.length === 0,
    _rewrite_allowed: canRewrite,
    _problems: problems,
    _first_problems: problems,
    _reason: problems.length
      ? problems.length + ' caption problem(s) from the ' + post._writer + ': ' + problems[0]
      : 'caption ok (' + c.words + ' words, ' + c.hashtags + ' hashtags, from the '
        + post._writer + ')'
  })
}];
