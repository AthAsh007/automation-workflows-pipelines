// The owner approved. One item per recipient, exactly as planned before the approval was
// asked for: nothing is re-priced after the owner has seen it.
const p = $('plan the broadcast').first().json;
return p.sends.map((s) => ({ json: { name: s.name, to: s.to, body: s.body } }));
