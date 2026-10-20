// The "Run the demo lead" trigger lands here. Three invented leads, one per source the
// brief names — a website form, a forwarded email, and a phone call somebody typed up — so
// pressing Execute shows all three being read, routed and filed without a webhook, a
// GoHighLevel account or a single credential. The shapes are exactly what the real sources
// post, which is the point: the parser below never knows the difference.
return [
  {
    json: {
      'your-name': 'Rachel Okonkwo',
      'your-email': 'r.okonkwo@brightpath-dental.example',
      'your-phone': '+44 7700 900123',
      company: 'Brightpath Dental',
      'your-message': 'We would like a quote to rebuild our website and set up the booking side.'
    }
  },
  {
    json: {
      from: 'Tom Beasley <tom@beasleylogistics.example>',
      subject: 'Booking form is broken and we are losing bookings',
      text: 'Our booking form stopped working yesterday and customers cannot get through. Can someone look at this today?'
    }
  },
  {
    json: {
      taken_by: 'Ben',
      caller_name: 'Ravi Menon',
      caller_phone: '07700 900456',
      company: 'Menon & Co',
      note: 'Called to ask about our services and left a number. He will ring back next week.'
    }
  }
].map((l) => ({ json: l }));
