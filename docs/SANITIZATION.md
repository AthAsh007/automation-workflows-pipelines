# Writing and copy rules

These rules apply to **all human-facing text** written or edited in this repository, by a
person or by a model: website copy, landing pages, UI strings, metadata, SEO content, blog posts, emails, social posts, READMEs, MDX files, JSON content, and documentation intended for end users.

These rules apply to **prose and copy only**. They do NOT apply to code, code comments, commit messages, logs, configuration files, technical identifiers, or API responses.

## Core Principle

Every sentence should do at least one of these:

- Explain what something does.
- Explain who it is for.
- Explain what changes after using it.

If a sentence does none of these, remove it.

Prefer clarity over sounding impressive.

## Punctuation

- No em dashes (`—`). The em dash is the single most common AI tell, made worse because models often set it with no surrounding spaces.
- No en dashes (`–`) in prose.
- Use a regular hyphen (`-`) only inside genuine compounds or numeric ranges ("fixed-fee", "9am-5pm").
- Avoid dramatic pause dashes (`-`).
- Prefer periods, commas, colons, or parentheses.
- Use straight quotes (`'` and `"`). Curly quotes and apostrophes are themselves an AI tell; keep them out of copy.
- One space after a period.
- Avoid excessive exclamation marks.

## Voice & Style

- Write like an experienced human, not a marketing department.
- Use active voice.
- Prefer present tense.
- Write directly to the reader using "you" when appropriate.
- Use concrete language.
- Use examples, numbers, timelines, and outcomes whenever possible.
- Vary sentence length naturally.
- Cut filler aggressively.
- If a word can be removed without changing meaning, remove it.

## Avoid AI-Tell Constructions

Do not use:

- It's not just X, it's Y.
- Not only X, but Y.
- More than just...
- The old way versus the new way.
- Traditional solutions do X. We do Y.
- Most platforms stop at X. We go further.
- X isn't just a tool. It's a platform.
- X isn't only about Y.

State the point directly.

## Avoid Structural AI Tells

These patterns flag generated text even when no single banned word appears. They matter more than the word lists.

- Participle tack-ons. Cut the trailing "-ing" clause that adds fake significance: "...handling your case with care, ensuring the best outcome", "...offering a service that delivers results." End the sentence, or make the clause a concrete fact.
- Copula inflation. Use "is" and "are." Do not swap them for "serves as," "stands as," "boasts," "features," "offers," or "represents."
- Significance inflation. Do not announce importance: "plays a vital role," "stands as a beacon of," "marks a pivotal moment," "reflects a broader commitment to." State the fact and let it stand.
- Outline conclusions. Drop the formula "Despite its strengths, X continues to..." and any closing line that restates the section.
- Uniform cadence. AI writes sentences of similar length and shape. Follow a long sentence with a short one. Read it aloud; if every line has the same rhythm, rewrite.

## Avoid AI Openings

Do not start sections, responses, or paragraphs with:

- Certainly!
- Absolutely!
- Great question!
- Of course!
- In today's fast-paced world...
- In the ever-evolving landscape of...
- In the realm of...
- Nowadays...
- As technology continues to evolve...
- We live in a world where...

## Avoid Empty Filler

Remove phrases such as:

- It's worth noting that
- It's important to remember
- That being said
- Needless to say
- In summary
- To summarize
- In conclusion
- Overall
- Put simply
- At the end of the day

If the sentence works without the phrase, remove it.

## Avoid Marketing Buzzwords

Do not use:

- seamless
- seamlessly
- robust
- cutting-edge
- leverage
- elevate
- unlock
- empower
- supercharge
- game-changer
- revolutionary
- transformative
- innovative
- modern
- advanced
- sophisticated
- dynamic
- intuitive
- comprehensive
- powerful
- flexible
- scalable
- best-in-class
- world-class
- industry-leading
- state-of-the-art

Replace with a concrete description.

Bad:

> A powerful platform with advanced automation.

Better:

> Automatically routes support tickets based on category and priority.

## Avoid AI Vocabulary Tells

These words appear so often in AI output that they signal generated text to both readers and detectors. They are flags in your own prose, not a ban on the dictionary or on a client's verbatim copy. A flagged word used in a concrete, literal sense is fine.

- Verbs: delve, leverage, utilize, facilitate, underscore, harness, foster, bolster, amplify, illuminate, cultivate, spearhead, unlock, unleash.
- Adjectives: pivotal, vital, robust, holistic, multifaceted, nuanced, profound, paramount, integral, unwavering, relentless, ever-evolving, nascent, exemplary.
- Nouns: landscape, realm, tapestry, testament, synergy, interplay, ecosystem, journey, treasure trove.

