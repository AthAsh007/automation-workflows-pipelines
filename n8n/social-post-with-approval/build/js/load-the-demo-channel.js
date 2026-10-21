// The approval channel, when there is no Discord bot. Demo bank only (SHEET_ID blank).
//
// Messages are returned newest first, exactly as the Discord node's "get many" returns them,
// with the same fields the gate reads: id, author { id, username, bot }, content, attachments,
// edited_timestamp. Alongside the reviewer's reply it holds the two things the gate must
// refuse, so the execution shows them being ignored:
//
//   * another bot saying "post" — a second automation is not a second opinion
//   * a human saying "looks good" — chatter is not a decision
//
// The reply itself is DEMO_REPLY in config: post | cancel | edit | bad-edit.

// @include lib/demo-content.js

const cfg = $('config').first().json;

const BOT = { id: DEMO_DRAFT.bot_id, username: 'approvals-bot', bot: true };
const OTHER_BOT = { id: '1100000000000000002', username: 'some-other-bot', bot: true };
const REVIEWER = { id: '1200000000000000001', username: 'reviewer', global_name: 'Demo Reviewer', bot: false };

const reply = {
  post: 'post',
  cancel: 'cancel',
  edit: 'edit\n' + DEMO_EDIT_CAPTION,
  'bad-edit': 'edit\n' + DEMO_BAD_EDIT_CAPTION
}[cfg.demo_reply] || 'post';

const at = (min) => new Date(Date.now() - min * 60000).toISOString();

const messages = [
  { id: '1300000000000000103', author: REVIEWER, content: reply, timestamp: at(5), attachments: [] },
  { id: '1300000000000000102', author: REVIEWER, content: 'looks good, one sec', timestamp: at(20), attachments: [] },
  { id: '1300000000000000101', author: OTHER_BOT, content: 'post', timestamp: at(40), attachments: [] },
  {
    id: DEMO_DRAFT.message_id, author: BOT, timestamp: at(50), edited_timestamp: null,
    content: DEMO_DRAFT_CAPTION + '\n\n' + cfg.approval_instruction,
    attachments: [{
      id: '1400000000000000001', filename: '2026-01-01_' + DEMO_DRAFT.slug + '.png',
      content_type: 'image/png', size: 91234,
      url: 'https://cdn.discordapp.com/attachments/demo/' + DEMO_DRAFT.slug + '.png'
    }]
  },
  { id: '1299999999999999990', author: REVIEWER, content: 'post', timestamp: at(300), attachments: [] }
];

return messages.map((json) => ({ json }));
