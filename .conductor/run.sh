#!/usr/bin/env bash
set -euo pipefail

run_mode="${1:-web}"
base_port="${INTERVIEW_PREP_CONDUCTOR_PORT:-${CONDUCTOR_PORT:-3000}}"

case "$run_mode" in
  web | check | build) ;;
  *)
    printf '%s\n' "Unknown Conductor run mode: ${run_mode}" >&2
    printf '%s\n' "Expected: web, check, or build." >&2
    exit 1
    ;;
esac

case "$base_port" in
  '' | *[!0-9]*)
    printf '%s\n' "Resolved Conductor base port must be numeric." >&2
    printf '%s\n' "Set INTERVIEW_PREP_CONDUCTOR_PORT=<port> to override it." >&2
    exit 1
    ;;
esac

mkdir -p .context
printf '%s\n' "$base_port" > .context/conductor-web-port

case "$run_mode" in
  web)
    export PORT="$base_port"
    export CONDUCTOR_PORT="$base_port"
    printf '%s\n' "Starting Interview Prep on http://localhost:${base_port}"
    npm run dev -- --port "$base_port"
    ;;
  check)
    npm run check
    ;;
  build)
    npm run build
    ;;
esac
