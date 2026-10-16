// The notification endpoint refused the post. Named, with the response on it, because a
// silently dropped notification is indistinguishable from "there was nothing to tell you" —
// and those two need to look different in the execution list.
//
// Note what this node does NOT do: it does not fail the run. Zoho has already been written
// by this point, and losing a Slack message is not a reason to lose the lead.
return $input.all().map((i) => {
  const j = i.json || {};
  const err = j.error || j;
  const detail = (err && (err.message || err.description || err.error)) || j;
  return {
    json: {
      _outcome: 'notification failed',
      _reason: 'the notification endpoint refused the post — the CRM write is unaffected',
      response: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 400)
    }
  };
});
