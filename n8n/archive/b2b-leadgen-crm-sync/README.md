# 02, Clay → GHL CRM Sync

**Post:** *B2B Lead Generation & CRM Automation, Clay, Apollo, n8n, GHL*

## What it does

Keeps the lead sheet (fed by Clay, Apollo and templates 08/14) and GoHighLevel agreeing
with each other, in both directions, every 15 minutes, without burning API quota on rows
that didn't change.

## The two things that make this a real sync

**Changed-rows-only.** `updated_at` vs `synced_at`. On a 4,000-row sheet the naive version
makes 16,000 GHL calls an hour and gets rate-limited into failure; this one usually makes
none. GHL allows ~100 requests per 10 seconds per location, and the HTTP node is batched to
stay under it.

**Write-back.** The bottom chain is the half most builds skip. When a rep marks an
opportunity *won* or *lost* in GHL, that lands back in the sheet as `booked` or
`suppressed`, and template 12 stops emailing them the next morning. Without it the client's
own sales team becomes the reason the campaign looks unprofessional.

## Flow

```text
Every 15 minutes
  └─ [cred] Sheets — read leads
      └─ changed since last sync      updated_at > synced_at, and stage is syncable
          └─ field map (EDIT ME)      ← the only client-specific node
              └─ [cred] GHL — upsert contact   (batched 10/sec)
                  └─ stamp synced rows          failures keep the old stamp and retry
                      └─ [cred] Sheets — write sync stamp
                          └─ alert only on failures → [cred] Notify

Webhook /ghl-change   (ContactUpdate, OpportunityStatusUpdate)
  └─ normalise GHL event    won → booked, lost/abandoned → suppressed
      └─ [cred] Sheets — write back CRM state
```

## Field mapping

Edit `field map (EDIT ME)`. Standard fields are a plain object:

```js
const STANDARD = {
  firstName: 'first_name',
  lastName:  'last_name',
  email:     'email',
  companyName: 'company',
  website:   'domain'
};
```

Custom fields don't go in the code, they go in `GHL_CUSTOM_FIELD_MAP`, a JSON env var:

```json
{"7Xk2mQp": "fit_score", "9Lm4nRt": "visible_pain", "3Bq8wZc": "recent_trigger"}
```

Get the IDs from GHL → Settings → Custom Fields → the field's URL. Keeping them in an env
var means a new client is a config change, not a code edit.

## Setup (about 25 minutes)

1. Import, set env vars from `.env.example`.
2. Add these columns to the `Leads` sheet: `ghl_contact_id`, `synced_at`, `updated_at`,
   `crm_owner`, `crm_stage_id`.
3. GHL → Settings → Webhooks → subscribe `ContactUpdate` and `OpportunityStatusUpdate` to
   the `/ghl-change` production URL.
4. Run once manually with `SYNC_STAGES=enriched` to sync a small slice first.

## Guardrails

- Rows without an email never sync. A contact with no address is noise in a CRM.
- A failed upsert keeps its old `synced_at`, so the next run retries it. No dead-letter
  queue to babysit.
- The workflow alerts **only on failure**. A sync that posts every 15 minutes gets muted by
  the client inside a week, and then real failures are invisible too.

## Scope we sell this as

**S$1,300 fixed**, build, field mapping workshop with their team (60 minutes, and it's
where the real requirements surface), webhooks wired, first full sync run together.
