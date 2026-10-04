// The row that lands on the board: heading columns only, nothing the sheet does not
// understand, no machinery fields.
const item = $input.first().json;
return [{ json: item.row }];
