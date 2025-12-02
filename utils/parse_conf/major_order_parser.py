from . import datetime_converter
from utils.parse_conf.planet_data_parser import PlanetParser

def parse_major_order_data(data, planet_parser: PlanetParser, user_timezone="UTC", task_types_map=None, reward_types_map=None):

    if task_types_map is None:
        task_types_map = {}
    if reward_types_map is None:
        reward_types_map = {}
    
    # List to hold multiple dictionaries
    parsed_orders = []
    
    if not isinstance(data, list):
        print(f"Error: Expected a list of major orders, but received {type(data)}")
        return None

    try:  
        for order in data:
            order_details = {}

            order_details["order_id"] = order.get("id32")

            order_details["order_expires"] = datetime_converter.get_expiration_from_seconds(order.get("expiresIn"), user_timezone)

            # Mission settings
            mission_settings = order.get("setting", {})
            order_type_id = str(mission_settings.get("type")) # Needed to make sure string
            order_details["order_type"] = order_type_id
            order_details["order_type_name"] = task_types_map.get(order_type_id, "Unknown Objective Type")

            order_details["order_title"] = mission_settings.get("overrideTitle")
            order_details["order_briefing"] = mission_settings.get("overrideBrief")
            order_details["order_taskDescr"] = mission_settings.get("taskDescription")

            # Task-specifics
            tasks_list = mission_settings.get("tasks", [])
            order_progress = order.get("progress")
            order_details["order_progress"] = order_progress
            parsed_tasks = [] # Holds parsed tasks

            for i, task in enumerate(tasks_list): # Enumerate turns a number into an index for a list
                task_details = {}
                values = task.get("values", [])
                valueTypes = task.get("valueTypes", [])
                value_map = dict(zip(valueTypes, values)) # Pair two value lists together
                
                task_type_id = str(task.get("type"))
                task_details["type"] = task_type_id
                task_details["type_name"] = task_types_map.get(task_type_id, "Unknown Task Type")


                ## Task's planet specifics
                task_details["goal"] = value_map.get(3) # 3 = goal
                target_id = value_map.get(12) # 12 = Planet ID for MO
                task_details["target_planet_id"] = target_id
                task_details["target_name"] = planet_parser.get_planet_name_by_id(target_id)
                

                if order_progress and i < len(order_progress):
                    task_details["progress"] = order_progress[i]
                else:
                    task_details["progress"] = 0

                parsed_tasks.append(task_details)

            order_details["tasks"] = parsed_tasks

            # Reward Parsing
            reward_data = mission_settings.get("reward", {})
            if reward_data and isinstance(reward_data, dict):
                reward_type_id = str(reward_data.get("type"))
                order_details["reward_type"] = reward_type_id
                order_details["rewards_amount"] = reward_data.get("amount")
            else:
                order_details["rewards_amount"] = None
                

            parsed_orders.append(order_details)

        print(f"Successfully parsed {len(parsed_orders)} major orders.")
        return parsed_orders
            
    except (AttributeError, TypeError, KeyError) as e:
        print (f"Error processing major order's data: {e} - Data causing error: {order}")
        return None