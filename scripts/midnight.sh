#!/usr/bin/env bash
# Run after midnight Pacific, when the free gemini-3.5-flash quota (20 requests a day) resets.
#   1. grade --all      grades every school not yet graded against its current documents (16 requests)
#   2. verify --all     quote check; writes grades and scores to Supabase
#   3. seed:demo        reseed every school's sample ratings with the final rule, now that every
#                       grade exists, and print the gap spread (no AI requests)
#   4. test:pipeline    independent re-check of every stored grade
#   5. rebuild the ubc-vancouver cached demo answer with gemini-3.5-flash (1 request)
# 17 requests in all, leaving 3 for retries. Stops at the first failing step.
# Usage: bash scripts/midnight.sh
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p logs
LOG="logs/midnight-$(date +%Y%m%d-%H%M%S).log"
R_grade=SKIPPED; R_verify=SKIPPED; R_seed=SKIPPED; R_tests=SKIPPED; R_cache=SKIPPED  # plain variables: macOS bash 3.2 has no associative arrays

echo "Onus midnight run, $(TZ=America/Los_Angeles date '+%Y-%m-%d %H:%M %Z'). Log: $LOG" | tee "$LOG"

run() { # result-variable, label, command...
  local var="$1" label="$2"; shift 2
  echo -e "\n=== $label: $*" | tee -a "$LOG"
  if "$@" 2>&1 | tee -a "$LOG"; then eval "$var=PASS"; return 0; fi
  eval "$var=FAIL"; return 1
}

ok=1
run R_grade grade npm run grade -- --all || ok=0
if [ $ok = 1 ]; then run R_verify verify npm run verify -- --all || ok=0; fi
if [ $ok = 1 ]; then run R_seed seed:demo npm run seed:demo -- --reseed all || ok=0; fi
if [ $ok = 1 ]; then run R_tests test:pipeline npm run test:pipeline || ok=0; fi
if [ $ok = 1 ]; then run R_cache cache npm run build:ask-cache -- ubc-vancouver --model gemini-3.5-flash || ok=0; fi

# Summary
graded=$(grep -cE "^       done in|^shared" "$LOG" || true)
kept=$(grep -c "^kept" "$LOG" || true)
checked=$(grep -E "quotes checked" "$LOG" | tail -1)
unverified=$(grep -E "unverified quotes stored" "$LOG" | tail -1)
tests=$(grep -E "^[0-9]+ passed, [0-9]+ failed" "$LOG" | tail -1)
spread=$(grep -E "^Gap spread:" "$LOG" | tail -1)

echo -e "\n================ SUMMARY ================" | tee -a "$LOG"
printf "  %-15s %s\n" "grade" "$R_grade" "verify" "$R_verify" "seed:demo" "$R_seed" "test:pipeline" "$R_tests" "cache" "$R_cache" | tee -a "$LOG"
echo "  graded this run: $graded   (already current: $kept)" | tee -a "$LOG"
[ -n "$checked" ] && echo "  $checked" | tee -a "$LOG"
[ -n "$unverified" ] && echo "  $unverified" | tee -a "$LOG"
[ -n "$tests" ] && echo "  test:pipeline: $tests" | tee -a "$LOG"
[ -n "$spread" ] && echo "  $spread" | tee -a "$LOG"
if [ $ok = 1 ]; then
  echo "  OVERALL: PASS" | tee -a "$LOG"
else
  echo "  OVERALL: FAIL. Read $LOG. If a step hit the Gemini quota (429), wait for the next reset and run again;" | tee -a "$LOG"
  echo "  grading is resumable, so schools already graded are not graded twice." | tee -a "$LOG"
fi
[ $ok = 1 ]
