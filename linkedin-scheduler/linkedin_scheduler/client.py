import json
import time

import requests

from . import config

USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
POSTS_URL = "https://api.linkedin.com/rest/posts"


class LinkedInAuthError(RuntimeError):
    pass


class LinkedInClient:
    def __init__(self):
        if not config.TOKEN_PATH.exists():
            raise LinkedInAuthError(
                "No token.json found. Run `python -m linkedin_scheduler.auth` first."
            )
        token_data = json.loads(config.TOKEN_PATH.read_text())
        self.access_token = token_data["access_token"]

        obtained_at = token_data.get("obtained_at", 0)
        expires_in = token_data.get("expires_in", 0)
        if obtained_at and expires_in and time.time() > obtained_at + expires_in:
            raise LinkedInAuthError(
                "Access token has expired. Run `python -m linkedin_scheduler.auth` again."
            )

        self._member_urn = None

    def _headers(self, extra=None):
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "X-Restli-Protocol-Version": "2.0.0",
        }
        if extra:
            headers.update(extra)
        return headers

    def get_member_urn(self) -> str:
        if self._member_urn:
            return self._member_urn
        resp = requests.get(USERINFO_URL, headers=self._headers(), timeout=30)
        resp.raise_for_status()
        member_id = resp.json()["sub"]
        self._member_urn = f"urn:li:person:{member_id}"
        return self._member_urn

    def create_post(self, text: str) -> str:
        """Publish a text post to the authenticated member's own feed.

        Returns the created post's URN (from the response's x-linkedin-id / x-restli-id header).
        """
        body = {
            "author": self.get_member_urn(),
            "commentary": text,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": [],
            },
            "lifecycleState": "PUBLISHED",
            "isReshareDisabledByAuthor": False,
        }
        resp = requests.post(
            POSTS_URL,
            headers=self._headers({"LinkedIn-Version": config.API_VERSION, "Content-Type": "application/json"}),
            data=json.dumps(body),
            timeout=30,
        )
        if resp.status_code >= 300:
            raise RuntimeError(f"LinkedIn API error {resp.status_code}: {resp.text}")
        return resp.headers.get("x-restli-id") or resp.headers.get("x-linkedin-id") or ""
