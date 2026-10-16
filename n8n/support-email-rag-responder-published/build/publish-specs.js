// Writes the two tools/layout.py specs for the n8n template library (GUIDELINES §10).
// Kept as JS so the sticky text is readable here; run: bun build/publish-specs.js
// Then, from n8n/workflows/:
//   python ../tools/layout.py <wf>.json <wf>-publish.json support-email-rag-responder/build/publish-spec-0N.json
//   python ../tools/make_submission_md.py <spec> SUBMISSION-<wf>.md
const fs = require('fs');
const path = require('path');

const T1 = 'Answer support emails in Gmail from a Pinecone knowledge base with OpenAI';
const T2 = 'Load help pages into a Pinecone knowledge base with OpenAI embeddings';

const spec01 = {
  title: T1,
  stickies: [
    { color: 4, band: 'top', from: '[cred] Gmail - new email in the inbox', to: 'a readable email?', width: 780, content:
`## ${T1}

**Who's it for**
Support teams and agencies that answer the same customer questions by email every day and want the answerable ones replied to from their own help content, with everything else handed to a person.

**How it works**
A Gmail trigger picks up each new email. It is read into one shape, with the message and thread ids kept. OpenAI classifies it into typed fields; non-support mail leaves the workflow, and complaints, refunds, legal or low-confidence emails go to a person. The question is embedded and matched in Pinecone. If the best match scores below \`MIN_MATCH_SCORE\`, it escalates instead of guessing. Otherwise OpenAI writes a reply from the retrieved excerpts only and must cite them, and Gmail replies in the customer's own thread.

**How to set up**
1. Run **Run the demo emails** first: six sample emails, a sample knowledge base, nothing sent.
2. Load your help pages with the companion knowledge-base workflow.
3. Attach Gmail, OpenAI and a Pinecone Header Auth credential (\`Api-Key\`), set \`USE_OPENAI\`, \`PINECONE_INDEX_HOST\` and \`SUPPORT_TEAM_EMAIL\` in \`config\`.
4. Set \`TEST_EMAIL\` to your address, then \`TEST_RUN = false\`.

**Requirements**
A Gmail or Google Workspace account, an OpenAI API key, and a Pinecone index (1536 dimensions, cosine).

**How to customize**
\`MIN_CLASSIFY_CONFIDENCE\` and \`MIN_MATCH_SCORE\` set how sure it must be before answering, \`HANDOFF_INTENTS\` what always goes to a person, and \`SIGNATURE\` how replies are signed.` },
    { color: 7, band: 'above', from: 'config', to: 'STOP: unreadable email', content:
`### 1. Read the email

\`read the email\` keeps the sender, the subject, only the new text of the body, and the Gmail message and thread ids the reply must attach to.

\`a readable email?\` stops empty mail, your own mail (\`OWN_ADDRESSES\`) and auto-replies at \`STOP: unreadable email\`, so the workflow can never answer itself.` },
    { color: 7, band: 'below', from: 'OpenAI configured?', to: 'needs a person?', content:
`### 2. Classify, and decide who answers

\`[cred] OpenAI - classify the email\` returns typed JSON: category, intent, handoff, confidence. A failed or malformed answer falls back to \`classify by keywords\` for that email, and says so.

\`a support request?\` routes sales pitches and newsletters out. \`needs a person?\` sends complaints, refunds, legal and cancellations to a person however good the knowledge would be, and so does any classification under \`MIN_CLASSIFY_CONFIDENCE\`.` },
    { color: 7, band: 'above', from: 'knowledge search configured?', to: 'enough knowledge?', content:
`### 3. Retrieve, and refuse to guess

The question is embedded with the same model the knowledge base was loaded with, and \`[cred] Pinecone - find matching knowledge\` returns the top matches with their text.

**\`enough knowledge?\` is the gate.** Below \`MIN_MATCH_SCORE\`, or when the search failed after its retries, the email goes to a person. With nothing configured, \`search the demo knowledge base\` stands in so the gate can be watched.` },
    { color: 7, band: 'below', from: 'OpenAI writes the reply?', to: 'a reply we can send?', content:
`### 4. Write only from the excerpts

\`[cred] OpenAI - write the reply\` sees the email and the excerpts, nothing else, must list the excerpts it used, and may refuse.

\`apply the AI reply\` rejects a refusal, an empty reply, a reply citing nothing, or one citing an excerpt it was not given. Those go to a person with the draft attached.` },
    { color: 7, band: 'above', from: 'address the reply', to: 'STOP: Gmail refused the send', content:
`### 5. Reply in the customer's thread

\`address the reply\` decides preview, test or live and enforces \`REPLY_CAP_PER_RUN\`. \`[cred] Gmail - reply in the thread\` answers on the customer's own message, so Gmail keeps the conversation together.

In test mode the reply goes to \`TEST_EMAIL\` instead, naming the thread it would have joined. A Gmail failure after its retries lands on \`STOP: Gmail refused the send\` with Gmail's error.` },
    { color: 3, band: 'below', from: 'prepare the escalation', to: 'STOP: preview - escalation not sent', content:
`## Nothing goes out until you say so

This ships with \`TEST_RUN = true\` and a blank \`TEST_EMAIL\`: every reply and every escalation is built in full and shown on a STOP node, and nothing is sent.

Everything the workflow will not answer reaches \`prepare the escalation\`: one email to \`SUPPORT_TEAM_EMAIL\` per case, with the reason, the customer's words, what was retrieved, any draft and a link to the thread.` }
  ]
};

