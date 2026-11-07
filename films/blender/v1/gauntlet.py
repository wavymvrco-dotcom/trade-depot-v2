# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Film 2 — Gauntlet (docs/FILMS.md): a hunter drone attacks one strategy with gaps
# and spread spikes; then a storm sweeps 200 worlds; a ring fills to the pass mark.

import os, sys, math, random, importlib
HERE = globals().get("FILMS_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import studio; importlib.reload(studio)
from studio import *  # noqa
import bpy

NX, NY = 6, 20           # 120 corridors shown (Storm Mode runs 200)
PITCH_X, PITCH_Y = 4.6, 1.25
CLEN = 4.2               # corridor length


def build():
    reset("gauntlet")
    studio(400)
    rnd = random.Random(7)
    centres = [((i - (NX - 1) / 2) * PITCH_X, (j - (NY - 1) / 2) * PITCH_Y) for j in range(NY) for i in range(NX)]
    seeds = [rnd.uniform(0, 40) for _ in centres]
    slabs, ribs = tiles_mesh("Gauntlet", centres, seeds, size=CLEN + 0.2, depth=0.9, length=CLEN, steps=220, ribbon_w=0.04, scale=1.4)
    assign(slabs, mat_solid("Slab", "slab", rough=0.7))
    assign(ribs, mat_solid("Ribbon", "ink", rough=0.35, emit=0.15))

    hero = min(range(len(centres)), key=lambda k: math.hypot(*centres[k]))
    hx, hy = centres[hero]
    pm = mat_object_colour("PuckColour", rough=0.3, emit_scale=1.6)
    pmesh = puck_mesh(0.1, 0.05); pmesh.materials.append(pm)
    big = puck_mesh(0.17, 0.07, "PuckBig"); big.materials.append(pm)
    frames = list(range(1, FRAMES + 2, 5))
    fail = set(rnd.sample(range(len(centres)), int(0.15 * len(centres)))) - {hero}

    for k, ((cx, cy), seed) in enumerate(zip(centres, seeds)):
        ob = new_obj(f"Puck{k:03d}", pmesh if k == hero else big)
        phase = rnd.random()
        xs, ys, zs = [], [], []
        for f in frames:
            t = (f - 1) / FRAMES
            u = 0.5 - 0.5 * math.cos(2 * math.pi * (t + phase if k != hero else t))
            p = ribbon_point(cx, cy, u, seed, CLEN, 0.06, 1.4)
            xs.append(p.x); ys.append(p.y); zs.append(p.z + 0.045)
        for i, v in enumerate((xs, ys, zs)):
            bulk(ob, "location", i, frames, v)
        if k in fail:
            f0 = 220 + int((cx + NX * PITCH_X / 2) / (NX * PITCH_X) * 120)   # the storm front passes left to right
            colour_keys(ob, [(1, "ink", 0.2), (f0, "ink", 0.2), (f0 + 15, "neg", 0.8), (540, "neg", 0.8), (585, "ink", 0.2), (601, "ink", 0.2)])
            smooth(ob, "delta_location", 2, [(1, 0), (f0 + 10, 0), (f0 + 40, -0.25), (540, -0.25), (585, 0), (601, 0)])
        else:
            colour_keys(ob, [(1, "ink", 0.2), (601, "ink", 0.2)])

    # Hunter drone over the hero corridor: flies ahead of the puck and raises hazard fins
    dm = mat_solid("Drone", "dark", rough=0.3, metal=0.6)
    drone = prim("ico_sphere", "Drone", dm, subdivisions=1, radius=0.12)
    drone.scale = (1.4, 1.0, 0.45)
    for side in (-1, 1):
        rot = prim("cylinder", f"Rotor{side}", mat_solid(f"Rotor{side}", "grey", rough=0.4), vertices=24, radius=0.09, depth=0.006)
        rot.parent = drone; rot.location = (side * 0.15, 0, 0.12)
    pts = []
    for f in range(1, FRAMES + 2, 10):
        t = (f - 1) / FRAMES
        u = min(0.98, 0.5 - 0.5 * math.cos(2 * math.pi * t) + 0.12)
        p = ribbon_point(hx, hy, u, seeds[hero], CLEN, 0.06, 1.4)
        pts.append((f, (p.x, p.y - 0.05, p.z + 0.42 + 0.04 * math.sin(f * 0.21))))
    smooth_vec(drone, "location", pts)
    fin_m = mat_solid("Fin", "neg", rough=0.4, emit=0.6)
    for n, (fa, u) in enumerate(((40, 0.28), (85, 0.45), (130, 0.62), (165, 0.74))):
        p = ribbon_point(hx, hy, u, seeds[hero], CLEN, 0.06, 1.4)
        fin = prim("cube", f"Fin{n}", fin_m, size=1)
        fin.location = (p.x, p.y, p.z)
        fin.scale = (0.012, 0.045, 0.001)
        smooth(fin, "scale", 2, [(1, 0.001), (fa, 0.001), (fa + 6, 0.32), (fa + 40, 0.32), (fa + 60, 0.001), (601, 0.001)])

    # Storm front: a translucent dark sheet sweeping across the grid, with falling streaks
    storm = prim("plane", "Storm", mat_solid("StormSheet", "dark", rough=1.0, alpha=0.38), size=1)
    from mathutils import Matrix
    storm.data.transform(Matrix.Diagonal((5.0, NY * PITCH_Y + 6, 1, 1)))
    storm.rotation_euler = (0, math.radians(90), 0)
    W = NX * PITCH_X
    smooth_vec(storm, "location", [(1, (-W / 2 - 8, 0, 1.5)), (200, (-W / 2 - 8, 0, 1.5)), (360, (W / 2 + 8, 0, 1.5)), (601, (W / 2 + 8, 0, 1.5))])
    rain_m = mat_solid("Rain", "dark", rough=1.0, alpha=0.5)
    for n in range(260):
        r = prim("cube", f"Rain{n:03d}", rain_m, size=1)
        r.scale = (0.5, 0.02, 0.02); r.parent = storm
        r.location = (rnd.uniform(-2.4, 2.4), rnd.uniform(-15, 15), rnd.uniform(-0.6, 0.6))
    # Ring meter: 120 segments light up in order and stop at 95% (the pass mark), no number
    seg_on = mat_solid("RingOn", "pos", rough=0.4, emit=0.9)
    seg_off = mat_solid("RingOff", "D9D4C8", rough=0.8)
    R, NSEG = 20.5, 120
    for n in range(NSEG):
        ang = math.pi / 2 - 2 * math.pi * n / NSEG
        base = prim("cube", f"RingBase{n:03d}", seg_off, size=1)
        base.location = (R * math.cos(ang), R * math.sin(ang), 0.03)
        base.rotation_euler = (0, 0, ang); base.scale = (0.55, 0.92, 0.04)
        if n < int(0.95 * NSEG):
            on = prim("cube", f"RingOn{n:03d}", seg_on, size=1)
            on.location = (R * math.cos(ang), R * math.sin(ang), 0.07)
            on.rotation_euler = (0, 0, ang)
            f_on = 360 + int(140 * n / NSEG)
            on.scale = (0.6, 0.94, 0.05)
            smooth(on, "scale", 2, [(1, 0.0), (f_on, 0.0), (f_on + 4, 0.05), (540, 0.05), (585, 0.0), (601, 0.0)])
            smooth(on, "scale", 0, [(1, 0.0), (f_on, 0.0), (f_on + 4, 0.6), (540, 0.6), (585, 0.0), (601, 0.0)])

    def hero_at(f):
        u = 0.5 - 0.5 * math.cos(2 * math.pi * (f - 1) / FRAMES)
        return ribbon_point(hx, hy, u, seeds[hero], CLEN, 0.06, 1.4)
    cam, tgt = camera(lens=45, dof_target=True, fstop=2.8)
    keys = []
    for f in (1, 40, 80, 120, 170):
        p = hero_at(f)
        keys.append((f, (p.x - 1.3, p.y - 1.9, p.z + 0.75), (p.x + 0.35, p.y, p.z), 45))
    p0 = hero_at(1)
    keys += [(300, (-14, -30, 20), (0, -1, 0), 32), (450, (12, -31, 21), (0, -1, 0), 32), (520, (8, -28, 17), (0, -1, 0), 34),
             (601, (p0.x - 1.3, p0.y - 1.9, p0.z + 0.75), (p0.x + 0.35, p0.y, p0.z), 45)]
    camera_path(cam, tgt, keys)
    smooth(cam.data, "dof.aperture_fstop", 0, [(1, 2.8), (170, 2.8), (260, 22), (520, 22), (590, 2.8), (601, 2.8)])


if globals().get("__name__") == "__main__" or "FILMS_DIR" in globals():
    build()
    save(os.path.abspath(globals().get("FILMS_OUT") or os.path.join(HERE, "..", "build", "gauntlet.blend")))
