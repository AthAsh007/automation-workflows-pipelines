// The pipeline "02 follow-up sequence" runs against until GoHighLevel is wired up: the demo
// leads from the config node, with their last-touch and last-reply times turned into real
// timestamps so "quiet for 30 hours" means something relative to now. Every person is
// invented, and the mix is chosen so every decision the sequence makes is visible in one run.
const cfg = $('config').first().json;
const now = Date.now();
const at = (h) => (h === null || h === undefined || Number(h) < 0)
  ? '' : new Date(now - Number(h) * 3600000).toISOString().slice(0, 16).replace('T', ' ');

return (cfg.demo_pipeline || []).map((r) => ({
  json: {
    contact_key:  r.contact_key,
    name:         r.name,
    company:      r.company || '',
    email:        r.email || '',
    phone:        r.phone || '',
    contact_id:   r.contact_id || '',
    owner:        r.owner || '',
    stage:        r.stage || '',
    touches_sent: Number(r.touches_sent) || 0,
    last_touch:   at(r.last_touch_hours_ago),
    last_reply:   at(r.last_reply_hours_ago),
    _demo:        true
  }
}));
