# extract

Turn unstructured text into a validated record, with per-field confidence and a
quote for every value.

```bash
python -m extract.run --input samples/enquiries.txt --dry-run
python -m extract.run --input samples/enquiries.txt --schema extract/schemas/enquiry.json --out records.json
```

## What to edit

A file in [`schemas/`](schemas/). It is the contract, and it is used three ways:
rendered into the prompt so the model knows the shape, enforced against the
response so nothing invalid reaches your database, and quoted back in the repair
message when validation fails.

`field_confidence` and `quotes` are added automatically. Do not put them in your
schema file.

## The rule that matters

**A field the text does not support is null, not a guess.** Extraction pipelines
do not usually fail by returning malformed JSON. They fail by returning a
plausible value for a field that was never in the source, and by then it is a row
in your CRM that nobody will question.

Two mechanisms enforce that:

1. The model returns a `quotes` object: the exact substring each non-null value
   came from.
2. `verify_quotes()` checks each quote against the source text. A quote the
   source does not contain means the value was invented, so the value is dropped
   to null, its confidence is set to 0, and the record is flagged.

This costs nothing. The model has already told you where it claims to have read
each value, so checking is a substring search.

## Reading the output

| Field | Meaning |
| --- | --- |
| `field_confidence` | Per field, 0-100. How clearly the text stated it, not how plausible it looks |
| `quotes` | Per field, the source substring. Null for a field the model set to null |
| `unsupported_fields` | Fields whose quote was not in the source. Already dropped to null |
| `low_confidence_fields` | Non-null fields scoring below `--floor` (default 50) |
| `needs_review` | True if either list is non-empty |

## Input formats

A `.json` file (a list of `{id, text}` objects), or a `.txt` file with records
separated by a line of three or more dashes. `samples/enquiries.txt` shows the
second form, including a one-line enquiry that should extract almost nothing.
