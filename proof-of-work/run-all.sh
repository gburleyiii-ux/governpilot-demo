#!/usr/bin/env bash
# One-command diligence runner for the pinned GovernPilot tree.
# Writes proof-of-work/results.json, logs, and manifest.sha256.
# Product files the suite rewrites are restored on exit. Failures stay in the results.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
POW="$ROOT/proof-of-work"
LOG="$POW/logs"
PIN="a0e360b37bed7c86d0bc5ca384c61043939a8f93"
API_PID=""
LAST_CODE=0

restore_product() {
  set +e
  if [[ -n "${API_PID}" ]] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  API_PID=""
  # Put back only files the suite rewrites. Leave product source and proof-of-work alone.
  local generated=(
    data/sentinelops-state.json
    standard/conformance-report.json
    standard/control-implementation.json
    standard/release-manifest.json
    docs/compliance/SSP_CONTROL_IMPLEMENTATIONS.md
    docs/compliance/POAM.md
    docs/compliance/CONTINUOUS_MONITORING_PLAN.md
    tck/tck-report.json
  )
  local restore=()
  local path
  for path in "${generated[@]}"; do
    if ! git diff --quiet -- "$path"; then
      restore+=("$path")
    fi
  done
  if ((${#restore[@]})); then
    git checkout -- "${restore[@]}"
  fi
  git clean -fd -- dist data/evidence >/dev/null
}

trap restore_product EXIT

rm -rf "$LOG"
mkdir -p "$LOG"
printf '[]\n' >"$LOG/suite-steps.json"

run_step() {
  local id="$1"
  shift
  local logfile="$LOG/${id}.log"
  local start finish start_ms end_ms code
  start="$(node -e 'process.stdout.write(new Date().toISOString())')"
  start_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
  set +e
  "$@" >"$logfile" 2>&1
  code=$?
  set -e
  finish="$(node -e 'process.stdout.write(new Date().toISOString())')"
  end_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
  node "$POW/harness/append-step.mjs" \
    --id "$id" \
    --code "$code" \
    --start "$start" \
    --finish "$finish" \
    --start-ms "$start_ms" \
    --end-ms "$end_ms" \
    --log "$logfile" \
    --cwd "$ROOT" \
    -- "$@"
  LAST_CODE=$code
  echo "step ${id} exit ${code}"
}

HEAD_AT_RUN="$(git rev-parse HEAD)"
NODE_VER="$(node -v)"
NPM_VER="$(npm -v)"
PLATFORM="$(node -e 'process.stdout.write(process.platform + " " + process.arch)')"
STARTED="$(node -e 'process.stdout.write(new Date().toISOString())')"
TREE_OK=false
if git diff --quiet "$PIN" -- . ':!proof-of-work'; then
  TREE_OK=true
fi

node -e '
const fs = require("fs");
const meta = {
  pinnedProductCommit: process.argv[1],
  headAtRun: process.argv[2],
  productTreeMatchesPin: process.argv[3] === "true",
  node: process.argv[4],
  npm: process.argv[5],
  platform: process.argv[6],
  ciNodePin: "20",
  startedAt: process.argv[7],
};
fs.writeFileSync(process.argv[8], JSON.stringify(meta, null, 2) + "\n");
' "$PIN" "$HEAD_AT_RUN" "$TREE_OK" "$NODE_VER" "$NPM_VER" "$PLATFORM" "$STARTED" "$LOG/run-meta.json"

run_step npm-ci npm ci --no-audit --no-fund
if [[ "$LAST_CODE" -ne 0 ]]; then
  echo "npm ci failed; stopping before tests." >&2
  exit 1
fi

run_step build npm run build
run_step signing-check npm run signing:check
run_step auth-guard-check npm run auth:guard-check
run_step auth-check npm run auth:check
run_step auth-oidc-check npm run auth:oidc-check
run_step claim-audit npm run claim:audit
run_step stripe-guard-check npm run stripe:guard-check
run_step health-check npm run health:check
run_step evals-local npm run evals:local

start_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
start="$(node -e 'process.stdout.write(new Date().toISOString())')"
node server/index.mjs >"$LOG/api-server.log" 2>&1 &
API_PID=$!
health_code=1
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1:4175/api/health >/dev/null; then
    health_code=0
    echo "api healthy pid ${API_PID}" | tee -a "$LOG/api-server.log"
    break
  fi
  sleep 1
done
if [[ "$health_code" -ne 0 ]]; then
  echo "api did not become healthy" | tee -a "$LOG/api-server.log"
fi
finish="$(node -e 'process.stdout.write(new Date().toISOString())')"
end_ms="$(node -e 'process.stdout.write(String(Date.now()))')"
node "$POW/harness/append-step.mjs" \
  --id api-health \
  --code "$health_code" \
  --start "$start" \
  --finish "$finish" \
  --start-ms "$start_ms" \
  --end-ms "$end_ms" \
  --log "$LOG/api-server.log" \
  --cwd "$ROOT" \
  -- curl -sf http://127.0.0.1:4175/api/health

run_step conformance npm run conformance
run_step crosswalk-check npm run crosswalk:check
run_step compliance-check npm run compliance:check
run_step tck-check npm run tck:check

if [[ -n "${API_PID}" ]] && kill -0 "$API_PID" 2>/dev/null; then
  kill "$API_PID" 2>/dev/null || true
  wait "$API_PID" 2>/dev/null || true
fi
API_PID=""

# Read the pinned product, not files the suite rewrote, while the logs keep the suite output.
restore_product

set +e
node "$POW/harness/adversarial.mjs" "$LOG/adversarial.json" >"$LOG/adversarial.stdout.log" 2>&1
adv_code=$?
set -e
echo "adversarial harness exit ${adv_code}"
if [[ "$adv_code" -ne 0 ]]; then
  echo "adversarial harness crashed; see logs/adversarial.stdout.log" >&2
  exit 1
fi

node "$POW/harness/assemble.mjs"

echo
echo "Results: proof-of-work/results.json"
echo "Manifest: proof-of-work/manifest.sha256"
echo "Demo: proof-of-work/demo.html"
