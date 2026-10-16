# Score WhatsApp leads with AI and send reminders over Twilio

**Who's it for**
Small service businesses running customer conversations over WhatsApp who want three jobs handled
without staff: qualifying an inbound enquiry, chasing an overdue invoice, and welcoming a new
customer.

**How it works**
Three independent flows share one Twilio WhatsApp number.

**Lead capture** — an inbound WhatsApp message goes to an AI agent that returns a structured lead
score against a fixed schema, so the reply is a typed object rather than free text. The score is
stored and an answer is sent straight back.

**Collections** — on a schedule, overdue invoices are read, the customer record for each is looked
up, and a payment reminder goes out on WhatsApp.

**Onboarding** — a submitted form creates the customer record and triggers a welcome message.

**How to set up**
1. Attach your Twilio credentials to the three send nodes and set your WhatsApp sender number.
2. Attach an OpenRouter credential to the model node and pick a model.
3. Create the data tables for invoices, customers and lead scores.
4. Send a WhatsApp message to your Twilio number to test the lead flow end to end.

**Requirements**
A Twilio account with WhatsApp enabled, an OpenRouter API key, and n8n data tables for customers,
invoices and lead scores.

**How to customize**
The scoring rubric is the prompt on **`score the lead with AI`**, and the shape it must return is
**`lead score schema`** — change them together. Each of the three flows can be deleted without
affecting the other two.
