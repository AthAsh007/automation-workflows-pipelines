// A sku in the order has no rule in PRODUCT_RULES, and HOLD_UNRULED_ITEMS is true, so
// neither an honest shipping window nor an honest installation email can be produced.
// Held here rather than promised. Add the sku(s) to PRODUCT_RULES and re-run the order.
return $input.all().map((i) => ({
  json: Object.assign({}, i.json, {
    _outcome: 'held',
    _reason: 'no product rule for: ' + ((i.json.plan && i.json.plan.gaps) || []).join(', ')
  })
}));
