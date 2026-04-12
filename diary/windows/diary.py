#!/usr/bin/env python3
"""
Windows Activity Diary Generator
Reads browser history, active window log, PowerShell history, and recent
files, then uses Claude API to write a natural-language diary entry.

Requirements:
    pip install anthropic
    set ANTHROPIC_API_KEY=sk-ant-...   (or export on Mac/Linux)

Usage:
    python diary.py                 # What did I do today?
    python diary.py yesterday
    python diary.py last-week
    python diary.py 2026-04-11      # A specific date
    python diary.py today --raw     # Show raw collected data (no AI)
"""

import argparse
import datetime
import json
import os
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path


# ---------------------------------------------------------------------------
# Time period parsing
# ---------------------------------------------------------------------------

def parse_period(period_str: str):
    today = datetime.date.today()
    if period_str == "today":
        since = datetime.datetime.combine(today, datetime.time.min)
        until = datetime.datetime.now()
    elif period_str == "yesterday":
        yest = today - datetime.timedelta(days=1)
        since = datetime.datetime.combine(yest, datetime.time.min)
        until = datetime.datetime.combine(today, datetime.time.min)
    elif period_str in ("last-week", "week"):
        since = datetime.datetime.combine(
            today - datetime.timedelta(days=7), datetime.time.min
        )
        until = datetime.datetime.now()
    else:
        try:
            d = datetime.datetime.strptime(period_str, "%Y-%m-%d").date()
            since = datetime.datetime.combine(d, datetime.time.min)
            until = datetime.datetime.combine(d + datetime.timedelta(days=1), datetime.time.min)
        except ValueError:
            print(f"Unknown period '{period_str}'. Use: today, yesterday, last-week, YYYY-MM-DD")
            sys.exit(1)
    return since, until


def period_label(period_str: str, since: datetime.datetime, until: datetime.datetime) -> str:
    return {
        "today": "today",
        "yesterday": "yesterday",
        "last-week": "the past week",
        "week": "the past week",
    }.get(period_str, f"{since:%Y-%m-%d} to {until:%Y-%m-%d}")


# ---------------------------------------------------------------------------
# Browser history  (Chrome / Edge / Firefox)
# ---------------------------------------------------------------------------

# Chrome / Edge store timestamps as microseconds since 1601-01-01
_CHROME_EPOCH = datetime.datetime(1601, 1, 1)

def _chrome_ts(us: int) -> datetime.datetime:
    return _CHROME_EPOCH + datetime.timedelta(microseconds=us)

def _dt_to_chrome_ts(dt: datetime.datetime) -> int:
    return int((dt - _CHROME_EPOCH).total_seconds() * 1_000_000)


