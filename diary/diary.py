#!/usr/bin/env python3
"""
Activity Diary Generator
Reads your activity log + git history and uses Claude to write a diary entry.

Usage:
  python diary.py                  # What did I do today?
  python diary.py yesterday        # Yesterday's diary
  python diary.py last-week        # Past 7 days
  python diary.py 2026-04-10       # A specific day
  python diary.py --raw yesterday  # Show raw collected data (no AI)
  python diary.py --add-repo /path/to/repo  # Track a git repo
"""

import argparse
import json
import os
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

LOG_FILE = Path.home() / ".activity_log" / "events.jsonl"
REPOS_FILE = Path.home() / ".activity_log" / "repos.txt"


# ---------------------------------------------------------------------------
# Time period parsing
# ---------------------------------------------------------------------------

def parse_period(period_str: str):
    """Return (since_dt, until_dt) for the requested period."""
    today = date.today()

    if period_str in ("today",):
        since = datetime.combine(today, datetime.min.time())
        until = datetime.now()
    elif period_str == "yesterday":
        yesterday = today - timedelta(days=1)
        since = datetime.combine(yesterday, datetime.min.time())
        until = datetime.combine(today, datetime.min.time())
    elif period_str in ("last-week", "last_week", "week"):
        since = datetime.combine(today - timedelta(days=7), datetime.min.time())
        until = datetime.now()
    else:
        # Try YYYY-MM-DD
        try:
            d = datetime.strptime(period_str, "%Y-%m-%d").date()
            since = datetime.combine(d, datetime.min.time())
            until = datetime.combine(d + timedelta(days=1), datetime.min.time())
        except ValueError:
            print(f"Unknown period '{period_str}'. Use: today, yesterday, last-week, or YYYY-MM-DD")
            sys.exit(1)

    return since, until


def period_label(period_str: str, since: datetime, until: datetime) -> str:
    labels = {
        "today": "today",
        "yesterday": "yesterday",
        "last-week": "the past week",
        "last_week": "the past week",
        "week": "the past week",
    }
    return labels.get(period_str, f"{since.strftime('%Y-%m-%d')} to {until.strftime('%Y-%m-%d')}")


# ---------------------------------------------------------------------------
# Data collectors
# ---------------------------------------------------------------------------

def collect_hook_events(since: datetime, until: datetime) -> list[dict]:
    """Read events logged by log_hook.py."""
    if not LOG_FILE.exists():
        return []

    events = []
    with open(LOG_FILE) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
                ts = datetime.fromisoformat(event["timestamp"])
                if since <= ts <= until:
                    events.append(event)
            except (json.JSONDecodeError, KeyError, ValueError):
                continue
    return events


def collect_git_activity(since: datetime, until: datetime) -> list[dict]:
    """Collect git commits from tracked repos."""
    repos = []

    # Always include current working directory if it's a git repo
    cwd = Path.cwd()
    git_check = subprocess.run(
        ["git", "rev-parse", "--git-dir"],
        cwd=cwd, capture_output=True, timeout=5
    )
    if git_check.returncode == 0:
        repos.append(str(cwd))

    # Load user-configured repos
    if REPOS_FILE.exists():
        for line in REPOS_FILE.read_text().splitlines():
            line = line.strip()
            if line and line not in repos:
                repos.append(line)

    since_str = since.strftime("%Y-%m-%d %H:%M:%S")
    until_str = until.strftime("%Y-%m-%d %H:%M:%S")
    commits = []

    for repo in repos:
        if not Path(repo).exists():
            continue
        try:
            result = subprocess.run(
                [
                    "git", "log", "--all", "--oneline",
                    "--format=%H|%ai|%s|%an",
                    f"--since={since_str}",
                    f"--until={until_str}",
                ],
                cwd=repo, capture_output=True, text=True, timeout=10,
            )
            if result.returncode == 0:
                for line in result.stdout.strip().splitlines():
                    parts = line.split("|", 3)
                    if len(parts) == 4:
                        commits.append({
                            "repo": Path(repo).name,
                            "hash": parts[0][:8],
                            "time": parts[1],
                            "message": parts[2],
                            "author": parts[3],
                        })
        except (subprocess.TimeoutExpired, FileNotFoundError):
            continue

    return commits


def collect_file_changes(since: datetime, until: datetime) -> list[dict]:
    """Find recently modified non-hidden files in the current project."""
    since_ts = since.timestamp()
    until_ts = until.timestamp()
    changed = []

    scan_root = Path.cwd()
    for p in scan_root.rglob("*"):
        try:
            if not p.is_file():
                continue
            # Skip hidden dirs and common noise
            parts = p.relative_to(scan_root).parts
            if any(part.startswith(".") for part in parts):
                continue
            if any(part in ("node_modules", "__pycache__", "dist", "build") for part in parts):
                continue
            mtime = p.stat().st_mtime
            if since_ts <= mtime <= until_ts:
                changed.append({
                    "path": str(p.relative_to(scan_root)),
                    "modified": datetime.fromtimestamp(mtime).strftime("%H:%M"),
                })
        except (PermissionError, OSError):
            continue

    return changed[:50]  # Cap to avoid flooding the prompt


