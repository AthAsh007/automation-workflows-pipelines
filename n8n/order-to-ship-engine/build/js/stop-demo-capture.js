// DEMO mode (no sheet configured): the whole run happened in memory. Nothing was written
// and nothing was sent — this node's output IS the result: the row that would land on the
// board and the email the customer would get. Open it to read both.
const plan = $('plan the build').first().json;
const mail = $('compose the confirmation').first().json;
return [{
  json: {
    _outcome: 'demo',
    _reason: 'BOARD_READY is false — row shown, not written; nothing emailed',
    order_key: plan.order_key,
    row: plan.row,
    email: {
      to: mail.customer_email,
      subject: mail.customer_subject,
      html: mail.customer_html,
      text: mail.customer_text
    }
  }
}];
