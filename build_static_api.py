"""
build_static_api.py

Runs during the GitHub Action (every 8 hours) to generate static JSON files
that Cloudflare Pages will serve as the "baseline" data for the frontend.

The frontend loads these instantly on page open, then polls the live
Helldivers API every 60 seconds for fresh numbers.
"""

from dotenv import load_dotenv
load_dotenv()

import json
import os
import markdown
from datetime import datetime, timezone, timedelta

from utils.parse_conf.planet_data_parser import PlanetParser
from utils.parse_conf.major_order_parser import MajorOrderParser
from utils.parse_conf.galaxy_stats_parser import parse_galaxy_stats
from utils.parse_conf.news_feed_parser import newsFeedParser
from utils.parse_conf.data_fetcher import fetch_data_from_url
from conf import settings

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "static-api")
HISTORY_DIR = os.path.join(BASE_DIR, "data_history")

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_static_json(file_path):
    """Load a JSON file from resources/json/."""
    full_path = os.path.join(BASE_DIR, "resources", "json", file_path)
    if not os.path.exists(full_path):
        print(f"  Warning: {full_path} not found")
        return {}
    try:
        with open(full_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"  Error loading {full_path}: {e}")
        return {}


def write_json(filename, data):
    """Write data as JSON to the output directory."""
    path = os.path.join(OUTPUT_DIR, filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"  Wrote {filename}")


def write_text(filename, text):
    """Write raw text (HTML, etc.) to the output directory."""
    path = os.path.join(OUTPUT_DIR, filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"  Wrote {filename}")


# ---------------------------------------------------------------------------
# 1. Load static reference data (same data the parsers need)
# ---------------------------------------------------------------------------
print("Loading static reference JSON...")
static_planets = load_static_json("planets/planets.json")
static_biomes = load_static_json("planets/biomes.json")
static_environmentals = load_static_json("planets/environmentals.json")
static_planet_effects = load_static_json("effects/planetEffects.json")
static_campaign_types = load_static_json("campaign_types.json")
static_factions = load_static_json("factions.json")
static_sectors = load_static_json("sectors.json")
static_enemies = load_static_json("enemies/hd2_enemies.json")
static_task_types = load_static_json("assignments/tasks/task/type.json")
static_value_types = load_static_json("assignments/tasks/task/valueTypes.json")
static_reward_types = load_static_json("assignments/reward/type.json")
static_items = load_static_json("items/item_names.json")

# ---------------------------------------------------------------------------
# 2. Fetch + parse planet data
# ---------------------------------------------------------------------------
print("\nFetching and parsing planet data...")
planet_parser = PlanetParser(
    static_json_planets=static_planets,
    static_json_biomes=static_biomes,
    static_json_environmentals=static_environmentals,
    static_json_planet_effects=static_planet_effects,
    static_json_factions=static_factions,
    static_json_campaign_types=static_campaign_types,
    save_history=True,  # also save to data_history/ for the snapshot
)
all_planets = planet_parser.get_all_planets()
print(f"  Parsed {len(all_planets)} planets")

# ---------------------------------------------------------------------------
# 3. Fetch + parse major orders
# ---------------------------------------------------------------------------
print("\nFetching and parsing major orders...")
major_order_url = settings.urls.get("major_order")
major_orders_data = []
if major_order_url:
    raw_mo = fetch_data_from_url(major_order_url, cache_key="major_orders", ttl=30, save_history=True)
    if raw_mo:
        mo_parser = MajorOrderParser(
            planet_parser=planet_parser,
            user_timezone="UTC",
            task_types_map=static_task_types,
            reward_types_map=static_reward_types,
            value_types_map=static_value_types,
            item_names_map=static_items,
            factions_map=static_factions,
        )
        major_orders_data = mo_parser.parse_major_order_data(raw_mo) or []
        print(f"  Parsed {len(major_orders_data)} major order(s)")
    else:
        print("  Warning: Could not fetch major orders from API")

# ---------------------------------------------------------------------------
# 4. Fetch + parse galaxy stats
# ---------------------------------------------------------------------------
print("\nFetching and parsing galaxy stats...")
galaxy_stats_url = settings.urls.get("war")
galaxy_stats_data = {}
if galaxy_stats_url:
    raw_gs = fetch_data_from_url(galaxy_stats_url, cache_key="galaxy_stats", ttl=30, save_history=True)
    if raw_gs:
        galaxy_stats_data = parse_galaxy_stats(raw_gs) or {}
        print("  Parsed galaxy stats")
    else:
        print("  Warning: Could not fetch galaxy stats from API")

