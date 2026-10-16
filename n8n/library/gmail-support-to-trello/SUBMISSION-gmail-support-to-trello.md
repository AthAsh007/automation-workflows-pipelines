# Turn Gmail support emails into Trello cards by category

**Who's it for**
Small teams that run support from a Gmail inbox and plan the work on a Trello board. Each email becomes a card in the right list with a due date, without anyone copying it across.

**How it works**
1. The Gmail trigger picks up unread mail matching `GMAIL_QUERY` every minute. A manual run uses 6 sample emails instead.
2. Auto-replies, bounces and mail from your own domain are skipped. Several messages from one thread in the same batch become one card.
3. Keyword rules in `CATEGORIES` pick the list; urgency words pick the priority, and the priority sets the due date (4 hours for urgent, 7 days for low).
4. A new thread creates a card with the sender, a trimmed body and the Gmail thread id. A later reply in that thread is added as a comment on the same card.

**How to set up**
1. Run it once as imported. It sorts the sample emails and stops at `STOP: dry run - Trello untouched`.
2. Add a Gmail credential to `New support email` and set `GMAIL_QUERY` to match your support mail.
3. Add a Trello credential to `Create the Trello card` and `Add the reply as a card comment`, then paste list ids into `CATEGORIES` and `FALLBACK_LIST_ID`, and label ids into `PRIORITY_LABEL_IDS`.
4. Set `DRY_RUN = false` and activate the workflow. The thread-to-card memory is kept in static data, which n8n saves on activated runs.

**Requirements**
- A Gmail or Google Workspace inbox
- A Trello board with one list per category
- Trello API key and token

**How to customize**
- `CATEGORIES` holds the words, list id and label id for each category; the first match wins.
- `DUE_HOURS` sets the due date per priority.
- `SKIP_SENDERS` and `OWN_DOMAINS` keep robots and colleagues off the board.
