// Pinecone accepted the batch. `upsertedCount` is Pinecone's own count, set beside how many
// were sent, so a partial write is visible.
return $input.all().map((i, idx) => {
  const sent = $('build the Pinecone upsert').itemMatching(idx).json;
  return { json: {
    outcome: 'batch ' + sent.batch_no + ' loaded',
    sent: sent.chunk_count,
    upserted: i.json.upsertedCount ?? '(not reported)'
  } };
});
