import csv
from datetime import datetime
from pathlib import Path

FIELDNAMES = ["id", "text", "scheduled_time", "status", "posted_at", "post_urn", "error"]

# scheduled_time format: "YYYY-MM-DD HH:MM" interpreted in the local timezone
# of the machine that runs the scheduler.
TIME_FORMAT = "%Y-%m-%d %H:%M"


def load_rows(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(f"Posts file not found: {path}")
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = []
        for row in reader:
            for field in FIELDNAMES:
                row.setdefault(field, "")
            rows.append(row)
        return rows


def save_rows(path: Path, rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def due_pending_rows(rows: list[dict], now: datetime) -> list[dict]:
    due = []
    for row in rows:
        if row.get("status", "").strip().lower() not in ("", "pending"):
            continue
        scheduled = row.get("scheduled_time", "").strip()
        if not scheduled:
            continue
        try:
            scheduled_dt = datetime.strptime(scheduled, TIME_FORMAT)
        except ValueError:
            row["status"] = "error"
            row["error"] = f"Unparseable scheduled_time: {scheduled!r}"
            continue
        if scheduled_dt <= now:
            due.append(row)
    return due
