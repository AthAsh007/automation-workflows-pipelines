// STOP: no writer configured — the skeleton pitch stands.
//
// The pitch is real: the facts are assembled, the numbers are the creator's own, and it is
// readable. It is also stiff, and the brief's third hard gate is that pitches never read
// templated. So it goes to the audit like every other pitch and will be held there unless
// it happens to pass — which the skeleton, by design, mostly does not.
//
// A blank AI_API_KEY means "a human finishes these", not "send them anyway".
const p = $json;

return [{
  json: Object.assign({}, p, {
    written_by: 'skeleton',
    writer_error: 'AI_API_KEY is blank — the skeleton was not rewritten'
  })
}];
