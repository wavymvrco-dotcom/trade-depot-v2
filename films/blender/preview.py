# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Contact sheet of key frames, for checking a film without the Blender window:
#   blender -b films/build/<id>.blend --python films/blender/preview.py -- --frames 1,150,300,450 --out sheet.png

import argparse, os, sys
import bpy
import numpy as np

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--frames", default="1,120,240,360,480,560")
ap.add_argument("--out", required=True)
ap.add_argument("--w", type=int, default=640)
a = ap.parse_args(argv)

s = bpy.context.scene
s.eevee.taa_render_samples = 8
s.render.resolution_percentage = int(100 * a.w / s.render.resolution_x)
s.render.image_settings.file_format = "PNG"
s.render.image_settings.color_mode = "RGBA"
frames = [int(f) for f in a.frames.split(",")]
tiles = []
tmp = os.path.splitext(a.out)[0] + "_tmp.png"
for f in frames:
    s.frame_set(f)
    s.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    im = bpy.data.images.load(tmp, check_existing=False)
    w, h = im.size
    px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(im)
    hs = bpy.data.scenes.get(f"{s.name}_hud")
    if hs:   # lay the HUD overlay on top, as render.py does
        hs.render.resolution_percentage = s.render.resolution_percentage
        hs.render.image_settings.file_format = "PNG"; hs.render.image_settings.color_mode = "RGBA"
        hs.frame_set(f); hs.render.filepath = tmp
        bpy.ops.render.render(write_still=True, scene=hs.name)
        hi = bpy.data.images.load(tmp, check_existing=False)
        hp = np.array(hi.pixels[:], dtype=np.float32).reshape(h, w, 4); bpy.data.images.remove(hi)
        al = hp[..., 3:4]
        px[..., :3] = hp[..., :3] + px[..., :3] * (1 - al)
    tiles.append(px)
cols = 3 if len(tiles) > 4 else 2
rows = (len(tiles) + cols - 1) // cols
h, w = tiles[0].shape[:2]
sheet = np.ones((rows * h + (rows - 1) * 6, cols * w + (cols - 1) * 6, 4), dtype=np.float32) * np.array([0.08, 0.08, 0.08, 1])
for i, t in enumerate(tiles):
    r, c = divmod(i, cols)
    y0 = (rows - 1 - r) * (h + 6)          # Blender images are bottom-up
    sheet[y0:y0 + h, c * (w + 6):c * (w + 6) + w] = t
out = bpy.data.images.new("sheet", sheet.shape[1], sheet.shape[0], alpha=True)
out.pixels = sheet.ravel()
out.filepath_raw = a.out; out.file_format = "PNG"; out.save()
os.remove(tmp)
print("SHEET", a.out, "frames", frames)
