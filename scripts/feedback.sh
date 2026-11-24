#!/usr/bin/env bash
# Agent helper for the ChronoRail feedback queue. Reads FEEDBACK_AGENT_TOKEN from the environment;
# never prints it. Usage:
#   bash scripts/feedback.sh list [new|triaged|planned|done|wontfix|spam|duplicate|all] [limit]
#   bash scripts/feedback.sh update <id> <status> "<agent note>" [ref-url]
set -euo pipefail
BASE="${FEEDBACK_BASE_URL:-https://chronorail.si}"
: "${FEEDBACK_AGENT_TOKEN:?FEEDBACK_AGENT_TOKEN is not set}"
auth=(-H "Authorization: Bearer ${FEEDBACK_AGENT_TOKEN}")
case "${1:-}" in
  list)
    curl -fsS "${auth[@]}" "${BASE}/api/feedback?status=${2:-new}&limit=${3:-50}" ;;
  update)
    id="${2:?id}"; st="${3:?status}"; note="${4:-}"; ref="${5:-}"
    body=$(python3 -c 'import json,sys; d={"status":sys.argv[1]}; 
n=sys.argv[2]; r=sys.argv[3]
if n: d["agentNote"]=n
if r: d["ref"]=r
print(json.dumps(d))' "$st" "$note" "$ref")
    curl -fsS -X PATCH "${auth[@]}" -H "content-type: application/json" --data "$body" "${BASE}/api/feedback/${id}" ;;
  *) echo "usage: feedback.sh list [status] [limit] | update <id> <status> \"<note>\" [ref]" >&2; exit 2 ;;
esac
echo
