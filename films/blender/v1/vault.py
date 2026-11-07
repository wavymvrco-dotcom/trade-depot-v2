# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Film 3 — Vault Exam (docs/FILMS.md): a wall of face-down market tiles with a
# vault door. It opens once; one strategy enters; tiles flip face-up only as it
# passes (data it has never seen); five gates judge it; the door seals.

import os, sys, math, random, importlib
HERE = globals().get("FILMS_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import studio; importlib.reload(studio)
from studio import *  # noqa
import bpy
from mathutils import Vector

DOOR_Z, DOOR_R = 1.25, 1.05
GATES_Y = (2.2, 3.7, 5.2, 6.7, 8.2)


def tile_obj(name, seed, back_mat, top_mat, rib_mat):
    slabs, ribs = tiles_mesh(name, [(0, 0)], [seed], size=0.94, thick=0.06)
    assign(slabs, top_mat); assign(ribs, rib_mat)
    # a dark back face just under the slab, so a flipped tile reads as "unseen"
    back = prim("cube", f"{name}Back", back_mat, size=1)
    back.scale = (0.94, 0.94, 0.01); back.location = (0, 0, -0.002)
    root = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(root)
    for o in (slabs, ribs, back):
        o.parent = root
    return root


def build():
    reset("vault")
    studio(300)
    rnd = random.Random(31)
    top = mat_solid("Slab", "slab", rough=0.7)
    back = mat_solid("Back", "ink", rough=0.5)
    rib = mat_solid("Ribbon", "ink", rough=0.35, emit=0.15)

    # The wall: tiles standing up (backs facing the camera), with a round opening for the door
    for i in range(-5, 6):
        for j in range(5):
            x, z = i * 0.98, 0.5 + j * 0.98
            if math.hypot(x, z - DOOR_Z) < DOOR_R + 0.45:
                continue
            t = tile_obj(f"W{i}_{j}", rnd.uniform(0, 40), back, top, rib)
            t.location = (x, 0, z); t.rotation_euler = (math.radians(-90), 0, 0)   # backs face -Y (outside)
    # Steel frame around the opening: a plate with a round hole (boolean), so the door reads as set in the wall
    frame = prim("cube", "DoorFrame", mat_solid("FrameM", "dark", rough=0.45, metal=0.6), size=1)
    frame.scale = (3.5, 0.12, 3.0); frame.location = (0, 0.02, DOOR_Z + 0.05)
    cutter = prim("cylinder", "Cutter", None, vertices=64, radius=DOOR_R + 0.04, depth=1.0)
    cutter.rotation_euler = (math.radians(90), 0, 0); cutter.location = (0, 0, DOOR_Z)
    bo = frame.modifiers.new("Hole", "BOOLEAN"); bo.object = cutter; bo.operation = "DIFFERENCE"
    cutter.hide_render = True; cutter.hide_viewport = True
    # Door: hinged on its left edge, opens inward
    hinge = bpy.data.objects.new("Hinge", None); bpy.context.collection.objects.link(hinge)
    hinge.location = (-DOOR_R, 0, DOOR_Z)
    steel = mat_solid("Steel", "dark", rough=0.35, metal=0.8)
    door = prim("cylinder", "Door", steel, vertices=64, radius=DOOR_R, depth=0.22)
    door.rotation_euler = (math.radians(90), 0, 0); door.parent = hinge; door.location = (DOOR_R, 0, 0)
    bevel(door, 0.02)
    for k in range(8):
        a = 2 * math.pi * k / 8
        bolt = prim("cylinder", f"Bolt{k}", mat_solid(f"BoltM{k}", "grey", rough=0.3, metal=0.9), vertices=16, radius=0.07, depth=0.06)
        bolt.parent = door; bolt.location = (0.75 * math.cos(a), 0.75 * math.sin(a), 0.13)
    wheel = prim("torus", "Wheel", mat_solid("WheelM", "grey", rough=0.3, metal=0.9), major_radius=0.32, minor_radius=0.035)
    wheel.parent = door; wheel.location = (0, 0, 0.15)
    smooth(hinge, "rotation_euler", 2, [(1, 0), (150, 0), (240, math.radians(105)), (470, math.radians(105)), (560, 0), (601, 0)])
    smooth(wheel, "rotation_euler", 2, [(1, 0), (110, 0), (150, math.radians(-180)), (560, math.radians(-180)), (590, 0), (601, 0)])
    # Lock bar slides home after the door seals
    lock = prim("cube", "LockBar", mat_solid("LockM", "gold", rough=0.25, metal=0.9), size=1)
    lock.scale = (0.9, 0.08, 0.08)
    smooth_vec(lock, "location", [(1, (DOOR_R + 1.2, -0.2, DOOR_Z)), (560, (DOOR_R + 1.2, -0.2, DOOR_Z)), (585, (0.2, -0.2, DOOR_Z)), (598, (0.2, -0.2, DOOR_Z)), (601, (DOOR_R + 1.2, -0.2, DOOR_Z))])

    # Inside: a corridor of face-down tiles that flip face-up as the strategy passes
    pm = mat_object_colour("PuckColour", rough=0.3, emit_scale=1.6)
    pmesh = puck_mesh(0.12, 0.06); pmesh.materials.append(pm)
    puck = new_obj("Strategy", pmesh)
    colour_keys(puck, [(1, "ink", 0.35), (601, "ink", 0.35)])
    path = [(1, (-7, -2.2, 0.06)), (60, (-3.5, -2.2, 0.06)), (150, (0, -1.6, 0.06)), (250, (0, 0.6, DOOR_Z - DOOR_R + 0.1)),
            (300, (0, 1.6, 0.06)), (460, (0, 9.2, 0.06)), (588, (0, 9.6, 0.06)), (590, (-7, -2.2, 0.06)), (601, (-7, -2.2, 0.06))]
    smooth_vec(puck, "location", path)
    ys = [0.9 + n * 0.98 for n in range(9)]
    for n, y in enumerate(ys):
        for side in (-1, 1):
            t = tile_obj(f"C{n}_{side}", rnd.uniform(0, 40), back, top, rib)
            t.location = (side * 0.62, y, 0.04)
            f_flip = 300 + int((y - 1.6) / (9.2 - 1.6) * 160)
            smooth(t, "rotation_euler", 1, [(1, math.pi), (max(2, f_flip - 12), math.pi), (f_flip + 6, 0), (575, 0), (595, math.pi), (601, math.pi)])

    # Five gates: costs x2, luck, baseline, drawdown, trade count. Gate 4 hesitates amber, then green.
    post = mat_solid("Post", "slab", rough=0.6)
    for g, y in enumerate(GATES_Y):
        for sx in (-1, 1):
            p = prim("cube", f"G{g}Post{sx}", post, size=1); p.scale = (0.08, 0.08, 1.5); p.location = (sx * 1.35, y, 0.75)
        lint = prim("cube", f"G{g}Lintel", mat_object_colour(f"G{g}Light", rough=0.3, emit_scale=3.0), size=1)
        lint.scale = (2.8, 0.1, 0.1); lint.location = (0, y, 1.5)
        f_pass = 300 + int((y - 1.6) / (9.2 - 1.6) * 160)
        seq = [(1, "grey", 0.0), (f_pass - 4, "grey", 0.0)]
        if g == 3:
            seq += [(f_pass + 2, "warn", 0.8), (f_pass + 10, "grey", 0.1), (f_pass + 16, "warn", 0.8), (f_pass + 28, "pos", 0.9)]
        else:
            seq += [(f_pass + 6, "pos", 0.9)]
        seq += [(575, "pos", 0.9), (595, "grey", 0.0), (601, "grey", 0.0)]
        colour_keys(lint, seq)

    cam, tgt = camera(lens=35, dof_target=True, fstop=4)
    camera_path(cam, tgt, [
        (1,   (-3.2, -7.5, 2.0), (-0.6, 0, 1.4), 35),
        (150, (-1.0, -6.0, 1.7), (0, 0, 1.3), 35),
        (250, (1.4, -3.0, 7.2), (0, 2.8, 0.4), 28),
        (380, (2.6, 2.8, 4.2), (0, 5.4, 0.6), 30),
        (460, (2.2, 6.0, 3.6), (0, 8.4, 0.6), 32),
        (520, (-1.5, -6.0, 3.0), (0, 0, 1.2), 32),
        (601, (-3.2, -7.5, 2.0), (-0.6, 0, 1.4), 35),
    ])


if globals().get("__name__") == "__main__" or "FILMS_DIR" in globals():
    build()
    save(os.path.abspath(globals().get("FILMS_OUT") or os.path.join(HERE, "..", "build", "vault.blend")))
