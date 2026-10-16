// Runs once per teacher turn. Exactly one WhatsApp reply goes out: the agent's answer, the fixed
// reply from Read message (media, unknown number), or an apology when the agent failed
// (LLM error, max iterations, empty answer), so a teacher is never left without a reply.
const src = $('School clock').item.json;
const err = $json.error ? String($json.error.message || $json.error) : null;
const answer = String(src.reply || $json.output || '').trim();
return {
  json: {
    to: src.from,
    text: answer || 'Sorry, something went wrong on my side. Please try again in a minute.',
    agent_error: err,
  },
};
