# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Film 8 — Playbook · Hive · Fleet, explainer (docs/FILMS.md, films/narration.json).

import os, sys, math, random, importlib
HERE = globals().get("FILMS_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import studio2 as S; importlib.reload(S)
from studio2 import (reset, stage, camera, World, world_meshes, probe, mat, mat_state, prim, state, smooth, bulk, sparks,
                     hud, hud_group, to_hud, counter, callout, caption, subtitles, title_card, end_card, narration, set_length,
                     spot, save, col, bevel)
import bpy
from mathutils import Vector, Matrix

SYM = "C:/Windows/Fonts/seguisym.ttf"


def scale_keys(ob, pts, base=(1, 1, 1)):
    for ax in range(3):
        smooth(ob, "scale", ax, [(f, v * base[ax]) for f, v in pts])


def plaque(name, title, colour="gold"):
    root = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(root)
    face = prim("cube", f"{name}F", mat(f"{name}FM", "3A4760", rough=0.3, metal=0.5, coat=1.0, emit=0.15), size=1); face.parent = root
    face.data.transform(Matrix.Diagonal((0.9, 0.06, 0.55, 1))); bevel(face, 0.02, 2)
    rim = prim("cube", f"{name}R", mat(f"{name}RM", colour, emit=3), size=1); rim.parent = root
    rim.data.transform(Matrix.Diagonal((0.94, 0.04, 0.59, 1))); rim.location = (0, 0.02, 0)
    lab = caption(f"{name}L", title, (0, 0, 0), 1, 99999, size=0.15, colour="white", frame=False, align="CENTER")
    lab.parent = root; lab.location = (0, -0.25, 0.0)
    return root


def build():
    reset("hive", haze=0.012)
    data, L, total = narration("hive")
    set_length(total)
    F = S.FRAMES
    b = [l["f0"] for l in L]; e = [l["f1"] for l in L]
    stage()
    cam, tgt = camera(S.LENS, 3.0)
    rnd = random.Random(19)

    # 1. Playbook: three bays by market weather
    PX = -10.0
    bays = [("≈  CALM", "cyan"), ("↗  TRENDING", "teal"), ("ϟ  VOLATILE", "amber")]
    for k, (lab, c) in enumerate(bays):
        x = PX + (k - 1) * 2.4
        shelf = prim("cube", f"Bay{k}", mat(f"BayM{k}", "1E2533", metal=0.8, rough=0.35), size=1); shelf.scale = (2.1, 0.7, 0.1); shelf.location = (x, 0.6, 0.8)
        strip = prim("cube", f"BayS{k}", mat(f"BaySM{k}", c, emit=4), size=1); strip.scale = (2.1, 0.02, 0.04); strip.location = (x, 0.24, 0.84)
        t = caption(f"BayL{k}", lab, (x, 0.3, 2.05), b[0] + 10 + k * 8, e[1] + 10, size=0.3, colour=c, frame=False, align="CENTER")
        t.children[0].data.font = bpy.data.fonts.load(SYM, check_existing=True)
        for j in range(2):
            p = plaque(f"PB{k}{j}", ["London Breakout", "Asia Range Fade", "Gold Trend Rider", "NY Momentum", "Oil Shock Fade", "NVDA Gap Fill"][k * 2 + j])
            home = (x - 0.48 + j * 0.96, 0.6, 1.2)
            f_in = b[0] + 20 + (k * 2 + j) * 10
            S.smooth_vec(p, "location", [(1, (home[0], -3, 4.5)), (f_in, (home[0], -3, 4.5)), (f_in + 20, home), (F + 1, home)])
            p.scale = (0.95, 0.95, 0.95)
    # Arena reuse: beams from the shelf into a small grid, Gen Zero seeded
    AX = -10.0
    ws = [World(f"G{k}", (AX + (k % 3 - 1) * 3.2, -4.0 + (k // 3) * 1.5), seed=300 + k, n=22, length=2.6, depth=1.0, scale=0.24) for k in range(6)]
    wm = world_meshes(ws, depth=1.0)
    for ob in wm.values():
        smooth(ob, "scale", 2, [(1, 0), (b[1] - 5, 0), (b[1] + 25, 1), (F + 1, 1)])
    beam_m = mat("SeedBeam", "teal", emit=5, alpha=0.5)
    for k, w in enumerate(ws):
        rt, core = probe(f"GP{k}", 0.9)
        ph = rnd.random()
        S.ride(rt, w, lambda f, ph=ph: 0.5 - 0.45 * math.cos(2 * math.pi * ((f - 1) / 240 + ph)), step=3)
        scale_keys(rt, [(1, 0), (b[1] + 20, 0), (b[1] + 30, 0.9), (F + 1, 0.9)])
        state(core, [(1, "teal", 1.6), (F + 1, "teal", 1.6)])
        a_, c_ = Vector((PX + (k % 3 - 1) * 2.4, 0.4, 1.0)), w.path(0.5)
        v = c_ - a_
        bm_ = prim("cylinder", f"Seed{k}", beam_m, vertices=12, radius=0.025, depth=1.0)
        bm_.location = a_ + v / 2; bm_.rotation_mode = "QUATERNION"; bm_.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(v.normalized())
        smooth(bm_, "scale", 2, [(1, 0), (b[1] + 10, 0), (b[1] + 30, v.length), (e[1] + 10, v.length), (e[1] + 20, 0), (F + 1, 0)])
    caption("GenZero", "New runs start from your skills", (AX, -4.0, 2.0), b[1] + 30, e[1] + 20, size=0.2, colour="teal", align="CENTER")

    # 2. Hive: orbs above a live S&P 500 chart, scored, then blended
    HX = 2.0
    hw = World("SPX", (HX, 0), seed=5000, n=36, length=7.0, depth=1.3, scale=0.36)
    world_meshes([hw], depth=1.3)
    callout("CoSPX", "S&P 500 · live", (HX - 3.0, 0, 1.0), (-0.4, -0.6, 0.6), b[2], e[2] + 20, size=0.14, colour="white")
    orb_mesh = None
    centre = Vector((HX, 0, 3.6))
    weights = [0.9, 0.7, 0.55, 0.4, 0.3, 0.25, 0.15]
    merge0, merge1 = b[3] + 20, b[3] + 70
    for k, wgt in enumerate(weights):
        home = Vector((HX - 3.0 + k, rnd.uniform(-0.4, 0.4), 2.2 + rnd.uniform(-0.2, 0.4)))
        orb = prim("uv_sphere", f"Orb{k}", mat_state(f"OrbM{k}", emit_scale=6), radius=0.12 + 0.1 * wgt, segments=24, ring_count=12)
        S.smooth_vec(orb, "location", [(1, tuple(home)), (merge0, tuple(home)), (merge1, tuple(centre)), (F + 1, tuple(centre))])
        scale_keys(orb, [(1, 0), (b[2] + 5 + k * 6, 0), (b[2] + 12 + k * 6, 1), (merge1 - 5, 1), (merge1, 0.2), (F + 1, 0)])
        seq = [(1, "cyan", 0.4)]
        for s in range(4):   # scored calls: brighten when right, dim when wrong
            f = b[2] + 40 + s * 22 + k * 3
            right = rnd.random() < 0.45 + 0.45 * wgt
            seq += [(f, "teal" if right else "red", 0.4 + wgt * (1.2 if right else 0.2))]
        seq += [(F + 1, "teal", 0.4 + wgt)]
        state(orb, seq)
    hive = prim("uv_sphere", "HiveOrb", mat_state("HiveM", emit_scale=5), radius=0.5, segments=48, ring_count=24); hive.location = centre
    scale_keys(hive, [(1, 0), (merge1 - 10, 0), (merge1 + 10, 1.15), (merge1 + 20, 1), (F + 1, 1)])
    state(hive, [(1, "teal", 1.2), (F + 1, "teal", 1.2)])
    caption("HiveL", "HIVE · P(up) 58% · 7 contributors", (HX, 0, 4.55), merge1 + 10, e[3] + 30, size=0.2, colour="teal", align="CENTER")
    caption("HiveN", "Context, not a signal · needs at least 5", (HX, 0, 2.75), merge1 + 20, e[3] + 30, size=0.13, colour="white", align="CENTER")
    caption("Scored", "each call scored on what actually happened", (HX, 0, 3.4), b[2] + 50, e[2] + 20, size=0.13, colour="white", align="CENTER")

    # 3. Fleet: three plaques on a gimballed platform that absorbs shocks
    FX = 14.0
    gim = bpy.data.objects.new("Gimbal", None); bpy.context.collection.objects.link(gim); gim.location = (FX, 0, 1.4)
    plat = prim("cylinder", "FleetPlat", mat("FleetPlatM", "2A3346", metal=0.7, rough=0.3, coat=1), vertices=64, radius=1.8, depth=0.1); plat.parent = gim
    ring = prim("torus", "FleetRing", mat("FleetRingM", "cyan", emit=3), major_radius=1.85, minor_radius=0.03); ring.parent = gim
    post = prim("cylinder", "FleetPost", mat("FleetPostM", "4A5468", metal=0.8, rough=0.3), vertices=24, radius=0.08, depth=1.4); post.location = (FX, 0, 0.7)
    for k, (name, wpct) in enumerate((("London Breakout", 45), ("Gold Trend Rider", 35), ("NVDA Gap Fill", 20))):
        a = math.radians(90 + k * 120)
        p = plaque(f"FP{k}", f"{name} · {wpct}%", "teal")
        p.parent = gim; p.location = (math.cos(a) * 1.1, math.sin(a) * 1.1, 0.45); p.scale = (0.9, 0.9, 0.9)
    shocks = [b[4] + 30, b[4] + 80, b[4] + 130]
    for ax in (0, 1):
        pts = [(1, 0)]
        for s in shocks:
            amp = math.radians(rnd.uniform(5, 9)) * (1 if ax else -1)
            pts += [(s, 0), (s + 6, amp), (s + 16, -amp * 0.35), (s + 28, 0)]
        pts += [(F + 1, 0)]
        smooth(gim, "rotation_euler", ax, pts)
    for s in shocks:
        sparks(f"Shock{s}", (FX + 1.6, -0.6, 1.5), s, n=10, colour="red", speed=0.6, seed=s)
    hud("Fleet", "FLEET · worst days softened · checked on unseen days", (-0.92, 0.82), b[4] + 10, F - 110, size=0.065, colour="teal")

    title_card(data)
    subtitles("hive", L)
    end_card(data)

    keys = [(1, (PX, -6.2, 2.6), (PX, 0.6, 1.4), S.LENS, 6), (b[0] + 60, (PX + 0.5, -5.6, 2.4), (PX, 0.6, 1.4), S.LENS, 6),
            (b[1] + 20, (AX - 0.5, -10.8, 4.0), (AX, -2.4, 0.8), S.LENS, 9), (b[2] + 10, (HX - 1.0, -7.4, 3.0), (HX, 0, 1.8), S.LENS, 6),
            (b[3] + 40, (HX + 0.5, -7.0, 3.6), (HX, 0, 3.0), S.LENS, 6), (e[3], (HX + 1.0, -6.4, 3.8), (HX, 0, 3.4), S.LENS, 6),
            (b[4] + 20, (FX - 0.8, -4.8, 2.9), (FX, 0, 1.7), S.LENS, 5), (F, (FX + 0.8, -4.4, 2.8), (FX, 0, 1.7), S.LENS, 5)]
    S.camera_path(cam, tgt, keys)
    print(f"hive explainer: {F} frames ({F / 30:.1f}s)")


if globals().get("__name__") == "__main__" or "FILMS_DIR" in globals():
    build()
    save(os.path.abspath(globals().get("FILMS_OUT") or os.path.join(HERE, "..", "build", "hive.blend")))
