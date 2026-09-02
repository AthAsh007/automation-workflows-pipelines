-- =============================================================================
-- RECRUITING CANDIDATE ENGINE — demo seed
-- Run AFTER schema.sql. Safe to re-run: every insert is idempotent.
--
-- Gives you one client, one open job order, one live campaign and ten candidates
-- whose enrollments are already DUE — so the outreach runner has real work the
-- first time you press "Run it now", without waiting a day for a ladder to mature.
--
-- The ten are the same ten as the hardcoded pool in `STOP: using the sample pool`,
-- so the demo tells the same story with or without a database. Every number is in
-- the 555-01XX reserved range and every address is at example.com; nothing here
-- can reach a real person even if you go live by accident.
--
-- To reset between takes:  select reset_demo();   (defined at the bottom)
-- =============================================================================

-- ---------------------------------------------------------------- the client
insert into clients (id, slug, name, ats_vendor, timezone,
                     quiet_hours_start, quiet_hours_end, daily_send_cap)
values ('11111111-1111-1111-1111-111111111111', 'meridian', 'Meridian Staffing',
        'bullhorn', 'America/New_York', 21, 8, 500)
on conflict (slug) do update
  set name = excluded.name, ats_vendor = excluded.ats_vendor;

-- Put this uuid into CLIENT_ID in the config node:
--   11111111-1111-1111-1111-111111111111

-- ---------------------------------------------------------------- the job order
insert into job_orders (id, client_id, ats_job_id, title, description,
                        required_skills, nice_to_have, city, state, pay_rate, shift,
                        employment_type, recruiter_name, recruiter_email, status)
values ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111',
        'JO-8842', 'Forklift Operator',
        'Distribution centre in Calder City is hiring experienced forklift operators for '
        'first shift, Monday to Friday, 6am to 2:30pm. Sit-down and stand-up reach '
        'trucks. RF scanner experience preferred. OSHA certification a plus. '
        'Must be able to lift 50lbs and pass a background check.',
        array['forklift','pallet jack','shipping','rf scanner'],
        array['osha','inventory'],
        'Calder City', 'MW', 22.50, '1st shift, Mon-Fri', 'Contract',
        'Dana Reyes', 'dana.reyes@example.com', 'open')
on conflict (client_id, ats_job_id) do update
  set title = excluded.title, status = 'open', required_skills = excluded.required_skills;

-- ---------------------------------------------------------------- the campaign
-- The ladder is copied onto the campaign, so editing SEQUENCE in the config node
-- later does not change how this campaign behaves mid-flight.
insert into campaigns (id, client_id, job_order_id, name, sequence, qualification,
                       status, idempotency_key)
values ('33333333-3333-3333-3333-333333333333',
        '11111111-1111-1111-1111-111111111111',
        '22222222-2222-2222-2222-222222222222',
        'Forklift Operator — Calder City — demo',
        '[{"step":1,"channel":"sms","delay_hours":0,
            "template":"Hi {{first_name}}, it is {{recruiter_name}} at {{client_name}}. We have a {{job_title}} role in {{job_city}}{{pay_phrase}}. Interested in hearing more? Reply YES or STOP to opt out."},
          {"step":2,"channel":"sms","delay_hours":20,
            "template":"Hi {{first_name}}, following up on the {{job_title}} position in {{job_city}}. Still open. Reply YES and I will call you, or STOP to opt out."},
          {"step":3,"channel":"voice","delay_hours":26,
            "agent_note":"Second contact. They have had two texts and not replied. Keep it under 90 seconds and offer to text the details instead."},
          {"step":4,"channel":"sms","delay_hours":48,
            "template":"Last note from me on the {{job_title}} role, {{first_name}} — reply YES if you would like the details, otherwise I will close it out. STOP to opt out."}]'::jsonb,
        '{"pass_mark":60,"review_band":15}'::jsonb,
        'active', 'campaign:meridian:JO-8842:demo')
on conflict (client_id, idempotency_key) do update
  set status = 'active', sequence = excluded.sequence;

-- ---------------------------------------------------------------- the people
-- Each row exists to exercise one branch. Do not tidy them up.
insert into candidates (id, client_id, ats_candidate_id, first_name, last_name, email,
                        phone_e164, title, skills, city, state, timezone, ats_status)
