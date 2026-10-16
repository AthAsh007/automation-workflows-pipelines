# Create offboarding checklists in Asana from a leaver form

Turns one leaver form into an Asana task with dated subtasks for access, equipment, handover, payroll and people steps, picked by department and leaving type, assigned by task type and moved off weekends.

Import `asana-offboarding-checklist-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

People and IT teams at companies of 20 to 500 that offboard from memory or an old checklist and find out months later that someone kept access. Each leaver gets the same dated list, owned by the right people.

## How it works

1. A manager submits the leaver form with the last day, department, leaving type and whether a laptop must come back. A manual run uses a sample leaver.
2. Tasks come from `BASE_TASKS` plus the department's `ROLE_TASKS`. The laptop task is dropped when there is none, and the exit interview is skipped for dismissals.
3. Each task is due relative to the last day. Weekend dates move to the Friday before, past dates move to today, and for a dismissal every access task is due today and marked urgent.
4. One parent task goes into `ASANA_PROJECT_GID` and every step becomes a subtask, assigned through `OWNERS` by task type.

## Sections on the canvas

1. **Start and settings.** The form is the real entry point and a manual run uses the sample leaver. Every task, offset and owner lives in `config`, so a new department is one more entry in `ROLE_TASKS`.
2. **Read the leaver.** `config` records whether the form fired and `Came from the form?` picks the reader. Both emit the same leaver shape, so the checklist logic never knows which one ran.
3. **Build the dated checklist.** `Build the checklist` refuses a form without a usable last day rather than guessing. Dates are moved off weekends and out of the past, and a dismissal pulls every access step to today so nothing waits on the calendar.
4. **Create in Asana.** The parent task is created first because subtasks need its gid. `Create in Asana?` needs a live run and a project id; in a dry run the full plan is still visible on `Build the checklist`.

## Setup

1. Run it once as imported. It builds the checklist for a sample leaver and stops at `STOP: dry run - Asana untouched`.
2. Add an Asana credential to `Create the offboarding task` and `Create each subtask`, and set `ASANA_PROJECT_GID` (the number in the project URL).
3. Replace the addresses in `OWNERS` with people in your Asana workspace and edit the task lists.
4. Check the plan in `Build the checklist`, then set `DRY_RUN = false` and share the form URL with managers.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `ASANA_PROJECT_GID` | `''` | Asana project that holds offboarding tasks; blank skips Asana |
| `BASE_TASKS` | `[{"task":"Handover document reviewed wit` | steps for every leaver; offset = days relative to the last day |
| `ROLE_TASKS` | `{"Engineering":[{"task":"Reassign open p` | extra steps by department |
| `OWNERS` | `{"access":"it@northwind.example","equipm` | task type -> Asana assignee email or gid; 'manager' = the manager on the form |
| `PARENT_OWNER` | `'people@northwind.example'` | assignee of the parent offboarding task |
| `MIN_NOTICE_DAYS` | `5` | a form submitted with fewer days left than this is flagged as short notice |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `Create the offboarding task`
- `Create each subtask`

## Requirements

- An Asana workspace and project
- An n8n instance that can serve a form

## Customising

- `BASE_TASKS` and `ROLE_TASKS` hold each step with its type and day offset from the last day.
- `OWNERS` maps a task type to an assignee; `manager` means the manager named on the form.
- `MIN_NOTICE_DAYS` flags forms submitted too close to the last day.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (sample leaver, dry run) | 9 | none | `STOP: dry run - Asana untouched` |
| dismissal from the form, live in Asana | 12 | `Create the offboarding task`, `Create each subtask` | `Report what was created` |
| form without a last day | 8 | none | `STOP: form incomplete - nothing created` |
