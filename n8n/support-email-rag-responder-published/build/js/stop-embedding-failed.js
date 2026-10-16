// A batch OpenAI would not embed after its retries. Its chunks were not upserted; the rest
// of the run carried on. Chunk ids are stable, so running the workflow again simply retries.
return $input.all().map((i) => ({ json: {
  outcome: 'batch ' + i.json.batch_no + ' not embedded: ' + i.json.problem,
  chunks_not_loaded: i.json.chunk_count
} }));