const spec02 = {
  title: T2,
  stickies: [
    { color: 4, band: 'top', from: 'Run it now', to: 'document list configured?', width: 760, content:
`## ${T2}

**Who's it for**
Teams running a retrieval-based support or chat workflow who need their help pages in Pinecone, reloadable whenever the content changes.

**How it works**
Each public URL in \`DOC_URLS\` is fetched on its own and stripped to plain text; a page that fails or comes back empty is listed as skipped. The text is split into overlapping chunks with stable ids, so reloading a page overwrites its chunks rather than duplicating them. Chunks are embedded with OpenAI in batches of 96 and upserted to Pinecone with the text, title and source as metadata. A batch that fails is reported and the rest still load.

**How to set up**
1. Run **Run it now** first: the sample articles are chunked and shown, nothing is embedded.
2. Create a Pinecone index with 1536 dimensions and cosine metric, and put its host in \`PINECONE_INDEX_HOST\`.
3. List your pages in \`DOC_URLS\`, attach OpenAI and a Pinecone Header Auth credential (\`Api-Key\`), set \`USE_OPENAI = true\`.
4. Set \`TEST_EMAIL\` or \`TEST_RUN = false\`: loading is skipped in preview.

**Requirements**
An OpenAI API key, a Pinecone index, and help pages reachable at public URLs.

**How to customize**
\`CHUNK_WORDS\` and \`CHUNK_OVERLAP\` set the chunk size, \`OPENAI_EMBED_MODEL\` and \`EMBED_DIMENSIONS\` the embedding, and \`PINECONE_NAMESPACE\` where the vectors go.` },
    { color: 7, band: 'above', from: 'config', to: 'chunk the documents', content:
`### 1. Read the pages and chunk them

\`Fetch the document\` runs once per URL with retries, so one broken page does not stop the rest; \`read the document text\` lists it as skipped with the reason.

\`chunk the documents\` splits the text into overlapping windows of \`CHUNK_WORDS\`, each with a stable \`<doc>#<n>\` id.` },
    { color: 7, band: 'below', from: 'loading on?', to: 'STOP: Pinecone refused the upsert', content:
`### 2. Embed and upsert

\`loading on?\` keeps preview runs read-only and shows every chunk on \`STOP: preview - vectors not upserted\`.

\`[cred] OpenAI - embed the chunks\` embeds each batch of 96, and \`[cred] Pinecone - upsert the vectors\` writes them with the text as metadata. A batch that fails lands on a named STOP with the API's error, and \`STOP: knowledge base loaded\` reports Pinecone's own count.` }
  ]
};

fs.writeFileSync(path.join(__dirname, 'publish-spec-01.json'), JSON.stringify(spec01, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'publish-spec-02.json'), JSON.stringify(spec02, null, 2) + '\n');
console.log('wrote publish-spec-01.json, publish-spec-02.json');
