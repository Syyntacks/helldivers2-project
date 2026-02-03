import time
import json
import os

# File Importing
from utils.parse_conf import data_fetcher
from conf import settings
from utils.parse_conf import major_order_parser
from utils.parse_conf import galaxy_stats_parser
from utils.parse_conf.planet_data_parser import PlanetParser

# https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
user_timezone = "America/Toronto"

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

#PLANET DATA
static_planets = load_static_json_data("planets/planets.json") # Holds planet name, sector, biome, environ, type, and weather_effects
static_biomes = load_static_json_data("planets/biomes.json") # Gives biome description
static_environmentals = load_static_json_data("planets/environmentals.json") # Gives environmental descriptions
static_planet_effects = load_static_json_data("effects/planetEffects.json") # Contains IDs for planet effects
static_campaign_types = load_static_json_data("campaign_types.json")
static_factions = load_static_json_data("factions.json")
# planetRegion needs to be fetched (cities are updated relatively frequently)

# Save JSON info to file function
def save_json_to_file(data, filename):
    try:
        with open(filename, "w", encoding='utf-8') as f:
            json.dump(data, f, indent=4) 
        print(f"Data successfully saved to {filename}")
    except IOError as e:
        print(f"Error saving data to file: {e}")


HISTORY_INTERVAL = 21600
last_history_save = 0


def main_program(save_history=False):
    """
        Main function for fetching and parsing data
    """

    if save_history:
        print("\n[HISTORY] 📸 Snapshot triggered! Saving data to history folder...")

    print("\n---- Beginning new data refresh cycle ----")
    
    ### PARSE ALL PLANETS ONCE
    planet_parser = PlanetParser(
        static_planets,
        static_biomes,
        static_environmentals,
        static_planet_effects,
        static_factions,
        static_campaign_types,
        save_history=save_history,
    )
    
    ### MAJOR ORDER-RELATED CODE ###
    major_order_url = settings.urls.get("major_order")
    if major_order_url:
        major_orders_data = data_fetcher.fetch_data_from_url(
            major_order_url,
            cache_key="major_orders",
            ttl=60,
            save_history=save_history
        )
        if major_orders_data is not None:
            # save_json_to_file(major_orders_data, "raw_mo_data") #<------- SAVES
            mo_parser = major_order_parser.MajorOrderParser(planet_parser, user_timezone)
            print("\nSuccessfully fetched raw data for Major Orders. Now parsing...")
            parsed_orders = mo_parser.parse_major_order_data(major_orders_data)

            if parsed_orders:
                print(f"\n    ---- MAJOR ORDER ----")
                for order in parsed_orders:
                    setting = order.get('setting', {})
                    print(f"    Title: {setting.get('overrideTitle', 'Unknown')}")
                    print(f"    Brief: {setting.get('overrideBrief', '')[:100]}...") # Truncate long text
                    
                    # --- SAFE TASK PRINTING LOOP ---
                    tasks = setting.get('tasks', [])
                    if tasks:
                        print("    Objectives:")
                        for task in tasks:
                            goal = task.get('goal')
                            
                            # THE FIX: Check if goal exists before formatting
                            if goal is not None:
                                try:
                                    goal_str = f"{int(goal):,}"
                                except (ValueError, TypeError):
                                    goal_str = str(goal)
                            else:
                                goal_str = "N/A" # Handle 'Hold' tasks safely

                            target = task.get('targetName', 'Unknown Target')
                            print(f"      - {target}: {goal_str}")
                    else:
                        print("    (No specific tasks found)")
                    print("    ---------------------")
        else:
            print("\nFailed to fetch Major Orders data from endpoint.")


    ### GALAXY-RELATED CODE ###
    galaxy_stats_url = settings.urls.get("war")
    if galaxy_stats_url:
        galaxy_stats_data = data_fetcher.fetch_data_from_url(
            galaxy_stats_url,
            cache_key="galaxy_stats",
            ttl=60,
            save_history=save_history
        )
        if galaxy_stats_data:
            print("\nSuccessfully fetched Galactic War statistics. Now parsing...")
            parsed_galaxy_stats = galaxy_stats_parser.parse_galaxy_stats(galaxy_stats_data)
            
            if parsed_galaxy_stats:
                print("\n    ---- GALACTIC WAR STATS ----")
                
                for line in parsed_galaxy_stats:
                    print(f"    {line}")

            else:
                print("\nFailed to parse Galactic War stats.")
        else:
            print("\nFailed to fetch Major Orders data from endpoint.")
    else:
        print("\nGalaxy stats cannot be found on the API.")
    

    ### PLANET-RELATED CODE ###
    print("\nFetching and parsing all planet data...")
    all_planets = planet_parser.get_all_planets()
    if all_planets:
        print(f"\nSuccessfully parsed data for {len(all_planets)} planets.")

        for i, planet in enumerate(list(all_planets.values())[:5]):
            print(f"    {i+1}, {planet.get('name')} | Sector: {planet.get('sector')} | Biome: {planet.get('biome')}")
        print("----------------------------")
    else:
        print("\nCould not fetch or parse planet data.")

    print("\n    ---- Data refresh cycle complete ----")



if __name__ == "__main__":
    while True:
        current_time = time.time()

        should_save_history = False
        if current_time - last_history_save >= HISTORY_INTERVAL:
            should_save_history = True
            last_history_save = current_time

        main_program(save_history=should_save_history)

        print("\nWaiting 10 seconds before next refresh...")
        time.sleep(10)