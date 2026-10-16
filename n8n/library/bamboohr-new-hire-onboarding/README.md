# Create Notion onboarding checklists and Slack welcomes for new BambooHR hires

Reads BambooHR hires starting in the next 7 days, builds a dated onboarding checklist per hire from common and department tasks, creates one Notion page each and posts a Slack welcome on their first day.

Import `bamboohr-new-hire-onboarding-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

People teams of 20 to 300 staff who run onboarding from a copied checklist and a reminder in someone's calendar. Every hire gets the same dated list a week before they start, with nothing to copy by hand.

## How it works

1. Every weekday at 08:00 it reads hires from a BambooHR custom report, or sample hires until BambooHR is connected.
2. Hires starting in the next 7 days get a checklist: the common tasks plus their department's tasks, each dated relative to the start day and given an owner.
3. Inactive records, hires outside the window and hires that already have a page are held back with a reason.
4. Each checklist becomes a Notion page with to-do blocks. On the start day (or the Monday after a weekend start) a welcome is posted to Slack.

## Sections on the canvas

1. **Start and settings.** Runs every weekday at 08:00 or by hand. Both task lists, the look-ahead window and the welcome wording live in `config`, so changing the checklist never means touching a Code node.
2. **Read upcoming hires.** A BambooHR custom report returns hire date, department and supervisor in one call. Until `USE_BAMBOOHR` is true, `Load sample hires` feeds the same shape, including an inactive record and an existing employee.
3. **Plan each checklist.** `Plan onboarding per hire` dates every task from the start day and pulls late ones to today, so a hire added two days before starting still gets a usable list. Hires that already have a page are held back by id.
4. **Create pages and post welcomes.** Pages and welcomes need both a live run and a target. `Remember paged hires` stores only ids whose page came back from Notion, so a failed create is retried on the next run instead of being lost.

## Setup

1. Run it once as imported. It plans checklists for sample hires and stops at `STOP: dry run - no Notion pages`.
2. Add a Header Auth credential to `Fetch hires from BambooHR` (name `Authorization`, value `Basic` plus base64 of `your_api_key:x`), set `BAMBOOHR_SUBDOMAIN` and `USE_BAMBOOHR = true`.
3. Create a Notion database with Name, Start date and Department properties, share it with your integration and put its id in `NOTION_DATABASE_ID`.
4. Set `SLACK_CHANNEL_ID` for welcomes, check the preview in `Plan onboarding per hire`, then set `DRY_RUN = false`.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `USE_BAMBOOHR` | `false` | set true after adding the Header Auth credential to the BambooHR node |
| `BAMBOOHR_SUBDOMAIN` | `'yourcompany'` | the part before .bamboohr.com in your BambooHR address |
| `LOOKAHEAD_DAYS` | `7` | hires starting within this many days get their checklist page |
| `COMMON_TASKS` | `[{"task":"Order and ship laptop","offset` | tasks every hire gets; offset = days relative to the start date |
| `DEPARTMENT_TASKS` | `{"Engineering":[{"task":"Grant GitHub an` | extra tasks by BambooHR department name |
| `NOTION_DATABASE_ID` | `''` | Notion database for onboarding pages; blank skips page creation |
| `SLACK_CHANNEL_ID` | `''` | channel for start-day welcomes; blank skips Slack |
| `WELCOME_TEMPLATE` | `'Please welcome {name}, who joins {tea...'` | start-day Slack message |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Fetch hires from BambooHR`
- `Create onboarding page in Notion`
- `Post welcome to Slack`

## Requirements

- A BambooHR account with API access
- A Notion workspace and integration
- Optional: a Slack workspace

## Customising

- `COMMON_TASKS` and `DEPARTMENT_TASKS` hold every checklist line with its day offset and owner.
- `LOOKAHEAD_DAYS` sets how early a page is created before the start date.
- `WELCOME_TEMPLATE` is the Slack message; `{name}`, `{title}`, `{team}` and `{manager}` are filled in.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 13 | none | `Summarise the run`, `STOP: dry run - no Notion pages`, `STOP: dry run - no welcome posted` |
| live with BambooHR, Notion and Slack | 16 | `Create onboarding page in Notion`, `Post welcome to Slack` | `Summarise the run`, `Remember paged hires`, `Remember welcomed hires` |
