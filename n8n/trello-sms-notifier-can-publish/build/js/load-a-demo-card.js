// The "Run the demo" trigger lands here. Two invented cards — one with a phone number
// and one without — so pressing Execute shows both paths through the workflow without
// a Trello webhook, a Twilio account or a single credential. The shapes are exactly
// what Trello posts on a real card update, which is the point: the reader below never
// knows the difference.

const now = new Date().toISOString();

return [
  {
    json: {
      action: 'createCard',
      'idAction': '680a00000000000001',
      data: {
        card: {
          id:           '680a00000000000001',
          name:         'Jane Smith — Quote request',
          desc:         'Customer: Jane Smith\nPhone: +1 555-0123\nEmail: jane@example.com\nCompany: Acme Co\nBudget: $5,000\nTimeline: ASAP\n\nNeed a quote for marketing automation.',
          shortLink:    'abc123',
          idList:       '680a00000000000010',
          idLabels:     [],
          labels:       [{ name: 'lead', color: 'green' }, { name: 'quote', color: 'purple' }],
          pos:          16384,
          idMembers:    [],
          creation:     now
        },
        list:  { id: '680a00000000000010', name: 'New Leads' },
        board: { id: '680a00000000000000', name: 'Workfluxa Leads' }
      },
      memberCreator: { id: '680a000000000000ff', username: 'board-member', fullName: 'Sam' },
      'date': now
    }
  },
  {
    json: {
      action: 'createCard',
      'idAction': '680a00000000000002',
      data: {
        card: {
          id:       '680a00000000000002',
          name:     'Enquiry — no phone on card',
          desc:     'Customer: Robert Chen\nEmail: rob@example.com\nCompany: Beta Ltd\n\nGeneral enquiry about services.',
          shortLink: 'def456',
          idList:   '680a00000000000010',
          idLabels: [],
          labels:   [{ name: 'lead', color: 'green' }],
          pos:      32768,
          idMembers: [],
          creation: now
        },
        list:  { id: '680a00000000000010', name: 'New Leads' },
        board: { id: '680a00000000000000', name: 'Workfluxa Leads' }
      },
      memberCreator: { id: '680a000000000000ff', username: 'board-member', fullName: 'Sam' },
      'date': now
    }
  }
];
