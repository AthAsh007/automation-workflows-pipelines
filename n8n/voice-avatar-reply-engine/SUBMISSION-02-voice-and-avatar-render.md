# Generate avatar video replies with ElevenLabs and HeyGen

**Who's it for**
Teams building a voice or video "digital clone" who need the render half as a reliable service: take
a script, speak it in a cloned voice, drive an avatar with it, and return a finished video - with
the failure cases handled rather than discovered in production.

**How it works**
A render request arrives by webhook from the triage workflow, or you press **Run it now**. The
script is length-checked first, because ElevenLabs bills per character and a runaway script is the
expensive failure. ElevenLabs synthesises the speech, and the returned bytes are **proved to be
audio** before anything trusts them - a 200 with a JSON error body is the normal way a TTS call
fails. A voice-only request stops there with the audio as its deliverable. A video request starts a
HeyGen render, which is asynchronous: the workflow polls on a bounded loop, giving up after a
configured number of tries instead of holding an execution open forever. Every stage stamps its own
duration, and the summary prints them against a latency budget.

**How to set up**
1. Open **`config`**: add `ELEVENLABS_API_KEY` and your cloned `ELEVENLABS_VOICE_ID`.
2. Add `HEYGEN_API_KEY` and `HEYGEN_AVATAR_ID` for the video half; leave blank for audio only.
3. Set `AUDIO_PUBLIC_BASE_URL` to a public URL for the synthesised audio - without it HeyGen uses
   its own voice instead of your clone, and the summary says so.
4. Leave **`DRY_RUN = true`** for the first run.

**Requirements**
An ElevenLabs account with a cloned voice. HeyGen is optional - without it this is a voice-only
pipeline. Somewhere public to host the audio is needed for the cloned voice to reach HeyGen.

**How to customize**
`LATENCY_BUDGET_MS`, `POLL_SECONDS` and `POLL_MAX_TRIES` are the timing controls. To swap HeyGen for
D-ID, replace the two HeyGen nodes - the poll loop and everything after it is unchanged.
