#!/usr/bin/env bash
# Build the public Cloudflare Pages bundle in dist/. Only files meant to be served.
# Internal files (listings/, scripts/, README, CSV templates) never ship.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build-data.mjs --strict --site "${SITE_URL:-https://chronorail.si}"
rm -rf dist && mkdir -p dist/assets dist/data dist/feed
cp index.html 404.html config.js llms.txt manifest.webmanifest sw.js _headers dist/
mkdir -p dist/assets/brand && cp assets/brand/*.svg dist/assets/brand/
cp assets/tokens.css assets/app.css assets/app.js assets/skin.js assets/icon.svg dist/assets/
cp data/listings.json data/categories.json data/stacks.json dist/data/
cp feed/listings.json dist/feed/
# Indexed by default (Silas, 2026-11-18). Run with NOINDEX=1 to hide a build from search engines.
printf 'User-agent: *\nAllow: /\n' > dist/robots.txt
if [ "${NOINDEX:-0}" = "1" ]; then
  printf '/*\n  X-Robots-Tag: noindex\n' >> dist/_headers
  printf 'User-agent: *\nDisallow: /\n' > dist/robots.txt
  echo "noindex header added (NOINDEX=1)"
fi
echo "dist/ ready: $(find dist -type f | wc -l) files"