values
  -- scores highest: every required skill, right city, active
  ('c0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'C-1001','Marcus','Ellison','marcus.ellison@example.com','+16145550142',
   'Forklift Operator', array['forklift','pallet jack','shipping','rf scanner'],
   'Calder City','MW','America/New_York','Active'),

  ('c0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'C-1002','Danielle','Okafor','d.okafor@example.com','+16145550177',
   'Warehouse Associate', array['forklift certified','shipping','receiving','inventory'],
   'Calder City','MW','America/New_York','Available'),

  -- SAME PHONE as C-1002, under a second ATS record. The queue view must not let
  -- both be worked at once — this is the duplicate-contact defence, visible.
  ('c0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'C-1003','Danielle','Okafor','danielle.okafor@example.com','+16145550177',
   'Warehouse', array[]::text[], 'Calder City','MW','America/New_York','Active'),

  -- opted out three weeks ago (see the opt_outs insert below)
  ('c0000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'C-1004','Priya','Raman','p.raman@example.com','+16145550188',
   'Forklift Driver', array['forklift','rf scanner','cycle counting'],
   'Calder City','MW','America/New_York','Active'),

  -- placed. never contact about a new role.
  ('c0000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   'C-1005','Tomas','Ibarra','t.ibarra@example.com','+16145550155',
   'Forklift Operator', array['forklift','shipping'],
   'Calder City','MW','America/New_York','Placed'),

  -- west coast: at 09:00 Eastern it is 06:00 for them. Deferred, not dropped.
  ('c0000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
   'C-1008','Renata','Voss','r.voss@example.com','+13135550164',
   'Forklift Operator', array['forklift','shipping','osha'],
   'Los Angeles','CA','America/Los_Angeles','Active'),

  -- no phone: stays in the database, never enrolled
  ('c0000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
   'C-1010','Sasha','Nurse','s.nurse@example.com',null,
   'Forklift Operator', array['forklift','inventory'],
   'Calder City','MW','America/New_York','Active'),

  -- nothing in common with the job order
  ('c0000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
   'C-1009','Owen','Castellanos','o.cast@example.com','+16145550133',
   'Graphic Designer', array['illustrator','figma'],
   'Calder City','MW','America/New_York','Active'),

  -- contacted six hours ago about a different job (see contact_attempts below)
  ('c0000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
   'C-1007','Andre','Whitlock','a.whitlock@example.com','+16145550199',
   'Material Handler', array['forklift','pallet jack'],
   'Calder City','MW','America/New_York','Active'),

  ('c0000000-0000-0000-0000-00000000000a', '11111111-1111-1111-1111-111111111111',
   'C-1006','Yvette','Braun','y.braun@example.com','+16145550121',
   'Shipping Clerk', array['shipping','receiving'],
   'Dublin','MW','America/New_York','Active')
on conflict (client_id, ats_candidate_id) do update
  set phone_e164 = excluded.phone_e164, skills = excluded.skills,
      ats_status = excluded.ats_status;

-- ---------------------------------------------------------------- the opt-out
-- Priya. Keyed on the phone, so it would suppress her under any ATS id.
insert into opt_outs (client_id, phone_e164, channel, reason, source, opted_out_at)
values ('11111111-1111-1111-1111-111111111111', '+16145550188', 'all',
        'replied STOP to a previous campaign', 'sms_keyword', now() - interval '21 days')
on conflict (client_id, phone_e164, channel) do nothing;

-- ---------------------------------------------------------------- the enrollments
-- Deliberately spread across the ladder so ONE run of the outreach runner shows a
-- first text, a follow-up, a voice escalation, a quiet-hours deferral and a ladder
-- that has run out — all at once.
insert into enrollments (id, client_id, campaign_id, candidate_id, job_order_id,
                         status, match_score, match_reasons, step, attempts_made,
                         next_attempt_at, last_attempt_at)
