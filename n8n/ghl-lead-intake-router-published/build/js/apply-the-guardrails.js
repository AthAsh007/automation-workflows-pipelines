// Decides which words go out, and builds every GoHighLevel request that follows a send.
//
// The AI draft is used only if it passes every guardrail, checked here in code:
//   - not empty, no placeholders or markup
//   - within the length for its channel (EMAIL_MAX_CHARS, SUBJECT_MAX_CHARS, SMS_MAX_CHARS)
//   - no prices, amounts, percentages or BANNED_WORDS (discounts, offers, promises...)
//   - an SMS ends with SMS_OPT_OUT_LINE
// Otherwise the template text goes, and `fallback_reason` says why: AI not configured, the AI
// call failed, the reply was unreadable, or which guardrail it broke. AI text that failed a
// guardrail is never sent.
const cfg = $('config').first().json;
const touch = $('compose the next touch').first().json;
const j = $input.first().json || {};
const channel = touch.channel;

function parseDraft(content) {
  const s = String(content || '').trim();
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    return { subject: String(o.subject || '').trim(), body: String(o.body || '').trim() };
  } catch (e) { return null; }
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function guardrails(draft) {
  const broken = [];
  const all = draft.subject + '\n' + draft.body;
  if (!draft.body) broken.push('empty body');
  if (/\[[^\]]*\]|\{\{|\}\}|<[^>]+>/.test(all)) broken.push('placeholder or markup');
  if (channel === 'sms') {
    if (draft.body.length > cfg.sms_max_chars) broken.push('SMS longer than ' + cfg.sms_max_chars);
    const end = draft.body.replace(/[.!\s]+$/, '');
    if (!end.toLowerCase().endsWith(String(cfg.sms_opt_out_line).toLowerCase())) broken.push('SMS missing the opt-out line');
  } else {
    if (draft.body.length > cfg.email_max_chars) broken.push('email longer than ' + cfg.email_max_chars);
    if (draft.subject.length > cfg.subject_max_chars) broken.push('subject longer than ' + cfg.subject_max_chars);
  }
  if (/[$£€₹¥]\s?\d|\d\s?(usd|gbp|eur|dollars?|pounds?|euros?)\b|\d+(\.\d+)?\s?(%|percent)/i.test(all)) {
    broken.push('mentions a price, amount or percentage');
  }
  const hits = (cfg.banned_words || []).filter((w) =>
    new RegExp('(^|[^a-z])' + escapeRe(w) + '([^a-z]|$)', 'i').test(all));
  if (hits.length) broken.push('banned words: ' + hits.join(', '));
  return broken;
}

let subject = touch.template_subject;
let body = touch.template_body;
let textSource = 'template';
let fallback = '';
let aiDraft = null;

if (j._template_ready) {
  fallback = 'AI not configured';
} else if (j.error) {
  const e = j.error;
  fallback = 'AI call failed: ' + String((e && (e.message || e.description)) || e).slice(0, 160);
} else {
  const content = (((j.choices || [])[0] || {}).message || {}).content;
  const draft = parseDraft(content);
  if (!draft) {
    fallback = 'AI reply unreadable';
  } else {
    aiDraft = draft;
    const broken = guardrails(draft);
    if (broken.length) {
      fallback = 'guardrail: ' + broken.join('; ');
    } else {
      body = draft.body;
      if (channel === 'email') subject = draft.subject || touch.template_subject;
      textSource = 'ai';
    }
  }
}

if (channel === 'email' && cfg.from_name) body += '\n\n— ' + cfg.from_name;

const base = cfg.ghl_api_base;
const ghlBody = channel === 'email'
  ? { type: 'Email', contactId: touch.contact_id, subject: subject, message: body,
      html: '<p>' + body.split('\n\n').join('</p><p>').split('\n').join('<br>') + '</p>' }
  : { type: 'SMS', contactId: touch.contact_id, message: body };

// ---- what follows a successful send
const now = new Date();
const newCount = (Number(touch.touches_sent) || 0) + 1;
const customFields = [];
if (cfg.seq_touches_field_id) customFields.push({ id: cfg.seq_touches_field_id, value: String(newCount) });
if (cfg.seq_last_touch_field_id) customFields.push({ id: cfg.seq_last_touch_field_id, value: now.toISOString() });

const owners = cfg.owners || [];
const ownerHit = owners.filter((o) => o.owner === touch.owner)[0];
const ownerId = ownerHit ? (ownerHit.user_id || '') : (touch.owner || '');
const task = {
  title: 'Call this lead: the follow-up sequence finished with no reply',
  body: (touch.name || 'This lead') + ' received all ' + newCount + ' touches and has not replied. ' +
    'Last touch: ' + channel + (touch.wants ? '. They asked about: ' + touch.wants : '') + '.',
  dueDate: new Date(now.getTime() + Number(cfg.task_due_hours || 24) * 3600000).toISOString(),
  completed: false
};
if (ownerId) task.assignedTo = ownerId;
const move = { pipelineStageId: cfg.nurture_stage_id };
if (cfg.ghl_pipeline_id) move.pipelineId = cfg.ghl_pipeline_id;

const isFinal = touch.is_final === true || Number(touch.touch) >= Number(cfg.max_touches);

return [{
  json: {
    contact_key: touch.contact_key, name: touch.name, owner: touch.owner, stage: touch.stage,
    contact_id: touch.contact_id, opportunity_id: touch.opportunity_id,
    email: touch.email, phone: touch.phone,
    touch: touch.touch, touches_sent: touch.touches_sent, channel: channel,
    ladder_channel: touch.ladder_channel, channel_note: touch.channel_note,
    local_time: touch.local_time, timezone_used: touch.timezone_used,
    subject: channel === 'email' ? subject : '',
    body: body,
    text_source: textSource,
    fallback_reason: fallback,
    ai_draft_rejected: textSource === 'template' && aiDraft ? aiDraft : null,
    _ghl: { method: 'POST', url: base + '/conversations/messages', body: ghlBody },
    _writeback: {
      fields: { customFields: customFields },
      fields_note: customFields.length ? '' : 'no SEQ_*_FIELD_ID set: the counter is not written back',
      tags: { tags: ['sequence-touch-' + touch.touch].concat(cfg.sequence_tags || []) },
      note: { body: 'Follow-up touch ' + touch.touch + ' of ' + cfg.max_touches + ' sent by ' + channel +
        (touch.channel_note && touch.channel_note !== 'the ladder channel' ? ' (' + touch.channel_note + ')' : '') +
        '. Text: ' + (textSource === 'ai' ? 'AI-written, passed the guardrails' : 'template' +
        (fallback ? ' (' + fallback + ')' : '')) + '.\n\n' + body },
      is_final: isFinal,
      task: task,
      nurture_enabled: isFinal && !!cfg.nurture_stage_id && !!touch.opportunity_id,
      move: move
    },
    _demo: touch._demo === true
  }
}];