Replace each with a plain description of the fact.

## Avoid Startup & Agency Buzzwords

Do not use:

- digital transformation
- bespoke solutions
- tailored solutions
- customer-centric
- mission-critical
- strategic partner
- value-driven
- data-driven
- growth-focused
- future-ready
- end-to-end
- all-in-one
- purpose-built
- next-generation

Describe what the product actually does.

## Avoid Future-Hype Language

Do not use:

- built for the future
- future-proof
- tomorrow's solution
- ready for what's next
- designed for the future
- the future of X

Describe actual capabilities instead.

## Avoid Generic SaaS Language

Do not use:

- streamline workflows
- drive innovation
- unlock value
- maximize efficiency
- optimize operations
- accelerate growth
- transform your business
- scale with confidence
- increase productivity
- enhance collaboration

Explain exactly what happens.

Bad:

> Streamline your workflow.

Better:

> Review and approve invoices from one dashboard.

## Avoid "Helps You" Language

Avoid:

- helps teams
- helps businesses
- helps developers
- helps organizations
- enables users to
- allows users to

Use direct statements.

Bad:

> Helps developers deploy faster.

Better:

> Deploy in under five minutes.

## Avoid "Whether You're"

Avoid:

- Whether you're a startup or an enterprise...
- Whether you're building an MVP or scaling globally...

Write directly.

Bad:

> Whether you're a freelancer or a large team...

Better:

> Freelancers use it to manage projects. Larger teams use it to coordinate approvals.

## Avoid "Built With X In Mind"

Avoid:

- built with scalability in mind
- designed with users in mind
- created with flexibility in mind

State the result.

Bad:

> Built with scalability in mind.

Better:

> Handles 100,000 requests per minute.

## Avoid Unsupported User Claims

Do not invent opinions.

Avoid:

- Users love...
- Teams appreciate...
- Customers enjoy...
- Developers prefer...

Only make these claims when supported by research, analytics, reviews, or testimonials.

## Avoid Vague Attribution & Fabricated Detail

Do not hide behind a vague source. Name the source or cut the claim.

Avoid:

- Experts agree...
- Studies show...
- Industry reports indicate...
- It is widely known that...
- Many clients / observers note...

Do not invent facts. Never fabricate statistics, awards, win rates, client counts, years in business, or "since 19XX" dates. Strangely precise numbers with no source are a classic AI tell. If a fact is not in the provided material, do not state it.

## Prefer Specificity

Prefer:

- numbers
- metrics
- timelines
- outcomes
- examples
- names
- measurable results

Bad:

> Significant performance improvements.

Better:

> Reduced page load time from 3.8s to 1.2s.

Bad:

> Faster onboarding.

Better:

> New users create their first workflow in under two minutes.

## Features Must Connect To Outcomes

Do not dump feature lists.

Bad:

> Includes analytics, reporting, automation, dashboards, integrations, and notifications.

Better:

> Track revenue, automate recurring reports, and get alerts when key metrics change.

Explain why a feature matters.

## Prefer Verbs Over Abstract Nouns

Reduce words ending in:

- -tion
- -ment
- -ability
- -ization

Bad:

> Facilitate collaboration and communication.

Better:

> Leave feedback directly on the document.

Bad:

> Improve operational efficiency.

Better:

> Approve requests in one click.

## Avoid Press Release Language

Do not use:

- proud to announce
- excited to share
- thrilled to introduce
- groundbreaking
- industry-defining
- category-leading

Most copy becomes stronger when these are removed.

## Avoid Generic Headlines

Do not write headlines that could belong to any SaaS company.

Avoid:

- Work Smarter
- Move Faster
- Scale With Confidence
- The Future of AI
- AI-Powered Solutions
- Smarter Workflows
- Unlock Your Potential
- Reimagine What's Possible

A headline should communicate a specific audience, capability, or outcome.

## Rule Of Three

Avoid automatic adjective lists.

Bad:

> Fast, reliable, and scalable.

Better:

> Processes 50,000 requests per minute without queuing.

Prefer one specific claim over three vague ones.

## Transition Words

Use sparingly.

Avoid excessive use of:

- additionally
- furthermore
- moreover
- consequently
- therefore
- as a result

Most web copy reads better without them.

## Endings

Do not add summary paragraphs that repeat the section.

