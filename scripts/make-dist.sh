#!/usr/bin/env bash
# Build the public Cloudflare Pages bundle in dist/. Only files meant to be served.
# Internal files (listings/, scripts/, README, CSV templates) never ship.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build-data.mjs --strict
rm -rf dist && mkdir -p dist/assets dist/data dist/feed
cp index.html 404.html config.js llms.txt manifest.webmanifest sw.js _headers dist/
cp assets/tokens.css assets/app.css assets/app.js assets/skin.js assets/icon.svg dist/assets/
cp data/listings.json data/categories.json data/stacks.json dist/data/
cp feed/listings.json dist/feed/
# Keep search engines out until the seed is checked. Run with INDEX=1 to allow indexing.
if [ "${INDEX:-0}" != "1" ]; then
  printf '/*\n  X-Robots-Tag: noindex\n' >> dist/_headers
  echo "noindex header added (set INDEX=1 to allow search indexing)"
fi
echo "dist/ ready: $(find dist -type f | wc -l) files"