# ---------------------------------------------------------------------------
# 5. Fetch + parse dispatches (news feed)
# ---------------------------------------------------------------------------
print("\nFetching and parsing dispatches...")
news_feed_url = settings.urls.get("news_feed")
dispatches_data = []
if news_feed_url:
    raw_dispatches = fetch_data_from_url(news_feed_url, cache_key="news_feed", ttl=30)
    if raw_dispatches:
        news_parser = newsFeedParser(planet_parser=planet_parser)
        dispatches_data = news_parser.parse_dispatch_data(raw_dispatches) or []
        print(f"  Parsed {len(dispatches_data)} dispatches")
    else:
        print("  Warning: Could not fetch dispatches from API")

# ---------------------------------------------------------------------------
# 6. Render CHANGELOG.md → HTML
# ---------------------------------------------------------------------------
print("\nRendering changelog...")
changelog_html = ""
changelog_path = os.path.join(BASE_DIR, "CHANGELOG.md")
if os.path.exists(changelog_path):
    with open(changelog_path, "r", encoding="utf-8") as f:
        changelog_html = markdown.markdown(f.read(), tab_length=2)
    print("  Rendered CHANGELOG.md")

# ---------------------------------------------------------------------------
# 7. Build per-planet player history from data_history/
# ---------------------------------------------------------------------------
print("\nBuilding player history files...")
history_root = os.path.join(HISTORY_DIR, "planets_snapshot")
HISTORY_DAYS = 5  # match the default from the original endpoint

player_history_by_planet = {}  # { planet_index: [ {timestamp, playerCount}, ... ] }

if os.path.isdir(history_root):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=HISTORY_DAYS)).strftime("%Y-%m-%d")

    for date_dir in sorted(os.listdir(history_root)):
        if date_dir < cutoff:
            continue
        date_path = os.path.join(history_root, date_dir)
        if not os.path.isdir(date_path):
            continue

        day_files = sorted(f for f in os.listdir(date_path) if f.endswith(".json"))
        if len(day_files) < 4:
            continue

        # Pick the 4th snapshot of the day (same logic as the original endpoint)
        fpath = os.path.join(date_path, day_files[3])
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                snapshot = json.load(f)
        except Exception:
            continue

        time_part = day_files[3].replace("planets_snapshot_", "").replace(".json", "")
        ts = f"{date_dir}T{time_part.replace('-', ':', 2)}Z"

        for planet in snapshot:
            idx = planet.get("index")
            if idx is None:
                continue
            stats = planet.get("statistics") or {}
            count = stats.get("playerCount")
            if count is None:
                continue

            player_history_by_planet.setdefault(idx, []).append({
                "timestamp": ts,
                "playerCount": count,
            })

print(f"  Built history for {len(player_history_by_planet)} planets")

# ---------------------------------------------------------------------------
# 8. Write everything to static-api/
# ---------------------------------------------------------------------------
print("\nWriting static API files...")
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Write planets as a dict keyed by planet index (matches current API format
# that the frontend already expects — JS does Object.values() on it)
write_json("planets.json", all_planets)
write_json("major_orders.json", major_orders_data)
write_json("galaxy_stats.json", galaxy_stats_data)
write_json("dispatches.json", dispatches_data)
write_json("enemies.json", static_enemies)
write_json("sector_layout.json", static_sectors)
write_text("changelog.html", changelog_html)

# Per-planet player history
for planet_idx, history in player_history_by_planet.items():
    write_json(f"player_history/{planet_idx}.json", history)

# Metadata (so the frontend knows when this build ran)
metadata = {
    "buildTimestamp": datetime.now(timezone.utc).isoformat(),
    "planetCount": len(all_planets),
    "historyDays": HISTORY_DAYS,
}
write_json("metadata.json", metadata)

# Lookup tables used by the frontend to parse live major order task data
mo_lookups = {
    "taskTypes": static_task_types,
    "valueTypes": static_value_types,
    "factions": static_factions,
}
write_json("mo_lookups.json", mo_lookups)

# API config for the live 60-second refresh calls made directly from the browser.
# Uses the same env vars the build itself uses — non-secret endpoint paths only.
api_config = {
    "planetsUrl": settings.urls.get("planets", ""),
    "warUrl": settings.urls.get("war", ""),
    "assignmentsUrl": settings.urls.get("major_order", ""),
    "newsFeedUrl": settings.urls.get("news_feed", ""),
    "headers": {
        "X-Super-Client": os.environ.get("SUPER_CLIENT", "HD2GalacticProject"),
        "X-Super-Contact": os.environ.get("SUPER_CONTACT", ""),
        "Accept": "application/json",
        "Accept-Language": "en-US",
    }
}
write_json("api_config.json", api_config)

print("\n--- Static API build complete ---")
