// Reads each incoming email into one shape: sender, subject, body, the Gmail message id and
// thread id (what the reply is attached to), and the RFC Message-ID header.
//
// Emails come from `config` (one item per email the Gmail trigger picked up). Run by hand,
// config carries no email, so the invented DEMO_EMAILS stand in and the whole run is visible
// with nothing connected.
//
// The Gmail trigger with "Simplify" off returns a parsed message: `from.value[0].address`,
// `text`, `html`, `headers`. With it on, `From` and `snippet`. Both are read.
const cfg = $('config').first().json;

const isReal = (p) => p && (p.id || p.threadId || p.from || p.From || p.text || p.snippet);
let emails = $input.all().map((i) => i.json.incoming).filter(isReal);
const demo = emails.length === 0;
if (demo) emails = cfg.demo_emails;

const strip = (html) => String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

function sender(p) {
  const v = p.from && p.from.value && p.from.value[0];
  if (v && v.address) return { address: v.address, name: v.name || '' };
  const raw = String((typeof p.from === 'string' ? p.from : '') || p.From || (p.headers || {}).from || '');
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/);
  if (m) return { address: m[2].trim(), name: m[1].trim() };
  return { address: raw.trim(), name: '' };
}

// Quoted history below the new text would make every reply in a thread look like the first
// message again. Keep only what this sender just wrote.
function newText(body) {
  const lines = String(body).split(/\r?\n/);
  const cut = lines.findIndex((l) => /^\s*>/.test(l) || /^On .+wrote:\s*$/.test(l) || /^-{2,}\s*Original Message/i.test(l));
  return (cut === -1 ? lines : lines.slice(0, cut)).join('\n').trim();
}

return emails.map((p) => {
  const s = sender(p);
  const headers = p.headers || {};
  const body = newText(p.text || p.textPlain || strip(p.html) || p.snippet || '');
  const address = s.address.toLowerCase();
  const autoReply = /auto-replied|auto-generated/i.test(String(headers['auto-submitted'] || ''))
    || /bulk|list|junk/i.test(String(headers.precedence || ''));

  let problem = '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) problem = 'no usable sender address';
  else if (!body) problem = 'empty body';
  else if (cfg.own_addresses.includes(address)) problem = 'sent from one of our own addresses';
  else if (autoReply) problem = 'an automatic or bulk message';

  return { json: {
    demo,
    from: address,
    from_name: s.name || address.split('@')[0] || '',
    subject: String(p.subject || p.Subject || headers.subject || '').trim(),
    body,
    message_id: String(p.id || ''),                   // Gmail's id: the reply is attached to this
    thread_id: String(p.threadId || ''),              // the conversation the reply must stay in
    rfc_message_id: String(p.messageId || headers['message-id'] || ''),
    in_reply_to: String(p.inReplyTo || headers['in-reply-to'] || ''),
    usable: problem === '',
    problem
  } };
});
