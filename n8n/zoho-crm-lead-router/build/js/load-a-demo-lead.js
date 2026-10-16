// Three invented leads, one per intake source, so the whole workflow can be run before a
// webhook is pointed at anything. They are deliberately different shapes: a website form
// posts flat fields, a forwarded email arrives as a blob of text, a phone note is whatever
// somebody typed. `read the lead` is what makes them the same thing.
return [
  {
    json: {
      _demo: true,
      source: 'website',
      form: {
        full_name: 'Priya Raman',
        email: 'priya@example.com',
        phone: '+44 7700 900111',
        company: 'Northgate Clinics',
        message: 'We need a quote for onboarding 40 staff onto your platform.'
      }
    }
  },
  {
    json: {
      _demo: true,
      source: 'email',
      subject: 'Fwd: support issue with the portal',
      body: 'Forwarded message\nFrom: Tom Auber <tom.auber@example.org>\n' +
            'Phone: 020 7946 0102\n\n' +
            'Our portal login has been failing since the update. Can someone take a look?'
    }
  },
  {
    json: {
      _demo: true,
      source: 'phone',
      note: 'Call from Dana Whitlock at Ferris Group, 07700 900222. ' +
            'Wants a demo before end of month. Email dana.whitlock@example.net'
    }
  }
];
