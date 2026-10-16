# Remind writers in Slack about Notion content calendar deadlines

**Who's it for**
Content leads who run an editorial calendar in Notion and spend Monday mornings chasing writers about drafts. Writers get a nudge before the deadline, and overdue pieces reach the editor.

**How it works**
1. Every weekday at 09:00 it queries your Notion database for pieces that are not published and due within 3 days or already overdue, or uses sample pages until Notion is connected.
2. Each piece gets the next reminder step: 3 days out, 1 day out, then overdue at 1, 3 and 7 days late. A step missed over a weekend is caught up on Monday.
3. A step is sent once per due date. Moving the due date in Notion starts the ladder again.
4. One Slack message groups the reminders by writer and mentions them. Pieces with no writer, or a writer with no Slack id, are listed for the editor.

**How to set up**
1. Run it once as imported. It works through the sample calendar and stops at `STOP: preview - nothing posted`.
2. Share the database with your Notion integration, add the credential to `Query the content calendar`, set `NOTION_DATABASE_ID` and the property names in `PROPS`, then set `USE_NOTION = true`.
3. Fill `WRITER_SLACK_IDS` (Notion email or name to Slack member id), connect Slack and set `SLACK_CHANNEL_ID`.
4. Set `TEST_EMAIL` to any address to post with a [TEST] prefix and no real mentions. Set `TEST_RUN = false` to go live.

**Requirements**
- A Notion database with a title, status (or select), date and person property
- A Slack workspace

**How to customize**
- `REMINDER_DAYS` and `OVERDUE_DAYS` set the ladder.
- `DONE_STATUSES` lists statuses that end reminders, such as Published or Cancelled.
- `EDITOR_SLACK_ID` gets mentioned for unassigned and overdue pieces.
