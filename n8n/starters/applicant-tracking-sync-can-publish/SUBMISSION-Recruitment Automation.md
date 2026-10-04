# Sync job applicants from Google Sheets to Notion and email them by stage

**Who's it for**
Small recruiting teams and hiring managers who collect applications through a Google Form and track
candidates in a Notion database, and who want new applicants added automatically and stage emails
sent without anyone copying rows between tools.

**How it works**
Two independent flows share one Notion database. The intake flow runs on a schedule: it reads new
applicants from the Google Sheet behind your form, reads the candidates already in Notion, and drops
anyone who is already there — so re-running never creates a duplicate page. Genuinely new people are
added to Notion and the sheet row is marked processed, which is what stops the next run picking it
up again. The email flow is triggered by Notion itself: when a candidate's stage changes, the
previous stage is read from a data table and compared with the new one, the matching email template
is fetched from Notion, filled in with that candidate's details, and sent through Gmail. Storing the
previous stage is what makes the trigger reliable — Notion reports that a page changed, not what
changed about it.

**How to set up**
1. Create a Notion database for candidates with a stage property, and a second one holding one email
   template per stage.
2. Attach Notion, Google Sheets and Gmail credentials to the credential nodes.
3. Point **`[cred] Sheets - read new applicants`** at the response sheet behind your Google Form.
4. Set the stage names in **`route by candidate stage`** to match your own.

**Requirements**
A Notion workspace, a Google Sheet collecting form responses, and a Gmail account.

**How to customize**
Add a stage by adding an output to **`route by candidate stage`** and a template page in Notion.
The email body is assembled in **`build the email from the template`**.
