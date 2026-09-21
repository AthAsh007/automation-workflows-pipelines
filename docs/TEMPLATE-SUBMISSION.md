# n8n Template Submission Guidelines

The platform's published rules for getting a template accepted into the n8n template
library. Captured from the submission page on 15 September 2026. These are the
platform's rules, not ours, and they are enforced by reviewers - check the page again
before submitting.

They apply to every workflow under `n8n/` and to the publish copies kept outside the
repo (for example `Capture and Reply.json`, `Chase and Digest.json`,
`candidate engine - Published.json`).

## TLDR

- Your template should look something like the example on the submission page.
- **Use sticky notes - it is mandatory.**
- **Do not hardcode API keys in the HTTP node.**
- **Do not repost or steal other people's workflows** - you will be banned.

## General guidelines

### What makes a template successful

- Make your templates **high quality** and **relevant** to common user needs.
- Focus on **real, practical use cases** (for example AI support chatbot, content
  creation, sales automation).
- Aim for **broad appeal**, but with enough specificity to be actionable.
- **Be original.** Check the template library to see what is already out there and
  fill the gaps.

### What not to do

- **Do not plagiarize or resell** someone else's template (this will get your account
  banned).
- **Do not submit low-effort templates** (they will not get published). Templates
  should demonstrate thoughtful design, utility, and real-world value.
- **Do not ignore these guidelines** - save yourself (and us) the back-and-forth on
  reviews and resubmissions.

## Description page guidelines (for SEO and presentation)

### Language and formatting

- Write in **clear, grammatically correct English**. Use an AI to proofread your
  content.
- Use proper **Markdown formatting**. No HTML tags.

### SEO optimization

- Use **main nodes in the title** with sentence-style capitalization.
- The title should be in this format:

  `Action verb` `thing being manipulated` `to/on/in/from` `where`

  Example: `Sync contacts from Pipedrive to HubSpot`

- **Avoid spammy, overhyped titles with emojis.** Use a clear, objective title that
  reflects what the template does (if not, the reviewers will change it).
- Aim for about **200 words** in the description.

### Suggested sections

- **Who's it for**
- **How it works / What it does**
- **How to set up**
- **Requirements**
- **How to customize the workflow**

### Special cases

If your template uses a **community node**, add:

- a **disclaimer** that it is self-hosted only;
- a **workflow image at the top** (because previews do not render).

## Workflow guidelines

### Structure and clarity

- **Rename all nodes** to describe their purpose.
- Use **sticky notes** for context and instructions.
  - Always include one sticky (preferably yellow) that **explains the template** and
    includes the entire description in it.
  - Link to external setup guides (for example a Notion page) if needed.
  - Use additional sticky notes (preferably neutral/white) to outline individual
    steps. The submission page shows a worked example of this.
  - You may embed YouTube videos and images in sticky notes.
- Consider adding a **quick Loom video** for setup (optional but highly encouraged).

### Best practices

- Follow **security guidelines** (for example do not store credentials directly in the
  HTTP node).
- Do not forget to remove personal identifiers such as Google Sheets IDs, Telegram
  channels, real email addresses, and the like.
- Use the **Set** node to group the variables the user needs to configure.

### User empathy

- Assume the user may be **new to n8n**.
- Minimize friction by making the workflow **plug-and-play** where possible.

## Payment guidelines

### Becoming a verified creator

You must submit **at least 3 high-quality templates** to become eligible to offer paid
templates.

### Selling templates

Paid templates must:

- be **delivered reliably** after purchase (you are the one responsible for tracking
  incoming payments and delivering the template);
- remain **accessible to the buyer**.

### Enforcement

Failure to deliver a paid template **may result in account suspension or banning**.
