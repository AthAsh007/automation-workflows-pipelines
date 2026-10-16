// Every reply and owner alert for this run went out.
return [{ json: { _outcome: 'sent', _reason: $input.all().length + ' WhatsApp message(s) sent' } }];
