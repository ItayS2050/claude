"""
One-time interactive OAuth flow to obtain a LinkedIn access token.

Usage:
    python -m linkedin_scheduler.auth

Requires LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET / LINKEDIN_REDIRECT_URI
in a .env file (see .env.example). The redirect URI's host:port must match
what's registered in your LinkedIn app's "Auth" tab exactly.
"""
import json
import secrets
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

import requests

from . import config

AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization"
TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"


class _CallbackHandler(BaseHTTPRequestHandler):
    result = {}

    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        _CallbackHandler.result["code"] = params.get("code", [None])[0]
        _CallbackHandler.result["state"] = params.get("state", [None])[0]
        _CallbackHandler.result["error"] = params.get("error_description", [None])[0]

        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        if _CallbackHandler.result.get("code"):
            body = b"<h2>Authorized. You can close this tab and return to the terminal.</h2>"
        else:
            body = b"<h2>Authorization failed. Check the terminal for details.</h2>"
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass  # silence default request logging


def _run_local_server(port: int, timeout_seconds: int = 300):
    server = HTTPServer(("localhost", port), _CallbackHandler)
    server.timeout = timeout_seconds
    server.handle_request()
    return dict(_CallbackHandler.result)


def main():
    if not config.CLIENT_ID or not config.CLIENT_SECRET:
        raise SystemExit(
            "Missing LINKEDIN_CLIENT_ID / LINKEDIN_CLIENT_SECRET. "
            "Copy .env.example to .env and fill them in first."
        )

    redirect = urlparse(config.REDIRECT_URI)
    port = redirect.port or 8765

    state = secrets.token_urlsafe(16)
    auth_params = {
        "response_type": "code",
        "client_id": config.CLIENT_ID,
        "redirect_uri": config.REDIRECT_URI,
        "state": state,
        "scope": config.SCOPES,
    }
    auth_url = f"{AUTHORIZE_URL}?{urlencode(auth_params)}"

    print("Opening browser for LinkedIn authorization...")
    print(f"If it doesn't open automatically, visit:\n  {auth_url}\n")
    webbrowser.open(auth_url)

    result = _run_local_server(port)

    if result.get("error"):
        raise SystemExit(f"Authorization failed: {result['error']}")
    if not result.get("code"):
        raise SystemExit("Timed out waiting for authorization redirect.")
    if result.get("state") != state:
        raise SystemExit("State mismatch — possible CSRF, aborting.")

    token_resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": result["code"],
            "redirect_uri": config.REDIRECT_URI,
            "client_id": config.CLIENT_ID,
            "client_secret": config.CLIENT_SECRET,
        },
        timeout=30,
    )
    token_resp.raise_for_status()
    token_data = token_resp.json()
    token_data["obtained_at"] = int(time.time())

    config.TOKEN_PATH.write_text(json.dumps(token_data, indent=2))
    expires_days = token_data.get("expires_in", 0) // 86400
    print(f"Saved token to {config.TOKEN_PATH} (valid ~{expires_days} days).")
    print("Re-run this script when it expires — LinkedIn 3-legged tokens don't silently refresh.")


if __name__ == "__main__":
    main()
