// Fold the downloaded files back onto the single email item as binary properties.
// n8n's email node takes a comma-separated list of those property names.
const email = $('any attachments?').first().json;
const plan = email._attachments || [];

const binary = {};
const attached = [];
const failed = [];

$input.all().forEach((item, i) => {
  const source = item.binary || {};
  const data = source.data || Object.values(source)[0];
  const planned = plan[i] || {};
  if (!data) {
    failed.push(planned.filename || ('file ' + i));
    return;
  }
  const prop = 'attachment_' + attached.length;
  // Name it after the file in the repo, not after whatever the URL happened to end in.
  binary[prop] = Object.assign({}, data, {
    fileName: planned.filename || data.fileName,
    mimeType: data.mimeType || (/\.pdf$/i.test(planned.filename || '') ? 'application/pdf' : 'image/png')
  });
  attached.push(planned.filename || prop);
});

return [{
  json: Object.assign({}, email, {
    _attachment_props: Object.keys(binary).join(','),
    _attached: attached,
    _attachments_failed: failed
  }),
  binary
}];
