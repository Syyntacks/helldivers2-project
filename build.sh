#!/bin/bash
# =============================================================
# build.sh — Cloudflare Pages build script
#
# Assembles a "dist/" folder that Cloudflare Pages can serve:
#
#   dist/index.html          → served at /
#   dist/static/...          → served at /static/... (JS, CSS, images)
#   dist/static-api/...      → served at /static-api/... (JSON data files)
#
# The /static/... paths are already hardcoded in index.html and
# main.js, so the folder structure must be preserved exactly.
#
# Cloudflare dashboard settings:
#   Build command:        bash build.sh
#   Build output dir:     dist
#   Root directory:       /   (repo root)
# =============================================================

set -e  # stop immediately if any command fails

echo "--- Building dist/ for Cloudflare Pages ---"

# 1. Obfuscate main.js (same step as the old Azure pipeline)
echo "[1/3] Obfuscating main.js..."
npm ci
npm run obfuscate

# 2. Create the output folder
echo "[2/3] Assembling dist/..."
rm -rf dist
mkdir -p dist

# Copy the entry point to the root of dist/ so Cloudflare serves it at /
cp static/index.html dist/index.html

# Copy the rest of the static folder (JS, CSS, images, etc.)
cp -r static dist/static

# Copy the pre-built static API files (committed by the GitHub Action)
if [ -d static-api ]; then
    cp -r static-api dist/static-api
else
    echo "  Warning: static-api/ not found — JSON data files will be missing."
    echo "  Run build_static_api.py locally or wait for the GitHub Action to generate them."
fi

echo "[3/3] Done."
echo "--- Build complete. Output is in dist/ ---"
