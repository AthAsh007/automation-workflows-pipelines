# Support email RAG responder

**Status: can publish.** Not yet submitted. Submit each `-publish.json` with its `SUBMISSION-*.md` as is.

| File | Template title |
| --- | --- |
| [`01-answer-support-email-publish.json`](01-answer-support-email-publish.json) | Answer support emails in Gmail from a Pinecone knowledge base with OpenAI |
| [`02-load-knowledge-base-publish.json`](02-load-knowledge-base-publish.json) | Load help pages into a Pinecone knowledge base with OpenAI embeddings |

Workflow 01 classifies a support email, retrieves matching help-page excerpts from Pinecone and replies in the same Gmail thread using only those excerpts. It hands the email to a person on low confidence, a complaint, refund, legal or cancellation intent, a weak match, or a draft that cites nothing. Workflow 02 fetches help pages, chunks and embeds them, and upserts them to Pinecone. Both run on a built-in demo knowledge base with no credentials.

Each `SUBMISSION-*.md` file is the description page for the workflow of the same number. The
`-publish.json` files pass `submission_lint` with no errors: stickies clear of every node, one
yellow description sticky with all five sections, an SEO title, and no credentials, sheet ids or
client references.
