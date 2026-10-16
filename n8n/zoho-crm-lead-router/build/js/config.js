// ZOHO CRM — LEAD ROUTING AND STAGE SWEEP — CONFIG
// Everything you might want to change lives in this one node. Nothing else in either
// workflow needs editing.
//
// The same config node ships in BOTH workflows ("01 lead routing" and "02 stage sweep").
// build.py regenerates both from this one file and validate.py fails if they drift apart,
// so you never paste it between them by hand.
//
// A blank id or key means that step is SKIPPED, never that the run fails. That is what lets
// this be demonstrated on a screen-share before a single Zoho credential exists.

// ---------------------------------------------------------------- Safety
// DRY_RUN ships true. Nothing is created in Zoho until you change it, deliberately.
const DRY_RUN = true;

// ---------------------------------------------------------------- Which Zoho you are on
// Zoho is regional and the data centre is part of the URL. Getting this wrong is the most
// common reason a working integration returns INVALID_TOKEN against a perfectly valid token.
//   US   https://www.zohoapis.com       accounts: https://accounts.zoho.com
//   EU   https://www.zohoapis.eu        accounts: https://accounts.zoho.eu
//   IN   https://www.zohoapis.in        accounts: https://accounts.zoho.in
//   AU   https://www.zohoapis.com.au    accounts: https://accounts.zoho.com.au
//   JP   https://www.zohoapis.jp        accounts: https://accounts.zoho.jp
//   CA   https://www.zohoapis.ca        accounts: https://accounts.zohocloud.ca
const ZOHO_API_BASE      = 'https://www.zohoapis.com';
const ZOHO_ACCOUNTS_BASE = 'https://accounts.zoho.com';
const ZOHO_API_VERSION   = 'v8';

// ---------------------------------------------------------------- Getting in
// A Zoho access token lives for ONE HOUR. Do not paste one here: it will work in the demo
// and stop working before the first real day is out. Register a Self Client or a
// Server-based app at api-console.zoho.com, authorise it once with the scopes below, and
// keep the REFRESH token. These workflows exchange it for a fresh access token at the top of
// every run, which is the difference between an integration that survives and one that has
// to be re-authorised by hand every morning.
//
// Scopes: ZohoCRM.modules.leads.CREATE, ZohoCRM.modules.deals.READ,
//         ZohoCRM.modules.tasks.CREATE, ZohoCRM.coql.READ
//
// All three blank -> both workflows build the exact request and stop in front of it, so you
// can read what they would have sent. They ship blank: this file goes out as a work sample.
const ZOHO_CLIENT_ID     = '';
const ZOHO_CLIENT_SECRET = '';
const ZOHO_REFRESH_TOKEN = '';

// ---------------------------------------------------------------- Do Zoho's own rules fire?
// Zoho runs workflow rules, approvals and blueprint transitions on a record created over the
// API only when you ask it to. An empty list means none of them fire; ['workflow'] means
// workflow rules do.
//
// Leave this EMPTY while Deluge is still doing the routing, or a lead written here is routed
// twice — once by this workflow and once by the rule that used to do it. Turn it on
// deliberately, one rule at a time, as the old ones are retired.
const ZOHO_TRIGGERS = [];

// ---------------------------------------------------------------- The layout
// Leads and Deals both carry an Owner. A blank owner id means the record is created
// unassigned rather than the run failing.
const LEAD_LAYOUT_ID = '';
const OWNERS = [
  { owner: 'Ada',  user_id: '' },
  { owner: 'Ben',  user_id: '' },
  { owner: 'Cara', user_id: '' }
];

// Zoho field API name -> where to read it off the lead. A blank api_name is skipped rather
// than written as an empty field, so a half-mapped org still writes a clean record.
const CUSTOM_FIELDS = [
  { api_name: 'Lead_Source_Detail', from: 'source'  },
  { api_name: 'Enquiry_Type',       from: 'wants'   },
  { api_name: 'Summary',            from: 'summary' }
];

// ---------------------------------------------------------------- Who gets what
// The rule table. First match wins. A rule may match on the intake source, on what the
// person wants, on both — and the last rule matches nothing on purpose, so a lead that fits
// no rule still lands somewhere rather than nowhere.
//
// THIS TABLE IS THE POINT. When routing changes — a new segment, someone leaves, a status
// gets renamed — it is one row here, not a Deluge function somebody has to open.
const ROUTING_RULES = [
  { match: { wants: 'support' },  owner: 'Cara', status: 'Support',         tags: ['support'] },
  { match: { wants: 'quote' },    owner: 'Ben',  status: 'Quote Requested', tags: ['quote'] },
  { match: { wants: 'demo' },     owner: 'Ben',  status: 'Attempted',       tags: ['demo'] },
  { match: { source: 'phone' },   owner: 'Ben',  status: 'Attempted',       tags: ['phone'] },
  { match: { source: 'email' },   owner: 'Ada',  status: 'Attempted',       tags: ['email'] },
  { match: { source: 'website' }, owner: 'Ada',  status: 'Attempted',       tags: ['website'] },
  { match: {},                    owner: 'Ada',  status: 'Attempted',       tags: ['unrouted'] }
];

