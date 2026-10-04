// Confirm the renderer actually returned a picture, before a human is asked to look at it.
//
// A render can fail in three ways that all look like success to the HTTP node:
//
//   * the provider answers 200 with a JSON error body instead of bytes
//   * it answers with a real PNG that is a blank canvas — the template threw and the
//     screenshot caught an empty page
//   * it answers with something that is not a PNG at all (an HTML error page, a JPEG)
//
// So the bytes are checked rather than the status code. The PNG signature and the IHDR
// dimensions are in the first 24 bytes of the file and are read straight out of the header,
// which is also how render.sh in the drafts repo proved a render was not a stale file.

const cfg = $('config').first().json;
const post = $('build the render request').first().json;

const binary = $binary || {};
const key = Object.keys(binary)[0];
const problems = [];

let bytes = 0;
let width = 0;
let height = 0;
let mime = '';

if (!key) {
  problems.push('the renderer returned no binary data. Response: '
    + JSON.stringify($json).slice(0, 400));
} else {
  const b = binary[key];
  mime = b.mimeType || '';
  bytes = Number(b.fileSize) || 0;

  // n8n reports fileSize as a human string ("142 kB") on some versions, so measure the
  // buffer rather than trusting the field.
  const buf = await this.helpers.getBinaryDataBuffer(0, key);
  bytes = buf.length;

  const isPng = buf.length > 24
    && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;

  if (!isPng) {
    problems.push('what came back is not a PNG. First bytes: '
      + buf.slice(0, 16).toString('utf8').replace(/[^\x20-\x7e]/g, '.'));
  } else {
    // IHDR is always the first chunk: width at byte 16, height at 20, big-endian.
    width = buf.readUInt32BE(16);
    height = buf.readUInt32BE(20);

    const expectW = cfg.canvas_width * cfg.device_scale;
    const expectH = cfg.canvas_height * cfg.device_scale;
    if (width !== expectW || height !== expectH) {
      problems.push('the PNG is ' + width + 'x' + height + ', expected ' + expectW + 'x'
        + expectH + '. LinkedIn will letterbox anything that is not the 4:5 canvas.');
    }
    if (bytes < cfg.min_png_bytes) {
      problems.push('the PNG is only ' + bytes + ' bytes, under the ' + cfg.min_png_bytes
        + ' floor. A render this small is a blank or half-drawn canvas, not a post.');
    }
  }
}

return [{
  json: Object.assign({}, post, {
    _png_ok: problems.length === 0,
    _png_bytes: bytes,
    _png_width: width,
    _png_height: height,
    _png_mime: mime,
    _binary_key: key || '',
    _problems: problems,
    _reason: problems.length ? problems[0]
      : 'rendered ' + width + 'x' + height + ', ' + bytes + ' bytes'
  }),
  binary: binary
}];
