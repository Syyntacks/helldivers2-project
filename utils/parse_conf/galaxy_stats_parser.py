import json
import time
from utils.parse_conf import datetime_converter

# Stats parser
def parse_galaxy_stats(data):
    #parsed_container = {}

    if isinstance(data, str):
        try:
            data = json.loads(data)
        except json.JSONDecodeError:
            print("Error: Received a string that could not be decoded as JSON.")
            return None


    if not isinstance(data, dict):
        print(f"Error: Expected data to be a dictionary, but got {type(data)}")
        return None

    try:
        
        overall_stats_dict = data.get("statistics", {})

        if not overall_stats_dict:
            return ["No overall stats available."]
        
        if 'missionTime' in overall_stats_dict:
            raw_seconds = overall_stats_dict['missionTime']
            formatted_duration = datetime_converter.format_duration_from_seconds(raw_seconds)
            overall_stats_dict['missionTime'] = formatted_duration


        missions_won = overall_stats_dict.get("missionsWon", 0)
        missions_lost = overall_stats_dict.get("missionsLost", 0)
        missions_total = missions_won + missions_lost
        missions_won_percent = (missions_won / missions_total) * 100

        mission_time = overall_stats_dict.get("missionTime")
        total_mission_time = datetime_converter.format_duration_from_seconds(mission_time)
        overall_stats_dict['timePlayedFormatted'] = missions_total

        total_players = overall_stats_dict.get("playerCount", 0)
        overall_stats_dict['totalPlayers'] = total_players


        deaths = overall_stats_dict.get("deaths", 0)
        bug_kills = overall_stats_dict.get("terminidKills", 0)
        bot_kills = overall_stats_dict.get("automatonKills", 0)
        squid_kills = overall_stats_dict.get("illuminateKills", 0)
        bullets_fired = overall_stats_dict.get("bulletsFired", 0)
        bullets_hit = overall_stats_dict.get("bulletsHit", 0)
        total_kills = bug_kills + bot_kills + squid_kills

        if bullets_fired > 0:
            accuracy_percent = (bullets_fired / bullets_hit) * 100 # Stats in API are incorrectly named

        if deaths > 0:
            kd_ratio = total_kills / deaths

        overall_stats_dict['deaths'] = deaths
        overall_stats_dict['terminidKills'] = bug_kills
        overall_stats_dict['automatonKills'] = bot_kills
        overall_stats_dict['illuminateKills'] = squid_kills
        overall_stats_dict['bulletsFired'] = bullets_fired
        overall_stats_dict['bulletsHit'] = bullets_hit
        overall_stats_dict['totalKills'] = total_kills
        overall_stats_dict['accuracy'] = accuracy_percent
        overall_stats_dict['kdRatio'] = kd_ratio
        overall_stats_dict['missionsWonPercent'] = missions_won_percent
        overall_stats_dict['totalMissionTime'] = total_mission_time

        return overall_stats_dict

    except Exception as e:
        print(f"An error occurred while parsing galaxy stats: {e}")
        return None