Bad:

> In summary, these features provide a better experience for users.

If the section already made the point, stop writing.

## Editing Existing Copy

When editing:

- Preserve the author's intent.
- Preserve the author's voice.
- Remove AI tells without rewriting unnecessarily.
- Match the surrounding style.
- Match capitalization and locale conventions.
- Apply the same standards across all languages.

## Sanitization Inside Code

The rules above target prose. Inside source files, apply them only to strings a user reads on screen. Everything else in a code file is off limits.

In scope (treat as copy):

- JSX/HTML text nodes: headings, body text, empty states, helper text.
- Attribute values users read: `placeholder`, `title`, `alt`, `aria-label`.
- Toasts, banners, dialogs, and form validation messages.
- Error messages rendered in the UI.
- Page titles, meta descriptions, OpenGraph and SEO strings.
- i18n/locale files and translation values.
- Seed or mock data that renders in the UI as readable text.
- Email and push notification templates.

Out of scope (leave alone):

- Identifiers, prop names, CSS classes, enum values, API field names, translation keys.
- Code comments, commit messages, developer changelogs.
- Log output and thrown `Error` messages used for debugging.
- Test names and assertion messages.
- Glyphs that are not sentences: an em dash ("—") as an empty table cell, an ellipsis ("…") on "Loading…" or "Search…" affordances, a "-" range separator.

Code-specific rules:

1. Fix the string value only. Never rename an identifier, translation key, or API field to satisfy a copy rule.
2. Error messages say what happened and what to do next: "No classes yet. Create your first class." Not internal detail: "Request failed with status 500."
3. Validation messages state the rule, not blame: "Password must be at least 6 characters," not "You entered an invalid password."
4. In interpolated strings (`Hello ${name}`), sanitize the literal parts and leave the variables.
5. If a key has translations, apply the same edit to every locale, or flag the untranslated ones.
6. Respect layout: a rewrite must not break truncation, fixed widths, or line-wrap assumptions in the component.
7. Mock data that demos the product counts as copy. Sample statistics must read as obvious samples and must never migrate into marketing copy.
8. After editing strings, run the project's formatter, linter, and type checker. If a snapshot or E2E test fails, it asserted the old copy; update the test to the new string.

## Final Self-Check

Before submitting copy:

1. No em dashes (`—`) remain.
2. No unnecessary en dashes (`–`) remain.
3. No marketing buzzwords remain.
4. No "It's not just X, it's Y" constructions remain.
5. No "Whether you're..." constructions remain.
6. No unsupported user-opinion claims remain.
7. Every sentence contributes information.
8. Concrete details appear wherever possible.
9. No summary paragraph repeats previous content.
10. The copy sounds like a person, not a press release.
11. The copy sounds specific to this product, not interchangeable with 500 SaaS websites.
12. UI strings in code (empty states, placeholders, validation, toasts) meet the same standards.

## Ultimate Test

Ask:

> Could this sentence appear on 500 different SaaS websites without changing a word?

If the answer is yes, rewrite it until it could only belong to this product, company, or situation.

## Research Basis & Sources

These rules come from documented patterns of AI-generated text and from conversion-copywriting practice, not from personal preference. The sources are listed so a rule can be checked rather than taken on trust.

- Wikipedia, Signs of AI writing: https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
- Walter Writes, Most common ChatGPT words to avoid: https://walterwrites.ai/most-common-chatgpt-words-to-avoid/
- Olivia Cal, AI writing tells and word blacklist: https://www.oliviacal.com/post/ai-writing-tells
- Decrypt, The 5 biggest tells something was written by AI: https://decrypt.co/348923/5-biggest-tells-something-written-ai
- GetResponse, Landing page copywriting principles: https://www.getresponse.com/blog/copywriting-landing-page-conversions
- VWO, Landing page copywriting guide: https://vwo.com/blog/landing-page-copywriting/
- Landingi, Conversion copywriting tips: https://landingi.com/conversion-optimization/copywriting/

Key findings folded into this document:

- The em dash and curly quotes are the leading punctuation tells.
- Structural patterns flag AI even without banned words: participle tack-ons, copula inflation ("serves as," "boasts"), significance inflation, the automatic rule of three, and uniform sentence cadence.
- AI-vocabulary tells (delve, tapestry, testament, landscape, realm, synergy) signal generated text to readers and detectors.
- Strong copy answers "what's in it for me" within five seconds and backs every benefit with a concrete feature, number, or outcome.
