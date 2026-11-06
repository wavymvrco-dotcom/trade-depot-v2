#!/usr/bin/env bash
# Update the server to the latest code on the deploy branch and restart.
# Run on the VPS as the tradedepot user:  /opt/trade-depot/deploy/deploy.sh
set -euo pipefail
cd /opt/trade-depot
BRANCH="${DEPLOY_BRANCH:-main}"
git fetch --quiet origin "$BRANCH"
git checkout --quiet "$BRANCH"
git reset --quiet --hard "origin/$BRANCH"
npm ci --include=dev --no-audit --no-fund
npm run build
# Database migrations (reviewed SQL in migrations/), using the env file's DATABASE_URL
set -a; . /etc/trade-depot.env; set +a
npm run db:migrate
sudo systemctl restart trade-depot-worker trade-depot-web
sleep 3
curl -fsS http://127.0.0.1:5000/api/version >/dev/null && echo "deployed: $(git log --oneline -1)"
