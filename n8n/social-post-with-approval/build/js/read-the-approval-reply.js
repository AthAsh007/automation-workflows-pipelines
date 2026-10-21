// Read the channel and decide what a human said about the draft.
//
// This is the gate. Everything downstream of `post` is irreversible, so the rules are narrow and
// every one of them is a refusal:
//
//   * Only messages AFTER the draft count. Anything already in the channel cannot be a reply.
//   * The workflow's own messages never count. Checked against the draft's own author id, not
//     a configured bot id — there is nothing to get wrong.
//   * Other bots never count. A second automation is not a second opinion.
//   * `post` / `cancel` must be the WHOLE message. "post please" and "do not post" are not
//     decisions. Substring matching would make "do not post" an approval.
//   * An EDIT is a message whose first line is exactly an edit word and whose remaining lines
//     are the new caption. It never publishes anything: "check the edited caption" runs the
//     caption rules on it and, if it passes, it goes out again as a NEW draft needing its own
//     `post`. An edit word with nothing under it is not a decision.
//   * Messages this workflow has already acted on (a refused edit) are skipped, by the Reply id
//     the log recorded, so a refusal is answered once rather than every five minutes — and a
//     later `post` can still approve the original.
//   * The FIRST decisive message wins. A cancel is not reopened by a later approval.
//
// Input: messages from the channel, newest first as Discord returns them (or the demo channel).
// Output: exactly one item, always, with _decision = post | edit | cancel | wait, and the draft
// message itself as _draft_message for the nodes after the Switch.

const cfg = $('config').first().json;
const pending = $('find the pending draft').first().json;

const messages = items.map((i) => i.json).filter((m) => m && m.id);

// Discord snowflakes are wider than a JS integer and sort chronologically as numbers — compare
// as BigInt, because string comparison puts a 19-digit id before a 20-digit one.
const anchor = BigInt(pending._message_id);
const draft = messages.find((m) => m.id === pending._message_id);

if (!draft) {
  return [{
    json: Object.assign({}, pending, {
      _decision: 'wait',
      _reason: 'the draft message ' + pending._message_id + ' was not in the messages read back '
        + 'from the channel. It may have scrolled out of the fetch window or been deleted. '
        + 'Nothing is published on an unverifiable draft.'
    })
  }];
}

const botAuthorId = String((draft.author && draft.author.id) || '');
const handled = new Set(pending._handled_reply_ids || []);

const after = messages
  .filter((m) => { try { return BigInt(m.id) > anchor; } catch (e) { return false; } })
  .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));   // oldest first

let decision = 'wait';
let approver = '';
let approverId = '';
let said = '';
let replyId = '';
let editText = '';
const ignored = [];

for (const m of after) {
  const authorId = String((m.author && m.author.id) || '');
  const isBot = Boolean(m.author && m.author.bot);
  const original = String(m.content || '').trim();
  const content = original.toLowerCase();

  if (!content) continue;
  if (handled.has(m.id)) { ignored.push('already acted on: ' + m.id); continue; }
  if (authorId === botAuthorId) { ignored.push('own message: "' + content.slice(0, 40) + '"'); continue; }
  if (isBot) {
    ignored.push('another bot (' + ((m.author && m.author.username) || authorId) + '): "'
      + content.slice(0, 40) + '"');
    continue;
  }

  const lines = original.split('\n');
  const firstLine = lines[0].trim().toLowerCase();
  const rest = lines.slice(1).join('\n').trim();

  if (cfg.cancel_words.includes(content)) decision = 'cancel';
  else if (cfg.approve_words.includes(content)) decision = 'post';
  else if (cfg.edit_words.includes(firstLine) && rest) { decision = 'edit'; editText = rest; }
  else {
    ignored.push((cfg.edit_words.includes(firstLine) ? 'an edit with no caption under it: "'
      : 'not a decision: "') + content.slice(0, 40) + '"');
    continue;
  }

  approver = (m.author && (m.author.global_name || m.author.username)) || authorId;
  approverId = authorId;
  said = decision === 'edit' ? 'edit (' + editText.length + ' characters)' : content;
  replyId = m.id;
  break;   // first decisive message wins
}

return [{
  json: Object.assign({}, pending, {
    _decision: decision,
    _approver: approver,
    _approver_id: approverId,
    _said: said,
    _reply_id: replyId,
    _edit_text: editText,
    _draft_message: {
      id: draft.id,
      content: draft.content,
      edited_timestamp: draft.edited_timestamp || null,
      author: draft.author,
      attachments: draft.attachments || []
    },
    _messages_after: after.length,
    _ignored: ignored,
    _reason: decision === 'post' ? approver + ' approved it ("' + said + '")'
      : decision === 'cancel' ? approver + ' cancelled it ("' + said + '")'
      : decision === 'edit' ? approver + ' sent an edit (' + editText.length + ' characters)'
      : 'no decision yet — ' + after.length + ' message(s) since the draft, ' + ignored.length
        + ' ignored'
  })
}];
