#!/usr/bin/env bash
# Fires the four inbound events workflow 3 handles, against a local or hosted n8n.
#
#   ./test-webhooks.sh                                  # localhost
#   ./test-webhooks.sh https://n8n.example.com          # hosted
#
# These are UNSIGNED. They work while the config node is in preview (DEMO_MODE or
# TEST_RUN true) because `verify the signature` fails closed only for live runs —
# which is the behaviour worth demonstrating: flip TEST_RUN to false, run these
# again, and every one of them is refused with a 403.
set -u
BASE="${1:-http://localhost:5678}"
URL="$BASE/webhook/meridian-inbound"

post() {
  echo ""
  echo "──────────────────────────────────────────────────────────────"
  echo "$1"
  echo "──────────────────────────────────────────────────────────────"
  shift
  curl -s -o /dev/stdout -w "\n[http %{http_code}]\n" -X POST "$URL" \
    -H 'Content-Type: application/json' \
    -H "$1" \
    -d "$2"
}

# 1 ── a candidate opts out. Must stop every campaign for this number, in one
#      transaction, and must be recognised before any AI or intent logic runs.
post "1. Twilio inbound SMS — 'STOP'" \
  'X-Twilio-Signature: unsigned-demo' \
  '{"MessageSid":"SM00000000000000000000000000000001",
    "From":"+16145550142","To":"+16145550102","Body":"STOP","NumMedia":"0"}'

# 2 ── a positive reply. Stops the sequence (a human wrote back) and goes to
#      qualification, which will NOT pass on a bare "YES" — interest is one
#      answered question, not a qualification.
post "2. Twilio inbound SMS — 'YES interested'" \
  'X-Twilio-Signature: unsigned-demo' \
  '{"MessageSid":"SM00000000000000000000000000000002",
    "From":"+16145550177","To":"+16145550102","Body":"YES interested","NumMedia":"0"}'

# 3 ── a delivery receipt. Bookkeeping, not a reply. Ends at STOP: event ignored
#      with a 200 — refusing it would make Twilio retry for hours.
post "3. Twilio status callback — 'undelivered' (error 30003)" \
  'X-Twilio-Signature: unsigned-demo' \
  '{"MessageSid":"SM00000000000000000000000000000003",
    "MessageStatus":"undelivered","To":"+16145550121","ErrorCode":"30003"}'

# 4 ── a finished AI screening call. The structured answers are what the decision
#      is computed from; the transcript and summary are stored for a human.
#      `certifications_valid: null` is the interesting one — it is not treated as
#      a yes, it just costs the points.
post "4. Retell call_analyzed — qualified candidate" \
  'X-Retell-Signature: v=unsigned-demo' \
  '{"event":"call_analyzed",
    "call":{"call_id":"call_demo_0001","to_number":"+16145550199",
      "call_status":"ended","disconnection_reason":"user_hangup","duration_ms":96000,
      "metadata":{"enrollment_id":"e0000000-0000-0000-0000-000000000003",
                  "candidate_id":"c0000000-0000-0000-0000-000000000009",
                  "campaign_id":"33333333-3333-3333-3333-333333333333","step":3},
      "transcript":"Agent: Hi Andre, calling about the forklift role in Calder City...",
      "call_analysis":{
        "call_summary":"Candidate is interested, has 4 years forklift experience, can start Monday, has his own transport and accepts $22.50/hr. Did not confirm whether his OSHA card is current.",
        "user_sentiment":"Positive",
        "custom_analysis_data":{
          "interested":true,"authorized_to_work":true,"can_start_within_days":5,
          "years_experience":4,"has_reliable_transport":true,"shift_match":true,
          "rate_acceptable":true,"certifications_valid":null}}}}'

# 5 ── the same call_analyzed, delivered a second time. Retell retries webhooks.
#      The unique key on (client_id, source, provider_event_id) means this writes
#      no second row and books no second interview.
post "5. Retell call_analyzed — SAME event id, redelivered" \
  'X-Retell-Signature: v=unsigned-demo' \
  '{"event":"call_analyzed",
    "call":{"call_id":"call_demo_0001","to_number":"+16145550199",
      "call_status":"ended","disconnection_reason":"user_hangup","duration_ms":96000,
      "call_analysis":{"call_summary":"(redelivery)",
        "custom_analysis_data":{"interested":true,"authorized_to_work":true,
          "can_start_within_days":5,"years_experience":4,"has_reliable_transport":true,
          "shift_match":true,"rate_acceptable":true,"certifications_valid":null}}}}'

# 6 ── nobody picked up. NOT a rejection: the enrollment stays on its rung and
#      the ladder carries on.
post "6. Retell call_analyzed — no answer" \
  'X-Retell-Signature: v=unsigned-demo' \
  '{"event":"call_analyzed",
    "call":{"call_id":"call_demo_0002","to_number":"+16145550142",
      "call_status":"no_answer","disconnection_reason":"dial_no_answer","duration_ms":0,
      "call_analysis":{}}}'

echo ""
echo "Done. Open the n8n execution list — each run should end at a named node that"
echo "says what happened, not at a red error."
