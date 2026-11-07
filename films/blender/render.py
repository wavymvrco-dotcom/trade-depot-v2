# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Render a film and encode it (docs/FILMS.md). Runs in background Blender:
#   blender -b films/build/<id>.blend --python films/blender/render.py -- --id arena --label "..." [--skip-frames]
# 1) frames -> films/build/<id>/frames/f_0001.png  2) a sequencer scene adds the lower-third label
# and writes <id>.mp4 (H.264), <id>.webm (VP9) and <id>.webp (poster, frame 300) to films/out/.

import argparse, os, sys, time
import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("--id", required=True)
ap.add_argument("--label", default="")
ap.add_argument("--skip-frames", action="store_true")
ap.add_argument("--samples", type=int, default=8)
ap.add_argument("--kbps", type=int, default=2000)
a = ap.parse_args(argv)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FRAMES_DIR = os.path.join(ROOT, "build", a.id, "frames")
OUT = os.path.join(ROOT, "out")
os.makedirs(FRAMES_DIR, exist_ok=True); os.makedirs(OUT, exist_ok=True)
FONT = next((f for f in (r"C:\Windows\Fonts\georgia.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf") if os.path.exists(f)), None)

film = bpy.context.scene
N = film.frame_end
t0 = time.time()
if not a.skip_frames:
    film.eevee.taa_render_samples = a.samples
    film.eevee.volumetric_tile_size = "16"
    film.render.image_settings.file_format = "PNG"
    film.render.image_settings.color_mode = "RGB"
    film.render.filepath = os.path.join(FRAMES_DIR, "f_")
    film.render.use_overwrite = False      # resume after an interruption
    film.render.use_placeholder = True
    bpy.ops.render.render(animation=True, scene=film.name)
    print(f"[render] {a.id}: {N} frames in {time.time() - t0:.0f}s", flush=True)

# HUD overlay scene (text layer) -> RGBA frames
HUD_DIR = os.path.join(ROOT, "build", a.id, "hud")
hud_scene = bpy.data.scenes.get(f"{film.name}_hud")
if hud_scene and not a.skip_frames:
    os.makedirs(HUD_DIR, exist_ok=True)
    hud_scene.render.image_settings.file_format = "PNG"
    hud_scene.render.image_settings.color_mode = "RGBA"
    hud_scene.render.filepath = os.path.join(HUD_DIR, "h_")
    hud_scene.render.use_overwrite = False
    hud_scene.render.use_placeholder = True
    bpy.ops.render.render(animation=True, scene=hud_scene.name)
    print(f"[render] {a.id}: HUD done in {time.time() - t0:.0f}s", flush=True)

# ─── Encode in a sequencer scene ──────────────────────────────────────────────
enc = bpy.data.scenes.new(f"{a.id}_encode")
enc.render.resolution_x, enc.render.resolution_y, enc.render.resolution_percentage = 1920, 1080, 100
enc.render.fps = film.render.fps
enc.frame_start, enc.frame_end = 1, N
enc.view_settings.view_transform = "Standard"
seq = enc.sequence_editor_create()
strips = seq.strips if hasattr(seq, "strips") else seq.sequences
files = sorted(f for f in os.listdir(FRAMES_DIR) if f.endswith(".png"))
img = strips.new_image("frames", os.path.join(FRAMES_DIR, files[0]), channel=1, frame_start=1)
for f in files[1:]:
    img.elements.append(f)
img.colorspace_settings.name = "sRGB" if "sRGB" in [i.identifier for i in img.colorspace_settings.bl_rna.properties["name"].enum_items] else img.colorspace_settings.name

if hud_scene and os.path.isdir(HUD_DIR):
    hf = sorted(f for f in os.listdir(HUD_DIR) if f.endswith(".png"))
    if hf:
        ov = strips.new_image("hud", os.path.join(HUD_DIR, hf[0]), channel=2, frame_start=1)
        for f in hf[1:]:
            ov.elements.append(f)
        ov.blend_type = "ALPHA_OVER"

