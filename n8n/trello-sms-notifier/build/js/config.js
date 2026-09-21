// TRELLO-SMS — CONFIG
// Everything you might want to change lives in this one node. Nothing else in the
// workflow needs editing.
//
// A blank key means that step is SKIPPED, never that the run fails. That is what lets
// this be demonstrated on a screen-share before a single Trello or Twilio credential
// exists — the SMS is built in full and shown, never sent.
//
// The same config node ships in every n8n workflow in this project. It is the document
// a non-developer edits, and the reason these templates run on n8n Cloud with zero
// host environment variables.

// -------------------------------------------------------- Trello
// The board and list to watch. The ids live in the Trello URL:
//   trello.com/b/<board-id>/<board-name>
//   trello.com/b/<board-id>/<board-name>/<list-name>-<list-id>
const TRELLO_KEY    = '';
const TRELLO_TOKEN  = '';
const TRELLO_BOARD_ID = '';
const TRELLO_LIST_ID  = '';

// -------------------------------------------------------- Twilio
// Account sid, auth token and the Twilio phone number that sends. Get them from
// twilio.com/console. Both blank -> the SMS is built and shown, never sent.
const TWILIO_ACCOUNT_SID = '';
const TWILIO_AUTH_TOKEN  = '';
const TWILIO_FROM_NUMBER = '+14155238886';

// Where test SMS lands when DRY_RUN is true and you want to see a real message.
const TRENCH_PHONE = '';

// -------------------------------------------------------- SMS content
// Template for the outbound SMS. {{field}} placeholders: contact_name, card_name,
// company, budget, timeline, url.
const SMS_TEMPLATE = (
  "Hi {{contact_name}}, we received your request \"{{card_name}}\" " +
  "and a member of the team will follow up within 1 business hour. — {{company}}"
);

// -------------------------------------------------------- Safety switch
//   DRY_RUN true  (how it ships) -> nothing is sent. The SMS is built and shown in
//                                   STOP: preview — SMS not sent.
//   DRY_RUN false                -> Twilio sends for real. Needs TWILIO_ACCOUNT_SID
//                                   + TWILIO_AUTH_TOKEN, and a real phone number on the card.
const DRY_RUN = true;

const MODE = DRY_RUN !== true ? 'live' : 'preview';

// -------------------------------------------------------- What counts as routable
// A card must carry at least one of these custom-field names for a phone number. Trello
// custom fields arrive on action.data.card.customFieldItems; this is the list of field
// ids (long hex strings) to look for. Leave empty to scan the card description text.
const PHONE_FIELD_IDS = [];

// A prefix that marks a card as a lead. Leave empty to match all cards on the watched
// list. (This is the rule-table concept from ghl-lead-intake-router — one setting, no code.)
const LEAD_LABEL_PREFIX = 'lead';

const SETTINGS = {
  trello_key:           TRELLO_KEY.trim(),
  trello_token:         TRELLO_TOKEN.trim(),
  trello_board_id:      TRELLO_BOARD_ID.trim(),
  trello_list_id:       TRELLO_LIST_ID.trim(),

  twilio_account_sid:   TWILIO_ACCOUNT_SID.trim(),
  twilio_auth_token:    TWILIO_AUTH_TOKEN.trim(),
  twilio_from_number:   TWILIO_FROM_NUMBER.trim(),
  trench_phone:         TRENCH_PHONE.trim(),

  sms_template:         SMS_TEMPLATE,

  phone_field_ids:   PHONE_FIELD_IDS,
  lead_label_prefix: LEAD_LABEL_PREFIX.trim(),

  mode:        MODE,
  dry_run:     MODE !== 'live',
  twilio_enabled: MODE === 'live'
    && TWILIO_ACCOUNT_SID.trim() !== ''
    && TWILIO_AUTH_TOKEN.trim() !== ''
};

// config passes the incoming payload through untouched under `lead`, so whichever trigger
// fired the next node reads the payload from the same place. It runs once per incoming item.
const incoming = $input.all().length ? $input.all().map((i) => i.json || {}) : [{}];
return incoming.map((card) => ({ json: Object.assign({}, SETTINGS, { lead: card }) }));
