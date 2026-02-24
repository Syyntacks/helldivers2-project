import requests
import json
import os
import time
import hashlib
import tempfile
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOCAL_CACHE_DIR = os.path.join(BASE_DIR, "data_cache")
LOCAL_HISTORY_DIR = os.path.join(BASE_DIR, "data_history")

def get_writable_dir(local_path):
    if os.access(os.path.dirname(local_path), os.W_OK):
        return local_path
    else:
        return os.path.join(tempfile.gettempdir(), os.path.basename(local_path))

CACHE_DIR = get_writable_dir(LOCAL_CACHE_DIR)
HISTORY_DIR = get_writable_dir(LOCAL_HISTORY_DIR)

os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(HISTORY_DIR, exist_ok=True)


def get_cache_filepath(url, custom_key=None):
    if custom_key:
        filename = f"{custom_key}.json"
    else:
        url_hash = hashlib.md5(url.encode('utf-8')).hexdigest()
        filename = f"cached_{url_hash}.json"

    return os.path.join(CACHE_DIR, filename)


def save_to_history(data, prefix):
    now = datetime.now()
    date_folder = now.strftime("%Y-%m-%d")
    time_filename = now.strftime("%H-%M-%S")

    category_dir = os.path.join(HISTORY_DIR, prefix, date_folder)
    os.makedirs(category_dir, exist_ok=True)

    filename = f"{prefix}_{time_filename}.json"
    filepath = os.path.join(category_dir, filename)

    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4)
        # print(f"    [History] Snapshot saved: {filename}")
    except Exception as e:
        print(f"    [History] Error saving snapshot: {e}")


# Fetch API data
def fetch_data_from_url(full_url, cache_key=None, ttl=60, save_history=False):
    """
    Fetches data with caching logic.
    """
    if not full_url:
        print("\nError: No URL provided.")
        return None

    cache_filepath = get_cache_filepath(full_url, cache_key)
    data = None
    
    is_cache_valid = False
    if os.path.exists(cache_filepath):
        file_age = time.time() - os.path.getmtime(cache_filepath)
        if file_age < ttl:
            is_cache_valid = True
    
    if is_cache_valid:
        try:
            with open(cache_filepath, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # print(f"    [Cache] Hit! Using cached data for {cache_key or 'url'}")
        except json.JSONDecodeError:
            print(f"    [Cache] Corrupt file found. Refetching...")
            is_cache_valid = False # Force refetch if corrupt

    if not is_cache_valid or data is None:
        print(f"\n[API] Fetching fresh data from: {full_url}")
        try:
            headers = {
                "User-Agent": f"{os.environ.get('USER_AGENT', 'Helldivers2Project')}",
                "X-Super-Client": f"{os.environ.get('SUPER_CLIENT', 'ProjectClient')}",
                "X-Super-Contact": f"{os.environ.get('SUPER_CONTACT', 'syyntacks')}",
                "Accept": "application/json",
                "Accept-Language": "en-US",
                "Cache-Control": "no-cache"
            }
            
            response = requests.get(full_url, headers=headers, timeout=10)
            
            if response.status_code != 200:
                print(f"❌ API Request Failed! Status: {response.status_code}")
                print(f"Server Reason: {response.text}")
                # Try to use stale cache if available
                if os.path.exists(cache_filepath):
                    print("    ⚠️  Serving stale cache due to API error.")
                    with open(cache_filepath, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                else:
                    return None
            else:
                data = response.json()
                
                # 3. SAVE TO CACHE (Only if we fetched new data)
                try:
                    with open(cache_filepath, 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=4)
                except Exception as e:
                    print(f"    ⚠️  Error writing cache file: {e}")

        except requests.exceptions.RequestException as exc:
            print(f"\nError fetching data: {exc}")
            return None

    if save_history and cache_key and data:
        save_to_history(data, cache_key)

    return data