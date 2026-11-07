# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Film 6 — Mirror, explainer (docs/FILMS.md, films/narration.json): perfect fills vs real
# fills on a price ladder; slippage and spread; the misses build a cost histogram on a
# mirror; the broker-wide average fills the gaps until your own data speaks; the model
# beams into the Arena.

import os, sys, math, random, importlib
HERE = globals().get("FILMS_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import studio2 as S; importlib.reload(S)
from studio2 import (reset, stage, camera, World, world_meshes, probe, mat, mat_state, prim, state, smooth, bulk, sparks,
                     hud, hud_group, to_hud, counter, callout, caption, subtitles, title_card, end_card, narration, set_length,
                     spot, save, col, bevel)
import bpy
from mathutils import Vector


def scale_keys(ob, pts, base=(1, 1, 1)):
    for ax in range(3):
        smooth(ob, "scale", ax, [(f, v * base[ax]) for f, v in pts])


def ticket(name, label, colour):
    root = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(root)
    card = prim("cube", f"{name}Card", mat(f"{name}M", "2A3346", rough=0.3, metal=0.5, coat=1.0), size=1); card.parent = root
    card.scale = (0.62, 0.03, 0.26); bevel(card, 0.01, 2)
    edge = prim("cube", f"{name}Edge", mat(f"{name}E", colour, emit=4), size=1); edge.parent = root; edge.scale = (0.03, 0.035, 0.26); edge.location = (-0.3, 0, 0)
    t = S._rich_text(f"{name}T", label, 0.1, "white", colour, align="LEFT"); t.parent = root
    t.rotation_euler = (math.radians(90), 0, 0); t.location = (-0.24, -0.02, 0)
    return root


def build():
    reset("mirror", haze=0.012)
    data, L, total = narration("mirror")
    set_length(total)
    F = S.FRAMES
    b = [l["f0"] for l in L]; e = [l["f1"] for l in L]
    stage()
    cam, tgt = camera(S.LENS, 3.0)
    rnd = random.Random(12)

    # Price ladder: horizontal rungs, the target price lit
    rung_m = mat("Rung", "3A4458", rough=0.4, emit=0.3)
    for k in range(14):
        z = 0.5 + k * 0.2
        r_ = prim("cube", f"Rung{k}", rung_m, size=1); r_.scale = (2.6, 0.04, 0.012); r_.location = (0, 0, z)
    for sx in (-1, 1):
        rail = prim("cube", f"Rail{sx}", mat(f"RailM{sx}", "4A5468", metal=0.8, rough=0.3), size=1); rail.scale = (0.05, 0.05, 2.9); rail.location = (sx * 1.32, 0, 1.85)
    target_z = 2.1
    tgt_line = prim("cube", "Target", mat("TargetM", "cyan", emit=6), size=1); tgt_line.scale = (2.62, 0.05, 0.02); tgt_line.location = (0, -0.03, target_z)
    callout("CoTarget", "Your order: buy at this price", (1.3, 0, target_z), (0.9, -0.5, 0.45), b[0] + 5, e[0] + 20, size=0.13)
    # bid/ask spread band
    band = prim("cube", "Spread", mat("SpreadM", "amber", emit=1.0, alpha=0.18), size=1); band.location = (0, 0.02, target_z + 0.13)
    scale_keys(band, [(1, 0), (b[1] + 30, 0), (b[1] + 40, 1), (F + 1, 1)], base=(2.6, 0.02, 0.26))
    callout("CoSpread", "the spread", (-1.3, 0, target_z + 0.13), (-0.8, -0.5, 0.3), b[1] + 40, e[1] + 30, size=0.12, colour="amber")

    # Tickets: a perfect (ghost) fill, then the real ones landing off target
    ghost = ticket("Ghost", "PERFECT FILL", "white")
    for ch in ghost.children_recursive:
        if ch.type == "MESH" and ch.data.materials:
            ch.data.materials[0] = mat("GhostM", "white", emit=0.6, alpha=0.25)
    S.smooth_vec(ghost, "location", [(1, (-6, -0.3, 3.5)), (b[0] + 10, (-6, -0.3, 3.5)), (b[0] + 40, (0, -0.3, target_z)), (e[0] + 30, (0, -0.3, target_z)), (e[0] + 40, (0, -0.3, 6)), (F + 1, (0, -0.3, 6))])
    fills = [("EURUSD", "cyan", 0.16), ("AAPL", "teal", 0.28), ("CRUDE OIL", "amber", 0.4)]
    for n, (lab, c, miss) in enumerate(fills):
        tk = ticket(f"T{n}", lab, c)
        f0 = (b[0] + 60) if n == 0 else b[1] + 20 + (n - 1) * 30
        land = (0.4 * (n - 1), -0.3 - 0.05 * n, target_z + miss)
        S.smooth_vec(tk, "location", [(1, (-6, -0.3, 3.6)), (f0, (-6, -0.3, 3.6)), (f0 + 26, land), (b[2] + 10, land), (b[2] + 30, (2.6 + n * 0.3, -1.6, 0.3)), (F + 1, (2.6 + n * 0.3, -1.6, 0.3))])
        scale_keys(tk, [(1, 0), (f0, 0), (f0 + 4, 1), (b[2] + 26, 1), (b[2] + 34, 0), (F + 1, 0)])
        off = prim("cube", f"Off{n}", mat(f"OffM{n}", "red", emit=5), size=1)
        off.location = (0.4 * (n - 1) + 0.36, -0.36, target_z + miss / 2)
        scale_keys(off, [(1, 0), (f0 + 26, 0), (f0 + 32, 1), (b[2] + 10, 1), (b[2] + 18, 0), (F + 1, 0)], base=(0.04, 0.04, miss))
        caption(f"Slip{n}", "slippage", (0.4 * (n - 1) + 0.55, -0.4, target_z + miss / 2), f0 + 30, b[2] + 10, size=0.08, colour="red", frame=False)

    # Mirror plane with the cost histogram (yours, teal) and the broker average (grey ghost)
    mp = prim("plane", "Mirror", mat("MirrorM", "B9C6DA", rough=0.04, metal=1.0), size=1); mp.scale = (4.2, 2.2, 1); mp.location = (4.4, -1.6, 0.02)
    mframe = prim("cube", "MirrorFrame", mat("MirrorFrameM", "cyan", emit=2.5), size=1); mframe.scale = (4.25, 0.03, 0.03); mframe.location = (4.4, -2.7, 0.04)
    yours = [math.exp(-((i - 5.5) / 2.4) ** 2) * (1 + 0.25 * rnd.random()) for i in range(14)]
    pool = [math.exp(-((i - 6.5) / 3.2) ** 2) for i in range(14)]
    h0, h1, h2 = b[2] + 30, e[2], b[3]
    for i in range(14):
        x = 2.6 + i * 0.27
        pb = prim("cube", f"Pool{i}", mat("PoolM", "8FA3C7", emit=0.6, alpha=0.35), size=1); pb.location = (x, -1.3, 0.0)
        smooth(pb, "scale", 2, [(1, 0.001), (h2, 0.001), (h2 + 30, pool[i] * 1.4), (e[3], pool[i] * 1.4), (e[3] + 30, 0.001), (F + 1, 0.001)])
        smooth(pb, "location", 2, [(1, 0), (h2, 0), (h2 + 30, pool[i] * 0.7), (e[3], pool[i] * 0.7), (e[3] + 30, 0), (F + 1, 0)])
        pb.scale.x = 0.2; pb.scale.y = 0.2
        yb = prim("cube", f"Yours{i}", mat("YoursM", "teal", emit=2.0), size=1); yb.location = (x, -1.75, 0)
        vals = [(1, 0.001), (h0, 0.001), (h0 + (h1 - h0) // 2, yours[i] * 0.5), (h1, yours[i] * 0.9), (e[3], yours[i] * 1.3), (F + 1, yours[i] * 1.3)]
        smooth(yb, "scale", 2, vals); smooth(yb, "location", 2, [(f, v / 2) for f, v in vals])
        yb.scale.x = 0.2; yb.scale.y = 0.2
    callout("CoHist", "Your real costs, fill by fill", (4.4, -1.75, 1.2), (0.6, -0.6, 0.7), h0 + 20, e[2] + 20, size=0.13, colour="teal")
    callout("CoPool", "Same-broker average (fills the gaps)", (4.8, -1.3, 1.1), (1.2, 0.4, 0.8), h2 + 30, e[3] + 10, size=0.12, colour="ink")
    counter("Fills", [f"Fills measured: {v}" for v in (0, 12, 30, 55, 90, 140, 200, 240)], None,
            [h0 + int((e[3] - h0) * k / 7) for k in range(8)], size=0.075, colour="teal", hud_xy=(0.4, 0.82), until=F - 110)
    # weight slider: broker average -> yours
    g = hud_group("Blend", (0.4, 0.62))
    tt = S._rich_text("BlendT", "Weight on *your* data", 0.055, "white", "teal", align="LEFT"); tt.parent = g
    bk = prim("cube", "BlendB", mat("BlendBM", "1A2130", emit=0.2), size=1); bk.parent = g; bk.location = (0.32, -0.07, -0.005); bk.scale = (0.64, 0.03, 0.002)
    knob = prim("cube", "Knob", mat("KnobM", "teal", emit=1.6), size=1); knob.parent = g; knob.scale = (0.03, 0.07, 0.003)
    smooth(knob, "location", 0, [(1, 0.05), (h2, 0.08), (e[3], 0.55), (F + 1, 0.58)]); knob.location.y = -0.07
    for ax in range(3):
        smooth(g, "scale", ax, [(1, 0), (h2 - 4, 0), (h2 + 4, 1), (e[3] + 30, 1), (e[3] + 36, 0), (F + 1, 0)])
    to_hud(g)

    # Into the Arena: a beam from the mirror to a small grid of worlds
    ax0 = 11.0
    ws = [World(f"A{k}", (ax0 + (k % 3 - 1) * 3.4, (k // 3 - 1) * 1.6), seed=900 + k, n=24, length=2.8, depth=1.1, scale=0.26) for k in range(9)]
    wm = world_meshes(ws, depth=1.1)
    for ob in wm.values():
        smooth(ob, "scale", 2, [(1, 0), (b[4] - 10, 0), (b[4] + 25, 1), (F + 1, 1)])
    for k, w in enumerate(ws):
        root, core = probe(f"AP{k}", 0.9)
        ph = rnd.random()
        S.ride(root, w, lambda f, ph=ph: 0.5 - 0.45 * math.cos(2 * math.pi * ((f - 1) / 240 + ph)), step=3)
        scale_keys(root, [(1, 0), (b[4] + 20, 0), (b[4] + 30, 0.9), (F + 1, 0.9)])
        state(core, [(1, "cyan", 0.6), (b[5], "cyan", 0.6), (b[5] + 10, "teal", 1.4), (F + 1, "teal", 1.4)])
    beam = prim("cylinder", "Beam", mat("BeamM", "teal", emit=5, alpha=0.3), vertices=24, radius=0.035, depth=1.0)
    a_, c_ = Vector((4.4, -1.6, 0.6)), Vector((ax0, 0, 0.8))
    v = c_ - a_
    beam.location = a_ + v / 2; beam.rotation_mode = "QUATERNION"; beam.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(v.normalized())
    smooth(beam, "scale", 2, [(1, 0), (b[4], 0), (b[4] + 20, v.length), (F + 1, v.length)]); beam.scale.x = beam.scale.y = 1
    caption("Yours", "COSTS: YOURS", (ax0, 0, 2.2), b[5] + 5, F - 110, size=0.28, colour="teal", align="CENTER")

    title_card(data)
    subtitles("mirror", L)
    end_card(data)

    keys = [(1, (-3.0, -6.2, 2.6), (0, 0, 2.0), S.LENS, 5), (b[0] + 40, (-1.5, -4.6, 2.4), (0, 0, 2.1), S.LENS, 4),
            (b[1] + 50, (-0.8, -4.0, 2.5), (0, 0, 2.3), S.LENS, 4), (b[2] + 40, (2.4, -6.6, 2.6), (4.0, -1.6, 0.4), S.LENS, 6),
            (b[3] + 30, (4.6, -6.4, 2.4), (4.4, -1.5, 0.5), S.LENS, 6), (b[4] + 30, (5.0, -9.5, 4.6), (8.5, -0.5, 0.6), S.LENS, 10),
            (F, (8.5, -8.0, 4.0), (11.0, 0, 0.6), S.LENS, 10)]
    S.camera_path(cam, tgt, keys)
    print(f"mirror explainer: {F} frames ({F / 30:.1f}s)")


if globals().get("__name__") == "__main__" or "FILMS_DIR" in globals():
    build()
    save(os.path.abspath(globals().get("FILMS_OUT") or os.path.join(HERE, "..", "build", "mirror.blend")))
