from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from utils.parse_conf.planet_data_parser import PlanetParser
from utils.parse_conf.major_order_parser import MajorOrderParser
from utils.parse_conf.galaxy_stats_parser import parse_galaxy_stats
from utils.parse_conf.data_fetcher import fetch_data_from_url
from conf import settings
import json
import markdown
import os
from datetime import datetime, timezone

def load_static_json_data(file_path):
    base_path = os.path.dirname(os.path.abspath(__file__)) # Gets path of api_source's directory to add to full_path
    full_path = os.path.join(base_path, 'resources', 'json', file_path)

    # Value check before running code
    if not os.path.exists(full_path):
        print(f"Warning: Static JSON file not found at {full_path}")
    
    try:
        # Open the rqeuested .json file
        with open(full_path, 'r', encoding='utf-8') as f:
            return json.load(f) # Fetch the data
    except Exception as e:
        print(f"Error loading {full_path}: {e}")
        return {}
    
######################################## 
# LOAD IN STATIC DATA FROM json FOLDER #
########################################
print("Loading static JSON data...")
#PLANET DATA
static_json_planets = load_static_json_data("planets/planets.json") # Holds planet name, sector, biome, environ, type, and weather_effects
static_json_biomes = load_static_json_data("planets/biomes.json") # Gives biome description
static_json_environmentals = load_static_json_data("planets/environmentals.json") # Gives environmental descriptions
static_json_planet_effects = load_static_json_data("effects/planetEffects.json") # Contains IDs for planet effects
static_json_campaign_types = load_static_json_data("campaign_types.json")
static_json_factions = load_static_json_data("factions.json")
static_json_sectors = load_static_json_data("sectors.json")
# planetRegion needs to be fetched (cities are updated relatively frequently)
#MO DATA
static_json_task_type = load_static_json_data("assignments/tasks/task/type.json") # Major Order mission types
static_json_task_valueTypes = load_static_json_data("assignments/tasks/task/valueTypes.json") # Same as above
static_json_reward_types = load_static_json_data("assignments/reward/type.json")
static_json_items = load_static_json_data("items/item_names.json")
static_json_enemies = load_static_json_data("enemies/hd2_enemies.json")
#WARBOND DATA (for later use)
print("Static data loaded.")


# Initiation for FastAPI app
app = FastAPI()

# Defining which origins are allowed to make requests 
# Works with the CORS FastAPI
origins = [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:8000",
    "http://localhost:8000",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # All methods (GET, POST, etc.)
    allow_headers=["*"]  # All headers
)

planet_handler = PlanetParser(
    static_json_planets=static_json_planets,
    static_json_biomes=static_json_biomes,
    static_json_environmentals=static_json_environmentals,
    static_json_planet_effects=static_json_planet_effects,
    static_json_factions=static_json_factions,
    static_json_campaign_types=static_json_campaign_types
)

mo_handler = MajorOrderParser(
    planet_parser=planet_handler,
    user_timezone="UTC",
    task_types_map=static_json_task_type,
    reward_types_map=static_json_reward_types,
    value_types_map=static_json_task_valueTypes,
    item_names_map=static_json_items,
    factions_map=static_json_factions
)

"""
    We define endpoints below for users to access. Subject to change.
"""

@app.get("/")
async def read_index():
    return FileResponse('static/index.html')

app.mount("/static", StaticFiles(directory="static"), name="static")
app.mount("/static-api", StaticFiles(directory="static-api"), name="static-api")

# All planet data combined
@app.get("/api/planets") 
def get_all_planets():
    print("Request received for all planet data...")
    return planet_handler.get_all_planets()

# Specific planet data
@app.get("/api/planets/{planet_name}")
def get_single_planet(planet_name: str):
    print(f"Request received for planet {planet_name}...")
    planet = planet_handler.get_planet_by_name(planet_name)
    return planet if planet else {"error": "Planet was not found"}

# Major order data
@app.get("/api/major_orders")
def get_major_orders():
    print("Request received for major orders...")
    major_order_url = settings.urls.get("major_order")

    raw_data = fetch_data_from_url(major_order_url, cache_key="major_orders", ttl=30)
    if raw_data:
        parsed_orders = mo_handler.parse_major_order_data(raw_data)
        return parsed_orders
    return {"error": "Failed to fetch major order data"}

# Galaxy stats
@app.get("/api/galaxy_stats")
def get_galaxy_stats():
    print("Request received for galaxy stats...")
    print(f"Available keys in settings: {list(settings.urls.keys())}")
    galaxy_stats_url = settings.urls.get("war")

    print(f"Trying to fetch URL: '{galaxy_stats_url}'")
    raw_data = fetch_data_from_url(galaxy_stats_url, cache_key="galaxy_stats", ttl=30)
    if raw_data:
        galaxy_stats = parse_galaxy_stats(raw_data) # returns a list
        return galaxy_stats
    return {"error": "Failed to fetch galaxy stats"}

@app.get("/api/enemies")
def get_enemies():
    return static_json_enemies

@app.get("/api/sector_layout")
def get_sector_layout():
    return static_json_sectors

@app.get("/api/changelog", response_class=HTMLResponse)
async def changelog_page():

    with open("CHANGELOG.md", "r", encoding="utf-8") as file:
        text = file.read()

    html_snippet = markdown.markdown(text, tab_length=2)
    return html_snippet

@app.get("/api/planets/{planet_index}/player_history")
def get_planet_player_history(planet_index: int, days: int = 5):
    """
    Returns time-series player count data for a planet over the past `days` days.
    Picks one snapshot per day (the 4th file chronologically, ~09:xx UTC).
    """
    from datetime import timedelta
    base_path = os.path.dirname(os.path.abspath(__file__))
    history_root = os.path.join(base_path, "data_history", "planets_snapshot")

    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")

    def find_planet_player_count(filepath, index):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                planets = json.load(f)
            for p in planets:
                if p.get("index") == index:
                    stats = p.get("statistics") or {}
                    return stats.get("playerCount")
        except Exception:
            pass
        return None

    results = []
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    if os.path.isdir(history_root):
        for date_dir in sorted(os.listdir(history_root)):
            if date_dir < cutoff_date:
                continue
            date_path = os.path.join(history_root, date_dir)
            if not os.path.isdir(date_path):
                continue

            # Collect and sort snapshot files for this day, pick the 4th (index 3)
            day_files = sorted(
                f for f in os.listdir(date_path) if f.endswith(".json")
            )
            if len(day_files) < 4:
                continue
            fname = day_files[3]
            fpath = os.path.join(date_path, fname)
            count = find_planet_player_count(fpath, planet_index)
            if count is None:
                continue
            time_part = fname.replace("planets_snapshot_", "").replace(".json", "")
            ts = f"{date_dir}T{time_part.replace('-', ':', 2)}Z"
            results.append({"timestamp": ts, "playerCount": count})

    # If today's scheduled snapshot hasn't been taken yet, use the live cache instead
    cache_file = os.path.join(base_path, "data_cache", "planets_snapshot.json")
    today_already_included = any(r["timestamp"].startswith(today) for r in results)
    if not today_already_included and os.path.isfile(cache_file):
        cache_count = find_planet_player_count(cache_file, planet_index)
        if cache_count is not None:
            now_ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            results.append({"timestamp": now_ts, "playerCount": cache_count})

    return results