def _read_chromium_db(db_path: Path, since: datetime.datetime, until: datetime.datetime) -> list[dict]:
    """Read visit history from a Chrome/Edge History SQLite file."""
    if not db_path.exists():
        return []

    since_ts = _dt_to_chrome_ts(since)
    until_ts = _dt_to_chrome_ts(until)

    # Must copy — Chrome locks the file while it's open
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        shutil.copy2(str(db_path), tmp_path)
        conn = sqlite3.connect(tmp_path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT v.visit_time, u.url, u.title
              FROM visits v
              JOIN urls u ON v.url = u.id
             WHERE v.visit_time >= ? AND v.visit_time <= ?
             ORDER BY v.visit_time
            """,
            (since_ts, until_ts),
        ).fetchall()
        conn.close()
        return [
            {
                "time": _chrome_ts(r["visit_time"]).strftime("%H:%M"),
                "url":  r["url"],
                "title": (r["title"] or r["url"])[:120],
            }
            for r in rows
        ]
    except Exception:
        return []
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _read_firefox_db(since: datetime.datetime, until: datetime.datetime) -> list[dict]:
    """Read visit history from Firefox's places.sqlite."""
    appdata = os.environ.get("APPDATA", "")
    profiles_dir = Path(appdata) / "Mozilla" / "Firefox" / "Profiles"
    if not profiles_dir.exists():
        return []

    candidates = list(profiles_dir.glob("*.default-release")) + list(profiles_dir.glob("*.default"))
    if not candidates:
        return []

    db_path = candidates[0] / "places.sqlite"
    if not db_path.exists():
        return []

    # Firefox timestamps: Unix microseconds
    since_us = int(since.timestamp() * 1_000_000)
    until_us = int(until.timestamp() * 1_000_000)

    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        shutil.copy2(str(db_path), tmp_path)
        conn = sqlite3.connect(tmp_path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT h.visit_date, p.url, p.title
              FROM moz_historyvisits h
              JOIN moz_places p ON h.place_id = p.id
             WHERE h.visit_date >= ? AND h.visit_date <= ?
             ORDER BY h.visit_date
            """,
            (since_us, until_us),
        ).fetchall()
        conn.close()
        return [
            {
                "time": datetime.datetime.fromtimestamp(r["visit_date"] / 1_000_000).strftime("%H:%M"),
                "url":  r["url"],
                "title": (r["title"] or r["url"])[:120],
            }
            for r in rows
        ]
    except Exception:
        return []
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


_SKIP_URL_PREFIXES = ("chrome://", "edge://", "about:", "chrome-extension://", "data:")

def collect_browser_history(since: datetime.datetime, until: datetime.datetime) -> list[dict]:
    local = os.environ.get("LOCALAPPDATA", "")
    chrome_db = Path(local) / "Google"    / "Chrome" / "User Data" / "Default" / "History"
    edge_db   = Path(local) / "Microsoft" / "Edge"   / "User Data" / "Default" / "History"

    visits = (
        _read_chromium_db(chrome_db, since, until)
        + _read_chromium_db(edge_db,   since, until)
        + _read_firefox_db(since, until)
    )

    # Deduplicate and strip internal browser URLs
    seen: set[tuple] = set()
    result = []
    for v in visits:
        if any(v["url"].startswith(p) for p in _SKIP_URL_PREFIXES):
            continue
        key = (v["time"], v["url"][:80])
        if key not in seen:
            seen.add(key)
            result.append(v)

    return result


# ---------------------------------------------------------------------------
# Active window log  (written by track.ps1)
# ---------------------------------------------------------------------------

def collect_window_events(since: datetime.datetime, until: datetime.datetime) -> list[dict]:
    log_file = Path.home() / ".activity_log" / "windows_events.jsonl"
    if not log_file.exists():
        return []

    raw = []
    with open(log_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                e = json.loads(line)
                ts = datetime.datetime.fromisoformat(e["timestamp"])
                if since <= ts <= until:
                    raw.append(e)
            except Exception:
                continue

    # Compress consecutive identical process+title entries to reduce noise
    compressed = []
    prev_key = None
    for e in raw:
        key = (e.get("process"), e.get("window", "")[:60])
        if key != prev_key:
            compressed.append(e)
            prev_key = key

    return compressed


# ---------------------------------------------------------------------------
# PowerShell history  (no timestamps — best-effort recent commands)
# ---------------------------------------------------------------------------

def collect_ps_history(since: datetime.datetime, until: datetime.datetime) -> list[str]:
    # PSReadLine history file location
    hist_file = (
        Path(os.environ.get("APPDATA", ""))
        / "Microsoft" / "Windows" / "PowerShell"
        / "PSReadLine" / "ConsoleHost_history.txt"
    )
    if not hist_file.exists():
        return []

    # No timestamps in the file, so only include for recent queries
    days_back = (datetime.datetime.now() - since).days
    if days_back > 7:
        return []

    lines = hist_file.read_text(encoding="utf-8", errors="ignore").splitlines()
    seen: set[str] = set()
    commands = []
    for line in reversed(lines):
        line = line.strip()
        if line and line not in seen and len(line) > 2:
            seen.add(line)
            commands.append(line)
            if len(commands) >= 60:
                break

    return list(reversed(commands))


# ---------------------------------------------------------------------------
# Recent files  (%APPDATA%\Microsoft\Windows\Recent)
# ---------------------------------------------------------------------------

def collect_recent_files(since: datetime.datetime, until: datetime.datetime) -> list[dict]:
    recent_dir = (
        Path(os.environ.get("APPDATA", ""))
        / "Microsoft" / "Windows" / "Recent"
    )
    if not recent_dir.exists():
        return []

    since_ts = since.timestamp()
    until_ts = until.timestamp()
    files = []
    for p in recent_dir.iterdir():
        try:
            mtime = p.stat().st_mtime
            if since_ts <= mtime <= until_ts and p.suffix.lower() == ".lnk":
                files.append({
                    "name": p.stem,
                    "time": datetime.datetime.fromtimestamp(mtime).strftime("%H:%M"),
                })
        except OSError:
            continue

    return sorted(files, key=lambda x: x["time"])


# ---------------------------------------------------------------------------
# Format raw context for the AI prompt
# ---------------------------------------------------------------------------

def build_context(windows: list, browser: list, ps_cmds: list, recent: list) -> str:
    parts = []

    if windows:
        parts.append("### Apps / Windows Used")
        for w in windows[:100]:
            ts   = w["timestamp"][11:16]
            proc = w.get("process", "")
            title = w.get("window", "")[:90]
            line = f"- [{ts}] {proc}"
            if title and title.lower() != proc.lower():
                line += f": {title}"
            parts.append(line)

    if browser:
        parts.append("\n### Browser Activity")
        for v in browser[:150]:
            parts.append(f"- [{v['time']}] {v['title']}")

    if ps_cmds:
        parts.append("\n### PowerShell Commands")
        for cmd in ps_cmds[:40]:
            parts.append(f"- {cmd[:120]}")

    if recent:
        parts.append("\n### Recently Opened Files")
        for f in recent:
            parts.append(f"- [{f['time']}] {f['name']}")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Claude API diary generation
# ---------------------------------------------------------------------------

def generate_diary(
    period_str: str,
    since: datetime.datetime,
    until: datetime.datetime,
    windows: list,
    browser: list,
    ps_cmds: list,
    recent: list,
) -> str:
    try:
        import anthropic
    except ImportError:
        print("Error: anthropic not installed. Run:  pip install anthropic")
        sys.exit(1)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY not set.")
        print("  Windows: setx ANTHROPIC_API_KEY sk-ant-...")
        print("  (then restart your terminal)")
        sys.exit(1)

    context = build_context(windows, browser, ps_cmds, recent)
    plabel = period_label(period_str, since, until)

    if not context.strip():
        return (
            f"No activity data found for {plabel}.\n\n"
            "Make sure:\n"
            "  1. setup.ps1 has been run once to start the window tracker\n"
            "  2. ANTHROPIC_API_KEY is set\n"
            "  3. The tracker has had time to collect data"
        )

    prompt = f"""Here is a log of my Windows computer activity for {plabel}:

{context}

Write a first-person diary entry summarizing what I did. Be natural and conversational.
Group related activities together (e.g. work blocks, browsing sessions, file editing).
Highlight accomplishments and main topics explored.
Start with the date as a heading. Keep it to 4–6 paragraphs."""

    client = anthropic.Anthropic(api_key=api_key)
    msg = client.messages.create(
        model="claude-opus-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Generate a diary of your Windows computer activity",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "period", nargs="?", default="today",
        help="today (default), yesterday, last-week, or YYYY-MM-DD",
    )
    parser.add_argument("--raw", action="store_true", help="Print raw data, skip AI generation")
    args = parser.parse_args()

    since, until = parse_period(args.period)
    plabel = period_label(args.period, since, until)
    print(f"Collecting activity for {plabel}  ({since:%Y-%m-%d %H:%M} → {until:%Y-%m-%d %H:%M})")

    windows  = collect_window_events(since, until)
    browser  = collect_browser_history(since, until)
    ps_cmds  = collect_ps_history(since, until)
    recent   = collect_recent_files(since, until)

    print(
        f"  {len(windows)} window events  |  {len(browser)} browser visits  |  "
        f"{len(ps_cmds)} shell commands  |  {len(recent)} recent files\n"
    )

    if args.raw:
        ctx = build_context(windows, browser, ps_cmds, recent)
        print(ctx if ctx.strip() else "(no data found for this period)")
        return

    print(generate_diary(args.period, since, until, windows, browser, ps_cmds, recent))


if __name__ == "__main__":
    main()
