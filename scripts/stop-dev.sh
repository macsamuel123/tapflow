#!/usr/bin/env bash
# Stop the API (:8000) and web (:3000) dev servers started by `make dev`.
# Only touches processes belonging to this repo; never kills unrelated apps on those ports.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORTS=(8000 3000)

# 1. concurrently -k tree-kills both children on SIGTERM.
pkill -TERM -f "concurrently.*-n api,web" 2>/dev/null && echo "Stopped make dev (concurrently)"

# 2. Fallback: anything still listening on our ports whose cwd is inside this repo.
for _ in {1..20}; do
  pids=()
  for port in "${PORTS[@]}"; do
    for pid in $(lsof -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null); do
      cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
      [[ "$cwd" == "$ROOT"* ]] && pids+=("$pid")
    done
  done
  ((${#pids[@]} == 0)) && { echo "API and web dev servers stopped"; exit 0; }
  kill -TERM "${pids[@]}" 2>/dev/null
  sleep 0.5
done

echo "Force-killing: ${pids[*]}"
kill -KILL "${pids[@]}" 2>/dev/null
exit 0
