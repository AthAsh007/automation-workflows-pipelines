// The contents of the `config` node in workflow-v2.json, kept here so the
// settings are reviewable without opening n8n.
//
// This template has NO environment variables and NO `.env` file. Everything it
// needs lives in one Code node at the head of the workflow, which means:
//
//   - it runs unchanged on n8n Cloud, where `$env` is blocked outright
//   - it runs on self-hosted n8n without N8N_BLOCK_ENV_ACCESS_IN_NODE=false
//   - changing a threshold is a save, not a host restart
//   - the exported JSON is still credential-free, because the values below ship
//     blank and the client pastes their own in
//
// (workflow.json — the v1 file in this folder — is the older `$env` version and
// is kept only for a client whose admin insists on host environment variables.)

const APOLLO_API_KEY = '';
const ROCKETREACH_API_KEY = '';
const VERIFIER_API_KEY = '';

// neverbounce | zerobounce | millionverifier
const VERIFIER = 'neverbounce';

const PATTERN_GUESS_ENABLED = true;

const MIN_CONFIDENCE_TO_SEND = 70;
const MIN_CONFIDENCE_TO_REVIEW = 40;

// ---------------------------------------------------------------------------
// What a blank key does
// ---------------------------------------------------------------------------
//
// | Blank                | Effect                                              |
// |----------------------|-----------------------------------------------------|
// | APOLLO_API_KEY       | waterfall starts at RocketReach                     |
// | ROCKETREACH_API_KEY  | waterfall starts at the pattern guess                |
// | VERIFIER_API_KEY     | nothing is verified: provider hits return            |
// |                      | email_status "unknown", pattern guesses are DROPPED  |
//
// All three blank is a valid dry run — import, hit Execute, and watch the
// response come back as an honest blank without spending a credit anywhere.
//
// The skip is reported in the response as `providers_skipped`, so a client
// reading the output can always tell "we looked and found nothing" apart from
// "we never looked".
