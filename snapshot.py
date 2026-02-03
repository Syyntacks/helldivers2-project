from main_exe import main_program
import os

os.makedirs("data_cache", exist_ok=True)
os.makedirs("data_history", exist_ok=True)

print("--- STARTING HOURLY SNAPSHOT --- ")

main_program(save_history=True)

print("--- SNAPSHOT COMPLETE ---")