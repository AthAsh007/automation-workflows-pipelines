// The ATS posted something this engine cannot start a campaign from. The run ends here on
// purpose, naming both the fields it looked for and the keys it actually received — because
// the usual cause is a field map pointing at the wrong name for this vendor, and that is a
// two-minute fix once you can see the two lists side by side.
const cfg = $('config').first().json;
const j = $input.first().json;

return [{
  json: {
    _outcome: 'job order not usable',
    problems: j._problems || [],
    ats_vendor: j._ats_vendor,
    keys_in_the_payload: j._received_keys || [],
    field_map_in_use: (cfg.ats_fields && cfg.ats_fields.job) || {},
    _next_step: 'Compare the two lists above. ATS_FIELDS.job in the config node maps our '
      + 'field names to theirs; a job order with no id or no title almost always means one '
      + 'of those paths is wrong for this vendor. Dotted paths like "address.city" are fine.'
  }
}];
