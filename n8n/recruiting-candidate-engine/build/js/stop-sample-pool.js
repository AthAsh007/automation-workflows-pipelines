// No ATS connected. Rather than ending the run, the engine hands the pipeline a small pool
// of fabricated candidates so every node downstream can be watched working. This is the
// state the walkthrough video is recorded in.
//
// Each row exists to exercise one branch of the gate. Do not tidy them up. Every number is
// in the 555-01XX reserved range and every address is at example.com.
return [
  { json: { id: 'C-1001', firstName: 'Marcus', lastName: 'Ellison', email: 'marcus.ellison@example.com',
      mobile: '(614) 555-0142', occupation: 'Forklift Operator',
      skillSet: 'forklift, pallet jack, shipping, RF scanner',
      address: { city: 'Calder City', state: 'MW' }, status: 'Active' } },

  { json: { id: 'C-1002', firstName: 'Danielle', lastName: 'Okafor', email: 'd.okafor@example.com',
      mobile: '614.555.0177', occupation: 'Warehouse Associate',
      skillSet: 'forklift certified; shipping; receiving; inventory',
      address: { city: 'Calder City', state: 'MW' }, status: 'Available' } },

  // The same human as C-1002 under a second ATS record, with the number written a third
  // way. Must collapse to one person, not be texted twice.
  { json: { id: 'C-1003', firstName: 'Danielle', lastName: 'Okafor', email: 'danielle.okafor@example.com',
      mobile: '+16145550177', occupation: 'Warehouse', skillSet: '',
      address: { city: 'Calder City', state: 'MW' }, status: 'Active' } },

  // Opted out three weeks ago. Scores well. Must never be contacted.
  { json: { id: 'C-1004', firstName: 'Priya', lastName: 'Raman', email: 'p.raman@example.com',
      mobile: '(614) 555-0188', occupation: 'Forklift Driver',
      skillSet: 'forklift, RF scanner, cycle counting',
      address: { city: 'Calder City', state: 'MW' }, status: 'Active' } },

  // Placed last month. Texting a placed candidate about a new role is how an agency loses
  // the client whose worker it just poached.
  { json: { id: 'C-1005', firstName: 'Tomas', lastName: 'Ibarra', email: 't.ibarra@example.com',
      mobile: '(614) 555-0155', occupation: 'Forklift Operator', skillSet: 'forklift, shipping',
      address: { city: 'Calder City', state: 'MW' }, status: 'Placed' } },

  // A placeholder typed into the mobile field, with a real landline underneath. Twilio
  // would answer 30003 on the first and charge for it.
  { json: { id: 'C-1006', firstName: 'Yvette', lastName: 'Braun', email: 'y.braun@example.com',
      mobile: '000-000-0000', phone: '614-555-0121', occupation: 'Shipping Clerk',
      skillSet: 'shipping, receiving', address: { city: 'Dublin', state: 'MW' }, status: 'Active' } },

  // Contacted six hours ago about a different job order. Inside the cooldown.
  { json: { id: 'C-1007', firstName: 'Andre', lastName: 'Whitlock', email: 'a.whitlock@example.com',
      mobile: '(614) 555-0199', occupation: 'Material Handler', skillSet: 'forklift, pallet jack',
      address: { city: 'Calder City', state: 'MW' }, status: 'Active' } },

  // Right skills, wrong state. Still scores; the distance shows up in the reasons.
  { json: { id: 'C-1008', firstName: 'Renata', lastName: 'Voss', email: 'r.voss@example.com',
      mobile: '(313) 555-0164', occupation: 'Forklift Operator', skillSet: 'forklift, shipping, OSHA',
      address: { city: 'Detroit', state: 'MI' }, status: 'Active' } },

  // Nothing in common with the job order. Below the floor, stored with the reason.
  { json: { id: 'C-1009', firstName: 'Owen', lastName: 'Castellanos', email: 'o.cast@example.com',
      mobile: '(614) 555-0133', occupation: 'Graphic Designer', skillSet: 'illustrator, figma',
      address: { city: 'Calder City', state: 'MW' }, status: 'Active' } },

  // No phone at all. Cannot be texted or called; kept in the database, not enrolled.
  { json: { id: 'C-1010', firstName: 'Sasha', lastName: 'Nurse', email: 's.nurse@example.com',
      mobile: '', occupation: 'Forklift Operator', skillSet: 'forklift, inventory',
      address: { city: 'Calder City', state: 'MW' }, status: 'Active' } },

  // A row the ATS export left half-empty. No id, so it cannot be tracked at all.
  { json: { id: '', firstName: '', lastName: '', mobile: '(614) 555-0102', skillSet: '' } }
];