values
  -- step 0 -> sends touch 1 (SMS)
  ('e0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333','c0000000-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222','pending',116,
   '["4 of 4 required skills","title matches on forklift, operator","same city"]'::jsonb,
   0,0, now() - interval '1 hour', null),

  -- step 1 -> sends the follow-up
  ('e0000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333','c0000000-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222','active',66,
   '["2 of 4 required skills","same city"]'::jsonb,
   1,1, now() - interval '2 hours', now() - interval '22 hours'),

  -- step 2 -> escalates to a Retell voice call
  ('e0000000-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333','c0000000-0000-0000-0000-000000000009',
   '22222222-2222-2222-2222-222222222222','active',72,
   '["2 of 4 required skills","same city"]'::jsonb,
   2,2, now() - interval '3 hours', now() - interval '26 hours'),

  -- west coast -> deferred by quiet hours, and rescheduled rather than dropped
  ('e0000000-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333','c0000000-0000-0000-0000-000000000006',
   '22222222-2222-2222-2222-222222222222','pending',68,
   '["3 of 4 required skills","out of state (CA)"]'::jsonb,
   0,0, now() - interval '1 hour', null),

  -- whole ladder sent, never replied -> becomes `exhausted`, which is an outcome
  ('e0000000-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333','c0000000-0000-0000-0000-00000000000a',
   '22222222-2222-2222-2222-222222222222','active',42,
   '["1 of 4 required skills","same state"]'::jsonb,
   4,4, now() - interval '24 hours', now() - interval '48 hours'),

  -- DUPLICATE HUMAN: same phone as enrollment 2. The queue view must exclude this
  -- one while the other is active. Comment out enrollment 2 to watch it appear.
  ('e0000000-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333','c0000000-0000-0000-0000-000000000003',
   '22222222-2222-2222-2222-222222222222','pending',44,
   '["title matches on warehouse"]'::jsonb,
   0,0, now() - interval '1 hour', null),

  -- opted out. In the queue view this row is invisible no matter what it says here.
  ('e0000000-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111',
   '33333333-3333-3333-3333-333333333333','c0000000-0000-0000-0000-000000000004',
   '22222222-2222-2222-2222-222222222222','pending',80,
   '["3 of 4 required skills","same city"]'::jsonb,
   0,0, now() - interval '1 hour', null)
on conflict (campaign_id, candidate_id) do update
  set status = excluded.status, step = excluded.step,
      attempts_made = excluded.attempts_made,
      next_attempt_at = excluded.next_attempt_at,
      lease_token = null, lease_expires_at = null;

-- ---------------------------------------------------------------- history
-- Andre was texted six hours ago about a different job order. This is what the
-- cooldown in the launch gate is measured against.
insert into contact_attempts (client_id, enrollment_id, candidate_id, channel, step,
                              provider, provider_sid, status, body, sent_at,
                              idempotency_key)
values ('11111111-1111-1111-1111-111111111111',
        'e0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000009',
        'sms', 2, 'twilio', 'SM_demo_seed_0001', 'delivered',
        'Hi Andre, following up on the Warehouse Lead position in Calder City.',
        now() - interval '6 hours', 'att_seed_andre_prior')
on conflict (client_id, idempotency_key) do nothing;

-- =============================================================================
-- Reset between takes. Puts every enrollment back to due and clears what a run
-- wrote, without touching the schema or the candidates.
-- =============================================================================
create or replace function reset_demo() returns text
language plpgsql as $fn$
declare v_client uuid := '11111111-1111-1111-1111-111111111111';
begin
  delete from contact_attempts
   where client_id = v_client and idempotency_key <> 'att_seed_andre_prior';
  delete from inbound_events   where client_id = v_client;
  delete from ats_writebacks   where client_id = v_client;
  delete from appointments     where client_id = v_client;
  delete from workflow_log     where client_id = v_client;

  -- The opt-out survives on purpose: re-adding someone who opted out is exactly
  -- the mistake this engine exists to prevent, so the demo keeps proving it.
  delete from opt_outs
   where client_id = v_client and phone_e164 <> '+16145550188';

  update enrollments set
    status = case id
      when 'e0000000-0000-0000-0000-000000000001' then 'pending'
      when 'e0000000-0000-0000-0000-000000000002' then 'active'
      when 'e0000000-0000-0000-0000-000000000003' then 'active'
      when 'e0000000-0000-0000-0000-000000000004' then 'pending'
      when 'e0000000-0000-0000-0000-000000000005' then 'active'
      else 'pending' end,
    step = case id
      when 'e0000000-0000-0000-0000-000000000002' then 1
      when 'e0000000-0000-0000-0000-000000000003' then 2
      when 'e0000000-0000-0000-0000-000000000005' then 4
      else 0 end,
    attempts_made = case id
      when 'e0000000-0000-0000-0000-000000000002' then 1
      when 'e0000000-0000-0000-0000-000000000003' then 2
      when 'e0000000-0000-0000-0000-000000000005' then 4
      else 0 end,
    next_attempt_at = now() - interval '1 hour',
    qualification = '{}'::jsonb,
    appointment_id = null,
    lease_token = null,
    lease_expires_at = null
  where client_id = v_client;

  return 'demo reset: 7 enrollments due, 1 opt-out kept, history cleared';
end $fn$;
