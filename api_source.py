from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from utils.parse_conf.planet_data_parser import PlanetParser
from utils.parse_conf.major_order_parser import MajorOrderParser
from utils.parse_conf.galaxy_stats_parser import parse_galaxy_stats
from utils.parse_conf.data_fetcher import fetch_data_from_url
from conf import settings
import json
import os

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
# planetRegion needs to be fetched (cities are updated relatively frequently)
#MO DATA
static_json_task_type = load_static_json_data("assignments/tasks/task/type.json") # Major Order mission types
static_json_task_valueTypes = load_static_json_data("assignments/tasks/task/valueTypes.json") # Same as above
static_json_reward_types = load_static_json_data("assignments/reward/type.json")
static_json_items = load_static_json_data("items/item_names.json")
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
    "*" # Allows everything for testing
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
def get_root():
    print("If you are reading this message, the Helldivers 2 API is running." \
    "\nGo to /api/planets, /api/major_orders, or /api/galaxy_stats to access data.") 


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
    raw_data = fetch_data_from_url(major_order_url)
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
    raw_data = fetch_data_from_url(galaxy_stats_url)
    if raw_data:
        galaxy_stats = parse_galaxy_stats(raw_data) # returns a list
        return galaxy_stats
    return {"error": "Failed to fetch galaxy stats"}