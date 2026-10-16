# Draft LinkedIn posts with AI and send them to Discord for approval

**Who's it for**
Teams running a daily company LinkedIn presence who want the drafting, image rendering and
approval loop automated - but who are not willing to let anything reach the company page without a
person saying yes.

**How it works**
Every weekday morning it reads the post log, works out whether today needs a post, and picks the
next item from a bank of ideas held in Google Sheets. The caption is written by an LLM, or read
from the bank if one is already there. The image is built as HTML, validated for layout, and sent
to a renderer - there is no browser inside n8n, so this is one call out to Browserless or HCTI. The
rendered PNG is checked before it is used. The finished draft, image attached, is delivered to a
Discord channel for a human to approve.

**It never publishes.** Publishing is the companion workflow, and it only happens after somebody
replies to the draft. Those are two separate acts on purpose.

**How to set up**
1. Open **`config`** and set your sheet ids for the bank and the log, and your brand colours.
2. Attach Google Sheets, your LLM endpoint, a renderer and Discord credentials.
3. Set `TEST_CHANNEL_ID` to a private channel of your own first - nothing leaves the building
   until you do.

**Requirements**
A Google Sheet holding the post bank and log, an OpenAI-compatible endpoint, a Browserless or HCTI
renderer, and a Discord server. The Slack summary is optional.

**How to customize**
The image design is the HTML in **`build the HTML template`**. The caption voice is the prompt in
**`[cred] LLM - write the caption`**.
