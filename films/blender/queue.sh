#!/usr/bin/env bash
# Render + encode films that have a built .blend but no output yet, one at a time.
# Usage: bash films/blender/queue.sh id [id ...]
cd "$(dirname "$0")/../.."
B="${BLENDER:-/c/Program Files/Blender Foundation/Blender 5.2/blender.exe}"
for id in "$@"; do
  [ -f "films/out/$id.mp4" ] && { echo "skip $id (done)"; continue; }
  [ -f "films/build/$id.blend" ] || { echo "skip $id (not built)"; continue; }
  # wait while another film render is running
  rm -rf "films/build/$id/frames" "films/build/$id/hud"
  echo "render $id"
  "$B" -b "films/build/$id.blend" --python films/blender/render.py -- --id "$id" --samples 8 --kbps 1800 > "films/build/$id.log" 2>&1
  grep -E "\[render\]|\[encode\]|\[done\]|Error|Traceback" "films/build/$id.log" | tail -5
done
