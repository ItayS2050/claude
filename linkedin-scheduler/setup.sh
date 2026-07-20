#!/usr/bin/env bash
# One-shot setup for the LinkedIn Post Scheduler.
# Run this, answer the prompts, and you're done: venv + deps + .env +
# one-time LinkedIn authorization + (optionally) the cron job.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
DIR="$(pwd)"

echo "== LinkedIn Post Scheduler setup =="
echo "Working in: $DIR"
echo

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is not installed. Install it first (e.g. from python.org) and re-run this script."
  exit 1
fi

if [ ! -d venv ]; then
  echo "-- Creating virtual environment..."
  python3 -m venv venv
fi

echo "-- Installing dependencies..."
./venv/bin/pip install -q --upgrade pip
./venv/bin/pip install -q -r requirements.txt

if [ ! -f .env ]; then
  echo
  echo "-- LinkedIn app credentials (from the Auth tab on developer.linkedin.com) --"
  read -r -p "Client ID: " CLIENT_ID
  read -r -s -p "Client Secret (input hidden): " CLIENT_SECRET
  echo
  cat > .env <<EOF
LINKEDIN_CLIENT_ID=$CLIENT_ID
LINKEDIN_CLIENT_SECRET=$CLIENT_SECRET
LINKEDIN_REDIRECT_URI=http://localhost:8765/callback
EOF
  echo "Saved to .env"
else
  echo "-- .env already exists, skipping credential prompt."
fi

if [ ! -f posts.csv ]; then
  cp posts.example.csv posts.csv
  echo "-- Created posts.csv from the template. Edit it with your real post text and times before going live."
fi

echo
read -r -p "Authorize with LinkedIn now? This opens your browser. [Y/n] " DO_AUTH
if [[ ! "$DO_AUTH" =~ ^[Nn] ]]; then
  ./venv/bin/python -m linkedin_scheduler.auth
fi

echo
read -r -p "Install a cron job to check for due posts every 15 minutes? [Y/n] " DO_CRON
if [[ ! "$DO_CRON" =~ ^[Nn] ]]; then
  CRON_CMD="*/15 * * * * cd $DIR && $DIR/venv/bin/python -m linkedin_scheduler.run --posts $DIR/posts.csv >> $DIR/cron.log 2>&1"
  if crontab -l 2>/dev/null | grep -qF "linkedin_scheduler.run --posts $DIR/posts.csv"; then
    echo "-- Cron entry already installed, skipping."
  else
    (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
    echo "-- Cron job installed (runs every 15 minutes)."
  fi
fi

echo
echo "== Done =="
echo "Next: edit posts.csv with your real posts, then check it worked with:"
echo "  ./venv/bin/python -m linkedin_scheduler.run --posts posts.csv --dry-run"