# ---------------------------------------------------------------------------
# Diary generation via Claude API
# ---------------------------------------------------------------------------

def build_context(events: list, commits: list, files: list) -> str:
    """Format collected data as a readable context block."""
    lines = []

    if commits:
        lines.append("### Git Commits")
        for c in commits:
            lines.append(f"- [{c['time'][:16]}] ({c['repo']}) {c['message']}")

    if events:
        lines.append("\n### Claude Code Actions")
        for e in events:
            ts = e["timestamp"][11:16]  # HH:MM
            tool = e["tool"]
            if tool == "Bash":
                desc = e.get("description") or e.get("command", "")[:80]
                lines.append(f"- [{ts}] Ran: {desc}")
            elif tool in ("Edit", "Write"):
                lines.append(f"- [{ts}] {'Edited' if tool == 'Edit' else 'Wrote'}: {e.get('file', '')}")
            elif tool == "Agent":
                lines.append(f"- [{ts}] Agent task: {e.get('description', '')}")
            elif tool == "Skill":
                lines.append(f"- [{ts}] Used skill: {e.get('skill', '')}")
            elif tool == "WebSearch":
                lines.append(f"- [{ts}] Web search: {e.get('query', '')}")
            elif tool == "WebFetch":
                lines.append(f"- [{ts}] Visited: {e.get('url', '')}")
            else:
                lines.append(f"- [{ts}] {tool}")

    if files:
        lines.append("\n### Modified Files")
        for f in files:
            lines.append(f"- {f['path']} (at {f['modified']})")

    return "\n".join(lines)


def generate_diary(period_str: str, since: datetime, until: datetime,
                   events: list, commits: list, files: list) -> str:
    try:
        import anthropic
    except ImportError:
        print("Error: anthropic package not installed.\nRun: pip install anthropic")
        sys.exit(1)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY environment variable is not set.")
        print("Export it before running: export ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    context = build_context(events, commits, files)
    if not context.strip():
        return (
            f"No activity found for {period_label(period_str, since, until)}.\n\n"
            "Make sure:\n"
            "  1. The PostToolUse hook is configured in ~/.claude/settings.json\n"
            "  2. You have used Claude Code during this period\n"
            "  3. ANTHROPIC_API_KEY is set"
        )

    plabel = period_label(period_str, since, until)
    prompt = f"""Below is a log of my computer activity for {plabel}.

{context}

Write a first-person diary entry summarizing what I did. Be conversational and natural.
Group related activities together. Highlight what was accomplished.
Start with the date/period as a header. Keep it concise (3–6 paragraphs max)."""

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def cmd_add_repo(repo_path: str):
    """Register a git repo to be scanned for commits."""
    path = Path(repo_path).resolve()
    if not (path / ".git").exists():
        print(f"'{path}' does not appear to be a git repository.")
        sys.exit(1)

    (Path.home() / ".activity_log").mkdir(exist_ok=True)
    existing = []
    if REPOS_FILE.exists():
        existing = [l.strip() for l in REPOS_FILE.read_text().splitlines() if l.strip()]

    if str(path) not in existing:
        existing.append(str(path))
        REPOS_FILE.write_text("\n".join(existing) + "\n")
        print(f"Added repo: {path}")
    else:
        print(f"Repo already tracked: {path}")


def main():
    parser = argparse.ArgumentParser(
        description="Generate a diary of your activity",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "period", nargs="?", default="today",
        help="today (default), yesterday, last-week, or YYYY-MM-DD",
    )
    parser.add_argument("--raw", action="store_true", help="Print raw data, skip AI generation")
    parser.add_argument("--add-repo", metavar="PATH", help="Register a git repo to track")
    args = parser.parse_args()

    if args.add_repo:
        cmd_add_repo(args.add_repo)
        return

    since, until = parse_period(args.period)
    plabel = period_label(args.period, since, until)

    print(f"Collecting activity for {plabel}  ({since.strftime('%Y-%m-%d %H:%M')} → {until.strftime('%Y-%m-%d %H:%M')})")

    events = collect_hook_events(since, until)
    commits = collect_git_activity(since, until)
    files = collect_file_changes(since, until)

    print(f"  {len(events)} Claude Code events  |  {len(commits)} git commits  |  {len(files)} modified files\n")

    if args.raw:
        context = build_context(events, commits, files)
        print(context if context.strip() else "(no data found)")
        return

    print(generate_diary(args.period, since, until, events, commits, files))


if __name__ == "__main__":
    main()
