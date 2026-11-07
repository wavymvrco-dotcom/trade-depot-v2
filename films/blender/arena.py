# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Film 1 — Arena (docs/FILMS.md): one strategy on one market, then the reveal of
# hundreds of market worlds tested at once; a wave fades the weak, survivors
# brighten and split into the next generation. Seamless 600-frame loop.
#   exec(open(r"<repo>/films/blender/arena.py").read())  — from Blender, or
#   blender -b --python films/blender/arena.py

import math, random, sys, os
import bpy

HERE = os.path.dirname(os.path.abspath(__file__)) if "__file__" in dir() else globals().get("FILMS_DIR")
sys.path.insert(0, HERE)
import importlib, studio
importlib.reload(studio)
from studio import *  # noqa

NX = NY = 18
LOSE_FRACTION = 0.7
WAVE_START, WAVE_SPAN = 270, 70


def bulk(obj_or_data, path, index, frames, values, interp="LINEAR"):
    """Insert many keys at once (fast path for hundreds of animated objects)."""
    idb = obj_or_data
    if not idb.animation_data:
        idb.animation_data_create()
    ad = idb.animation_data
    if not ad.action:
        ad.action = bpy.data.actions.new(f"{idb.name}Action")
    act = ad.action
    if hasattr(act, "fcurve_ensure_for_datablock"):
        fc = act.fcurve_ensure_for_datablock(idb, path, index=index)
    else:
        fc = act.fcurves.find(path, index=index) or act.fcurves.new(path, index=index)
    fc.keyframe_points.add(len(frames))
    co = []
    for f, v in zip(frames, values):
        co += [f, v]
    fc.keyframe_points.foreach_set("co", co)
    for kp in fc.keyframe_points:
        kp.interpolation = interp
    fc.update()
    return fc


def smooth_keys(obj, path, index, pts):
    """pts: [(frame, value)] with eased (bezier) interpolation."""
    fc = bulk(obj, path, index, [p[0] for p in pts], [p[1] for p in pts], interp="BEZIER")
    for kp in fc.keyframe_points:
        kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
    fc.update()


def build():
    reset("arena")
    studio(400)
    rnd = random.Random(20261107)
    centres = grid_centres(NX, NY)
    seeds = [rnd.uniform(0, 40) for _ in centres]
    slabs, ribs = tiles_mesh("Arena", centres, seeds)
    assign(slabs, mat_solid("Slab", "slab", rough=0.7))
    assign(ribs, mat_solid("Ribbon", "ink", rough=0.35, emit=0.15))

    # Hero tile near the centre; always a survivor
    hero = min(range(len(centres)), key=lambda i: (centres[i][0] - 0.575) ** 2 + (centres[i][1] - 0.575) ** 2)
    fitness = [rnd.random() for _ in centres]
    fitness[hero] = 1.0
    cut = sorted(fitness)[int(LOSE_FRACTION * len(fitness))]
    maxd = max(math.hypot(*c) for c in centres)

    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.085, depth=0.045)
    puck_mesh = bpy.context.object.data; puck_mesh.name = "Puck"
    bpy.data.objects.remove(bpy.context.object)
    pm = mat_object_colour("PuckColour", rough=0.3, emit_scale=1.6)
    puck_mesh.materials.append(pm)

    ink, pos, grey = col("ink"), col("pos"), col("grey")
    step = 5
    frames = list(range(1, FRAMES + 2, step))

    def path_keys(ob, cx, cy, seed, phase, laps=2):
        xs, ys, zs = [], [], []
        for f in frames:
            t = (f - 1) / FRAMES
            u = 0.5 - 0.5 * math.cos(2 * math.pi * (laps * t + phase))
            p = ribbon_point(cx, cy, u, seed)
            xs.append(p.x); ys.append(p.y); zs.append(p.z + 0.04)
        for i, vals in enumerate((xs, ys, zs)):
            bulk(ob, "location", i, frames, vals)

    survivors = 0
    for i, ((cx, cy), seed) in enumerate(zip(centres, seeds)):
        ob = bpy.data.objects.new(f"Puck{i:03d}", puck_mesh)
        bpy.context.collection.objects.link(ob)
        phase = rnd.random()
        path_keys(ob, cx, cy, seed, phase)
        d = math.hypot(cx, cy) / maxd
        w0 = WAVE_START + int(d * WAVE_SPAN)
        lose = fitness[i] < cut
        # Colour: navy and dim -> (wave) -> green and bright, or grey and dark; restored before the loop ends
        if lose:
            seq = [(1, ink, 0.25), (w0, ink, 0.25), (w0 + 24, grey, 0.0), (540, grey, 0.0), (585, ink, 0.25), (601, ink, 0.25)]
            smooth_keys(ob, "delta_location", 2, [(1, 0), (w0, 0), (w0 + 30, -0.16), (540, -0.16), (585, 0), (601, 0)])
        else:
            survivors += 1
            seq = [(1, ink, 0.25), (w0, ink, 0.25), (w0 + 18, pos, 0.9), (540, pos, 0.9), (585, ink, 0.25), (601, ink, 0.25)]
            smooth_keys(ob, "scale", 0, [(1, 1), (w0, 1), (w0 + 8, 1.35), (w0 + 20, 1), (601, 1)])
            smooth_keys(ob, "scale", 1, [(1, 1), (w0, 1), (w0 + 8, 1.35), (w0 + 20, 1), (601, 1)])
            # Offspring: appears beside its parent, rides the same ribbon half a lap behind
            kid = bpy.data.objects.new(f"Kid{i:03d}", puck_mesh)
            bpy.context.collection.objects.link(kid)
            path_keys(kid, cx, cy, seed, phase + 0.18)
            for ax in range(3):
                smooth_keys(kid, "scale", ax, [(1, 0), (w0 + 12, 0), (w0 + 34, 1), (530, 1), (575, 0), (601, 0)])
            for ch in range(4):
                bulk(kid, "color", ch, [1, 601], [pos[ch] if ch < 3 else 0.9] * 2)
        for ch in range(4):
            smooth_keys(ob, "color", ch, [(f, (c[ch] if ch < 3 else a)) for f, c, a in seq])

    # Camera: close on the hero tile -> crane up to the whole grid -> slow orbit -> back (seamless)
    hx, hy = centres[hero]
    cam, tgt = camera(lens=50, dof_target=True, fstop=2.0)
    camera_path(cam, tgt, [
        (1,   (hx - 1.1, hy - 1.35, 0.7), (hx, hy, 0.24), 50),
        (110, (hx - 0.55, hy - 1.35, 0.78), (hx, hy, 0.24), 50),
        (300, (-6.5, -9.5, 7.2), (0, 1.2, 0), 28),
        (430, (5.5, -10, 6.5), (0, 1.2, 0), 28),
        (500, (3.5, -8, 5), (0.3, 0.8, 0), 32),
        (601, (hx - 1.1, hy - 1.35, 0.7), (hx, hy, 0.24), 50),
    ])
    # DOF only matters close up; open the aperture as the camera rises
    cam.data.dof.aperture_fstop = 2.0
    smooth_keys(cam.data, "dof.aperture_fstop", 0, [(1, 2.0), (110, 2.0), (220, 16), (500, 16), (590, 2.0), (601, 2.0)])
    print(f"arena: {len(centres)} worlds, {survivors} survive")
    return cam


if globals().get("__name__") == "__main__" or "FILMS_DIR" in globals():
    build()
    out = globals().get("FILMS_OUT") or os.path.join(HERE, "..", "build", "arena.blend")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    save(os.path.abspath(out))
