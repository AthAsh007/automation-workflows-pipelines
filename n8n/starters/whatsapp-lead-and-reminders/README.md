# WhatsApp lead scoring and reminders

Score WhatsApp leads with AI and send reminders over Twilio.

**Import** [`workflow.json`](workflow.json). 17 nodes, one file.

## Who it is for

Small service businesses running customer conversations over WhatsApp who want three jobs
handled without staff: qualifying an inbound enquiry, chasing an overdue invoice, and
welcoming a new customer.

## How it works

Three independent flows share one Twilio WhatsApp number.

**Lead capture.** An inbound WhatsApp message goes to an agent that returns a structured
lead score against a fixed schema, so the reply is a typed object rather than free text. The
score is stored and an answer is sent straight back.

**Collections.** On a schedule, overdue invoices are read, the customer record for each is
looked up, and a payment reminder goes out on WhatsApp.

**Onboarding.** A submitted form creates the customer record and triggers a welcome message.

## Setting it up

1. Attach your Twilio credentials to the three send nodes and set your WhatsApp sender
   number.
2. Attach an OpenRouter credential to the model node and pick a model.
3. Create the data tables for invoices, customers and lead scores.
4. Send a WhatsApp message to your Twilio number to test the lead flow end to end.

## Requirements

A Twilio account with WhatsApp enabled, an OpenRouter API key, and n8n data tables for
customers, invoices and lead scores.

## Changing what it does

The scoring rubric is the prompt on the scoring node, and the shape it must return is the
lead score schema. Change them together. Each of the three flows can be deleted without
affecting the other two.

## Pinned data

The pinned samples are one inbound message, one score and one form submission. The Twilio
account and message SIDs are placeholders, and the customer phone number is in the
`555-01xx` range. The sender number `+14155238886` is Twilio's shared WhatsApp sandbox
number, which is the same for every account and belongs to Twilio rather than a person.
