// One item per file to download. The plan was made in "build email content" so the
// copy and the attachments can never disagree about what is in the email.
const email = $input.first().json;
return (email._attachments || []).map((a) => ({ json: a }));
