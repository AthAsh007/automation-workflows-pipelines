// Take whichever caption we ended up with and check it against the rules.
//
// Two paths reach this node and both are checked identically:
//
//   bank   the row's Caption cell, written by a person
//   model  whatever came back from the LLM, if one is configured
//
// A caption that fails is HELD, never trimmed to fit. Silently cutting a caption at 220
// words ends a post mid-sentence, and the reviewer approves it because the top of it read
// fine. Report the problem and deliver nothing.

const cfg = $('config').first().json;
const post = $('pick todays post').first().json;

// The LLM node is behind an IF, so on the bank path it never ran. $json is the merge output;
// read the model's answer defensively rather than assuming a shape.
let caption = post._caption || '';
let source = post._caption_source;
const problems = [];

if (post._needs_caption) {
  if (!cfg.llm_enabled) {
    problems.push('slot ' + post.slot + ' has no caption in the bank and no model is '
      + 'configured to write one. Fill in the Caption cell, or set LLM_API_KEY.');
  } else {
    // OpenAI-compatible shape, which is what the 9router gateway returns. A gateway error
    // arrives as a 200 with an `error` key just as often as a 4xx, so check for content
    // rather than for the absence of an error.
    const body = $json || {};
    const choice = (body.choices && body.choices[0]) || {};
    const text = (choice.message && choice.message.content) || body.content || '';
    caption = String(text).trim();
    source = 'model';
    if (!caption) {
      problems.push('the model returned no caption. Response keys: '
        + Object.keys(body).join(', ') + (body.error ? ' — ' + JSON.stringify(body.error) : ''));
    }
  }
}

// A model sometimes wraps the answer in a code fence or in quotes despite being told not to.
// Unwrapping is safe and lossless; anything beyond that is editing, which this node does not do.
caption = caption
  .replace(/^\s*```[a-z]*\s*\n?/i, '')
  .replace(/\n?```\s*$/i, '')
  .replace(/^\s*["“]([\s\S]+)["”]\s*$/, '$1')
  .trim();

// ---------------------------------------------------------------- the checks
const hashtags = caption.match(/#[A-Za-z0-9_]+/g) || [];
const withoutTags = caption.replace(/#[A-Za-z0-9_]+/g, ' ');
const words = withoutTags.split(/\s+/).filter(Boolean).length;

// Surrogate pairs and the pictographic ranges. Counted rather than banned: the rule is at
// most one, not none.
const emoji = (caption.match(/[‼-㊙\u{1F000}-\u{1FAFF}]/gu) || []).length;

if (caption) {
  if (words < cfg.caption_min_words) {
    problems.push('caption is ' + words + ' words, the minimum is ' + cfg.caption_min_words);
  }
  if (words > cfg.caption_max_words) {
    problems.push('caption is ' + words + ' words, the maximum is ' + cfg.caption_max_words);
  }
  if (hashtags.length < cfg.hashtags_min || hashtags.length > cfg.hashtags_max) {
    problems.push('caption has ' + hashtags.length + ' hashtags, the rule is '
      + cfg.hashtags_min + '-' + cfg.hashtags_max);
  }
  if (emoji > cfg.max_emoji) {
    problems.push('caption has ' + emoji + ' emoji, the maximum is ' + cfg.max_emoji);
  }
  const lower = caption.toLowerCase();
  for (const phrase of cfg.banned_phrases) {
    if (lower.includes(phrase)) problems.push('caption contains the banned phrase "' + phrase + '"');
  }
}

// LinkedIn "little text" reserved characters. '#' is deliberately NOT escaped so hashtags
// keep working; everything else in the reserved set gets a backslash at publish time. The
// escaping happens here, once, so the reviewer's copy and the published copy are the same
// string with the same fingerprint.
const RESERVED = '\\|{}@[]()<>*_~';
const escaped = caption.split('').map((c) => (RESERVED.includes(c) ? '\\' + c : c)).join('');

// FNV-1a. Not a security hash — it exists so workflow 02 can tell "the caption I am about to
// publish is the one that was approved" from "somebody edited the message". require('crypto')
// needs NODE_FUNCTION_ALLOW_BUILTIN set on the host, which is exactly the kind of thing the
// config rule exists to avoid depending on.
function fingerprint(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

return [{
  json: Object.assign({}, post, {
    _caption: caption,
    _caption_escaped: escaped,
    _caption_source: source,
    _caption_words: words,
    _caption_hashtags: hashtags.length,
    _caption_fp: fingerprint(caption),
    _caption_ok: problems.length === 0 && caption !== '',
    _problems: problems,
    _reason: problems.length ? problems[0] : 'caption ok (' + words + ' words, '
      + hashtags.length + ' hashtags, from the ' + source + ')'
  })
}];
