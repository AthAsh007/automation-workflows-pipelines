// "Run the demo replies" lands here. Six invented replies in the shape Smartlead's EMAIL_REPLY
// webhook posts, one for each thing a reply can be: interested, not now, a referral, an
// unsubscribe, an out-of-office, and one only a person should answer.
const base = { event_type: 'EMAIL_REPLY', campaign_id: 'demo-campaign-a', campaign_name: 'Tier A (demo)' };
const replies = [
  { sl_email_lead_id: 'demo-1', sl_lead_email: 'dana.reyes@ledgerly.example', to_name: 'Dana Reyes',
    subject: 'Re: Ledgerly and your Q4 pipeline',
    reply_message: { text: 'Thanks, the timing is actually good. Can you send a couple of slots for Thursday?\n\nOn Tue, 22 Sep, Sam wrote:\n> Hi Dana...' } },
  { sl_email_lead_id: 'demo-2', sl_lead_email: 'marcus.obi@freightline.example', to_name: 'Marcus Obi',
    subject: 'Re: Freightline',
    reply_message: { text: 'Not a priority this quarter. Circle back in Q1 and we can look at it then.' } },
  { sl_email_lead_id: 'demo-3', sl_lead_email: 'aisha.khan@stackmart.example', to_name: 'Aisha Khan',
    subject: 'Re: Stackmart outbound',
    reply_message: { text: "I'm not the right person for this. Please loop in our RevOps lead, jamie.cole@stackmart.example." } },
  { sl_email_lead_id: 'demo-4', sl_lead_email: 'nora.quinn@vaultline.example', to_name: 'Nora Quinn',
    subject: 'Re: Vaultline',
    reply_message: { text: 'Please remove me from your list.' } },
  { sl_email_lead_id: 'demo-5', sl_lead_email: 'grace.liu@parcelhub.example', to_name: 'Grace Liu',
    subject: 'Automatic reply: Parcelhub',
    reply_message: { text: 'I am out of the office until Monday with limited access to email.' } },
  { sl_email_lead_id: 'demo-6', sl_lead_email: 'priya@clinicflow.example', to_name: 'Priya Nair',
    subject: 'Re: Clinicflow',
    reply_message: { text: 'Who gave you my email address?' } }
];
return replies.map((r) => ({ json: { body: Object.assign({}, base, r), _source: 'demo replies (invented)' } }));
