# Create Notion onboarding checklists and Slack welcomes for new BambooHR hires

**Who's it for**
People teams of 20 to 300 staff who run onboarding from a copied checklist and a reminder in someone's calendar. Every hire gets the same dated list a week before they start, with nothing to copy by hand.

**How it works**
1. Every weekday at 08:00 it reads hires from a BambooHR custom report, or sample hires until BambooHR is connected.
2. Hires starting in the next 7 days get a checklist: the common tasks plus their department's tasks, each dated relative to the start day and given an owner.
3. Inactive records, hires outside the window and hires that already have a page are held back with a reason.
4. Each checklist becomes a Notion page with to-do blocks. On the start day (or the Monday after a weekend start) a welcome is posted to Slack.

**How to set up**
1. Run it once as imported. It plans checklists for sample hires and stops at `STOP: dry run - no Notion pages`.
2. Add a Header Auth credential to `Fetch hires from BambooHR` (name `Authorization`, value `Basic` plus base64 of `your_api_key:x`), set `BAMBOOHR_SUBDOMAIN` and `USE_BAMBOOHR = true`.
3. Create a Notion database with Name, Start date and Department properties, share it with your integration and put its id in `NOTION_DATABASE_ID`.
4. Set `SLACK_CHANNEL_ID` for welcomes, check the preview in `Plan onboarding per hire`, then set `DRY_RUN = false`.

**Requirements**
- A BambooHR account with API access
- A Notion workspace and integration
- Optional: a Slack workspace

**How to customize**
- `COMMON_TASKS` and `DEPARTMENT_TASKS` hold every checklist line with its day offset and owner.
- `LOOKAHEAD_DAYS` sets how early a page is created before the start date.
- `WELCOME_TEMPLATE` is the Slack message; `{name}`, `{title}`, `{team}` and `{manager}` are filled in.
