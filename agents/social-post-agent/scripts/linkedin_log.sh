#!/usr/bin/env bash
# Log whether a daily LinkedIn draft was posted or skipped.
# Usage: linkedin_log.sh posted|skipped|cancelled acme|mch [note]
set -euo pipefail

STATUS="${1:?usage: linkedin_log.sh posted|skipped|cancelled acme|mch [note]}"
BRAND="${2:?usage: linkedin_log.sh posted|skipped|cancelled acme|mch [note]}"
NOTE="${3:-}"
NOTE="${NOTE//$'\t'/ }"
NOTE="${NOTE//$'\n'/ }"

case "$STATUS" in posted|skipped|cancelled) ;; *) echo "status must be posted, skipped or cancelled" >&2; exit 1;; esac
case "$BRAND" in acme|mch) ;; *) echo "brand must be acme or mch" >&2; exit 1;; esac

LOG="${LINKEDIN_LOG_PATH:-$HOME/.hermes/data/linkedin_posted_log.tsv}"
mkdir -p "$(dirname "$LOG")"
printf '%s\t%s\t%s\t%s\n' "$(date +%F)" "$BRAND" "$STATUS" "$NOTE" >> "$LOG"
echo "logged: $(date +%F) $BRAND $STATUS $NOTE"
