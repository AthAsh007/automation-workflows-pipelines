# Answer support emails in Gmail from a Pinecone knowledge base with OpenAI

**Who's it for**
Support teams and agencies that answer the same customer questions by email every day and want the answerable ones replied to from their own help content, with everything else handed to a person.

**How it works**
A Gmail trigger picks up each new email. It is read into one shape, with the message and thread ids kept. OpenAI classifies it into typed fields; non-support mail leaves the workflow, and complaints, refunds, legal or low-confidence emails go to a person. The question is embedded and matched in Pinecone. If the best match scores below `MIN_MATCH_SCORE`, it escalates instead of guessing. Otherwise OpenAI writes a reply from the retrieved excerpts only and must cite them, and Gmail replies in the customer's own thread.

**How to set up**
1. Run **Run the demo emails** first: six sample emails, a sample knowledge base, nothing sent.
2. Load your help pages with the companion knowledge-base workflow.
3. Attach Gmail, OpenAI and a Pinecone Header Auth credential (`Api-Key`), set `USE_OPENAI`, `PINECONE_INDEX_HOST` and `SUPPORT_TEAM_EMAIL` in `config`.
4. Set `TEST_EMAIL` to your address, then `TEST_RUN = false`.

**Requirements**
A Gmail or Google Workspace account, an OpenAI API key, and a Pinecone index (1536 dimensions, cosine).

**How to customize**
`MIN_CLASSIFY_CONFIDENCE` and `MIN_MATCH_SCORE` set how sure it must be before answering, `HANDOFF_INTENTS` what always goes to a person, and `SIGNATURE` how replies are signed.