# Voice-over: one sound strip per narration line, at the line start used when the film was built
VO_DIR = os.path.join(ROOT, "vo", a.id)
has_vo = os.path.isdir(VO_DIR) and any(f.endswith(".wav") for f in os.listdir(VO_DIR))
if has_vo:
    sys.path.insert(0, os.path.dirname(__file__))
    import studio2
    _, lines, _ = studio2.narration(a.id)
    for L in lines:
        wav = os.path.join(VO_DIR, f"{L['n']:02d}.wav")
        if os.path.exists(wav):
            strips.new_sound(f"vo{L['n']:02d}", wav, channel=3 + L["n"] % 2, frame_start=L["f0"])

if a.label:
    tx = strips.new_effect("label", "TEXT", channel=2, frame_start=1, length=N) if "length" in strips.new_effect.__doc__ else strips.new_effect("label", "TEXT", channel=2, frame_start=1, frame_end=N + 1)
    tx.text = a.label
    tx.font_size = 40
    tx.color = (0.12, 0.13, 0.15, 1.0)
    tx.use_box = True
    tx.box_color = (0.957, 0.945, 0.918, 0.92)
    tx.box_margin = 0.012
    tx.location = (0.05, 0.075)
    tx.anchor_x, tx.anchor_y = "LEFT", "BOTTOM"
    if FONT:
        tx.font = bpy.data.fonts.load(FONT)
    # Fade in after 1 s, out 1 s before the loop point (so the loop seam has no text)
    for f, v in ((1, 0.0), (30, 0.0), (48, 1.0), (N - 48, 1.0), (N - 30, 0.0), (N, 0.0)):
        tx.blend_alpha = v; tx.keyframe_insert("blend_alpha", frame=f)

def encode(container, codec, ext):
    r = enc.render
    if hasattr(r.image_settings, "media_type"):
        r.image_settings.media_type = "VIDEO"      # Blender 5: video output is its own media type
    r.image_settings.file_format = "FFMPEG"
    r.ffmpeg.format = container
    r.ffmpeg.codec = codec
    r.ffmpeg.constant_rate_factor = "NONE"
    r.ffmpeg.video_bitrate = a.kbps
    r.ffmpeg.maxrate = int(a.kbps * 1.5)
    r.ffmpeg.minrate = 0
    r.ffmpeg.buffersize = a.kbps * 2
    r.ffmpeg.gopsize = 30
    r.ffmpeg.audio_codec = ("AAC" if ext == "mp4" else "OPUS") if has_vo else "NONE"
    if has_vo:
        r.ffmpeg.audio_bitrate = 128
        r.ffmpeg.audio_channels = "MONO"
    r.filepath = os.path.join(OUT, f"{a.id}.{ext}")
    r.use_file_extension = False
    bpy.ops.render.render(animation=True, scene=enc.name)
    print(f"[encode] {r.filepath}: {os.path.getsize(r.filepath) / 1e6:.1f} MB", flush=True)

encode("MPEG4", "H264", "mp4")
encode("WEBM", "WEBM", "webm")

# Poster: frame 300 with the label (a one-frame animation render: a still render ignores frame_set here)
P = min(300, N)
enc.frame_start = enc.frame_end = P
if hasattr(enc.render.image_settings, "media_type"):
    enc.render.image_settings.media_type = "IMAGE"
enc.render.image_settings.file_format = "WEBP"
enc.render.image_settings.quality = 82
enc.render.use_file_extension = True
enc.render.filepath = os.path.join(OUT, f"{a.id}_poster_")
bpy.ops.render.render(animation=True, scene=enc.name)
tmp = os.path.join(OUT, f"{a.id}_poster_{P:04d}.webp")
final = os.path.join(OUT, f"{a.id}.webp")
if os.path.exists(final):
    os.remove(final)
os.replace(tmp, final)
print(f"[done] {a.id} in {time.time() - t0:.0f}s", flush=True)
