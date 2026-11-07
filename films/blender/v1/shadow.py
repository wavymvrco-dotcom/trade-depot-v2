# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Film 4 — Shadow Run (docs/FILMS.md): a live price line draws itself; the strategy
# (solid) and its shadow twin (glass) ride the newest bar; every decision is
# pinned one bar ahead of the price and chained into a record; a balance tilts.

import os, sys, math, random, importlib
HERE = globals().get("FILMS_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import studio; importlib.reload(studio)
from studio import *  # noqa
import bpy
from mathutils import Vector

L = 7.0           # ribbon length
SEED = 11.3
GROW_END = 480    # the line finishes drawing here
RESET = (540, 590)


def x_at(f):
    """Tip position (0..1) of the live line at frame f."""
    return min(1.0, max(0.0, (f - 1) / (GROW_END - 1)))


def tip(u, lane=0.0):
    p = ribbon_point(0, 0, u, SEED, L, 0.06, 2.2)
    return Vector((p.x, p.y + lane, p.z))


def build():
    reset("shadow")
    studio(400)
    slabs, ribs = tiles_mesh("Live", [(0, 0)], [SEED], size=L + 0.4, depth=1.4, length=L, steps=420, ribbon_w=0.05, scale=2.2)
    assign(slabs, mat_solid("Slab", "slab", rough=0.7))
    assign(ribs, mat_solid("Ribbon", "ink", rough=0.35, emit=0.2))
    # Draw the line left to right; hide it during the reset so the loop starts empty
    b = ribs.modifiers.new("Grow", "BUILD")
    ribs.modifiers.move(len(ribs.modifiers) - 1, 0)       # build before solidify
    b.frame_start = 1; b.frame_duration = GROW_END
    for f, v in ((1, 1), (RESET[0], 1), (RESET[0] + 1, 9999), (600, 9999), (601, 1)):
        b.frame_start = v; ribs.keyframe_insert(f'modifiers["Grow"].frame_start', frame=f)
    for fc in fcurves_of(ribs.animation_data.action):
        for kp in fc.keyframe_points:
            kp.interpolation = "CONSTANT"

    solid_m = mat_solid("Strategy", "ink", rough=0.3, emit=0.4)
    glass_m = mat_solid("Twin", "8FB0D6", rough=0.08, emit=0.25, alpha=0.5)
    pm = puck_mesh(0.13, 0.06, "PuckS"); pm.materials.append(solid_m)
    gm = puck_mesh(0.13, 0.06, "PuckG"); gm.materials.append(glass_m)
    solid = new_obj("Strategy", pm); twin = new_obj("Twin", gm)
    for ob, lane in ((solid, -0.22), (twin, 0.22)):
        pts = []
        for f in list(range(1, GROW_END + 1, 8)) + [GROW_END, RESET[0], RESET[1], 601]:
            u = x_at(f) if f <= RESET[0] else 0.0
            p = tip(u, lane)
            pts.append((f, (p.x, p.y, p.z + 0.05)))
        bulk(ob, "location", 0, [p[0] for p in pts], [p[1][0] for p in pts])
        bulk(ob, "location", 1, [p[0] for p in pts], [p[1][1] for p in pts])
        bulk(ob, "location", 2, [p[0] for p in pts], [p[1][2] for p in pts])
        smooth(ob, "scale", 0, [(1, 1), (RESET[0], 1), (RESET[0] + 15, 0), (RESET[1], 0), (600, 1), (601, 1)])
        smooth(ob, "scale", 1, [(1, 1), (RESET[0], 1), (RESET[0] + 15, 0), (RESET[1], 0), (600, 1), (601, 1)])

    # Decisions: a pin one bar ahead of the newest price, then a link into the record chain
    pin_m = mat_solid("Pin", "ink", rough=0.3)
    head_s = mat_solid("PinHeadS", "ink", rough=0.3, emit=0.6)
    head_g = mat_solid("PinHeadG", "pos", rough=0.3, emit=0.8)
    cube_m = mat_solid("Record", "3E5C80", rough=0.35, emit=0.15)
    link_m = mat_solid("Link", "grey", rough=0.5)
    prev_cube = None
    for n, f in enumerate(range(30, GROW_END - 10, 40)):
        u = x_at(f) + 0.035
        for lane, hm, tag in ((-0.22, head_s, "S"), (0.22, head_g, "G")):
            p = tip(min(1, u), lane)
            pin = prim("cylinder", f"Pin{tag}{n}", pin_m, vertices=12, radius=0.008, depth=0.32)
            pin.location = (p.x, p.y, p.z + 0.16)
            head = prim("uv_sphere", f"Head{tag}{n}", hm, segments=16, ring_count=8, radius=0.035)
            head.parent = pin; head.location = (0, 0, 0.17)
            for ax in range(3):
                smooth(pin, "scale", ax, [(1, 0), (f, 0), (f + 6, 1), (RESET[0], 1), (RESET[0] + 20, 0), (601, 0)])
        cube = prim("cube", f"Rec{n}", cube_m, size=0.16)
        cube.location = (tip(min(1, u)).x, 1.1, 0.12)
        bevel(cube, 0.01, 2)
        for ax in range(3):
            smooth(cube, "scale", ax, [(1, 0), (f + 8, 0), (f + 16, 1), (RESET[0] + 10, 1), (RESET[0] + 30, 0), (601, 0)])
        if prev_cube is not None:
            link = prim("cylinder", f"Link{n}", link_m, vertices=8, radius=0.012, depth=1.0)
            a, c = prev_cube.location, cube.location
            mid = (a + c) / 2
            link.location = mid; link.rotation_euler = (0, math.radians(90), 0)
            length = (c - a).length
            smooth(link, "scale", 2, [(1, 0), (f + 14, 0), (f + 20, length), (RESET[0] + 10, length), (RESET[0] + 30, 0), (601, 0)])
            smooth(link, "scale", 0, [(1, 0), (f + 14, 0), (f + 15, 1), (RESET[0] + 29, 1), (RESET[0] + 30, 0), (601, 0)])
            smooth(link, "scale", 1, [(1, 0), (f + 14, 0), (f + 15, 1), (RESET[0] + 29, 1), (RESET[0] + 30, 0), (601, 0)])
        prev_cube = cube

    # Balance: tilts gently toward whichever side is doing better (no numbers, settles)
    stand_m = mat_solid("Stand", "slab", rough=0.6)
    post = prim("cylinder", "Fulcrum", stand_m, vertices=24, radius=0.04, depth=1.6); post.location = (0, 2.6, 0.8)
    pivot = bpy.data.objects.new("Pivot", None); bpy.context.collection.objects.link(pivot); pivot.location = (0, 2.6, 1.62)
    beam = prim("cube", "Beam", mat_solid("BeamM", "ink", rough=0.4), size=1); beam.scale = (1.6, 0.05, 0.05); beam.parent = pivot
    for side, mm in ((-1, solid_m), (1, glass_m)):
        pan = prim("cylinder", f"Pan{side}", mm, vertices=32, radius=0.22, depth=0.03); pan.parent = pivot; pan.location = (side * 0.75, 0, -0.42)
        rod = prim("cylinder", f"Rod{side}", stand_m, vertices=8, radius=0.006, depth=0.4); rod.parent = pivot; rod.location = (side * 0.75, 0, -0.21)
    smooth(pivot, "rotation_euler", 1, [(1, 0), (200, math.radians(3)), (300, math.radians(-4)), (420, math.radians(5)), (520, math.radians(4)), (580, 0), (601, 0)])

    cam, tgt = camera(lens=40, dof_target=True, fstop=4)
    keys = []
    for f in (1, 70, 140, 200):
        p = tip(x_at(f))
        keys.append((f, (p.x - 1.2, p.y - 2.6, p.z + 0.9), (p.x + 0.3, p.y + 0.2, p.z), 40))
    keys += [(330, (0.5, -6.5, 3.4), (0.3, 0.2, 0.3), 32), (450, (1.8, -3.6, 2.6), (0.4, 2.0, 1.1), 36),
             (530, (-0.6, -3.8, 2.4), (0, 2.0, 1.2), 36), (601, keys[0][1], keys[0][2], 40)]
    camera_path(cam, tgt, keys)


if globals().get("__name__") == "__main__" or "FILMS_DIR" in globals():
    build()
    save(os.path.abspath(globals().get("FILMS_OUT") or os.path.join(HERE, "..", "build", "shadow.blend")))
