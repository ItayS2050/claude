#!/usr/bin/env python3
"""
Claude Code PostToolUse hook.
Silently logs every significant tool use to ~/.activity_log/events.jsonl.

Wire it up in ~/.claude/settings.json:
  "PostToolUse": [{"matcher": "", "hooks": [{"type": "command", "command": "python3 /home/user/claude/diary/log_hook.py"}]}]
"""

import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Tools too noisy to log individually
SKIP_TOOLS = {"Read", "Glob", "Grep", "ToolSearch"}


def main():
    log_dir = Path.home() / ".activity_log"
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / "events.jsonl"

    try:
        data = json.load(sys.stdin)
    except Exception:
        return  # Never crash the main Claude process

    tool_name = data.get("tool_name", "")
    if tool_name in SKIP_TOOLS:
        return

    tool_input = data.get("tool_input", {})
    session_id = data.get("session_id", "")

    event = {
        "timestamp": datetime.now().isoformat(),
        "session": session_id[:8] if session_id else "",
        "tool": tool_name,
        "cwd": os.getcwd(),
    }

    if tool_name == "Bash":
        event["command"] = tool_input.get("command", "")[:500]
        event["description"] = tool_input.get("description", "")
    elif tool_name in ("Edit", "Write"):
        event["file"] = tool_input.get("file_path", "")
    elif tool_name == "Agent":
        event["description"] = tool_input.get("description", "")[:200]
        event["agent_type"] = tool_input.get("subagent_type", "general")
    elif tool_name == "Skill":
        event["skill"] = tool_input.get("skill", "")
    elif tool_name == "WebSearch":
        event["query"] = tool_input.get("query", "")[:200]
    elif tool_name == "WebFetch":
        event["url"] = tool_input.get("url", "")[:200]

    try:
        with open(log_file, "a") as f:
            f.write(json.dumps(event) + "\n")
    except Exception:
        pass  # Never fail


if __name__ == "__main__":
    main()
