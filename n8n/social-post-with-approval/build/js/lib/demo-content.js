// ---- demo content (shared) ----------------------------------------------------------------
// Inlined by build.mjs into the demo-only nodes, so workflow 01's demo writer and workflow 02's
// demo channel tell one story: 01 drafts DEMO_DRAFT_CAPTION, 02 finds it open in the log and
// reads a reply to it. None of it is reachable while SHEET_ID is set.

const DEMO_DRAFT = {
  slug: 'demo-never-approve-your-own-work',
  slot: 2,
  pillar: 'Production AI guardrails',
  message_id: '1300000000000000100',
  bot_id: '1100000000000000001'
};

const DEMO_DRAFT_CAPTION = [
  'A workflow that approves its own drafts has no approval step at all.',
  '',
  'It drafts a post, reads its own draft back, and calls that a review. Nothing about the outcome depends on a person, so the delay is the only thing it added.',
  '',
  'The approval that counts is a human, in a channel made for nothing else, typing a word that cannot be mistaken for chat. Four things never count as a yes: the workflow\'s own message, another bot, silence, and a thumbs-up reaction.',
  '',
  'The cost is a few minutes of somebody\'s morning, every morning, and on busy days the post goes out later than planned. We think that is the right price for a company page.',
  '',
  'Who approves what goes out on your page today?',
  '',
  '(Demo draft, not for publication.)',
  '',
  '#Automation #Guardrails #Approval #Workflow #Demo'
].join('\n');

// A reviewer's clean revision: new opening, same argument, still inside every rule.
const DEMO_EDIT_CAPTION = [
  'If the system that writes the post can also approve it, nobody approved it.',
  '',
  'A draft that is posted for review and then read back by the same workflow has not been reviewed. It has been delayed. The outcome never depended on a person.',
  '',
  'So the only yes that counts here is a human, in a channel made for nothing else, typing one word that cannot be mistaken for chat. The workflow\'s own message does not count. Another bot does not count. Silence and a thumbs-up do not count either.',
  '',
  'The cost is a few minutes of somebody\'s morning, and on a busy day the post goes out later than planned. For a company page we think that is cheap.',
  '',
  'Who signs off what goes out on your page?',
  '',
  '(Demo draft, not for publication.)',
  '',
  '#Automation #Guardrails #Approval #Workflow #Demo'
].join('\n');

// An edit the rules refuse: too short, a link in the body, and hashtags mid-caption.
const DEMO_BAD_EDIT_CAPTION = [
  'Shorter version #Approval — the full write-up is at https://example.com/approvals',
  '',
  'Only a human in the right channel can approve a post.',
  '',
  '#Automation #Demo'
].join('\n');
// ---- end demo content ---------------------------------------------------------------------
