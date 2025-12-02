import requests
import json
import os

# Fetch API data
def fetch_data_from_url(full_url):
   
    if not full_url:
        print("\nError: No URL provided.")
        return None

    print(f"\nAttempting to fetch data from: {full_url}")

    try:
        headers = {
            "User-Agent": f"{os.environ.get("USER_AGENT")}",
            "X-Super-Client": f"{os.environ.get("SUPER_CLIENT")}",
            "X-Super-Contact": f"{os.environ.get("SUPER_CONTACT")}",
            "Accept": "application/json"
        }
        response = requests.get(full_url, headers=headers)
        
        # --- DEBUG: Print what happened ---
        if response.status_code != 200:
            print(f"❌ API Request Failed! Status Code: {response.status_code}")
            print(f"Response text: {response.text[:200]}") # Show first 200 chars of error
        else:
            print(f"✅ API Request Successful! (Size: {len(response.content)} bytes)")
        # ----------------------------------

        response.raise_for_status() # Raises an exception if HTTP error encountered
        
        if not response.text.strip():
            return []
        
        return response.json()
    
    except requests.exceptions.RequestException as exc:
        print(f"\nError fetching data from {full_url} endpoint: {exc}")
        return None
    except json.JSONDecodeError:
        print(f"\nError: Failed to decode JSON from response at {full_url}")
        return None