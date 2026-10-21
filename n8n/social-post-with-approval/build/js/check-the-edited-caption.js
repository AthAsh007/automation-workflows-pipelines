// A reviewer replied `edit` with a new caption. Hold it to exactly the rules a model caption
// meets — length, hashtags, banned phrases, links, @mentions, a repeated hook — and build what
// happens next either way.
//
// Passes  -> it goes back out as a NEW draft: the edited caption, the same image (the
//            attachment on the original draft, fetched by "download the draft image"), and the
//            approval line. The old draft is closed as `superseded`. The edit itself publishes
//            nothing: the reviewer approves the revised draft like any other, with `post`.
// Fails   -> the bot replies to the edit with the reasons, the refusal is logged with the
//            edit's Reply id so it is answered once, and the ORIGINAL draft stays open.
//
// Why re-deliver rather than publish the edit directly: the person approving should be looking
// at the exact message that will be published, fingerprinted, next to its picture — the same
// guarantee every other draft gets.

// @include lib/caption-rules.js

const cfg = $('config').first().json;
const d = $json;

// The edited draft's own previous hook is not a "recent post" — only published hooks count.
const c = checkCaption(d._edit_text || '', cfg, d._recent_hooks || []);
const problems = c.problems.slice();

const message = c.caption + '\n\n' + cfg.approval_instruction;
if (message.length > cfg.discord_message_limit) {
  problems.push('with the approval line it is ' + message.length + ' characters; Discord\'s '
    + 'limit is ' + cfg.discord_message_limit);
}

const draft = d._draft_message || {};
const image = (draft.attachments || []).find((a) =>
  String(a.content_type || '').startsWith('image/') || /\.png$/i.test(String(a.filename || '')));
if (!image) {
  problems.push('the original draft no longer has its image, so there is nothing to re-deliver '
    + 'the edit with');
}

let refusal = 'That edit was not applied:\n'
  + problems.map((p) => '• ' + p).join('\n')
  + '\n\nThe draft above is still open. Reply **post**, **cancel**, or send another **edit**.';
if (refusal.length > cfg.discord_message_limit) {
  refusal = refusal.slice(0, cfg.discord_message_limit - 3) + '...';
}

return [{
  json: Object.assign({}, d, {
    _edit_ok: problems.length === 0,
    _problems: problems,
    _caption: c.caption,
    _caption_fp: c.fp,
    _caption_words: c.words,
    _hook: c.hook,
    _message: message,
    _refusal_message: refusal,
    _image_url: image ? image.url : '',
    _file_name: (d._date || 'draft') + '_' + (d._slug || 'post') + '_edit.png',
    _reason: problems.length
      ? 'edit by ' + d._approver + ' refused: ' + problems[0]
      : 'edit by ' + d._approver + ' passes (' + c.words + ' words, ' + c.hashtags
        + ' hashtags) — re-delivering it as a new draft'
  })
}];
