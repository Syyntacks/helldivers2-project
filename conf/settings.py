# From Diveharder API settings.py file
import os
import requests
from dotenv import load_dotenv
from pathlib import Path
from urllib.parse import unquote

# Find project's root directory and loads the .env file.
env_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path=env_path)


security = {
    "token": os.environ["SECURITY_TOKEN"],
}

ahgs_api = {
    "request_headers": {
        "Accept-Language": "en-US",
        "User-Agent": "Helldivers 2 Community API - api.helldivers2.dev",
    },
    "auth_headers": {
        "Accept-Language": "en-US",
        "User-Agent": "Helldivers 2 Community API - api.helldivers2.dev",
        "Authorization": os.environ["SESSION_TOKEN"],
    },
    "time_delay": int(20),
}


base_url = os.environ["BASE_URL"]

urls = {
    "war": base_url + os.environ["WAR"],
    "major_order": base_url + os.environ["MAJOR_ORDER"],
    "campaigns": base_url + os.environ["CAMPAIGNS"],
    "news_feed": base_url + os.environ["NEWS_FEED"],
    "planets": base_url + os.environ["PLANETS"],
    "planet_events": base_url + os.environ["PLANET_EVENTS"],
    "updates": os.environ["STEAM_NEWS"],
    "space_stations": os.environ["SPACE_STATIONS"]
}