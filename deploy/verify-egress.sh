#!/usr/bin/env bash
#
# Prove the sovereignty boundary, rather than asserting it.
#
# Two properties must both hold, and the second is the one people forget:
#
#   1. A container on `backplane` CANNOT reach the internet -- tested against
#      raw IPs as well as hostnames, so that a passing result means "no route"
#      and not merely "no DNS".
#   2. It CAN still reach its siblings. A network that blocks everything is
#      trivially sovereign and useless; the claim only means something if the
#      pipeline actually works inside it.
#
# Writes a timestamped evidence record to deploy/captures/. That file is the
# artefact attached to a benchmark run -- the number on the slide has to come
# from somewhere a jury can inspect.
#
# Usage:  ./deploy/verify-egress.sh

set -uo pipefail

cd "$(dirname "$0")/.."

COMPOSE_FILE="deploy/compose.yaml"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVIDENCE_DIR="deploy/captures"
EVIDENCE="${EVIDENCE_DIR}/egress-${STAMP}.txt"

# Raw IPs first: if these are unreachable, the result is about routing, not DNS.
EXTERNAL_IPS=("1.1.1.1" "8.8.8.8")
EXTERNAL_HOSTS=("https://huggingface.co" "https://integrate.api.nvidia.com" "https://registry.npmjs.org")

if ! command -v docker >/dev/null 2>&1; then
  echo "FAIL  docker not found."
  echo
  echo "The topology plane is the primary sovereignty enforcement (principle 2)."
  echo "Until Docker is installed this claim is designed but unproven, and P0"
  echo "cannot close. Install Docker Desktop, then re-run this script."
  exit 127
fi

mkdir -p "$EVIDENCE_DIR"

log() { echo "$@" | tee -a "$EVIDENCE"; }

log "Outskirts egress verification"
log "timestamp: ${STAMP}"
log "compose:   ${COMPOSE_FILE}"
log "docker:    $(docker --version)"
log ""

cleanup() {
  docker compose -f "$COMPOSE_FILE" --profile probe rm -sf egress-probe >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "Starting probe on the backplane network..."
if ! docker compose -f "$COMPOSE_FILE" --profile probe up -d egress-probe >>"$EVIDENCE" 2>&1; then
  log "FAIL  could not start the probe container. See ${EVIDENCE}."
  exit 1
fi

probe() { docker compose -f "$COMPOSE_FILE" exec -T egress-probe "$@" 2>&1; }

failures=0

log ""
log "--- 1. external destinations must be unreachable -----------------------"
for ip in "${EXTERNAL_IPS[@]}"; do
  if probe curl -s --max-time 6 --connect-timeout 4 "http://${ip}" >/dev/null; then
    log "  LEAK      reached ${ip} -- the backplane has a route to the internet"
    failures=$((failures + 1))
  else
    log "  blocked   ${ip}"
  fi
done

for url in "${EXTERNAL_HOSTS[@]}"; do
  if probe curl -s --max-time 6 --connect-timeout 4 "$url" >/dev/null; then
    log "  LEAK      reached ${url}"
    failures=$((failures + 1))
  else
    log "  blocked   ${url}"
  fi
done

log ""
log "--- 2. siblings must remain reachable ---------------------------------"
# A boundary that also breaks the pipeline proves nothing worth proving.
for target in "mongo:27017" "qdrant:6333"; do
  host="${target%%:*}"
  port="${target##*:}"
  if probe sh -c "nc -z -w 4 ${host} ${port}" >/dev/null; then
    log "  reachable ${target}"
  else
    log "  UNREACHED ${target} -- the network is too closed to run on"
    failures=$((failures + 1))
  fi
done

log ""
if [ "$failures" -eq 0 ]; then
  log "PASS  no route to the internet; siblings reachable."
  log "evidence: ${EVIDENCE}"
  exit 0
fi

log "FAIL  ${failures} problem(s). This blocks the P0 gate."
log "evidence: ${EVIDENCE}"
exit 1
