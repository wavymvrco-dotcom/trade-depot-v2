# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Film 5 — Licensed + Tripwire (docs/FILMS.md): a gold seal is earned; a live line
# drifts until it touches the tripwire, which flashes and sends the card back to
# the Shadow shelf; it returns and re-earns the seal.

import os, sys, math, random, importlib
HERE = globals().get("FILMS_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import studio; importlib.reload(studio)
from studio import *  # noqa
import bpy
from mathutils import Vector

CARD_HOME = (0.0, 0.0, 1.05)
SHELF = (-1.9, 0.3, 0.62)


def build():
    reset("licensed")
    studio(400)
    paper = mat_solid("Card", "white", rough=0.45)
    gold = mat_solid("Gold", "gold", rough=0.22, metal=1.0)

    # Strategy card with a small chart on its face
    card = prim("cube", "Card", paper, size=1); card.scale = (0.82, 0.52, 0.03)
    bevel(card, 0.02, 3)
    root = bpy.data.objects.new("CardRoot", None); bpy.context.collection.objects.link(root)
    card.parent = root
    ink = mat_solid("CardInk", "ink", rough=0.4)
    for n, (w, y) in enumerate(((0.42, 0.13), (0.3, 0.04), (0.36, -0.05), (0.22, -0.14))):
        line = prim("cube", f"CardLine{n}", ink, size=1); line.parent = root
        line.scale = (w, 0.022 if n else 0.035, 0.004); line.location = (-0.36 + w / 2, y, 0.017)
    root.rotation_euler = (math.radians(70), 0, 0)          # face the camera
    smooth_vec(root, "location", [
        (1, (0, 0, 2.6)), (40, CARD_HOME), (300, CARD_HOME), (345, SHELF), (430, SHELF), (480, CARD_HOME),
        (560, CARD_HOME), (601, (0, 0, 2.6))])
    smooth(root, "rotation_euler", 0, [(1, math.radians(70)), (300, math.radians(70)), (345, math.radians(85)), (430, math.radians(85)), (480, math.radians(70)), (601, math.radians(70))])

    # Seal: presses at 60 and again (shorter beat) at 505; lifts off when the card is pulled
    seal_root = bpy.data.objects.new("SealRoot", None); bpy.context.collection.objects.link(seal_root)
    seal_root.parent = root
    seal = prim("cylinder", "Seal", gold, vertices=64, radius=0.12, depth=0.025); seal.parent = seal_root
    seal.rotation_euler = (0, 0, 0)
    ring = prim("torus", "SealRing", gold, major_radius=0.095, minor_radius=0.008); ring.parent = seal_root; ring.location = (0, 0, 0.014)
    star = prim("cone", "SealMark", gold, vertices=5, radius1=0.05, radius2=0.0, depth=0.012); star.parent = seal_root; star.location = (0, 0, 0.016)
    seal_root.location = (0.24, 0.09, 0.6)   # in card space (z is the card's normal)
    smooth(seal_root, "location", 2, [(1, 0.6), (45, 0.6), (60, 0.03), (300, 0.03), (330, 0.7), (480, 0.7), (498, 0.7), (508, 0.03), (560, 0.03), (601, 0.6)])
    for ax in range(3):
        smooth(seal_root, "scale", ax, [(1, 0), (40, 0), (48, 1), (318, 1), (335, 0), (488, 0), (496, 1), (575, 1), (595, 0), (601, 0)])
    # Ripple when the seal lands
    rip_m = mat_object_colour("Ripple", rough=0.4, emit_scale=3.0)
    for n, f0 in enumerate((60, 508)):
        r = prim("torus", f"Ripple{n}", None, major_radius=0.1, minor_radius=0.006)
        r.data.materials.clear(); r.data.materials.append(rip_m)
        r.parent = root; r.location = (0.24, 0.09, 0.03)
        for ax in range(3):
            bulk(r, "scale", ax, [1, f0 - 1, f0, f0 + 28, f0 + 29, 601], [0, 0, 1, 5 if ax < 2 else 1, 0, 0])
        colour_keys(r, [(1, "gold", 1.2), (f0, "gold", 1.2), (f0 + 28, "gold", 0.0), (601, "gold", 0.0)])

    # Live line below the card, and the tripwire under it
    seed, L = 23.0, 5.2
    slabs, live = tiles_mesh("Live", [(0, 0.9)], [seed], size=L + 0.4, depth=1.0, length=L, steps=260, ribbon_w=0.04, scale=0.8)
    assign(slabs, mat_solid("Slab", "slab", rough=0.7)); assign(live, mat_solid("LiveRib", "ink", rough=0.35, emit=0.2))
    low = min(ribbon_point(0, 0.9, k / 260, seed, L, 0.06, 0.8).z for k in range(261))
    LIFT, DROP = 0.32, 0.14
    wire_z = low + LIFT - DROP
    smooth(live, "location", 2, [(1, LIFT), (180, LIFT), (300, LIFT - DROP), (330, LIFT - DROP), (420, LIFT), (601, LIFT)])
    wire = prim("cylinder", "Tripwire", mat_object_colour("Wire", rough=0.3, emit_scale=4.0), vertices=12, radius=0.01, depth=L + 0.3)
    wire.rotation_euler = (0, math.radians(90), 0); wire.location = (0, 0.86, wire_z)
    colour_keys(wire, [(1, "neg", 0.35), (296, "neg", 0.35), (300, "neg", 2.5), (304, "neg", 0.5), (308, "neg", 2.5), (330, "neg", 0.35), (601, "neg", 0.35)])

    # The Shadow shelf: where a pulled strategy waits (no label; its colour says "not licensed")
    shelf = prim("cube", "Shelf", mat_solid("ShelfM", "D9D4C8", rough=0.7), size=1)
    shelf.scale = (1.1, 0.7, 0.05); shelf.location = (SHELF[0], SHELF[1], 0.32)
    for sx in (-1, 1):
        leg = prim("cube", f"ShelfLeg{sx}", mat_solid(f"LegM{sx}", "D9D4C8", rough=0.7), size=1)
        leg.scale = (0.05, 0.6, 0.3); leg.location = (SHELF[0] + sx * 0.5, SHELF[1], 0.15)

    cam, tgt = camera(lens=40, dof_target=True, fstop=5.6)
    camera_path(cam, tgt, [
        (1,   (1.6, -3.6, 1.8), (-0.1, 0.2, 0.85), 40),
        (180, (0.6, -3.9, 1.6), (0.0, 0.4, 0.7), 40),
        (300, (-0.5, -4.2, 1.5), (-0.4, 0.5, 0.6), 38),
        (430, (-1.4, -3.9, 1.7), (-0.9, 0.3, 0.7), 38),
        (520, (0.8, -3.7, 1.8), (0.0, 0.2, 0.85), 40),
        (601, (1.6, -3.6, 1.8), (-0.1, 0.2, 0.85), 40),
    ])


if globals().get("__name__") == "__main__" or "FILMS_DIR" in globals():
    build()
    save(os.path.abspath(globals().get("FILMS_OUT") or os.path.join(HERE, "..", "build", "licensed.blend")))
