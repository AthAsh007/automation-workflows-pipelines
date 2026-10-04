# Filter and summarise RSS news with AI into Google Sheets

**Who's it for**
Anyone who has to keep up with a set of news sources - analysts, comms teams, researchers - and
wants a filtered, summarised digest in a spreadsheet instead of reading every feed by hand.

**How it works**
Several RSS feeds are read in parallel and merged into one list. The first AI agent is a
**relevance filter**: it judges each headline against your topic and returns a typed verdict with a
reason, pinned to a schema so the answer is always machine-readable. Only the articles that survive
go on to the second stage, which is where the cost is. That agent fetches the full article page
through Browserless - an RSS item usually carries a teaser, not the piece - and writes a structured
summary against its own schema. The result is shaped into rows and appended to Google Sheets.
Filtering before fetching is the whole design: scraping and summarising every item in every feed
would cost many times more to produce the same digest.

**How to set up**
1. Replace the three RSS nodes with your own feed URLs - add or remove as many as you like, they
   all meet at the same merge.
2. Attach an OpenRouter credential to both model nodes and a Browserless credential to the fetch node.
3. Edit the prompt on **`Filter the news`** to describe the topic you actually care about.
4. Attach Google Sheets and point the last node at your sheet.

**Requirements**
An OpenRouter API key, a Browserless account for page fetching, and a Google Sheet.

**How to customize**
The relevance test is the prompt on **`Filter the news`**; the digest format is the prompt on
**`summarise each article`** plus its schema. Change each prompt together with its schema, never
one without the other.
