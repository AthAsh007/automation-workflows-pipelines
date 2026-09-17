// PREVIEW mode (TEST_RUN true, TEST_EMAIL blank): the row is on the board but no email
// went out, so the board honestly still says 'New order' with no confirmation recorded.
// Open this node to read exactly what the customer would have received.
const mail = $('compose the confirmation').first().json;
return [{
  json: {
    _outcome: 'preview',
    _reason: 'preview mode — row written, confirmation email not sent',
    order_key: mail.order_key,
    email: {
      to: mail.customer_email,
      subject: mail.customer_subject,
      html: mail.customer_html,
      text: mail.customer_text
    }
  }
}];
