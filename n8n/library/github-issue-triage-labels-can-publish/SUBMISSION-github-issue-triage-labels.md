# Label new GitHub issues by keywords with an optional OpenAI pass

**Who's it for**
Maintainers of open source projects and small product teams who get 10 to 100 issues a week and triage them by hand. New issues arrive labelled, and the ones missing repro steps already have a comment asking for them.

**How it works**
1. Every 30 minutes it lists open issues in each repository in `REPOS` updated since the last run, or sample issues until GitHub is connected. Pull requests and issues that already have labels are skipped.
2. Keywords in `TYPE_RULES` score each type, title words counting double. Paths and words in `AREA_RULES` add area labels. A bug with no steps or no version gets `needs-repro`.
3. When the top two types tie or nothing matched, and `USE_OPENAI` is true, the model picks the type. Otherwise the issue gets `needs-triage`.
4. Labels are added through the GitHub API, and needs-repro issues get one comment asking for steps and versions.

**How to set up**
1. Run it once as imported. It labels the sample issues and stops at `STOP: dry run - GitHub untouched`.
2. Add a GitHub credential to the three GitHub nodes, list your repositories in `REPOS` and set `USE_GITHUB = true`. Create the labels in each repository first.
3. Optional: add an OpenAI credential to `Classify unclear issues model` and set `USE_OPENAI = true`.
4. Read the labels on `Pick the final labels`, then set `DRY_RUN = false`.

**Requirements**
- A GitHub token with issues write access
- Optional: an OpenAI API key

**How to customize**
- `TYPE_RULES` and `AREA_RULES` hold every keyword and the label it maps to.
- `REPRO_COMMENT` is the text posted on bugs without steps; blank turns comments off.
- `MAX_PER_RUN` caps how many issues one run labels.
