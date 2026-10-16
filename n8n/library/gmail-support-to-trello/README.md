# Turn Gmail support emails into Trello cards by category

Sorts each new support email into a Trello list by keyword category, sets a due date from its priority, applies label ids, skips auto-replies and internal mail, and adds replies in an existing thread as a comment on that thread's card instead of a new card.

Import `gmail-support-to-trello-publish.json` into n8n. It runs on import with no credentials: the shipped `config` takes the built-in sample path and stops on a named `STOP:` node before anything is sent or written.

## Who it's for

Small teams that run support from a Gmail inbox and plan the work on a Trello board. Each email becomes a card in the right list with a due date, without anyone copying it across.

## How it works

1. The Gmail trigger picks up unread mail matching `GMAIL_QUERY` every minute. A manual run uses 6 sample emails instead.
2. Auto-replies, bounces and mail from your own domain are skipped. Several messages from one thread in the same batch become one card.
3. Keyword rules in `CATEGORIES` pick the list; urgency words pick the priority, and the priority sets the due date (4 hours for urgent, 7 days for low).
4. A new thread creates a card with the sender, a trimmed body and the Gmail thread id. A later reply in that thread is added as a comment on the same card.

## Sections on the canvas

1. **Start and settings.** The Gmail trigger polls every minute for unread mail matching `GMAIL_QUERY`; the manual trigger exists to try the rules on sample mail. Categories, list ids and due times all live in `config`.
2. **Read the email.** `Read the incoming email` flattens the Gmail message into sender, subject, body and thread. With no trigger data it returns a marker, so `Load sample support emails` runs instead and the same rules can be checked.
3. **Sort and plan the card.** Skips come first so an out-of-office never becomes a card. Messages are grouped by thread before categorising, and the first matching category wins, so the order of `CATEGORIES` is the tie-breaker.
4. **Write to Trello.** A thread already on the board gets a comment, not a second card. The card id is stored only after `Create the Trello card` succeeds, so a failed call is retried on the next email in that thread.

## Setup

1. Run it once as imported. It sorts the sample emails and stops at `STOP: dry run - Trello untouched`.
2. Add a Gmail credential to `New support email` and set `GMAIL_QUERY` to match your support mail.
3. Add a Trello credential to `Create the Trello card` and `Add the reply as a card comment`, then paste list ids into `CATEGORIES` and `FALLBACK_LIST_ID`, and label ids into `PRIORITY_LABEL_IDS`.
4. Set `DRY_RUN = false` and activate the workflow. The thread-to-card memory is kept in static data, which n8n saves on activated runs.

## Settings in `config`

| Setting | Ships as | What it does |
|---|---|---|
| `GMAIL_QUERY` | `'to:support@yourcompany.example'` | Gmail search the trigger polls (unread only); also set it on the trigger node |
| `CATEGORIES` | `[{"name":"Billing","words":["invoice","r` | first category whose words appear in the subject or body wins; list_id is the Trello list id |
| `FALLBACK_LIST_ID` | `''` | Trello list for mail that matches no category |
| `URGENT_WORDS` | `["urgent","asap","everyone","outage","pr` | make a card urgent |
| `HIGH_WORDS` | `["charged twice","refund","cannot","bloc` | make a card high priority |
| `LOW_CATEGORIES` | `["Feature request"]` | categories that are low priority unless urgent words appear |
| `DUE_HOURS` | `{"urgent":4,"high":24,"normal":72,"low":` | hours from arrival to the card due date |
| `PRIORITY_LABEL_IDS` | `{"urgent":"","high":"","normal":"","low"` | Trello label id per priority; blank adds no label |
| `SKIP_SENDERS` | `["no-reply","noreply","mailer-daemon","p` | sender address fragments that are never carded |
| `SKIP_SUBJECTS` | `["automatic reply","out of office","deli` | subject fragments that mark an auto-reply |
| `OWN_DOMAINS` | `["yourcompany.example"]` | mail from these domains is internal and skipped |
| `BODY_CHARS` | `1200` | how much of the email body goes onto the card |
| `DRY_RUN` | `true` | ships true. The run computes and reports, and writes nothing. |

## Nodes that need a credential

- `New support email`
- `Create the Trello card`
- `Add the reply as a card comment`

## Requirements

- A Gmail or Google Workspace inbox
- A Trello board with one list per category
- Trello API key and token

## Customising

- `CATEGORIES` holds the words, list id and label id for each category; the first match wins.
- `DUE_HOURS` sets the due date per priority.
- `SKIP_SENDERS` and `OWN_DOMAINS` keep robots and colleagues off the board.

## Verified

Every scenario below was run by `_kit/simulate.ts`: the real Code-node JavaScript and IF/Switch logic, with service calls replaced by canned responses.

| Scenario | Nodes run | Sends or writes | Ends at |
|---|---|---|---|
| shipped config (dry run) | 9 | none | `STOP: dry run - Trello untouched` |
| live: Gmail trigger creates a card | 12 | `Create the Trello card` | `STOP: skipped, not a support request`, `Remember the card for this thread` |
