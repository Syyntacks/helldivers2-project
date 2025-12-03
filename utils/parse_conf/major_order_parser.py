from . import datetime_converter
from utils.parse_conf.planet_data_parser import PlanetParser
from utils.parse_conf.data_fetcher import fetch_data_from_url
from conf import settings
from json import loads

class MajorOrderParser():
    """
        Handles all functions regarding the aggregation
        of major order data.
    """

    def __init__(self, planet_parser: PlanetParser, user_timezone="UTC", task_types_map=None, reward_types_map=None, value_types_map=None, item_names_map=None, factions_map=None):
        self.planet_parser = planet_parser
        self.user_timezone = user_timezone
        self.task_types_map = task_types_map or {}
        self.reward_types_map = reward_types_map or {}
        self.value_types_map = value_types_map or {}
        self.item_names_map = item_names_map or {}
        self.factions_map = factions_map or {}

        self.reverse_value_map = {v: k for k, v in self.value_types_map.items()}

    def get_item_name(self, item_id):

        if item_id is None:
            return None
        
        # Collect a string of the item id as the key
        # Use it to get the item
        key = str(item_id)
        item_data = self.item_names_map.get(key)

        # If item data found, get the name of the item
        if item_data:
            return item_data.get("name")
        return None
    
    def get_value_key(self, name):
        key_str = self.reverse_value_map.get(name)
        if key_str:
            return int(key_str)
        return None


    def parse_major_order_data(self, data):
        if not isinstance(data, list):
            print(f"Error: Expected a list of major orders, but received {type(data)}")
            return None

        parsed_orders = []

        try:  
            for order in data:
                order_data = {}
                order_setting = order.get("setting", {})
        
                order_data["orderId"] = order.get("id32")
                order_data["orderExpires"] = datetime_converter.get_expiration_from_seconds(order.get("expiresIn"), self.user_timezone)

                # Order type
                order_type_id = str(order_setting.get("type"))
                order_type_name = self.task_types_map.get(order_type_id, "Unknown Objective Type")
                order_data["orderType"] = order_type_id
                order_data["orderTypeName"] = order_type_name

                order_data["orderTitle"] = order_setting.get("overrideTitle")
                order_data["orderBriefing"] = order_setting.get("overrideBrief")
                order_data["orderTaskDescr"] = order_setting.get("taskDescription")

                # Task-specifics
                order_progress = order.get("progress")
                order_data["orderProgress"] = order_progress

                tasks_list = order_setting.get("tasks", [])
                parsed_tasks = [] # Holds parsed tasks

                for i, task in enumerate(tasks_list): # Enumerate turns a number into an index for a list
                    task_details = {}
                    values = task.get("values", [])
                    value_types = task.get("valueTypes", [])
                    value_map = dict(zip(value_types, values)) # Pair two value lists together
                    
                    task_type_id = str(task.get("type"))
                    task_type_name = self.task_types_map.get(task_type_id, "Unknown Task Type")
                    task_details["type"] = task_type_id
                    task_details["typeName"] = task_type_name

                    goal_key = self.get_value_key("goal")
                    task_details["goal"] = value_map.get(goal_key)

                    #############################
                    ## Task's planet specifics ##
                    ## ======================= ##

                    target_info = self._resolve_task_details_by_type(task_type_name, value_map, values)

                    task_details["targetName"] = target_info["name"]
                    task_details["targetPlanetId"] = target_info.get("planet_id")
                    
                    if order_progress and i < len(order_progress):
                        task_details["progress"] = order_progress[i]
                    else:
                        task_details["progress"] = 0

                    parsed_tasks.append(task_details)

                order_data["tasks"] = parsed_tasks

                # Reward Parsing
                rewards_list = order_setting.get("rewards", [])
                if rewards_list and len(rewards_list) > 0:
                    for reward in rewards_list:
                        reward_type_id = str(reward.get("type"))
                        order_data["rewardType"] = reward_type_id
                        reward_amount = str(reward.get("amount"))
                        order_data["rewardsAmount"] = reward_amount
                else:
                    order_data["rewardsAmount"] = None
                    

                parsed_orders.append(order_data)

            print(f"Successfully parsed {len(parsed_orders)} major orders.")
            return parsed_orders
        
        except (AttributeError, TypeError, KeyError) as e:

            import traceback
            traceback.print_exc()
            print (f"Error processing major order's data: {e}")
            return None
        
    
    def _get_type_id_by_name(self, name_to_find):
        for id, name in self.task_types_map.items():
            if name == name_to_find:
                return id
        return None

        
    def _resolve_task_details_by_type(self, task_type_name, value_map, raw_values):
        result = {"name": "Unknown Target", "planet_id": None}

        planet_key_id = self.get_value_key("locationIndex")
        faction_key_id = self.get_value_key("faction")
        target_key_id = self.get_value_key("targetID")
        loc_type_key_id = self.get_value_key("locationType")

        planet_id = value_map.get(planet_key_id)
        faction_id = value_map.get(faction_key_id)
        target_id = value_map.get(target_key_id)
        loc_type_id = value_map.get(loc_type_key_id)

        planet_name = self.planet_parser.get_planet_name_by_id(planet_id) if planet_id else None # If planet_id exists, then collect its respective name
        
        faction_name = None
        if faction_id is not None:
            faction_name = self.factions_map.get(faction_id)

        ## Extract Samples ------------------------------------
        if task_type_name == "ExtractSamples":
            found_item = False
            for val in raw_values:
                item_name = self.get_item_name(val)
                if item_name:
                    result["name"] = item_name
                    found_item = True
                    break

            if not found_item:
                result["name"] = "Any Samples"
            result

        ## Kill Enemies ---------------------------------------
        if task_type_name == "KillEnemies":
            ### If specific enemy type
            if target_id:
                target_name = self.get_item_name(target_id) ### Enemy target
                if target_name:
                    result["name"] = target_name
                    return result
            
            ### If general faction enemies
            if faction_name:
                result["name"] = faction_name
                return result

            ### HELPED 
            for val in raw_values:
                item_name = self.get_item_name(val)
                if item_name:
                    result["name"] = item_name
                    return result
                
        ## Operations-Oriented --------------------------------
        if task_type_name in ["CompleteObjs", "CompleteOperations", "Extract"]:
            if planet_name and "Unknown" not in planet_name:
                result["name"] = planet_name
                result["planet_id"] = planet_id
                return result


        ## Territory ------------------------------------------
        if task_type_name in ['Liberate', 'Defense', 'Hold', 'Contest']:
            if loc_type_id == 1 and planet_name and "Unknown" not in planet_name:
                result["name"] = planet_name
                result["planet_id"] = planet_id
                return result
            elif loc_type_id == 2:
                result["name"] = "Designated Sector"
                return result
            elif loc_type_id == 0:
                result["name"] = "Across the Galaxy"
            
            if planet_name and "Unknown" not in planet_name:
                result["name"] = planet_name
                result["planet_id"] = planet_id
                return result
        
        ## FALLBACK
        if planet_name and "Unknown" not in planet_name:
            result["name"] = planet_name
            result["planet_id"] = planet_id
        elif faction_name:
            result["name"] = f"Target: {faction_name}"

        return result