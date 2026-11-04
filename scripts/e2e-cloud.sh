#!/usr/bin/env bash
# The shared demo flow against local Supabase, with its keys read from the running stack.
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(pnpm exec supabase status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
export NEXT_PUBLIC_DEMO_MODE=true NEXT_PUBLIC_DEMO_CLOUD=true
export NEXT_PUBLIC_SUPABASE_URL="$API_URL" NEXT_PUBLIC_SUPABASE_ANON_KEY="$ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export DEMO_ADMIN_SECRET=local-test-secret CRON_SECRET=local-cron-secret
export API_INTERNAL_URL=http://127.0.0.1:9
pnpm --dir web exec playwright test --config playwright.cloud.config.ts "$@"
