// Zoho refused the Tasks write outright. Visible, with the response on it, rather than a
// sweep that reported work it never did.
//
// The one that actually happens: INVALID_DATA on What_Id, which means the deal id was sent
// without $se_module — the task then has nothing to attach to. compose-the-next-action always
// sends both; if this fires, check the module name has not been renamed in the org.
return $input.all().map((i) => {
  const j = i.json || {};
  const err = j.error || j;
  const detail = (err && (err.message || err.description || err.error)) || j;
  return {
    json: {
      _outcome: 'task creation failed',
      _reason: 'Zoho rejected the Tasks write — no next actions were created this run',
      zoho_response: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 600)
    }
  };
});
