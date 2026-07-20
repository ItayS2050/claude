import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

CLIENT_ID = os.environ.get("LINKEDIN_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("LINKEDIN_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("LINKEDIN_REDIRECT_URI", "http://localhost:8765/callback")

TOKEN_PATH = BASE_DIR / "token.json"
DEFAULT_POSTS_PATH = BASE_DIR / "posts.csv"
LOG_PATH = BASE_DIR / "scheduler.log"

SCOPES = "openid w_member_social"
API_VERSION = "202401"
