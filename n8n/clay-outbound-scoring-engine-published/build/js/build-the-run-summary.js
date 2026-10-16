// One summary for the whole run: what came in, how it tiered, what the credits went on and
// what the ordering saved, what Zoho and Smartlead did with it, and everyone held back with
// the reason. It is the monitoring: a run that quietly did nothing still posts this.
const cfg = $('config').first().json;
const run = $('decide what goes where').first().json;
const c = run.counts;

const first = (name) => { try { return $(name).first().json; } catch (e) { return null; } };
const every = (name) => { try { return $(name).all().map((i) => i.json); } catch (e) { return []; } };

const zoho = first("read Zoho's answers") || first('STOP: preview - Zoho payload shown') ||
  first('STOP: Zoho rejected the write') || first('STOP: could not authenticate with Zoho') || {};
const pushed = every("read Smartlead's answer");
const preview = first('STOP: preview - Smartlead payload shown');

const tiers = ['A', 'B', 'C', 'Reject'].map((t) => t + ' ' + (c.by_tier[t] || 0)).join(' · ');
const zohoLine = zoho._outcome === 'written to Zoho'
  ? 'Zoho: ' + zoho.inserted + ' new, ' + zoho.updated + ' updated' + (zoho.refused.length ? ', ' + zoho.refused.length + ' refused' : '')
  : 'Zoho: ' + (zoho._outcome || 'not reached') + (zoho._reason ? ' (' + zoho._reason + ')' : '');
const slLine = pushed.length
  ? 'Smartlead: ' + pushed.map((p) => p.tier + ' ' + (p.added !== null ? p.added : p.sent) + ' added' + (p.error ? ' (error)' : '')).join(', ')
  : 'Smartlead: ' + (preview ? preview._outcome + ' (' + preview._reason + ')' : 'nothing to push');

const heldLines = run.held.map((h) => '• ' + (h.full_name || h.clay_row_id) + (h.company ? ', ' + h.company : '') +
  ': ' + h._where + ', ' + h._why);

const text = [
  (cfg.mode === 'live' ? '' : '[' + cfg.mode.toUpperCase() + '] ') + 'Clay scoring run: ' + c.received + ' rows',
  'Tiers: ' + tiers,
  'Enrichment: ' + c.credits_used + ' of ' + c.credits_budget + ' credits used, ' + c.credits_saved +
    ' saved against enriching every row',
  zohoLine,
  slLine,
  'Held: ' + (c.held + c.zoho_only),
  ...heldLines
].join('\n');

return [{
  json: {
    mode: cfg.mode,
    counts: c,
    zoho: zoho,
    smartlead: pushed.length ? pushed : (preview || {}),
    held: run.held.map((h) => ({ who: h.full_name || h.clay_row_id, company: h.company, tier: h.tier,
      where: h._where, why: h._why })),
    summary: text,
    _notify_body: { text: text }
  }
}];
