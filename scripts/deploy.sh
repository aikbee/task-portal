#!/usr/bin/env bash
#
# Deploys Task Portal on the VPS. CI pipes this script over SSH as the site user:
#
#   ssh system-portal-task@host "bash -s -- <commit-sha>" < scripts/deploy.sh
#
# The new release is built beside the running one and swapped in, so the live app is
# only interrupted by the pm2 restart. If the build, the migration or the health check
# fails, the previous release is put back and the deploy exits non-zero.
#
# Overridable: APP_DIR, ENV_FILE, PM2_APP, HEALTH_URL, HEALTH_RETRIES
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$HOME/htdocs/task.system-portal.com}"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"
PM2_APP="${PM2_APP:-task-portal}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3891/api/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
REF="${1:-origin/main}"

# node is installed per-user with nvm and is not on PATH for non-interactive SSH
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; fi

log()  { printf '\n==> %s\n' "$*"; }
fail() { printf '\n!!  %s\n' "$*" >&2; exit 1; }

command -v node >/dev/null || fail "node not found - is nvm installed for $(whoami)?"
command -v pm2  >/dev/null || fail "pm2 not found - install it with: npm install -g pm2"
[ -d "$APP_DIR/.git" ] || fail "$APP_DIR is not a git checkout - run the one-time server setup first"
[ -r "$ENV_FILE" ]     || fail "$ENV_FILE is missing or not readable"
cd "$APP_DIR"

PREV_SHA="$(git rev-parse HEAD)"
DEPS_CHANGED=0
ROLLED_BACK=0

rollback() {
  [ "$ROLLED_BACK" = 1 ] && return 0
  ROLLED_BACK=1
  log "Rolling back to ${PREV_SHA:0:8}"
  git reset --hard --quiet "$PREV_SHA" || true
  rm -rf .next.new
  if [ -d .next.old ]; then
    rm -rf .next
    mv .next.old .next
  fi
  if [ "$DEPS_CHANGED" = 1 ]; then
    npm ci --include=dev --no-audit --no-fund || true
  fi
  pm2 restart "$PM2_APP" --update-env || true
}
trap 'rollback; fail "Deploy failed - previous release restored"' ERR

log "Fetching $REF"
git fetch --prune --quiet origin
git rev-parse --verify --quiet "${REF}^{commit}" >/dev/null || fail "commit $REF not found on this server"
if ! git diff --quiet "$PREV_SHA" "$REF" -- package.json package-lock.json; then
  DEPS_CHANGED=1
fi
git reset --hard --quiet "$REF"
NEW_SHA="$(git rev-parse HEAD)"
log "Deploying ${NEW_SHA:0:8} ($(git log -1 --pretty=%s))"

log "Installing dependencies"
# --include=dev: the build needs Tailwind and the ESLint config, and NODE_ENV is
# production here, which would otherwise skip them.
npm ci --include=dev --no-audit --no-fund

log "Building"
rm -rf .next.new
NEXT_DIST_DIR=.next.new npm run build

log "Applying database migrations"
# --no-seed: schema and migrations only. Never demo data, never demo logins.
# (--reset drops every table and must never appear in a deploy.)
node --env-file="$ENV_FILE" scripts/setup-db.mjs --no-seed

log "Swapping in the new build"
rm -rf .next.old
if [ -d .next ]; then mv .next .next.old; fi
mv .next.new .next

log "Restarting $PM2_APP"
pm2 restart "$PM2_APP" --update-env
pm2 save --force >/dev/null 2>&1 || true

log "Waiting for a healthy response from $HEALTH_URL"
healthy=0
for _ in $(seq 1 "$HEALTH_RETRIES"); do
  if curl -fsS --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then healthy=1; break; fi
  sleep 1
done
if [ "$healthy" != 1 ]; then
  trap - ERR
  rollback
  fail "App did not become healthy within ${HEALTH_RETRIES}s - previous release restored"
fi

trap - ERR
log "Deployed ${NEW_SHA:0:8} successfully"
curl -fsS "$HEALTH_URL" || true
echo
