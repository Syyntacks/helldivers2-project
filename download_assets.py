import os
import requests

BASE_URL = "https://helldivers.wiki.gg/wiki/Special:FilePath/"
SAVE_DIR = "static/src/images/factions/subfaction_icons"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://helldivers.wiki.gg/"
}

biomes = [
    'Predator_Strain',
    'Rupture_Strain',
    'Jet_Brigade',
    'Incineration_Corps',
    'Cyborgs',
    'Mindless_Masses',
    'Appropriators'
]

os.makedirs(SAVE_DIR, exist_ok=True)

print("Initiating asset retrieval...")

for biome in biomes:
    url = f"{BASE_URL}{biome}_Icon.svg"
    save_path = os.path.join(SAVE_DIR, f"{biome}.svg")

    try:
        response = requests.get(url, headers=HEADERS, stream=True, allow_redirects=True)
        if response.status_code == 200:
            with open(save_path, "wb") as file:
                for chunk in response.iter_content(1024):
                    file.write(chunk)
            print(f"[SUCCESS] Downloaded: {biome}.svg")
        else:
            print (f"[FAILED] Could not find {biome}.svg (Status: {response.status_code})")
    except Exception as e:
        print(f"[ERROR] Connection failed for {biome}.svg: {e}")

print ("Extraction complete.")