// On every lead this workflow writes. The routing rule adds its own.
const BASE_TAGS = ['automation-intake'];

// ---------------------------------------------------------------- The stage sweep
// The rule workflow 02 enforces:
//
//   NO OPEN DEAL SHOULD SIT IN A STAGE WITHOUT THE NEXT ACTION THAT STAGE CALLS FOR.
//
// Zoho's own workflow rules fire on a stage CHANGE. A deal that never moved never fired
// anything, and that is exactly the deal that goes quiet. This runs on a schedule and asks
// every open deal, so the ones nothing fired for are the ones it catches.
const OPEN_STAGES = ['Qualification', 'Needs Analysis', 'Proposal', 'Negotiation'];

// Per stage: the task to create when an open deal has no next action, how soon it is due,
// and how long a deal may sit in that stage before it is called stalled.
const STAGE_ACTIONS = [
  { stage: 'Qualification',  task: 'Qualify: confirm budget, authority and timeline', due_in_days: 2, stale_after_days: 7 },
  { stage: 'Needs Analysis', task: 'Book the scoping call',                           due_in_days: 3, stale_after_days: 10 },
  { stage: 'Proposal',       task: 'Chase the proposal',                              due_in_days: 3, stale_after_days: 14 },
  { stage: 'Negotiation',    task: 'Agree the next step in writing',                  due_in_days: 2, stale_after_days: 10 }
];

// A deal whose next action is ALREADY OVERDUE does not get a second task piled on top of it.
// It is escalated to the digest instead. Stacking tasks is how a pipeline stops being
// trusted, and once nobody trusts it, "nothing falls through the cracks" is over.
const ESCALATE_OVERDUE = true;

// How many deals to read in one run. Anything past this is reported, never silently dropped.
const DEAL_PAGE_LIMIT = 200;

// ---------------------------------------------------------------- Notifications
// Optional. Blank -> nothing is posted and the run still completes. Any endpoint that
// accepts a JSON POST: Slack, Teams, Zoho Cliq, a webhook of your own.
const NOTIFY_WEBHOOK_URL  = '';
const NOTIFY_ON_NEW_LEAD  = true;
const NOTIFY_ON_DIGEST    = true;

// ---------------------------------------------------------------- derived — do not edit
const ZOHO_AUTH_READY = ZOHO_CLIENT_ID.trim() !== '' &&
                        ZOHO_CLIENT_SECRET.trim() !== '' &&
                        ZOHO_REFRESH_TOKEN.trim() !== '';

const SETTINGS = {
    dry_run: DRY_RUN === true,
    zoho_api_base: ZOHO_API_BASE.replace(/\/+$/, ''),
    zoho_accounts_base: ZOHO_ACCOUNTS_BASE.replace(/\/+$/, ''),
    zoho_api_version: ZOHO_API_VERSION,
    zoho_client_id: ZOHO_CLIENT_ID,
    zoho_client_secret: ZOHO_CLIENT_SECRET,
    zoho_refresh_token: ZOHO_REFRESH_TOKEN,
    zoho_triggers: ZOHO_TRIGGERS,
    lead_layout_id: LEAD_LAYOUT_ID,
    owners: OWNERS,
    custom_fields: CUSTOM_FIELDS,
    routing_rules: ROUTING_RULES,
    base_tags: BASE_TAGS,
    open_stages: OPEN_STAGES,
    stage_actions: STAGE_ACTIONS,
    escalate_overdue: ESCALATE_OVERDUE === true,
    deal_page_limit: DEAL_PAGE_LIMIT,
    notify_webhook_url: NOTIFY_WEBHOOK_URL,
    notify_on_new_lead: NOTIFY_ON_NEW_LEAD === true,
    notify_on_digest: NOTIFY_ON_DIGEST === true,
    // derived flags — never test a key's emptiness downstream, test the flag
    zoho_auth_ready: ZOHO_AUTH_READY,
    zoho_enabled: ZOHO_AUTH_READY && DRY_RUN !== true,
    notify_enabled: NOTIFY_WEBHOOK_URL.trim() !== '' && DRY_RUN !== true
};

// config sits IN the data path, so it must not swallow the items passing through it. It runs
// once per incoming item and passes that item's payload along untouched under `lead`, so
// three demo leads in is three leads out — not one settings object.
//
// A trigger that carries no payload (the schedule, the manual run in workflow 02) still
// produces one item, so `$('config').first().json` always resolves.
const incoming = $input.all().length ? $input.all().map((i) => i.json || {}) : [{}];
return incoming.map((lead) => ({ json: Object.assign({}, SETTINGS, { lead: lead }) }));
