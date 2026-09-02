// Read the channel and decide whether a human approved the draft.
//
// This is the gate. Everything downstream of it is irreversible, so the rules here are
// deliberately narrow and every one of them is a refusal:
//
//   * Only messages AFTER the draft count. Anything already in the channel when the draft
//     landed cannot be a reply to it.
//   * The workflow's own messages never count. The bot posted the draft, so any message from
//     that same author is the system agreeing with itself. This is checked against the
//     draft's own author id rather than a configured bot id — there is nothing to get wrong.
//   * Other bots never count. A second automation is not a second opinion.
//   * The whole message must be the word. "post" approves; "post please", "we should post
//     this" and "do not post" do not. Substring matching here would make "do not post"
//     an approval, which is the worst available bug.
//   * The FIRST decisive message wins. If someone says cancel and someone else says post a
//     minute later, the draft was already cancelled — a later approval does not reopen it.
//   * A cancel beats an approval in the same message. There is no such message, but if the
//     word lists are ever edited to overlap, the safe reading wins.
//
// Input: messages from the channel, newest-first as Discord returns them.
// Output: exactly one item, always, with _decision = post | cancel | wait.

const cfg = $('config').first().json;
const pending = $('find the pending draft').first().json;

const messages = items.map((i) => i.json).filter((m) => m && m.id);

// Discord snowflake ids sort chronologically as numbers, and they are wider than a JS
// integer — compare them as BigInt rather than as strings, because string comparison puts
// a 19-digit id before a 20-digit one.
const anchor = BigInt(pending._message_id);
const draft = messages.find((m) => m.id === pending._message_id);

// The author of the draft is the identity that must never be trusted as an approver. If the
// draft message is no longer in the fetched window we cannot establish that identity, and
// the safe answer is to wait rather than to guess.
if (!draft) {
  return [{
    json: Object.assign({}, pending, {
      _decision: 'wait',
      _reason: 'the draft message ' + pending._message_id + ' was not in the messages read '
        + 'back from the channel. It may have scrolled out of the fetch window or been '
        + 'deleted. Nothing is published on an unverifiable draft.'
    })
  }];
}

const botAuthorId = String((draft.author && draft.author.id) || '');

const after = messages
  .filter((m) => {
    try { return BigInt(m.id) > anchor; } catch (e) { return false; }
  })
  .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1));   // oldest first

let decision = 'wait';
let approver = '';
let approverId = '';
let said = '';
const ignored = [];

for (const m of after) {
  const authorId = String((m.author && m.author.id) || '');
  const isBot = Boolean(m.author && m.author.bot);
  const content = String(m.content || '').trim().toLowerCase();

  if (!content) continue;

  if (authorId === botAuthorId) {
    ignored.push('own message: "' + content.slice(0, 40) + '"');
    continue;
  }
  if (isBot) {
    ignored.push('another bot (' + ((m.author && m.author.username) || authorId) + '): "'
      + content.slice(0, 40) + '"');
    continue;
  }

  const isCancel = cfg.cancel_words.includes(content);
  const isApprove = cfg.approve_words.includes(content);

  if (isCancel) { decision = 'cancel'; }
  else if (isApprove) { decision = 'post'; }
  else { ignored.push('not a decision: "' + content.slice(0, 40) + '"'); continue; }

  approver = (m.author && (m.author.global_name || m.author.username)) || authorId;
  approverId = authorId;
  said = content;
  break;   // first decisive message wins
}

return [{
  json: Object.assign({}, pending, {
    _decision: decision,
    _approver: approver,
    _approver_id: approverId,
    _said: said,
    _messages_after: after.length,
    _ignored: ignored,
    _reason: decision === 'post'
      ? approver + ' approved it ("' + said + '")'
      : decision === 'cancel'
        ? approver + ' cancelled it ("' + said + '")'
        : 'no decision yet — ' + after.length + ' message(s) since the draft, '
          + ignored.length + ' ignored'
  })
}];
