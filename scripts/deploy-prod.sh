#!/usr/bin/env bash
# Bump the version in package.json, commit it, push to origin/main, then
# trigger a production deploy via the Vercel REST API.
#
# Usage (from repo root, with main checked out and clean working tree):
#   ./scripts/deploy-prod.sh "Short description"          # patch bump (default)
#   ./scripts/deploy-prod.sh "Short description" patch    # bug fix / minor fix
#   ./scripts/deploy-prod.sh "Short description" minor    # substantive change
#   ./scripts/deploy-prod.sh "Short description" major    # large feature addition
#
# Versioning convention — pick at your own discretion, don't ask the user:
#   MAJOR — large feature addition or a change in the user-facing model.
#   MINOR — substantive change: a single feature, a meaningful UX shift, a
#           refactor with user-visible impact, or a serious behavior-changing fix.
#   PATCH — bug fix, minor fix, copy tweak, dep bump, internal cleanup.
#
# Requires VERCEL_TOKEN in the environment (or in /home/stphn/work/.env).

set -euo pipefail

if [[ -z "${1-}" ]]; then
  echo "Usage: $0 \"Short description\" [patch|minor|major]" >&2
  exit 1
fi
DESC="$1"
BUMP="${2:-patch}"
case "$BUMP" in
  patch|minor|major) ;;
  *) echo "Bump level must be one of: patch, minor, major (got '$BUMP')" >&2; exit 1 ;;
esac

# Load VERCEL_TOKEN from the standard location if not already set.
if [[ -z "${VERCEL_TOKEN-}" && -f /home/stphn/work/.env ]]; then
  # shellcheck disable=SC1091
  source /home/stphn/work/.env
fi
if [[ -z "${VERCEL_TOKEN-}" ]]; then
  echo "VERCEL_TOKEN must be set." >&2
  exit 1
fi

# Verify clean tree on main.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "Refusing to deploy: not on main (currently on $BRANCH)." >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to deploy: working tree has uncommitted changes." >&2
  git status --short >&2
  exit 1
fi

# Bump version.
NEW_VERSION=$(npm version "$BUMP" --no-git-tag-version)
echo "Bumped to $NEW_VERSION ($BUMP)"

git add package.json package-lock.json 2>/dev/null || true
git commit -m "Release $NEW_VERSION: $DESC"
git push origin main

# Trigger production deploy.
TEAM_ID="team_RQ6pjztQEdvy59M2MdbXKq8O"
PROJECT_ID="prj_4eJWJoKYl92YwqpWbScohf2gvifw"
REPO_ID="1221278411"

DEPLOY_ID=$(curl -s -X POST \
  "https://api.vercel.com/v13/deployments?teamId=$TEAM_ID&forceNew=1" \
  -H "Authorization: Bearer $VERCEL_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"daily-do-vercel\",\"project\":\"$PROJECT_ID\",\"target\":\"production\",\"gitSource\":{\"type\":\"github\",\"repoId\":\"$REPO_ID\",\"ref\":\"main\"}}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Deployment: $DEPLOY_ID"
echo "Polling..."
for i in $(seq 1 30); do
  sleep 10
  STATE=$(curl -s "https://api.vercel.com/v13/deployments/$DEPLOY_ID?teamId=$TEAM_ID" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('readyState',''))")
  echo "[$i] $STATE"
  case "$STATE" in
    READY) echo "Live: https://daily-do-vercel.vercel.app/  ($NEW_VERSION)"; exit 0 ;;
    ERROR|CANCELED) echo "Deploy failed: $STATE"; exit 1 ;;
  esac
done
echo "Timed out waiting for deploy." >&2
exit 1
