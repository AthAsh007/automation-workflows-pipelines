// STOP: no sending platform configured — build a demo reply batch instead.
//
// Deterministic, and deliberately awkward: one reply of every class the rules know about,
// plus two that match nothing. Those last two are the important ones. A classifier
// demonstrated only on replies it can classify is a classifier nobody has tested.
const cfg = $('config').first().json;

if (cfg.replies_enabled) {
  throw new Error('demo replies reached with a sending key configured — check the IF gate');
}

const DAY = 86400000;
const now = Date.now();
function iso(ms) { return new Date(ms).toISOString(); }

const REPLIES = [
  ['P-ST-01-BR-001-20260902', 'Sofie Brandt', 'sofie.brandt@kestrelliving.example',
   'Kestrel Living', 'Nadia Osei',
   'Re: the modular sofa line',
   'This is interesting — can you send over rates and the last two campaigns she ran? ' +
   'Happy to jump on a call next week.'],
  ['P-ST-02-BR-011-20260902', 'Elena Ruiz', 'elena.ruiz@copperpotsauces.example',
   'Copper Pot Sauces', 'Tomas Ferreira',
   'Re: Tesco listing',
   'Thanks but we are not interested at the moment, our influencer budget is committed ' +
   'through the autumn.'],
  ['P-ST-03-BR-026-20260902', 'Beth Okoye', 'beth.okoye@rowansupplements.example',
   'Rowan Supplements', 'Priya Raman',
   'Re: the reformulated protein line',
   'Please unsubscribe me from this list and do not contact me again.'],
  ['P-ST-04-BR-031-20260902', 'Marc Dubois', 'marc.dubois@hexlineperipherals.example',
   'Hexline Peripherals', 'Leo Hartmann',
   'Automatic reply: Re: the wireless mouse',
   'I am out of office until the 14th with limited access to email.'],
  ['P-ST-05-BR-041-20260902', 'Aisha Rahman', 'aisha.rahman@lumenskin.example',
   'Lumen Skin', 'Amara Chike',
   'Re: fragrance-free serum',
   'I have left Lumen — please forward this to Dan who now handles partnerships.'],
  ['P-ST-06-BR-051-20260902', 'Mei Tanaka', 'mei.tanaka@paperfoldstudio.example',
   'Paperfold Studio', 'Iris Vandermeer',
   'Re: the watercolour set',
   'Budget is set for this year. Worth revisiting in January if she is still available.'],
  ['P-ST-01-BR-002-20260902', 'postmaster', 'postmaster@northwoodceramics.example',
   'Northwood Ceramics', 'Nadia Osei',
   'Undeliverable: Partnership with Nadia Osei',
   'Your message could not be delivered. The address was not found at this domain.'],
  // Matches nothing. Goes to a human, is never guessed at.
  ['P-ST-02-BR-012-20260902', 'Tom Aldridge', 'tom.aldridge@grainhousebakery.example',
   'Grainhouse Bakery', 'Tomas Ferreira',
   'Re: shipping nationwide',
   'Who is this for exactly? We had someone else email us about the same thing yesterday.'],
  ['P-ST-04-BR-032-20260902', 'Sara Lindholm', 'sara.lindholm@nightfallstudios.example',
   'Nightfall Studios', 'Leo Hartmann',
   'Re: early access',
   'Depends entirely on the numbers.']
];

return [{
  json: {
    source: 'demo',
    read_at: new Date().toISOString(),
    failures: [],
    replies: REPLIES.map(function (r, i) {
      return { reply_id: 'R-' + (1000 + i), pitch_id: r[0], from_name: r[1], from: r[2],
        brand: r[3], student: r[4], subject: r[5], text: r[6],
        received_at: iso(now - (i + 1) * 3600000),
        inbox: 'outreach@northbeam-outreach.example' };
    }),
    _note: 'DEMO REPLIES — nine fabricated replies, two of which match no rule on purpose.'
  }
}];
