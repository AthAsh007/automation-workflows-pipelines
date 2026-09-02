# Demo data (Cedar Land Group) workflow v3

This version uses the original `lead_id` matching approach. There is no `row_id` column.

## Google Sheet tabs

Import:

1. `Leads-v3.csv` → `Leads`
2. `Data Quality-v3.csv` → `Data Quality`
3. `Data Quality Summary.csv` → `Data Quality Summary`
4. `Suppression.csv` → `Suppression`

Copy the Google Sheet ID into the `config` node.

For the demo:

```text
REVERIFY_BATCH = 0
NEVERBOUNCE_API_KEY = ''
ALERT_WEBHOOK_URL = ''
```

## Safe fixes

The safe-fix Google Sheets node uses:

```text
Operation: Update Row
Column to Match On: lead_id
Data Mode: Auto-Map Input Data
```

Safe fixes include trimming, lowercasing email, normalising domain, and rebuilding a missing `lead_id`.

## Important limitation

Because `lead_id` is also the matching key, a row whose original `lead_id` is blank cannot be safely updated by matching on `lead_id` after the workflow generates a new value. If that case is included, Update Row will not find the original blank-key row.

This version intentionally restores the original `lead_id` design as requested.

## Data Quality

Human-review queue, one row per issue:

```text
audit_id
audited_at
source_row_number
lead_id
email
first_name
last_name
company
issue_type
details
recommended_action
status
```

## Data Quality Summary

Weekly aggregate:

```text
audited_at
total_rows
health_score
auto_fixed
needs_human
rechecked
downgraded
```

## Demo

Expected aggregate:

```text
total_rows = 26
health_score = 69
auto_fixed = 7
needs_human = 8
rechecked = 0
downgraded = 0
```
