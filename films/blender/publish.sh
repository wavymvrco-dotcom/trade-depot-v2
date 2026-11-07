#!/usr/bin/env bash
# Put finished films on the website: copies films/out/<id>.mp4 + .webp into
# client/public/films and lists the id in client/src/content/films-published.json.
# Usage: bash films/blender/publish.sh id [id ...]   (then commit + push; Render redeploys)
cd "$(dirname "$0")/../.."
mkdir -p client/public/films
for id in "$@"; do
  src="films/out/$id"; [ -f "$src.mp4" ] || src="films/out/silent/$id"
  [ -f "$src.mp4" ] || { echo "skip $id (no render yet)"; continue; }
  cp "$src.mp4" "client/public/films/$id.mp4"; cp "$src.webp" "client/public/films/$id.webp"
  node -e 'const f="client/src/content/films-published.json";const fs=require("fs");const s=new Set(JSON.parse(fs.readFileSync(f,"utf8")));s.add(process.argv[1]);fs.writeFileSync(f,JSON.stringify([...s].sort())+"\n")' "$id"
  echo "published $id ($(du -h "client/public/films/$id.mp4" | cut -f1))"
done
