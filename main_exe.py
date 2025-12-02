import time
import json

# File Importing
from utils.parse_conf import data_fetcher
from conf import settings
from utils.parse_conf import major_order_parser
from utils.parse_conf import galaxy_stats_parser
from utils.parse_conf.planet_data_parser import PlanetParser

# https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
user_timezone = "America/Toronto"

# Save JSON info to file function
def save_json_to_file(data, filename):
    try:
        with open(filename, "w", encoding='utf-8') as f:
            json.dump(data, f, indent=4) 
        print(f"Data successfully saved to {filename}")
    except IOError as e:
        print(f"Error saving data to file: {e}")


def main_program():
    """
        Main function for fetching and parsing data
    """
    print("\n---- Beginning new data refresh cycle ----")
    
    ### PARSE ALL PLANETS ONCE
    planet_parser = PlanetParser()
    
    ### MAJOR ORDER-RELATED CODE ###
    major_order_url = settings.urls.get("major_order")
    if major_order_url:
        major_orders_data = data_fetcher.fetch_data_from_url(major_order_url)
        if major_orders_data is not None:
            # save_json_to_file(major_orders_data, "raw_mo_data") #<------- SAVES

            print("\nSuccessfully fetched raw data for Major Orders. Now parsing...")
            parsed_orders = major_order_parser.parse_major_order_data(major_orders_data, planet_parser, user_timezone)
            if parsed_orders is not None:
                if not parsed_orders:
                    print("\n    There are currently no active Major Orders.")

                
                else:
                    print("\nSuccesfully parsed the following Major Order(s):")
                    for order in parsed_orders:
                        print(f"        {order.get("order_title")}") # "MAJOR ORDER or SECONDARY ORDER"
                        print("    -------------------")
                        
                        print(f"    Briefing: {order.get("order_briefing")}")
                        
                        tasks = order.get("tasks", [])
                        if tasks:
                            print("\n    --- OBJECTIVES ---")
                            for i, task in enumerate(tasks):
                                progress = task.get('progress', 0)
                                goal = task.get('goal', 1)
                                # Format with commas for readability
                                progress_str = f"{progress:,}"
                                goal_str = f"{goal:,}"
                                
                                print(f"    Objective {i+1}:")
                                print(f"        Task Type ID: {task.get('type')}")
                                print(f"        Target Planet: {task.get('target_name')} (ID: {task.get('target_planet_id')})")
                                print(f"        Progress: {progress_str} / {goal_str}")
                                # Simple percentage calculation
                                if goal > 0:
                                    percentage = (progress / goal) * 100
                                    print(f"        Completion: {percentage:.4f}%")
                            print("    ------------------")

                        print(f"    Order Expires: {order.get("order_expires")}")

                        if order.get("rewards_amount"):
                            print(f"\n    Reward: {order.get("rewards_amount")} Medals")
                        else:
                            print("\n    This order type does not include any rewards.")
                        
            else:
                print("\nFailed to parse Major Orders data.")
        else:
            print("\nFailed to fetch Major Order data.")


    ### GALAXY-RELATED CODE ###
    galaxy_stats_url = settings.urls.get("war")
    if galaxy_stats_url:
        galaxy_stats_data = data_fetcher.fetch_data_from_url(galaxy_stats_url)
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
        main_program()
        print("\nWaiting 10 seconds before next refresh...")
        time.sleep(10)