# Create offboarding checklists in Asana from a leaver form

**Who's it for**
People and IT teams at companies of 20 to 500 that offboard from memory or an old checklist and find out months later that someone kept access. Each leaver gets the same dated list, owned by the right people.

**How it works**
1. A manager submits the leaver form with the last day, department, leaving type and whether a laptop must come back. A manual run uses a sample leaver.
2. Tasks come from `BASE_TASKS` plus the department's `ROLE_TASKS`. The laptop task is dropped when there is none, and the exit interview is skipped for dismissals.
3. Each task is due relative to the last day. Weekend dates move to the Friday before, past dates move to today, and for a dismissal every access task is due today and marked urgent.
4. One parent task goes into `ASANA_PROJECT_GID` and every step becomes a subtask, assigned through `OWNERS` by task type.

**How to set up**
1. Run it once as imported. It builds the checklist for a sample leaver and stops at `STOP: dry run - Asana untouched`.
2. Add an Asana credential to `Create the offboarding task` and `Create each subtask`, and set `ASANA_PROJECT_GID` (the number in the project URL).
3. Replace the addresses in `OWNERS` with people in your Asana workspace and edit the task lists.
4. Check the plan in `Build the checklist`, then set `DRY_RUN = false` and share the form URL with managers.

**Requirements**
- An Asana workspace and project
- An n8n instance that can serve a form

**How to customize**
- `BASE_TASKS` and `ROLE_TASKS` hold each step with its type and day offset from the last day.
- `OWNERS` maps a task type to an assignee; `manager` means the manager named on the form.
- `MIN_NOTICE_DAYS` flags forms submitted too close to the last day.
