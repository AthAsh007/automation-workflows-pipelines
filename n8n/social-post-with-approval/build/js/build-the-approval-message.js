// Build the message the reviewer sees, and nothing else.
//
// What leaves the system here is the caption and the image — the draft, exactly as it would
// be published. No internal paths, no slot numbers, no run ids, no reasoning about why this
// post was chosen. A reviewer approving a draft should be looking at the post, not at the
// workflow that made it.
//
// The caption travels in the message body rather than as an attached file so that what is
// read and what is published are the same string. If it will not fit in one Discord message
// the draft is HELD — never truncated. A caption cut at 2000 characters ends mid-sentence
// and still reads fine at the top, which is exactly how it gets approved.

const cfg = $('config').first().json;
const p = $json;

const INSTRUCTION = 'Reply **post** to publish, or **cancel** to discard.';

// Discord counts UTF-16 code units, the same thing String.length counts.
const body = p._caption + '\n\n' + INSTRUCTION;
const overBy = body.length - cfg.discord_message_limit;

const problems = [];
if (overBy > 0) {
  problems.push('the caption plus the approval line is ' + body.length + ' characters, '
    + overBy + ' over Discord\'s ' + cfg.discord_message_limit + ' limit. Shorten the '
    + 'caption in the bank — it is not truncated here, because a caption cut mid-sentence '
    + 'still reads fine at the top and gets approved.');
}

return [{
  json: Object.assign({}, p, {
    _message: body,
    _message_length: body.length,
    _file_name: p._today + '_' + p.slug + '.png',
    _message_ok: problems.length === 0,
    _problems: problems,
    _reason: problems.length ? problems[0]
      : 'draft ready for ' + (cfg.test_delivery ? 'the TEST channel' : 'review') + ', '
        + body.length + ' characters and a ' + p._png_bytes + ' byte image'
  })
}];
