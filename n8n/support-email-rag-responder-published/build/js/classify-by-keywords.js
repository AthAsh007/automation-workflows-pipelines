// The keyword classifier. With USE_OPENAI = false it IS the classifier; with it on, the same
// rules are the fallback inside `apply the AI classification` when the model fails.
//
// Output is the same typed shape the model is asked for:
//   category    'support' | 'not_support'
//   intent      short label: question, access, billing, complaint, refund, legal, ...
//   handoff     true when a person must answer, whatever the knowledge says
//   confidence  0..1
//   reason      one line a person can read
// plus `route` ('not_support' | 'person' | 'answer'), decided by the shared rule below.
//@include lib-classify.js

const cfg = $('config').first().json;
return $input.all().map((i) => {
  const c = keywordClassify(i.json, cfg);
  return { json: Object.assign({}, i.json, c, decideRoute(c, cfg), { classified_by: 'keyword rules' }) };
});
