// DEMO ONLY — stands in for "[cred] LLM - write the caption" when the demo bank is in use and no
// LLM_API_KEY is set. It is reached only through the "demo" output of "who writes the caption?",
// which pick todays post selects only while SHEET_ID is blank.
//
// It answers in the same OpenAI-compatible shape as the real call, so "apply the caption" runs
// unchanged. The answer is deliberately the kind of first draft a model really produces, and it
// breaks four rules at once:
//
//   * it opens with the same hook as a post published two days ago (see "load the demo log")
//   * it carries a link in the body
//   * it uses a banned phrase
//   * it has eight hashtags
//
// so the execution shows the check catching each one and the rewrite fixing them.

const content = [
  'Most approval steps fail because nobody owns the decision!',
  '',
  'A workflow that drafts a post and then approves it itself has not added a review step. It has added a delay. The draft goes in, the same system reads it back, and nothing about the outcome depends on a person.',
  '',
  'This is a game-changer for teams that publish every day: the only approval that counts is a human, in a channel made for nothing else, typing a word that cannot be mistaken for chat. Its own message does not count. Another bot does not count. Silence does not count, and neither does a thumbs-up.',
  '',
  'The cost is a few minutes of somebody\'s morning, every morning. We think that is the right price for a company page.',
  '',
  'Full checklist here: https://example.com/approval-checklist',
  '',
  'Who approves what goes out on your page?',
  '',
  '#Automation #AI #Guardrails #Approval #Workflow #LinkedIn #Content #Demo'
].join('\n');

return [{
  json: {
    id: 'demo-first-draft',
    model: 'demo-writer',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: content } }]
  }
}];
