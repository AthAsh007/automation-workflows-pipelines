# Label new GitHub issues by keywords with an optional OpenAI pass

Every 30 minutes it reads issues opened since the last run, labels each as bug, feature, question or docs from weighted keywords, adds area labels from file paths mentioned, flags bugs without repro steps, and asks OpenAI only about the issues the rules could not decide.

Import `github-issue-triage-labels-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Maintainers of open source projects and small product teams who get 10 to 100 issues a week and triage them by hand. New issues arrive labelled, and the ones missing repro steps already have a comment asking for them.

## How it works

1. Every 30 minutes it lists open issues in each repository in `REPOS` updated since the last run, or sample issues until GitHub is connected. Pull requests and issues that already have labels are skipped.
2. Keywords in `TYPE_RULES` score each type, title words counting double. Paths and words in `AREA_RULES` add area labels. A bug with no steps or no version gets `needs-repro`.
3. When the top two types tie or nothing matched, and `USE_OPENAI` is true, the model picks the type. Otherwise the issue gets `needs-triage`.
4. Labels are added through the GitHub API, and needs-repro issues get one comment asking for steps and versions.

## Sections on the canvas

1. **Start and settings.** Runs every 30 minutes. `List repositories` attaches the time of the last labelled run to each repository, so a run only reads issues it has not seen.
2. **Read new issues.** The issues endpoint also returns pull requests, and `Load sample issues` includes one plus an already-labelled issue, so the filters that skip them are exercised offline.
3. **Rules first, model only when unsure.** Keyword rules decide most issues for free. `Rules decided it?` sends only ties and no-match issues to OpenAI, and `Use the model answer` ignores answers under 0.6 confidence, so a vague issue gets needs-triage rather than a guess.
4. **Label, comment and record.** Nothing is written in a dry run. A live run adds the labels, comments once on bugs without steps or a version, and records the run time only after GitHub accepted the labels.

## Setup

1. Run it once as imported. It labels the sample issues and stops at `STOP: dry run - GitHub untouched`.
2. Add a GitHub credential to the three GitHub nodes, list your repositories in `REPOS` and set `USE_GITHUB = true`. Create the labels in each repository first.
3. Optional: add an OpenAI credential to `Classify unclear issues model` and set `USE_OPENAI = true`.
4. Read the labels on `Pick the final labels`, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_GITHUB` | `false` | set true after adding the GitHub credential |
| `REPOS` | `["northwind/api","northwind/web"]` | owner/name of each repository to triage |
| `TYPE_RULES` | `{"bug":["error","crash","exception","bro` | type label -> keywords; title matches count double |
| `AREA_RULES` | `{"area: api":["src/api/","endpoint","/v1` | area label -> paths or words that suggest it |
| `REPRO_COMMENT` | `'Thanks for the report. Could you add ...'` | posted on bugs with no steps or version; blank posts nothing |
| `USE_OPENAI` | `false` | true asks the model about issues the keyword rules could not decide |
| `LOOKBACK_HOURS` | `24` | first run: how far back to look |
| `MAX_PER_RUN` | `30` | hard ceiling on issues labelled per run |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Fetch open issues`
- `Classify unclear issues`
- `Classify unclear issues model`
- `Add labels on GitHub`
- `Comment asking for repro steps`

## Requirements

- A GitHub token with issues write access
- Optional: an OpenAI API key

## Customising

- `TYPE_RULES` and `AREA_RULES` hold every keyword and the label it maps to.
- `REPRO_COMMENT` is the text posted on bugs without steps; blank turns comments off.
- `MAX_PER_RUN` caps how many issues one run labels.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample issues, dry run) | 12 | none | `STOP: dry run - GitHub untouched` |
| live with GitHub and OpenAI | 17 | `Add labels on GitHub`, `Comment asking for repro steps` | `Record the run time`, `Comment asking for repro steps` |
