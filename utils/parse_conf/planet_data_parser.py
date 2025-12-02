from typing import Dict, Any, Union, List
from utils.parse_conf.data_fetcher import fetch_data_from_url
from conf import settings
import traceback

PLANET_URL: str = settings.urls.get("planets")  # General planet data
PLANET_EVENTS_URL: str = settings.urls.get("planet_events")  # Planets with defence campaigns
CAMPAIGNS_URL: str = settings.urls.get("campaigns") # Planets with liberation campaigns

class PlanetParser():
    """
        Handles all functions regarding all planets
        on the Galactic Map.
    """
    
    # 
    def __init__(self, static_json_planets, static_json_planet_effects, static_json_biomes, static_json_environmentals, static_json_factions, static_json_campaign_types):
        self.combined_data: Dict[int, Dict[str, Any]] = {} # Return for better understanding

        # static data stored
        self.static_json_planets=static_json_planets
        self.static_json_planet_effects = static_json_planet_effects # planet effect events (rupture strain, eagle storm, etc.)
        self.static_json_biomes = static_json_biomes
        self.static_json_environmentals = static_json_environmentals
        self.static_json_factions = static_json_factions
        self.static_json_campaign_types = static_json_campaign_types

        self._fetch_and_combine()
    

    def _fetch_and_combine(self):
        # Creates one dictionary from API endpoints
        planets_list = fetch_data_from_url(PLANET_URL) #
        planet_events_list = fetch_data_from_url(PLANET_EVENTS_URL)
        campaigns_list = fetch_data_from_url(CAMPAIGNS_URL)

        try:
            #############
            # LIVE DATA #
            #############

            #####################
            ## /api/v1/planets ##
            #####################
            planets_dict = {}
            if isinstance(planets_list, list):
                for planet in planets_list:
                    try:
                        index = planet.get("index")
                        if index is not None:
                            planets_dict[int(index)] = planet
                    except (ValueError, TypeError):
                        continue
                            

            ####################################
            # Defense and Liberation Campaigns #
            ####################################
            
            ## == DEFENSE CAMPAIGNS == ##
            planet_events_dict = {}
            if isinstance(planet_events_list, list):
                for campaign in planet_events_list:
                    try:
                        campaign_index = campaign.get("planetIndex")
                        if campaign_index is None:
                            campaign_index = campaign.get("index")

                        if campaign_index is not None:
                            planet_events_dict[int(campaign_index)] = campaign
                    except (ValueError, TypeError):
                        continue

            ## == LIBERATION CAMPAIGNS == ##
            campaigns_dict = {}
            if isinstance(campaigns_list, list):
                for campaign in campaigns_list:
                    campaign_planet = campaign.get("planet", {})
                    campaign_index = campaign_planet.get("index")

                    if campaign_index is not None:
                        campaigns_dict[int(campaign_index)] = campaign

            #######################
            # Planet Data Parsing #
            #######################
            for index, planet in planets_dict.items():
                try:
                
                    # base planet statistics dictionary
                    stats_dict = planet.get("statistics", {}) # Get stats of planet

                    # check if planet is in a defense campaign
                    active_defense_event = planet_events_dict.get(index)

                    # check if planet is in a liberation campaign
                    active_liberation_campaign = campaigns_dict.get(index)

                    ######################
                    #= Defense Campaign =#
                    ######################
                    if active_defense_event:

                        is_under_attack = True

                        ## Under the event: branch
                        event_stats_dict = active_defense_event.get("event", active_defense_event)

                        # ID's
                        event_id = str(event_stats_dict.get("id"))
                        campaign_id = str(event_stats_dict.get("campaignId"))
                        event_type = str(event_stats_dict.get("eventType", "Unknown"))

                        ## Attacker details
                        attacking_list = active_defense_event.get("attacking", [])
                        attacking_planet_id = attacking_list[0] if (isinstance(attacking_list, list) and len(attacking_list) > 0) else None
                        attacking_planet_name = self.get_planet_name_by_id(attacking_planet_id)

                        attacking_faction_name = event_stats_dict.get("faction", "Unknown")

                        campaign_type_id = str(event_stats_dict.get("eventType", "Unknown Event Type"))
                        campaign_count = ""

                        current_health = event_stats_dict.get("health")
                        max_health = event_stats_dict.get("maxHealth")

                        start_time_str = event_stats_dict.get("startTime", "")
                        end_time_str = event_stats_dict.get("endTime", "")
                    
                    #########################
                    #= Liberation Campaign =#
                    #########################
                    elif active_liberation_campaign:

                        is_under_attack = False

                        event_id = ""
                        campaign_id = str(active_liberation_campaign.get("id"))

                        attacking_faction_name = active_liberation_campaign.get("faction", "Humans")
                        attacking_planet_name = "N/A"

                        campaign_type_id = str(active_liberation_campaign.get("type", ""))
                        campaign_type_name = "Liberation"
                        campaign_count = active_liberation_campaign.get("count", "0")

                        current_health = planet.get("health")
                        max_health = planet.get("maxHealth")

                        start_time_str = ""
                        end_time_str = ""

                    else:

                        is_under_attack = False

                        event_id = ""
                        campaign_id = ""

                        attacking_faction_id = ""
                        attacking_faction_name = ""
                        attacking_planet_id = ""
                        attacking_planet_name = ""

                        campaign_type_id = ""
                        campaign_type_name = ""
                        campaign_count = ""

                        current_health = planet.get("health")
                        max_health = planet.get("maxHealth")

                        start_time_str = ""
                        end_time_str = ""

                    # Biome descriptions
                    biome_data = planet.get("biome", {})

                    if isinstance(biome_data, dict):
                        biome_name = biome_data.get("name", "Unknown Biome")
                        biome_desc = biome_data.get("description", "No description available.")
                    else:
                        biome_name = "Unknown Biome"
                        biome_desc = "No description available."

                    # Checks current owner and compares to saved faction data
                    x, y = 0, 0
                    planet_position = str(planet.get("position", {x: 0, y: 0}))
                    first_owner = planet.get("initialOwner", "Unknown Origin Faction")
                    owner_id = planet.get("currentOwner", "Unknown Faction ID")
                    regen_per_sec = str(planet.get("regenPerSecond", 0))

                    # Planet Statistics (follows dict order)
                    missions_won = stats_dict.get('missionsWon', 0)
                    missions_lost = stats_dict.get('missionsLost', 0)
                    mission_time = stats_dict.get('missionTime', 0)
                    bug_kills = stats_dict.get("terminidKills", 0)
                    bot_kills = stats_dict.get("automatonKills", 0)
                    squid_kills = stats_dict.get("illuminateKills", 0)
                    bullets_fired = stats_dict.get('bulletsFired', 0)
                    bullets_hit = stats_dict.get('bulletsHit', 0)
                    time_played = stats_dict.get('timePlayed', 0)
                    deaths = stats_dict.get('deaths', 0)
                    friendlies = stats_dict.get('friendlies', 0)

                    player_count = stats_dict.get("playerCount", 0)
                    is_planet_disabled: bool = planet.get("disabled")

                    # Waypoints (planets with travel paths)
                    waypoint_ids = planet.get("waypoints", [])
                    waypoint_names = []
                    for waypoint in waypoint_ids:
                        name = planets_dict.get(waypoint, {}).get("name", f"Planet {waypoint}")
                        waypoint_names.append(name)


                    # Planet hazards
                    hazard_names = []
                    hazard_descr = []
                    hazards_list = planets_dict.get("hazards", [])
                    for hazard in hazards_list:
                        name = hazard.get("name", "Unknown Hazard")
                        description = hazard.get("description")

                        hazard_names.append(name)
                        hazard_descr.append(description)
                    

                    # Parameters
                    self.combined_data[index] = {
                        # Static data (planets.json)
                        'index': index,
                        'name': planet.get('name', 'Unknown'),
                        'sector': planet.get('sector', 'Unknown Sector'),
                        'type': planet.get('type', 'Unknown Type'),

                        # Planet-specific data
                        'biomeName': biome_name,
                        'biomeDescr': biome_desc,

                        # Hazards data
                        'hazardName': hazard_names,
                        'hazardDesc': hazard_descr,

                        # Campaign data
                        'isUnderAttack': is_under_attack, # If under attack set to true
                        'isDisabled': is_planet_disabled, # Is planet player-accessible

                        'eventId': event_id,
                        'campaignId': campaign_id,
                        'campaignType': campaign_type_name,
                        'campaignTypeId': campaign_type_id,

                        'campaignCount': campaign_count,
                        'attackingFactionId': attacking_faction_id,
                        'attackingFaction': attacking_faction_name,
                        'attackingPlanet': attacking_planet_name,

                        # Statistics data
                        'missionsWon': missions_won,
                        'missionsLost': missions_lost,
                        'missionTime': mission_time,
                        'bugKills': bug_kills,
                        'botKills': bot_kills,
                        'squidKills': squid_kills,
                        'bulletsFired': bullets_fired,
                        'bulletsHit': bullets_hit,
                        'timePlayed': time_played,
                        'deaths': deaths,
                        'friendlies': friendlies,

                        # Dynamic data (status_url)
                        'players': player_count,
                        'initialOwner': first_owner,
                        'owner': owner_id,

                        # Health data
                        'currentHealth': current_health,
                        'regenPerSecond': regen_per_sec,
                        'maxHealth': max_health,
                        'eventStartTime': start_time_str,
                        'eventEndTime': end_time_str,

                        # Galactic Position data
                        'position': planet_position,
                        'waypoints': waypoint_ids,
                        'waypointNames': waypoint_names,
                    }
                except Exception as inner_e:
                    print(f"Skipping planet {index} due to error: {inner_e}")
                    continue

        except Exception as e:
            import traceback
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
    

    def get_planet_name_by_id(self, planet_id: int|str) -> str:
        if planet_id is None or planet_id == "":
            return "N/A"
        
        try:
            planet_index = int(planet_id)
        except (ValueError, TypeError):
            return str([planet_id])
            
        planet_info = self.combined_data.get(planet_index)
        if planet_info:
            return planet_info.get('name', f'Planet {planet_index}')
        
        return f"Unknown Planet ID {planet_index}"