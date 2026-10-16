// Posted to the team channel. A webhook that answered with an error is reported, not assumed.
const b = $input.first().json || {};
const failed = !!(b.error || b.ok === false);
return [{ json: { _outcome: failed ? 'the team channel refused the post' : 'posted to the team channel',
  error: failed ? JSON.stringify(b.error || b).slice(0, 300) : '' } }];
