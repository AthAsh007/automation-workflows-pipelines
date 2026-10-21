// ---- caption rules (shared) ---------------------------------------------------------------
// Inlined by build.mjs into every node that judges a caption: "apply the caption", "check the
// rewrite" (workflow 01) and "check the edited caption" (workflow 02). One copy of the rules,
// so a caption the model wrote, a caption the model rewrote and a caption a human typed into
// Discord are held to exactly the same standard.

// FNV-1a. Not a security hash — it lets workflow 02 prove that the caption it is about to
// publish is the one that was approved. require('crypto') needs NODE_FUNCTION_ALLOW_BUILTIN on
// the host, which is the kind of host setting the config rule exists to avoid depending on.
function fingerprint(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

// LinkedIn "little text" reserved characters. '#' is deliberately NOT escaped so hashtags keep
// working; everything else in the reserved set gets a backslash at publish time.
function escapeLittleText(s) {
  const RESERVED = '\\|{}@[]()<>*_~';
  return String(s).split('').map((c) => (RESERVED.includes(c) ? '\\' + c : c)).join('');
}

// A model sometimes wraps its answer in a code fence or in quotes despite being told not to.
// Unwrapping is lossless; anything beyond that would be editing, which no node here does.
function unwrapCaption(s) {
  return String(s || '')
    .replace(/^\s*```[a-z]*\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .replace(/^\s*["“]([\s\S]+)["”]\s*$/, '$1')
    .trim();
}

// The hook is the opening sentence: what shows above "...see more" in the feed, and the part a
// follower remembers. Two posts that open the same way read as a template, however different
// the rest is.
function hookOf(caption) {
  const first = String(caption || '').split('\n').map((l) => l.trim()).find(Boolean) || '';
  const m = first.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : first).slice(0, 200);
}

const HOOK_STOPWORDS = ['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for',
  'is', 'are', 'was', 'it', 'its', 'that', 'this', 'with', 'you', 'your', 'we', 'our', 'not',
  'be', 'by', 'at', 'as', 'do', 'does'];

function hookWords(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length > 1 && !HOOK_STOPWORDS.includes(w));
}

// Jaccard overlap of the meaningful words. 1 = the same words, 0 = nothing shared.
function hookSimilarity(a, b) {
  const A = new Set(hookWords(a));
  const B = new Set(hookWords(b));
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}

// Every rule returns a sentence a person can act on. The list is fed back to the model on the
// one rewrite, and shown to the reviewer when an edit is refused, so it has to read as an
// instruction rather than a code.
function checkCaption(raw, cfg, recentHooks) {
  const caption = unwrapCaption(raw);
  const problems = [];

  const hashtags = caption.match(/#[A-Za-z0-9_]+/g) || [];
  const withoutTags = caption.replace(/#[A-Za-z0-9_]+/g, ' ');
  const words = withoutTags.split(/\s+/).filter(Boolean).length;
  const emoji = (caption.match(/[‼-㊙\u{1F000}-\u{1FAFF}]/gu) || []).length;
  const lines = caption.split('\n').map((l) => l.trim()).filter(Boolean);
  const hook = hookOf(caption);

  if (!caption) {
    problems.push('the caption is empty');
  } else {
    if (words < cfg.caption_min_words) {
      problems.push('it is ' + words + ' words; write at least ' + cfg.caption_min_words);
    }
    if (words > cfg.caption_max_words) {
      problems.push('it is ' + words + ' words; cut it to ' + cfg.caption_max_words + ' or fewer');
    }
    if (hashtags.length < cfg.hashtags_min || hashtags.length > cfg.hashtags_max) {
      problems.push('it has ' + hashtags.length + ' hashtags; use ' + cfg.hashtags_min + '-'
        + cfg.hashtags_max);
    }
    if (cfg.hashtags_last_line_only && lines.length > 1) {
      const early = lines.slice(0, -1).join(' ').match(/#[A-Za-z0-9_]+/g) || [];
      if (early.length) {
        problems.push('hashtags belong on the last line only; move ' + early.slice(0, 3).join(', '));
      }
    }
    if (emoji > cfg.max_emoji) {
      problems.push('it has ' + emoji + ' emoji; the maximum is ' + cfg.max_emoji);
    }
    const lower = caption.toLowerCase();
    for (const phrase of cfg.banned_phrases) {
      if (lower.includes(phrase)) problems.push('remove the banned phrase "' + phrase + '"');
    }
    if (cfg.no_links_in_body) {
      // LinkedIn shows fewer people a post with an outbound link in the body. The link goes in
      // the first comment, by hand, after it is live.
      const links = caption.match(/https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:com|io|xyz|ai|co|net|org|dev|app)\b(?:\/\S*)?/gi) || [];
      if (links.length) {
        problems.push('remove the link (' + links[0] + ') from the body; links go in the first comment');
      }
    }
    if (/@[A-Za-z]/.test(caption.replace(/\S+@\S+\.\S+/g, ''))) {
      problems.push('remove the @mention; tags are added by hand on LinkedIn, not typed as text');
    }
    // The opening line, against what was actually published recently.
    for (const r of recentHooks || []) {
      const sim = hookSimilarity(hook, r.hook);
      if (sim >= cfg.hook_similarity) {
        problems.push('the opening line repeats the hook of "' + r.slug + '" (posted ' + r.date
          + ', ' + Math.round(sim * 100) + '% the same words); open differently');
        break;
      }
    }
  }

  return {
    caption: caption,
    problems: problems,
    words: words,
    hashtags: hashtags.length,
    emoji: emoji,
    hook: hook,
    fp: fingerprint(caption),
    escaped: escapeLittleText(caption)
  };
}
// ---- end caption rules --------------------------------------------------------------------
