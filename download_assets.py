import os
import requests

BASE_URL = "https://helldiverscompanion.com/planets/"
SAVE_DIR = "static/images/planets"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://helldiverscompanion.com/"
}

biomes = [
    'moor_arid'
]

os.makedirs(SAVE_DIR, exist_ok=True)

print("Initiating asset retrieval...")

for biome in biomes:
    url = f"{BASE_URL}{biome}.webp"
    save_path = os.path.join(SAVE_DIR, f"{biome}.webp")

    try:
        response = requests.get(url, headers=HEADERS, stream=True)
        if response.status_code == 200:
            with open(save_path, "wb") as file:
                for chunk in response.iter_content(1024):
                    file.write(chunk)
            print(f"[SUCCESS] Downloaded: {biome}.webp")
        else:
            print (f"[FAILED] Could not find {biome}.webp (Status: {response.status_code})")
    except Exception as e:
        print(f"[ERROR] Connection failed for {biome}: {e}")

print ("Extraction complete.")
