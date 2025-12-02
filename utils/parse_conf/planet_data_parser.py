from typing import Dict, Any, Union, List
from utils.parse_conf.data_fetcher import fetch_data_from_url
from conf import settings
import traceback

PLANET_DETAILS_URL: str = settings.urls.get("planet_stats")   #v1/planet_stats
STATUS_URL: str = settings.urls.get("status")   #v1/status
PLANET_HEALTH_URL: str = settings.urls.get("war_info")

class PlanetParser():
    """
        Handles all functions regarding all planets
        on the Galactic Map.
        \n3 sources combined.
    """
    
    # 
    def __init__(self, static_json_planets, static_json_biomes, static_json_environmentals, static_json_planet_effects, static_json_factions, static_json_campaign_types):
        self.combined_data: Dict[int, Dict[str, Any]] = {} # Return for better understanding

        # static data stored
        self.static_json_planets = static_json_planets
        self.static_json_biomes = static_json_biomes # biome descriptions
        self.static_json_environmentals = static_json_environmentals # weather effects
        self.static_json_planet_effects = static_json_planet_effects # planet effect events (rupture strain, eagle storm, etc.)
        self.static_json_factions = static_json_factions
        self.static_json_campaign_types = static_json_campaign_types

        self._fetch_and_combine()
    

    def _fetch_and_combine(self):
        # Creates one dictionary from API endpoints
        details_api_data = fetch_data_from_url(PLANET_DETAILS_URL)
        status_api_data = fetch_data_from_url(STATUS_URL)
        planet_settings_api_data = fetch_data_from_url(PLANET_HEALTH_URL)

        planet_stats = (details_api_data or {}).get("planet_stats", {}) 
        

        datapoint_names = {
            "missionsWon": "Missions Won",
            "missionsLost": "Missions Lost",
            "missionTime": "Total Mission Time (ms)",
            "bugKills": "Terminid Kills",
            "automatonKills": "Automaton Kills",
            "illuminateKills": "Illuminate Kills",
            "bulletsFired": "Total Bullets Fired",
            "bulletsHit": "Total Bullets Hit",
            "timePlayed": "Total Time Played (ms)",
            "deaths": "Total Deaths",
            "friendlies": "Friendly Kills",
            "missionSuccessRate": "Mission Success Rate"
        }

        custom_stat_keys = [
            "bugKills", "automatonKills", "illuminateKills", "deaths", "bulletsFired", "bulletsHit"
        ]

        remove_stat_keys = ["accuracy"]

        try:
            planet_status_list = (status_api_data or {}).get("planetStatus", [])
            planet_infos_list = (planet_settings_api_data or {}).get("planetInfos", [])
            liberation_campaigns = (status_api_data or {}).get("campaigns", []) # Grabs all liberation campaigns available
            defense_campaigns = (status_api_data or {}).get("planetEvents", []) # Grabs all defense campaigns available

            #############
            # LIVE DATA #
            #############


            ####################################
            # Defense and Liberation Campaigns #
            ####################################
            liberation_campaigns_dict = {}
            if isinstance(liberation_campaigns, list):
                for campaign in liberation_campaigns:
                    campaign_index = campaign.get("planetIndex")
                    if campaign is not None:
                        liberation_campaigns_dict[int(campaign_index)] = campaign

            defense_campaigns_dict = {}
            if isinstance(defense_campaigns, list):
                for campaign in defense_campaigns:
                    campaign_index = campaign.get("planetIndex")
                    if campaign is not None:
                        defense_campaigns_dict[int(campaign_index)] = campaign
            
            #######################
            # status/planetStatus #
            #######################
            status_planets_dict = {}
            if isinstance(planet_status_list, list):
                for planet_status in planet_status_list:
                    index = planet_status.get("index")
                    if index is not None:
                        status_planets_dict[int(index)] = planet_status

            formatted_strings = []

            # planet_stats/planets_stats
            if planet_stats:
                for key, value in planet_stats.items():
                    if key in custom_stat_keys or remove_stat_keys: 
                        continue

                    display_name = datapoint_names.get(key, key)

                    if key in ["missionSuccessRate", "accuracy"]:
                        formatted_strings.append(f"{display_name}: {value}%")
                    else:
                        formatted_strings.append(f"{display_name}: {value:,}")
            
            # checks planet's max health
            planet_health_data_dict = {}
            if isinstance(planet_infos_list, list):
                for planet_info_data in planet_infos_list:
                    index = planet_info_data.get("index")
                    if index is not None:
                        planet_health_data_dict[int(index)] = planet_info_data

            for index_str, planet_info in self.static_json_planets.items():

                try:
                    index = int(index_str)
                except ValueError:
                    continue
                
                status = status_planets_dict.get(index, {}) # Get stats of planet
                health_info = planet_health_data_dict.get(index, {})

                active_defense_event = defense_campaigns_dict.get(index)
                if active_defense_event:
                    is_under_attack = True

                    attacking_faction_id = str(active_defense_event.get("race", 0))
                    attacking_faction_name = self.static_json_factions.get(attacking_faction_id, "Unknown")
                    campaign_type_id = str(active_defense_event.get("eventType", 0))
                    campaign_type_name = self.static_json_campaign_types.get(campaign_type_id, "N/A")

                    current_health = active_defense_event.get("health")
                    max_health = active_defense_event.get("maxHealth")

                else:
                    is_under_attack = False
                    attacking_faction_name = "N/A"
                    campaign_type_name = "N/A"

                    current_health = status.get("health")
                    max_health = health_info.get("maxHealth")

                # Biome descriptions
                biome_id = str(planet_info.get("biome"))
                biome_desc = self.static_json_biomes.get(biome_id, {})

                # Checks current owner and compares to saved faction data
                owner_id = status.get("owner", 1)
                owner_name = self.static_json_factions.get(owner_id, "Unknown")

                env_names = []
                env_descr = []
                for env_id in planet_info.get("environmentals", []):
                    env_info = self.static_json_environmentals.get(str(env_id), {})
                    env_names.append(env_info.get("name", "Unknown Effect"))
                    env_descr.append(env_info.get("description", "No description."))

                # Parameters
                self.combined_data[index] = {
                    # Static data (planets.json)
                    'index': index,
                    'name': planet_info.get('name', 'Unknown'),
                    'sector': planet_info.get('sector', 'Unknown Sector'),
                    'type': planet_info.get('type', 'Unknown Type'),

                    # Planet-specific data
                    'biome': biome_desc.get('name', 'Unknown Biome'),
                    'biome_id': biome_id,
                    'description': biome_desc.get('description', 'No Description'),
                    'weatherEffects': planet_info.get('weather_effects', 'No Weather Effects'),

                    # Environment data
                    'environName': env_names,
                    'environDesc': env_descr,

                    # Campaign data
                    'isUnderAttack': is_under_attack, # If under attack set to true
                    'campaignType': campaign_type_name,
                    'attackingFaction': attacking_faction_name,

                    # Dynamic data (status_url)
                    'players': status.get('players', 0),
                    'owner': owner_id,
                    'ownerName': owner_name,

                    # Health data
                    'currentHealth': current_health,
                    'regenPerSecond': status.get('regenPerSecond'),
                    'maxHealth': max_health,

                    # Galactic Position data
                    'position': health_info.get('position', {'x': 0, 'y': 0})
                }
        except TypeError or Exception as e:
            import traceback # The stack of traces program was executing before crashing
            print(f"Encountered an error in _fetch_and_combine: {e}")
            traceback.print_exc()
            return 
        

    def get_all_planets(self):
        return self.combined_data


    def get_planet_by_name(self, planet_name: str):
        for planet in self.combined_data.values():
            if planet.get('name', '').lower() == planet_name.lower():
                return planet
        return None
    

    def get_planet_name_by_id(self, planet_id: int) -> str:
        if planet_id is None:
            return "N/A"
            
        planet_info = self.combined_data.get(int(planet_id)) # int safety check added
        if planet_info:
            return planet_info.get('name', 'Unknown Planet')
        return "Unknown Planet ID"