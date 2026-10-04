// Nothing in the raw list needs work: every row is already enriched, a duplicate, or not
// marked ready. The run ends here on purpose and says which, so an empty morning is
// distinguishable from a broken morning.
//
// The empty-tab case is called out separately because it is the one that looks like a bug.
// A tab with only a header row would otherwise end the run at the Sheets node with a green
// tick and no explanation at all.
const s = $input.first().json;
const skipped = s._skipped || {};

const why = s._sheet_empty
  ? 'The "' + (s._tab || 'Organisations') + '" tab has no data rows. Headings alone are not '
    + 'enough — paste some organisations in below row 1, or check that ORGS_TAB in config '
    + 'matches the tab name exactly.'
  : 'Every row is either already enriched, a duplicate, or not marked ready. Set Status to '
    + 'Re-enrich on anything you want redone.';

return [{
  json: {
    _outcome: s._sheet_empty ? 'the sheet is empty' : 'nothing to enrich',
    tab: s._tab || '',
    rows_in_sheet: s._rows_in_sheet || 0,
    already_enriched_recently: skipped.too_recent || 0,
    not_marked_ready: skipped.not_ready || 0,
    duplicates_in_the_list: skipped.duplicate || 0,
    rows_with_no_name: skipped.no_name || 0,
    _next_step: why
  }
}];
