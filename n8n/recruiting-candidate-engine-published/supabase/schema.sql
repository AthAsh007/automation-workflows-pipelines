-- =============================================================================
-- RECRUITING CANDIDATE ENGINE — operating database
-- Postgres 15+ / Supabase. Run this whole file once in the SQL editor.
--
-- Design rules this file follows, all of which exist to answer one question in
-- the brief — "how would you prevent duplicate contact":
--
--   1. Every table carries client_id. There is no row that belongs to nobody.
--      RLS is on for all of them, so a leaked anon key reads nothing.
--   2. Duplicate prevention is a UNIQUE INDEX, not an IF node. n8n can be
--      restarted, re-run, or run twice concurrently; the constraint cannot.
--   3. State lives here. n8n holds no memory between executions at all.
--   4. Nothing is deleted. Opt-outs, failures and cancellations are states.
-- =============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------- 1. tenancy
-- One row per staffing client. Everything below hangs off this.
create table if not exists clients (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,          -- 'meridian', 'acme-staffing'
  name              text not null,
  ats_vendor        text,                          -- bullhorn | avionte | ceipal | jobdiva | recruitcrm | salesforce
  timezone          text not null default 'America/New_York',
  quiet_hours_start smallint not null default 21,  -- local hour; no outbound at or after
  quiet_hours_end   smallint not null default 8,   -- local hour; no outbound before
  daily_send_cap    integer  not null default 500,
  settings          jsonb not null default '{}'::jsonb,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------- 2. people
create table if not exists candidates (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  ats_candidate_id  text not null,                 -- the id in THEIR system. the join key.
  first_name        text,
  last_name         text,
  email             text,
  phone_e164        text,                          -- normalised on the way in, always +1...
  title             text,
  skills            text[] not null default '{}',
  city              text,
  state             text,
  timezone          text,
  ats_status        text,
  last_ats_sync_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- One candidate row per ATS id per client. Re-importing the same 20,000 rows
  -- every night updates them; it does not duplicate them.
  unique (client_id, ats_candidate_id)
);

-- A phone number can legitimately appear on two ATS records (someone who applied
-- twice under two email addresses). This index is what lets the engine treat
-- those as one human when it decides who to contact.
create index if not exists candidates_phone_idx on candidates (client_id, phone_e164)
  where phone_e164 is not null;
create index if not exists candidates_skills_idx on candidates using gin (skills);

-- ---------------------------------------------------------------- 3. the work
create table if not exists job_orders (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  ats_job_id        text not null,
  title             text not null,
  description       text,
  required_skills   text[] not null default '{}',
  nice_to_have      text[] not null default '{}',
  city              text,
  state             text,
  pay_rate          numeric(10,2),
  shift             text,
  employment_type   text,
  recruiter_name    text,
  recruiter_email   text,
  recruiter_calendar_id text,
  status            text not null default 'open',
  opened_at         timestamptz not null default now(),
  raw               jsonb not null default '{}'::jsonb,   -- the untouched ATS payload
  unique (client_id, ats_job_id)
);

-- ---------------------------------------------------------------- 4. campaigns
-- One campaign per job order per outreach push. A second push for the same job
-- (the first 200 candidates did not fill it) is a second campaign, which keeps
-- "who was contacted about what, and when" answerable a year later.
create table if not exists campaigns (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  job_order_id      uuid not null references job_orders(id) on delete cascade,
  name              text not null,
  sequence          jsonb not null,                 -- the touch ladder, copied at launch time
  qualification     jsonb not null default '{}'::jsonb,
  status            text not null default 'active', -- active | paused | complete | cancelled
  launched_at       timestamptz not null default now(),
  -- The run that creates a campaign stamps its own key, so an ATS webhook
  -- delivered twice creates one campaign rather than two.
  idempotency_key   text not null,
  unique (client_id, idempotency_key)
);

-- ---------------------------------------------------------------- 5. enrollment
-- THE state machine. One row = one candidate's journey through one campaign.
create table if not exists enrollments (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  campaign_id       uuid not null references campaigns(id) on delete cascade,
  candidate_id      uuid not null references candidates(id) on delete cascade,
  job_order_id      uuid not null references job_orders(id) on delete cascade,

  status            text not null default 'pending',
  -- pending -> active -> responded -> qualified | not_qualified -> booked
  --                   \-> exhausted   (ladder finished, silence)
  --                    \-> opted_out | undeliverable | cancelled   (terminal, immediate)

  match_score       smallint not null default 0,
  match_reasons     jsonb not null default '[]'::jsonb,

  step              smallint not null default 0,    -- how far up the ladder
  attempts_made     smallint not null default 0,
  next_attempt_at   timestamptz,                    -- null = nothing scheduled. this IS the queue.
  last_attempt_at   timestamptz,
  last_inbound_at   timestamptz,

  -- Optimistic lease. A runner claims a row by writing its own token and an
  -- expiry; a second runner starting mid-flight sees the lease and skips the row.
  -- This is what makes an overlapping 15-minute schedule safe.
  lease_token       uuid,
  lease_expires_at  timestamptz,

  qualification     jsonb not null default '{}'::jsonb,
  appointment_id    uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- A candidate is enrolled in a given campaign exactly once. The first of the
  -- three duplicate defences.
  unique (campaign_id, candidate_id)
);

create index if not exists enrollments_due_idx
  on enrollments (client_id, next_attempt_at)
  where status in ('pending','active') and next_attempt_at is not null;
create index if not exists enrollments_candidate_idx on enrollments (client_id, candidate_id);

-- ---------------------------------------------------------------- 6. attempts
-- Append-only. Every outbound touch, successful or not, lands here.
create table if not exists contact_attempts (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  enrollment_id     uuid not null references enrollments(id) on delete cascade,
  candidate_id      uuid not null references candidates(id) on delete cascade,
  channel           text not null,                 -- sms | voice | email
  step              smallint not null,
  direction         text not null default 'outbound',
  provider          text,                          -- twilio | retell
  provider_sid      text,                          -- Twilio SID / Retell call_id
  status            text not null,                 -- queued|sent|delivered|failed|no_answer|completed
  error_code        text,
  error_message     text,
  body              text,
  retry_count       smallint not null default 0,
  sent_at           timestamptz not null default now(),

  -- The duplicate defence that matters most. The runner computes
  --   sha256(enrollment_id | channel | step | attempt_window)
  -- BEFORE it calls Twilio. If this insert conflicts, another execution already
  -- sent that exact touch and this one stops without sending anything.
  idempotency_key   text not null,
  unique (client_id, idempotency_key)
);

create index if not exists attempts_enrollment_idx on contact_attempts (enrollment_id, sent_at desc);
create index if not exists attempts_sid_idx on contact_attempts (provider_sid) where provider_sid is not null;

-- ---------------------------------------------------------------- 7. inbound
create table if not exists inbound_events (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  candidate_id      uuid references candidates(id) on delete set null,
  enrollment_id     uuid references enrollments(id) on delete set null,
  source            text not null,                 -- twilio_sms | twilio_status | retell_call
  event_type        text,
  from_number       text,
  body              text,
  intent            text,                          -- opt_out | interested | not_interested | question | unclear
  payload           jsonb not null default '{}'::jsonb,
  received_at       timestamptz not null default now(),
  -- Twilio and Retell both retry webhooks. The same provider event id is one row.
  provider_event_id text,
  unique (client_id, source, provider_event_id)
);

-- ---------------------------------------------------------------- 8. opt-outs
-- Deliberately keyed on the PHONE, not the candidate. One human with three ATS
-- records opts out once, and nothing in the engine may contact that number again.
create table if not exists opt_outs (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  phone_e164        text not null,
  channel           text not null default 'all',
  reason            text,
  source            text,                          -- sms_keyword | voice | manual | ats_flag
  opted_out_at      timestamptz not null default now(),
  unique (client_id, phone_e164, channel)
);

-- ---------------------------------------------------------------- 9. outcomes
create table if not exists appointments (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  enrollment_id     uuid not null references enrollments(id) on delete cascade,
  candidate_id      uuid not null references candidates(id) on delete cascade,
  recruiter_email   text,
  calendar_provider text,                          -- google | microsoft
  calendar_event_id text,
  starts_at         timestamptz not null,
  ends_at           timestamptz not null,
  status            text not null default 'booked',
  created_at        timestamptz not null default now(),
  unique (enrollment_id, starts_at)
);

-- Every write back into the client's ATS is queued rather than fired, so a
-- Bullhorn outage delays a note instead of losing it.
create table if not exists ats_writebacks (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid not null references clients(id) on delete cascade,
  enrollment_id     uuid references enrollments(id) on delete set null,
  ats_candidate_id  text not null,
  action            text not null,                 -- add_note | update_status | set_field
  payload           jsonb not null,
  status            text not null default 'pending', -- pending | sent | failed | dead
  attempts          smallint not null default 0,
  last_error        text,
  next_retry_at     timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  idempotency_key   text not null,
  unique (client_id, idempotency_key)
);

create table if not exists workflow_log (
  id                bigserial primary key,
  client_id         uuid references clients(id) on delete cascade,
  workflow          text not null,
  execution_id      text,
  level             text not null default 'info',  -- info | warn | error
  event             text not null,
  detail            jsonb not null default '{}'::jsonb,
  logged_at         timestamptz not null default now()
);
create index if not exists workflow_log_recent on workflow_log (client_id, logged_at desc);

-- =============================================================================
-- THE QUEUE
-- The outreach runner selects from this view and from nothing else. Every rule
-- that can be expressed as a set operation lives HERE rather than in an n8n IF
-- node, because a rule in Postgres cannot be skipped by a branch that did not run.
--
--   - a terminal enrollment never appears
--   - a leased row never appears twice
--   - an opted-out phone never appears, whatever the enrollment says
--   - a candidate already being worked by another live campaign never appears
-- =============================================================================
create or replace view v_due_attempts as
select
  e.id                as enrollment_id,
  e.client_id,
  e.campaign_id,
  e.candidate_id,
  e.job_order_id,
  e.status,
  e.step,
  e.attempts_made,
  e.next_attempt_at,
  e.match_score,
  c.first_name, c.last_name, c.phone_e164, c.email,
  coalesce(c.timezone, cl.timezone) as candidate_timezone,
  cl.slug             as client_slug,
  cl.quiet_hours_start, cl.quiet_hours_end, cl.daily_send_cap,
  j.title             as job_title,
  j.city              as job_city,
  j.state             as job_state,
  j.pay_rate, j.shift,
  j.recruiter_name, j.recruiter_email,
  cp.sequence,
  cp.qualification
from enrollments e
join clients    cl on cl.id = e.client_id and cl.active
join candidates c  on c.id  = e.candidate_id
join campaigns  cp on cp.id = e.campaign_id and cp.status = 'active'
join job_orders j  on j.id  = e.job_order_id and j.status = 'open'
where e.status in ('pending','active')
  and e.next_attempt_at is not null
  and e.next_attempt_at <= now()
  and c.phone_e164 is not null
  and (e.lease_expires_at is null or e.lease_expires_at < now())
  and not exists (
    select 1 from opt_outs o
     where o.client_id = e.client_id
       and o.phone_e164 = c.phone_e164
       and o.channel in ('all','sms','voice')
  )
  -- Duplicate defence #2: the same human is not worked by two campaigns at once,
  -- however many ATS records they happen to have.
  and not exists (
    select 1
      from enrollments e2
      join candidates c2 on c2.id = e2.candidate_id
     where e2.client_id = e.client_id
       and e2.id <> e.id
       and c2.phone_e164 = c.phone_e164
       and e2.status in ('active','responded','qualified','booked')
       and e2.last_attempt_at > now() - interval '24 hours'
  )
order by e.match_score desc, e.next_attempt_at asc;

-- Claim rows atomically. SKIP LOCKED means ten concurrent runners take ten
-- disjoint batches instead of fighting over one.
create or replace function claim_due_attempts(
  p_client_id uuid, p_limit integer, p_lease_seconds integer default 300
) returns setof v_due_attempts
language plpgsql as $fn$
declare v_token uuid := gen_random_uuid();
begin
  update enrollments e
     set lease_token = v_token,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   where e.id in (
     select d.enrollment_id from v_due_attempts d
      where d.client_id = p_client_id
      limit p_limit
      for update skip locked
   );
  return query select * from v_due_attempts v
    where v.enrollment_id in (select id from enrollments where lease_token = v_token);
end $fn$;

-- Everything the launch gate needs, in ONE round trip.
--
-- Three separate REST calls would be three chances for a partial failure to leave the
-- gate holding a half-populated suppression list, and a half-populated suppression
-- list is worse than none: it looks like it worked. Either all four answers come back
-- together or the workflow treats the history as unavailable and stays in preview.
create or replace function engagement_history(
  p_client_id uuid, p_phones text[], p_ats_job_id text default null
) returns json
language sql stable as $fn$
  select json_build_object(
    'opt_outs', coalesce((
      select json_agg(json_build_object('phone_e164', o.phone_e164))
        from opt_outs o
       where o.client_id = p_client_id
         and o.phone_e164 = any(p_phones)
    ), '[]'::json),

    -- The most recent outbound touch per number, from ANY campaign. This is what the
    -- cooldown is measured against, so a candidate worked by yesterday's job order is
    -- not texted again this morning about a different one.
    'recent_touches', coalesce((
      select json_agg(t)
        from (
          select c.phone_e164, max(a.sent_at) as last_attempt_at
            from contact_attempts a
            join candidates c on c.id = a.candidate_id
           where a.client_id = p_client_id
             and c.phone_e164 = any(p_phones)
             and a.direction = 'outbound'
             and a.sent_at > now() - interval '30 days'
           group by c.phone_e164
        ) t
    ), '[]'::json),

    -- Numbers currently live in some other campaign. Enrolling them again is how one
    -- human ends up in two ladders and gets four texts in a day from the same agency.
    'active_phones', coalesce((
      select json_agg(distinct c.phone_e164)
        from enrollments e
        join candidates c on c.id = e.candidate_id
       where e.client_id = p_client_id
         and c.phone_e164 = any(p_phones)
         and e.status in ('pending','active','responded','qualified')
    ), '[]'::json),

    -- Already enrolled for THIS job order. Covers the ATS that delivers the same
    -- job-order webhook twice, and the operator who presses Run it now again.
    'enrolled_ats_ids', coalesce((
      select json_agg(distinct c.ats_candidate_id)
        from enrollments e
        join candidates c on c.id = e.candidate_id
        join job_orders j on j.id = e.job_order_id
       where e.client_id = p_client_id
         and p_ats_job_id is not null
         and j.ats_job_id = p_ats_job_id
    ), '[]'::json)
  );
$fn$;

-- The one call the inbound workflow makes when somebody texts STOP. Everything
-- that needs to be true is true after this returns, in a single transaction.
create or replace function stop_all_outreach(
  p_client_id uuid, p_phone text, p_reason text default 'sms_keyword'
) returns integer
language plpgsql as $fn$
declare v_stopped integer;
begin
  insert into opt_outs (client_id, phone_e164, channel, reason, source)
  values (p_client_id, p_phone, 'all', p_reason, p_reason)
  on conflict (client_id, phone_e164, channel) do nothing;

  update enrollments e
     set status = 'opted_out',
         next_attempt_at = null,      -- leaves the queue immediately
         lease_token = null,
         lease_expires_at = null,
         updated_at = now()
    from candidates c
   where c.id = e.candidate_id
     and e.client_id = p_client_id
     and c.phone_e164 = p_phone
     and e.status not in ('opted_out','booked','cancelled');
  get diagnostics v_stopped = row_count;
  return v_stopped;
end $fn$;

-- =============================================================================
-- ROW LEVEL SECURITY — the multi-client guarantee
-- Every table is deny-by-default. n8n connects with the service role for writes
-- and a per-client JWT for anything user-facing.
-- =============================================================================
do $rls$
declare t text;
begin
  foreach t in array array['clients','candidates','job_orders','campaigns','enrollments',
                           'contact_attempts','inbound_events','opt_outs','appointments',
                           'ats_writebacks','workflow_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    if t = 'clients' then
      execute format('create policy tenant_isolation on %I using '
        '(id = (auth.jwt() ->> ''client_id'')::uuid)', t);
    else
      execute format('create policy tenant_isolation on %I using '
        '(client_id = (auth.jwt() ->> ''client_id'')::uuid)', t);
    end if;
  end loop;
end $rls$;

-- Keep updated_at honest without anyone having to remember to set it.
create or replace function touch_updated_at() returns trigger
language plpgsql as $fn$ begin new.updated_at = now(); return new; end $fn$;

drop trigger if exists candidates_touch on candidates;
create trigger candidates_touch before update on candidates
  for each row execute function touch_updated_at();
drop trigger if exists enrollments_touch on enrollments;
create trigger enrollments_touch before update on enrollments
  for each row execute function touch_updated_at();
