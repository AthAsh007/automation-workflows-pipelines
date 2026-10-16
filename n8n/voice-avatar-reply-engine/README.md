# voice-avatar-reply-engine

A digital-clone reply pipeline: inbound enquiry in, a written / spoken / avatar-video answer out.

Two workflows, built to the milestones in the brief.

| file | what it is | the brief's milestone |
|---|---|---|
| [`01-intake-and-triage.json`](01-intake-and-triage.json) | email intake, AI triage, scheduling, decides the medium | milestone 2 |
| [`02-voice-and-avatar-render.json`](02-voice-and-avatar-render.json) | ElevenLabs speech → HeyGen avatar → deliver | milestone 1 |
| both, wired together | 01's `RENDER_WEBHOOK_URL` points at 02's webhook | milestone 3 |

## Run it before you configure anything

Press **Run it now** on either workflow. Both ship with `DRY_RUN = true`, a built-in sample
payload and every API key blank, so they run end to end and touch nothing:

- **01** classifies the sample enquiry on keyword rules, picks a medium, writes the reply, and
  stops at `STOP: preview - nothing queued` carrying the whole decision.
- **02** stops at `STOP: ElevenLabs not configured` — which is the point. Nothing is synthesised
  and nothing is charged until you put a key in `config`.

No credentials, no accounts, nothing leaving the building.

## The line this is built on

**Rendering has to be earned.** Text is free, voice costs per character, video costs and takes
minutes. `MODE_FOR` in 01's `config` maps intent to medium, and two rules protect the ladder:

- confidence below 0.5 drops back to text — if we are not sure what they asked, we do not spend a
  render answering it
- every intent in `HANDOFF_INTENTS` (complaint, legal, press) gets **no automated answer at all**

The enquiry most likely to be made worse by a synthetic reply is the angry one.

## Setup, in order

1. **01 `config`** — `CLONE_NAME`, `CLONE_ROLE`, `CLONE_SCOPE`, then the `MODE_FOR` table.
2. **01 `config`** — `LLM_API_KEY` for model triage, or leave blank to run on keyword rules.
3. **02 `config`** — `ELEVENLABS_API_KEY` and your cloned `ELEVENLABS_VOICE_ID`.
4. **02 `config`** — `HEYGEN_API_KEY` and `HEYGEN_AVATAR_ID` for the video half.
5. **02 `config`** — `AUDIO_PUBLIC_BASE_URL`. See the warning below.
6. Copy **02**'s production webhook URL into **01**'s `RENDER_WEBHOOK_URL`.
7. `DRY_RUN = false` on both — only then does anything reach a real person.

### The one that will catch you

**HeyGen fetches the audio, it is not handed the bytes.** The synthesised speech has to be
reachable at a public URL, which is what `AUDIO_PUBLIC_BASE_URL` is for. Leave it blank and the
render still succeeds — using **HeyGen's own text-to-speech, not your cloned voice**.

That is a silent downgrade, and on a voice-clone product it is the most embarrassing possible
one, so `build the render summary` prints a `NOTE` line whenever it happens rather than letting
a plausible-looking video go out in the wrong voice.

## Known gaps

Honest list, because the brief asks for a handover:

- **No conversational realtime voice.** The brief mentions Bland AI / OpenAI Realtime for an
  *interactive* call. This pipeline is request → response, not a live conversation. That is a
  different architecture and is not built here.
- **No D-ID path.** HeyGen only. Swapping it is two nodes — the poll loop and everything after it
  is vendor-agnostic — but it has not been done.
- **Audio hosting is not included.** `AUDIO_PUBLIC_BASE_URL` assumes you have somewhere to put the
  file. S3, a bucket, anything public.
- **The poll loop costs an execution slot** for up to three minutes per video. On n8n Cloud that
  matters at volume; a callback URL from HeyGen would be the production answer.
