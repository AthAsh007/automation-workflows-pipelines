# Applicant tracking sync

Sync job applicants from Google Sheets to Notion and email them by stage.

**Import** [`workflow.json`](workflow.json). 18 nodes, one file.

## Who it is for

Small recruiting teams and hiring managers who collect applications through a Google Form
and track candidates in a Notion database, and who want new applicants added automatically
and stage emails sent without anyone copying rows between tools.

## How it works

Two independent flows share one Notion database.

**Intake** runs on a schedule. It reads new applicants from the sheet behind your form,
reads the candidates already in Notion, and drops anyone who is already there, so
re-running never creates a duplicate page. Genuinely new people are added to Notion and the
sheet row is marked processed, which is what stops the next run picking it up again.

**Stage emails** are triggered by Notion itself. When a candidate's stage changes, the
previous stage is read from a data table and compared with the new one, the matching email
template is fetched from Notion, filled in with that candidate's details, and sent through
Gmail. Storing the previous stage is what makes the trigger reliable: Notion reports that a
page changed, not what changed about it.

## Setting it up

1. Create a Notion database for candidates with a stage property, and a second one holding
   one email template per stage.
2. Attach Notion, Google Sheets and Gmail credentials to the credential nodes.
3. Point the applicant-reading node at the response sheet behind your Google Form.
4. Set the stage names in the routing node to match your own.

## Requirements

A Notion workspace, a Google Sheet collecting form responses, and a Gmail account.

## Changing what it does

Add a stage by adding an output to the routing node and a template page in Notion. The
email body is assembled in the template node.

## Pinned data

The pinned sample on the template node is one email template. The Notion page id and URL in
it are placeholders, so the pin shows the shape without pointing at a real page.
