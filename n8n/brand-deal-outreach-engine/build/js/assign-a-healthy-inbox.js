// The deliverability gate. Their second hard gate, and the one that fails CLOSED.
//
// > Deliverability literate — warmup, domain health, spam are second nature.
//
// An inbox sends only if it can be proved healthy. Five reasons it cannot:
//
//   warming        younger than MIN_WARMUP_DAYS. Nothing else about it matters.
//   bouncing       above MAX_BOUNCE_RATE — pulled until somebody cleans the list.
//   complaints     above MAX_SPAM_RATE.
//   unhealthy      platform health score below MIN_HEALTH_SCORE.
//   unknown        the platform will not report on it. HOLD_UNKNOWN_INBOX decides, and it
//                  ships true, because an unknown inbox is not a healthy one.
//
// Then two ceilings, both enforced here rather than left to the sending platform: per
// mailbox, and per DOMAIN. The second is the one people forget — five mailboxes on one
// domain each politely under their own cap will still cook the domain between them.
//
// Runs once for the whole batch, because a per-item version cannot count what the batch is
// already using.
const cfg = $('config').first().json;
const items = $input.all();

const inboxes = ((items[0] && items[0].json._roster && items[0].json._roster.inboxes) || [])
  .map(function (i) { return Object.assign({}, i); });

function health(inbox) {
  const reasons = [];
  const bounce = inbox.bounce_rate;
  const spam = inbox.spam_rate;
  const score = inbox.health_score;

  if (Number(inbox.warmed_days || 0) < Number(cfg.min_warmup_days || 0)) {
    reasons.push('warming (' + (inbox.warmed_days || 0) + 'd of ' + cfg.min_warmup_days + ')');
  }
  const unknown = bounce === null || bounce === undefined ||
    score === null || score === undefined;
  if (unknown) {
    if (cfg.hold_unknown_inbox) reasons.push('health not reported — held by default');
  } else {
    if (Number(bounce) > Number(cfg.max_bounce_rate)) {
      reasons.push('bounce ' + (Number(bounce) * 100).toFixed(1) + '% over ' +
        (Number(cfg.max_bounce_rate) * 100).toFixed(1) + '%');
    }
    if (spam !== null && spam !== undefined && Number(spam) > Number(cfg.max_spam_rate)) {
      reasons.push('spam complaints ' + (Number(spam) * 100).toFixed(2) + '% over ' +
        (Number(cfg.max_spam_rate) * 100).toFixed(2) + '%');
    }
    if (Number(score) < Number(cfg.min_health_score)) {
      reasons.push('health score ' + score + ' under ' + cfg.min_health_score);
    }
  }
  if (String(inbox.state || '').toLowerCase() === 'paused') reasons.push('paused');
  return reasons;
}

// Room left today, per mailbox and per domain, starting from what the platform says has
// already gone out.
const perInboxCap = Number(cfg.max_per_inbox_day || 0);
const perDomainCap = Number(cfg.max_per_domain_day || 0);
const domainUsed = {};
const usable = [];

inboxes.forEach(function (inbox) {
  const reasons = health(inbox);
  inbox._blocked = reasons;
  inbox._sent = Number(inbox.sent_today || 0);
  const d = String(inbox.domain || '');
  domainUsed[d] = (domainUsed[d] || 0) + inbox._sent;
  if (!reasons.length) usable.push(inbox);
});

// Fewest sent first, so the load spreads instead of hammering the first healthy mailbox.
usable.sort(function (a, b) { return a._sent - b._sent; });

const out = [];
let sent = 0;
let heldByAudit = 0;
const inboxReport = inboxes.map(function (i) {
  return { inbox: i.email, domain: i.domain, sent_today: i._sent,
    blocked: i._blocked.join(' · ') };
});

items.forEach(function (item) {
  const p = item.json;

  if (!p.audit_passed) {
    heldByAudit++;
    out.push({ json: Object.assign({}, p, {
      inbox: '', _send: false, send_state: 'held',
      send_reason: p.hold_reason, inbox_report: inboxReport }) });
    return;
  }

  // Pick the first healthy mailbox with room, whose domain also has room.
  let chosen = null;
  for (let i = 0; i < usable.length; i++) {
    const inbox = usable[i];
    const d = String(inbox.domain || '');
    const inboxRoom = perInboxCap <= 0 || inbox._sent < perInboxCap;
    const domainRoom = perDomainCap <= 0 || (domainUsed[d] || 0) < perDomainCap;
    if (inboxRoom && domainRoom) { chosen = inbox; break; }
  }

  if (!chosen) {
    const anyHealthy = usable.length > 0;
    out.push({ json: Object.assign({}, p, {
      inbox: '', _send: false, send_state: 'held',
      send_reason: anyHealthy
        ? 'every healthy inbox is at its daily ceiling — this rolls to the next run'
        : 'no inbox passed the health gate: ' + inboxes.map(function (i) {
            return i.email + ' (' + i._blocked.join('; ') + ')';
          }).join(' | '),
      inbox_report: inboxReport }) });
    return;
  }

  chosen._sent++;
  domainUsed[String(chosen.domain || '')] =
    (domainUsed[String(chosen.domain || '')] || 0) + 1;
  usable.sort(function (a, b) { return a._sent - b._sent; });
  sent++;

  out.push({ json: Object.assign({}, p, {
    inbox: chosen.email,
    inbox_domain: chosen.domain,
    _send: cfg.send_enabled === true,
    send_state: cfg.send_enabled ? 'queued' : 'preview',
    send_reason: cfg.send_enabled ? '' : 'preview — nothing is sent',
    // In test mode every pitch is redirected to one address, so a real brand contact is
    // never emailed while the copy is being checked.
    to: cfg.test_send && cfg.test_email ? cfg.test_email : p.email,
    inbox_report: inboxReport,
    _totals: { candidates: items.length, sendable: sent, held_by_audit: heldByAudit }
  }) });
});

out.forEach(function (o) {
  o.json._totals = { candidates: items.length, sendable: sent, held_by_audit: heldByAudit,
    inboxes_healthy: usable.length, inboxes_total: inboxes.length };
});
return out;
