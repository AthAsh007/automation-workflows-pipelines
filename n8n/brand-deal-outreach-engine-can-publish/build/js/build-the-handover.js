// The message that actually earns the fee: an interested brand, in front of a person,
// within the hour, with enough context to reply without opening anything else.
//
// Deliberately separate from the hourly summary. A summary is scanned; a handover has to be
// acted on, and putting the two in one message means the second gets treated like the first.
const s = $json;

const lines = [];
lines.push('*' + s.handovers.length + ' repl' +
  (s.handovers.length === 1 ? 'y needs' : 'ies need') + ' a person*');
lines.push('');

s.handovers.slice(0, 10).forEach(function (h) {
  lines.push('*' + h.brand + '* → ' + h.student);
  lines.push('_' + h.contact + ' <' + h.from + '>_ · ' + h.klass);
  lines.push('> ' + String(h.excerpt).replace(/\n+/g, ' '));
  lines.push('→ ' + h.next_step);
  lines.push('');
});

if (s.handovers.length > 10) {
  lines.push('… and ' + (s.handovers.length - 10) + ' more in the dashboard.');
}

return [{ json: Object.assign({}, s, { _handover_body: { text: lines.join('\n') } }) }];
