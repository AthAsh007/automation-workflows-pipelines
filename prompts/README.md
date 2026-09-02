# Prompt pipelines

Automation where the model is a step in a pipeline rather than a chat window.
Every pipeline here returns typed output or fails loudly, and none of them need a
paid model to run: each ships pointed at an OpenAI-compatible endpoint, so a local
model served by Ollama, llama.cpp or vLLM works without changing any code.

```
prompts/
├── classify/          route an item into one of N buckets, with a refusal bucket
├── extract/           turn unstructured text into a validated record
├── review/            score a draft against a rubric and return line-level notes
├── route/             pick the next action, with a deterministic fallback
├── optimise/          measure a prompt against a labelled set and improve it
└── lib/               the client, the schema validator, the repair loop
```

## The shape every pipeline uses

```
input ──> render prompt ──> call model ──> parse ──> validate against schema
                                              │             │
                                              │        fails │
                                              │             ▼
                                              │      repair: show the model its
                                              │      own validation error, once
                                              │             │
                                              │        fails │
                                              ▼             ▼
                                          typed record   deterministic fallback
```

Four properties make this different from calling a model and hoping:

**Output is validated before it is used.** The model returns JSON, the JSON is
checked against a schema, and nothing downstream sees an unvalidated field. A
missing enum value is a pipeline error, not a surprise three steps later.

**Repair is bounded at one attempt.** On a validation failure the model is shown
its own output and the specific error, once. A second failure goes to the
fallback. Unbounded repair loops turn a cheap call into an expensive one and
still fail.

**There is always a deterministic fallback.** A classifier falls back to the
`unknown` bucket and flags for human review. An extractor falls back to nulls
with a `confidence: 0`. The pipeline completing with a low-confidence answer is
better than the pipeline stopping.

**Retrieved text is data, never instruction.** Inbound email, scraped pages and
retrieved documents are wrapped in a delimiter and the system prompt says the
content inside is untrusted. A pipeline that concatenates a scraped page into its
instructions will eventually execute what someone wrote on that page.

## Running one

```bash
cd prompts
cp .env.example .env         # point LLM_BASE_URL at your endpoint
python -m pip install -r requirements.txt
python -m classify.run --input samples/support-tickets.json --dry-run
```

`--dry-run` uses the recorded responses in `samples/` and makes no network call,
so you can see the whole pipeline behave before you have an endpoint at all.

### Free ways to get an endpoint

| Option | Setup | Notes |
| --- | --- | --- |
| Ollama | `ollama serve`, then `LLM_BASE_URL=http://localhost:11434/v1` | Runs on a laptop. No key needed; set `LLM_API_KEY=ollama`. |
| llama.cpp server | `llama-server -m model.gguf --port 8080` | `LLM_BASE_URL=http://localhost:8080/v1` |
| vLLM | `vllm serve <model>` | Same interface, faster on a GPU |
| A hosted provider free tier | Provider dependent | Set `LLM_BASE_URL` and `LLM_API_KEY` |

Structured output quality varies a lot by model. `lib/schema.py` does the
validation and repair, which is what makes a smaller local model usable here: it
does not have to get the JSON right on the first try.

## The pipelines

| Pipeline | Input | Output | Fallback |
| --- | --- | --- | --- |
| [classify](classify/) | A text item and a list of buckets | `{bucket, confidence, reason}` | `unknown`, flagged for review |
| [extract](extract/) | Unstructured text and a schema | The record, plus per-field confidence | Nulls with `confidence: 0` |
| [review](review/) | A draft and a rubric | Per-criterion score and line-level notes | The rubric's deterministic checks only |
| [route](route/) | A record and a list of actions | The chosen action and its arguments | The action marked `default` |
| [optimise](optimise/) | A prompt and a labelled set | A report, and a candidate prompt | The original prompt, unchanged |

## optimise/

Treating a prompt as something you measure rather than something you argue about.
Give it a labelled set and a prompt; it scores the prompt, generates candidate
variants, scores those on a held-out split, and reports which won and by how much.

It stops short of committing anything. The output is a report and a candidate
file, and a human decides. A prompt that scores three points higher on 40 examples
has not necessarily improved.

**Prior art.** The idea of optimising a prompt against a metric rather than by
hand is DSPy's (Stanford NLP, MIT licensed,
<https://github.com/stanfordnlp/dspy>), and the paper behind it is worth reading
before using this. This implementation is deliberately much smaller: no compiler,
no module abstraction, no teleprompter. It is a scoring harness with a variant
generator, meant to be read in one sitting. If you want the real thing, use DSPy.

## Prompt-injection boundary

Every pipeline that handles text from outside the system follows the same three
rules, implemented in `lib/untrusted.py`:

1. Untrusted content is wrapped in a delimiter that the content itself cannot
   contain, and the wrapper is generated per call.
2. The system prompt names the delimiter and states that everything inside it is
   data to be analysed, never instruction to be followed.
3. The output schema constrains what the model can say. A classifier that can
   only return one of five enum values cannot be talked into returning a shell
   command, whatever the input says.

Rule 3 is the one that actually holds. Rules 1 and 2 raise the cost of an attack;
a constrained output schema removes the payload.
