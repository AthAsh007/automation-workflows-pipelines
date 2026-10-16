// Reconstruct exactly what was approved — and refuse if it is not what was delivered.
//
// The caption published is taken from the DISCORD MESSAGE, not from the bank. That is
// deliberate: the message is what the human read, and the bank row could have been edited in
// the spreadsheet in the hours since. Publishing the bank row would publish something nobody
// approved.
//
// The fingerprint written at draft time then proves the message itself has not been edited.
// Discord lets an author edit a message in place, and an edited draft carries an approval
// that was given for different words. A mismatch stops the run rather than publishing
// either version.
//
// The image is the attachment on that same message: the picture the reviewer actually saw,
// fetched fresh so there is no expiring CDN link to keep.

const cfg = $('config').first().json;
const approval = $('read the approval reply').first().json;

const messages = items.map((i) => i.json).filter((m) => m && m.id);
const draft = messages.find((m) => m.id === approval._message_id);

const problems = [];

if (!draft) {
  return [{
    json: Object.assign({}, approval, {
      _publishable: false,
      _problems: ['the draft message disappeared between reading the approval and reading '
        + 'the draft'],
      _reason: 'the draft message is gone — nothing to publish'
    })
  }];
}

// Strip the approval instruction back off. It was appended by "build the approval message"
// and is the only thing in the message that is not the caption.
const INSTRUCTION = 'Reply **post** to publish, or **cancel** to discard.';
let caption = String(draft.content || '');
if (caption.endsWith(INSTRUCTION)) {
  caption = caption.slice(0, -INSTRUCTION.length);
} else {
  problems.push('the draft message does not end with the approval line, so it is not the '
    + 'message this workflow delivered');
}
caption = caption.trim();

// Same FNV-1a as apply-the-caption.js. Both must change together if either does.
function fingerprint(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

const fp = fingerprint(caption);
if (approval._caption_fp && fp !== approval._caption_fp) {
  problems.push('the caption in the channel no longer matches what was delivered '
    + '(logged ' + approval._caption_fp + ', now ' + fp + '). The message has been edited '
    + 'since it was approved. Cancel it and run workflow 01 again.');
}
if (draft.edited_timestamp) {
  problems.push('the draft message was edited at ' + draft.edited_timestamp);
}

const attachments = draft.attachments || [];
const image = attachments.find((a) =>
  String(a.content_type || '').startsWith('image/')
  || /\.png$/i.test(String(a.filename || '')));

if (!image) {
  problems.push('the draft message has no image attached. A caption is not a post — the '
    + 'approval was given for a picture that is no longer there.');
}

// LinkedIn "little text" escaping, applied at publish time. '#' is deliberately not escaped
// so hashtags keep working.
const RESERVED = '\\|{}@[]()<>*_~';
const escaped = caption.split('').map((c) => (RESERVED.includes(c) ? '\\' + c : c)).join('');

return [{
  json: Object.assign({}, approval, {
    _publishable: problems.length === 0,
    _caption: caption,
    _caption_escaped: escaped,
    _caption_fp_now: fp,
    _image_url: image ? image.url : '',
    _image_name: image ? image.filename : '',
    _image_bytes: image ? image.size : 0,
    _problems: problems,
    _reason: problems.length ? problems[0]
      : 'the approved draft is intact — ' + caption.length + ' characters, fingerprint '
        + fp + ', image ' + (image.size || 0) + ' bytes'
  })
}];
