// What happens to each reply, decided in one place.
//
// Five routes, and only one of them involves a person:
//
//   handover   interested, or unclear -> a human, now. This is the money.
//   suppress   unsubscribe or hard bounce -> added to the suppression list, and the pitch
//              row is closed. Nothing about this is optional or delayed.
//   reroute    wrong person -> the pitch is closed and the brand goes back to the target
//              list for research, because the company is still a fit even though the
//              contact is not.
//   nurture    not now, with a date attached -> closed, re-pitchable after the window.
//   close      not interested -> closed.
//   ignore     auto-reply -> nothing at all. An out-of-office is not a reply and must not
//              consume the follow-up.
const cfg = $('config').first().json;
const items = $input.all();

const DAY = 86400000;
const now = Date.now();

const ACTIONS = {
  handover: { state: 'Replied — with a human', close: false, suppress: false },
  suppress: { state: 'Closed — suppressed', close: true, suppress: true },
  reroute:  { state: 'Closed — wrong contact', close: true, suppress: false },
  nurture:  { state: 'Closed — revisit', close: true, suppress: false },
  close:    { state: 'Closed — not interested', close: true, suppress: false },
  ignore:   { state: '', close: false, suppress: false }
};

const suppressionAdds = [];
const handovers = [];

const out = items.map(function (item) {
  const r = item.json;
  const action = ACTIONS[r.route] || ACTIONS.handover;

  if (action.suppress && r.from) suppressionAdds.push(String(r.from).toLowerCase());
  if (r.route === 'handover') handovers.push(r);

  const revisitAfter = r.reply_class === 'not-now'
    ? new Date(now + Number(cfg.repitch_after_days || 90) * DAY).toISOString().slice(0, 10)
    : '';

  return {
    json: Object.assign({}, r, {
      action: r.route,
      new_state: action.state,
      closes_the_pitch: action.close,
      adds_to_suppression: action.suppress,
      revisit_after: revisitAfter,
      // An auto-reply changes nothing, and saying so explicitly is what stops somebody
      // "fixing" it later by counting it as engagement.
      writes_back: r.route !== 'ignore',
      next_step: r.route === 'handover'
        ? (r.reply_class === 'unclear'
          ? 'read it — the classifier could not place this one'
          : 'a person replies with rates and the media kit')
        : r.route === 'suppress' ? 'suppressed; nothing further is sent to this address'
        : r.route === 'reroute' ? 'back to the target list for a new contact'
        : r.route === 'nurture' ? 'revisit after ' + revisitAfter
        : r.route === 'close' ? 'closed'
        : 'no action — automatic reply'
    })
  };
});

out.forEach(function (o) {
  o.json._suppression_adds = suppressionAdds;
  o.json._handover_count = handovers.length;
});
return out;
