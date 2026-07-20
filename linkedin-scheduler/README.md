# LinkedIn Post Scheduler

Schedules and posts a queue of text posts to your own LinkedIn profile feed,
using LinkedIn's official Posts API. Meant to be run periodically via cron —
not a long-running daemon.

## 1. Register a LinkedIn app

1. Go to https://www.linkedin.com/developers/apps and click **Create app**.
2. LinkedIn requires every app to be linked to a **LinkedIn Page**. If you
   don't have one, create a minimal company page first (developers.linkedin.com
   will prompt you) — you won't post there, it's just an app-registration
   requirement.
3. In your app's **Products** tab, add:
   - **Sign In with LinkedIn using OpenID Connect**
   - **Share on LinkedIn**

   Both are self-serve / instant-approve — no partner review needed for
   posting to your own profile.
4. In the **Auth** tab, note your **Client ID** and **Client Secret**, and
   add an **Authorized redirect URL**: `http://localhost:8765/callback`
   (must match exactly what's in `.env`).

## 2. Install and configure

```bash
cd linkedin-scheduler
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# edit .env: paste in LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET
```

## 3. Authorize once

```bash
python -m linkedin_scheduler.auth
```

This opens your browser to LinkedIn's consent screen, then captures the
redirect on `localhost:8765` and exchanges it for an access token, saved to
`token.json` (gitignored — never commit this file).

LinkedIn access tokens from this flow are valid for ~60 days and don't
silently refresh. When it expires, `run.py` will fail with an auth error —
just re-run `python -m linkedin_scheduler.auth`.

## 4. Fill in your posts

Copy `posts.example.csv` to `posts.csv` and edit it — one row per post:

| column | meaning |
|---|---|
| `id` | any unique identifier |
| `text` | the post content |
| `scheduled_time` | `YYYY-MM-DD HH:MM`, interpreted in the **local timezone of the machine running the scheduler** |
| `status` | leave as `pending`; the script fills in `posted` or `error` |
| `posted_at`, `post_urn`, `error` | filled in automatically |

## 5. Test with a dry run

```bash
python -m linkedin_scheduler.run --posts posts.csv --dry-run
```

Shows what would be posted without calling the API. Backdate one row's
`scheduled_time` to confirm it's picked up as due.

## 6. Run for real, on a schedule

```bash
python -m linkedin_scheduler.run --posts posts.csv
```

Each run scans `posts.csv` for rows that are `pending` and whose
`scheduled_time` has passed, posts them, and marks each row `posted` (with
the LinkedIn post URN) or `error` (with the failure reason) immediately —
so it's safe to run repeatedly/on a timer without double-posting.

Add a cron entry to check every 15 minutes:

```
*/15 * * * * cd /full/path/to/linkedin-scheduler && ./venv/bin/python -m linkedin_scheduler.run --posts posts.csv >> cron.log 2>&1
```

Logs also go to `scheduler.log` in this directory.

## Notes / limitations

- Posts go to your **personal profile's main feed**, public visibility.
- No image/media attachments in this version — text posts only. LinkedIn's
  Posts API supports images/video via a separate upload step if you want
  that added later.
- If a scheduled time is missed entirely (e.g. your machine was off, or cron
  wasn't running), the post still fires on the next run, whenever that is —
  there's no "give up if too late" cutoff. Say if you want that added.
- Respect LinkedIn's platform policies: this posts on your behalf with your
  own approved app credentials, at your explicit direction, which is exactly
  what the "Share on LinkedIn" product is for. Avoid content/timing patterns
  that look like spam (e.g. don't blast dozens of posts in one hour).
