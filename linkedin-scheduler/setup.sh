#!/usr/bin/env bash
# One-shot setup for the LinkedIn Post Scheduler.
# Run this, answer the prompts, and you're done: venv + deps + .env +
# one-time LinkedIn authorization + (optionally) a recurring schedule.
# Works in a Mac/Linux terminal or in Git Bash on Windows.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
DIR="$(pwd)"

echo "== LinkedIn Post Scheduler setup =="
echo "Working in: $DIR"
echo

PYTHON=""
for candidate in python3 python; do
  if command -v "$candidate" >/dev/null 2>&1; then
    PYTHON="$candidate"
    break
  fi
done
if [ -z "$PYTHON" ]; then
  echo "Python is not installed or not on your PATH."
  echo "Install it from https://www.python.org/downloads/ (on Windows, check"
  echo "\"Add python.exe to PATH\" during install) and re-run this script."
  exit 1
fi

if [ ! -d venv ]; then
  echo "-- Creating virtual environment..."
  "$PYTHON" -m venv venv
fi

# venv layout differs: Scripts/ on Windows, bin/ on Mac/Linux.
if [ -f venv/Scripts/python.exe ]; then
  VENV_PY="venv/Scripts/python.exe"
  VENV_PIP="venv/Scripts/pip.exe"
else
  VENV_PY="venv/bin/python"
  VENV_PIP="venv/bin/pip"
fi

echo "-- Installing dependencies..."
"$VENV_PIP" install -q --upgrade pip
"$VENV_PIP" install -q -r requirements.txt

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
  "$VENV_PY" -m linkedin_scheduler.auth
fi

echo
if command -v crontab >/dev/null 2>&1; then
  read -r -p "Install a cron job to check for due posts every 15 minutes? [Y/n] " DO_CRON
  if [[ ! "$DO_CRON" =~ ^[Nn] ]]; then
    CRON_CMD="*/15 * * * * cd $DIR && $DIR/$VENV_PY -m linkedin_scheduler.run --posts $DIR/posts.csv >> $DIR/cron.log 2>&1"
    if crontab -l 2>/dev/null | grep -qF "linkedin_scheduler.run --posts $DIR/posts.csv"; then
      echo "-- Cron entry already installed, skipping."
    else
      (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
      echo "-- Cron job installed (runs every 15 minutes)."
    fi
  fi
else
  echo "-- No 'cron' on this system (expected on Windows) — set up a recurring run yourself"
  echo "   via Task Scheduler. See README.md 'Windows: Task Scheduler setup' for exact steps"
  echo "   and the command to enter."
fi

echo
echo "== Done =="
echo "Next: edit posts.csv with your real posts, then check it worked with:"
echo "  \"$VENV_PY\" -m linkedin_scheduler.run --posts posts.csv --dry-run"
