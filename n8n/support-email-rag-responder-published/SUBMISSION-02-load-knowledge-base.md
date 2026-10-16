# Load help pages into a Pinecone knowledge base with OpenAI embeddings

**Who's it for**
Teams running a retrieval-based support or chat workflow who need their help pages in Pinecone, reloadable whenever the content changes.

**How it works**
Each public URL in `DOC_URLS` is fetched on its own and stripped to plain text; a page that fails or comes back empty is listed as skipped. The text is split into overlapping chunks with stable ids, so reloading a page overwrites its chunks rather than duplicating them. Chunks are embedded with OpenAI in batches of 96 and upserted to Pinecone with the text, title and source as metadata. A batch that fails is reported and the rest still load.

**How to set up**
1. Run **Run it now** first: the sample articles are chunked and shown, nothing is embedded.
2. Create a Pinecone index with 1536 dimensions and cosine metric, and put its host in `PINECONE_INDEX_HOST`.
3. List your pages in `DOC_URLS`, attach OpenAI and a Pinecone Header Auth credential (`Api-Key`), set `USE_OPENAI = true`.
4. Set `TEST_EMAIL` or `TEST_RUN = false`: loading is skipped in preview.

**Requirements**
An OpenAI API key, a Pinecone index, and help pages reachable at public URLs.

**How to customize**
`CHUNK_WORDS` and `CHUNK_OVERLAP` set the chunk size, `OPENAI_EMBED_MODEL` and `EMBED_DIMENSIONS` the embedding, and `PINECONE_NAMESPACE` where the vectors go.
