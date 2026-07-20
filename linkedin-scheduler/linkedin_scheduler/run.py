"""
Checks the posts queue for due, unposted rows and publishes them.

Meant to be run periodically (e.g. via cron every 10-15 minutes), not left
running continuously. Safe to run repeatedly: each row is marked 'posted' or
'error' immediately after the attempt, so already-handled rows are skipped.

Usage:
    python -m linkedin_scheduler.run [--posts posts.csv] [--dry-run]
"""
import argparse
import logging
from datetime import datetime
from pathlib import Path

from . import config
from .client import LinkedInClient
from .queue import due_pending_rows, load_rows, save_rows

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.FileHandler(config.LOG_PATH), logging.StreamHandler()],
)
log = logging.getLogger("linkedin_scheduler")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--posts", default=str(config.DEFAULT_POSTS_PATH))
    parser.add_argument("--dry-run", action="store_true", help="Don't actually post, just show what would happen.")
    args = parser.parse_args()

    posts_path = Path(args.posts)

    rows = load_rows(posts_path)
    now = datetime.now()
    due = due_pending_rows(rows, now)

    if not due:
        log.info("No due posts.")
        save_rows(posts_path, rows)  # persist any rows marked 'error' for bad timestamps
        return

    log.info("Found %d due post(s).", len(due))

    client = None
    if not args.dry_run:
        client = LinkedInClient()

    for row in due:
        preview = row["text"][:60].replace("\n", " ")
        if args.dry_run:
            log.info("[DRY RUN] Would post id=%s: %s...", row["id"], preview)
            continue
        try:
            urn = client.create_post(row["text"])
            row["status"] = "posted"
            row["posted_at"] = now.strftime("%Y-%m-%d %H:%M:%S")
            row["post_urn"] = urn
            row["error"] = ""
            log.info("Posted id=%s -> %s", row["id"], urn)
        except Exception as exc:  # noqa: BLE001 - log and continue with remaining posts
            row["status"] = "error"
            row["error"] = str(exc)
            log.error("Failed to post id=%s: %s", row["id"], exc)

    if not args.dry_run:
        save_rows(posts_path, rows)


if __name__ == "__main__":
    main()
