// DEMO ONLY — stands in for "[cred] LLM - rewrite against the failures" when the demo bank is in
// use and no LLM_API_KEY is set. Same response shape as the real call.
//
// The answer is the first draft with exactly the listed failures fixed: a new opening line, no
// link, no banned phrase, five hashtags on the last line. "check the rewrite" then runs the
// full rule set on it again — the canned answer gets no special treatment. It is also the
// draft workflow 02's demo finds open in its demo log.

// @include lib/demo-content.js

return [{
  json: {
    id: 'demo-rewrite',
    model: 'demo-writer',
    choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: DEMO_DRAFT_CAPTION } }]
  }
}];
