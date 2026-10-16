# AI news digest

Filter and summarise RSS news with AI into Google Sheets.

**Import** [`workflow.json`](workflow.json). 15 nodes, one file.

## Who it is for

Anyone who has to keep up with a set of news sources and wants a filtered, summarised
digest in a spreadsheet instead of reading every feed by hand.

## How it works

Three RSS feeds are read in parallel and merged into one list. The first agent is a
relevance filter: it judges each headline against your topic and returns a typed verdict
with a reason, pinned to a schema so the answer is always machine-readable. Only the
articles that survive go on to the second stage, which is where the cost is. That agent
fetches the full article page through Browserless, because an RSS item usually carries a
teaser rather than the piece, and writes a structured summary against its own schema. The
result is shaped into rows and appended to Google Sheets.

Filtering before fetching is the whole design. Scraping and summarising every item in
every feed would cost several times more to produce the same digest.

## Setting it up

1. Replace the three RSS nodes with your own feed URLs. They ship pointing at
   `feeds.example.com`, which does not resolve. Add or remove as many as you like; they
   all meet at the same merge.
2. Attach an OpenRouter credential to both model nodes, and a Browserless credential to
   the fetch node.
3. Edit the prompt on `Filter the news` to describe the topic you care about.
4. Attach Google Sheets and point the last node at your sheet.

## Requirements

An OpenRouter API key, a Browserless account for page fetching, and a Google Sheet.

## Changing what it does

The relevance test is the prompt on `Filter the news`. The digest format is the prompt on
the summarising agent plus its schema. Change each prompt together with its schema, never
one without the other: the parser rejects a response that no longer matches.

## Pinned data

The original pinned sample on `Merge RSS` was 190 KB of full article text from the news
sites it was developed against, so it is not included here. To get the same offline run,
execute the three RSS nodes once against your own feeds and pin the merge output.
