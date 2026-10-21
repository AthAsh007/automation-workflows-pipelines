// Reconstruct exactly what was approved — and refuse if it is not what was delivered.
//
// The caption published is taken from the DISCORD MESSAGE, not from the bank: the message is
// what the human read, and the bank row could have been edited in the sheet since. Publishing
// the bank row would publish something nobody approved.
//
// The fingerprint written at draft time then proves the message itself has not been edited.
// Discord lets an author edit a message in place, and an edited draft carries an approval given
// for different words. A mismatch stops the run rather than publishing either version. (To
// change the words, reply `edit` — that goes back through the caption rules and out as a new
// draft.)
//
// The image is the attachment on that same message: the picture the reviewer actually saw.

const cfg = $('config').first().json;
const approval = $json;
const draft = approval._draft_message || null;

const problems = [];

if (!draft) {
  return [{
    json: Object.assign({}, approval, {
      _publishable: false,
      _problems: ['the draft message did not travel with the approval'],
      _reason: 'the draft message is missing — nothing to publish'
    })
  }];
}

// Strip the approval instruction back off. It was appended by "build the approval message" (or
// "check the edited caption") and is the only thing in the message that is not the caption.
const INSTRUCTION = cfg.approval_instruction;
let caption = String(draft.content || '');
if (caption.endsWith(INSTRUCTION)) {
  caption = caption.slice(0, -INSTRUCTION.length);
} else {
  problems.push('the draft message does not end with the approval line, so it is not the '
    + 'message this workflow delivered (or APPROVAL_INSTRUCTION was changed while it was open)');
}
caption = caption.trim();

// @include lib/caption-rules.js

const fp = fingerprint(caption);
if (approval._caption_fp && fp !== approval._caption_fp) {
  problems.push('the caption in the channel no longer matches what was delivered (logged '
    + approval._caption_fp + ', now ' + fp + '). The message was edited after delivery. Reply '
    + '`edit` with the new text instead, so it is checked and re-delivered.');
}
if (draft.edited_timestamp) {
  problems.push('the draft message was edited at ' + draft.edited_timestamp);
}

const image = (draft.attachments || []).find((a) =>
  String(a.content_type || '').startsWith('image/') || /\.png$/i.test(String(a.filename || '')));
if (!image) {
  problems.push('the draft message has no image attached. A caption is not a post — the '
    + 'approval was given for a picture that is no longer there.');
}

return [{
  json: Object.assign({}, approval, {
    _publishable: problems.length === 0,
    _caption: caption,
    _caption_escaped: escapeLittleText(caption),
    _caption_fp_now: fp,
    _hook: approval._hook || hookOf(caption),
    _image_url: image ? image.url : '',
    _image_name: image ? image.filename : '',
    _image_bytes: image ? image.size : 0,
    _problems: problems,
    _reason: problems.length ? problems[0]
      : 'the approved draft is intact — ' + caption.length + ' characters, fingerprint ' + fp
        + ', image ' + ((image && image.size) || 0) + ' bytes'
  })
}];
