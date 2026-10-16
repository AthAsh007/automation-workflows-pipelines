// The Customers tab now marks these numbers opted out; workflow 01 skips them from here on.
return [{ json: { _outcome: 'written', _reason: $input.all().length + ' opt-out(s) recorded on the Customers tab' } }];
