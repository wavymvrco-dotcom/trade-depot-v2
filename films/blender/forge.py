# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Film 7 — The Forge, explainer (docs/FILMS.md, films/narration.json): layers are the
# Arena's building blocks; the Forge builds new ones as formula trees from safe pieces;
# each is tested; the bar rises with every idea tried (3.00 -> 3.49 after 109); none
# has cleared it yet (best |t| 1.69) — reported honestly.

import os, sys, math, random, importlib
HERE = globals().get("FILMS_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import studio2 as S; importlib.reload(S)
from studio2 import (reset, stage, camera, probe, mat, mat_state, prim, state, smooth, bulk, sparks,
                     hud, hud_group, to_hud, counter, callout, caption, subtitles, title_card, end_card, narration, set_length,
                     spot, save, col, bevel)
import bpy
from mathutils import Vector, Matrix

LAYERS = ["Trend", "Momentum", "Mean reversion", "Volatility", "Session", "Higher timeframe"]
TREE = [("div", (0.0, 3.0), None), ("slope", (-0.7, 2.4), 0), ("atr", (0.7, 2.4), 0), ("ema", (-0.7, 1.8), 1), ("close", (-0.7, 1.2), 3)]
BAR_Z0, BAR_Z1 = 1.5, 1.95          # visual heights for |t| 3.00 and 3.49
TRIALS = [(1.2, 1), (0.6, 2), (1.35, 3), (0.9, 5), (1.69, 8), (1.1, 20), (1.4, 60), (1.3, 109)]   # (|t|, trials so far)


def scale_keys(ob, pts, base=(1, 1, 1)):
    for ax in range(3):
        smooth(ob, "scale", ax, [(f, v * base[ax]) for f, v in pts])


def link(name, a, c, m):
    v = Vector(c) - Vector(a)
    ln = prim("cylinder", name, m, vertices=8, radius=0.015, depth=1.0)
    ln.location = Vector(a) + v / 2; ln.rotation_mode = "QUATERNION"
    ln.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(v.normalized())
    ln.scale = (1, 1, v.length)
    return ln


def build():
    reset("forge", haze=0.012)
    data, L, total = narration("forge")
    set_length(total)
    F = S.FRAMES
    b = [l["f0"] for l in L]; e = [l["f1"] for l in L]
    stage()
    cam, tgt = camera(S.LENS, 3.0)
    rnd = random.Random(4)

    # 1. The layer rack feeding a strategy
    RX = -9.0
    shelf = prim("cube", "Shelf", mat("ShelfM", "1E2533", metal=0.8, rough=0.35), size=1); shelf.scale = (6.6, 0.6, 0.12); shelf.location = (RX, 1.5, 0.9)
    pr, pc = probe("Probe", 1.8); pr.location = (RX, -1.4, 0.6); state(pc, [(1, "cyan", 1.0), (F + 1, "cyan", 1.0)])
    lm = mat("LinkM", "cyan", emit=3)
    for i, nm in enumerate(LAYERS):
        x = RX - 2.75 + i * 1.1
        blk = prim("cube", f"Layer{i}", mat(f"LayerM{i}", "4A5A78", rough=0.3, metal=0.4, coat=1.0, emit=0.25), size=1); blk.scale = (0.9, 0.5, 0.5); blk.location = (x, 1.5, 1.22)
        bevel(blk, 0.03, 3)
        stripe = prim("cube", f"LayerS{i}", mat(f"LayerSM{i}", "cyan", emit=4), size=1); stripe.scale = (0.9, 0.02, 0.06); stripe.location = (x, 1.24, 1.42)
        caption(f"LayerL{i}", nm, (x, 1.2, 1.85), b[0] + 10 + i * 6, e[1], size=0.2, colour="white", align="CENTER", frame=False)
        ln = link(f"Feed{i}", (x, 1.25, 1.0), (RX, -1.4, 0.75), lm)
        scale_keys(ln, [(1, 0), (b[0] + 20 + i * 6, 0), (b[0] + 30 + i * 6, 1), (e[1], 1), (e[1] + 10, 0), (F + 1, 0)], base=tuple(ln.scale))
    slot = prim("cube", "EmptySlot", mat("SlotM", "teal", emit=2, alpha=0.25), size=1); slot.location = (RX + 3.85, 1.5, 1.22)
    scale_keys(slot, [(1, 0), (b[5], 0), (b[5] + 10, 1), (F + 1, 1)], base=(0.9, 0.5, 0.5))
    caption("SlotL", "NEXT LAYER · earned, not wished for", (RX + 3.85, 1.2, 1.9), b[5] + 10, F - 110, size=0.13, colour="teal", align="CENTER")

    # 2. The Forge bench: safe pieces snap into a formula tree
    TX = 0.0
    bench = prim("cube", "Bench", mat("BenchM", "1E2533", metal=0.8, rough=0.35), size=1); bench.scale = (3.4, 1.6, 0.9); bench.location = (TX, 0.6, 0.45)
    node_m = mat("NodeM", "4A5A78", rough=0.3, metal=0.4, coat=1.0, emit=0.25)
    tree_root = bpy.data.objects.new("Tree", None); bpy.context.collection.objects.link(tree_root)
    t_build = b[1] + 10
    nodes = []
    for k, (op, (x, z), parent) in enumerate(TREE):
        nd = prim("cube", f"N{k}", node_m, size=1); nd.data.transform(Matrix.Diagonal((0.62, 0.3, 0.3, 1))); bevel(nd, 0.04, 3); nd.parent = tree_root
        rim = prim("cube", f"NR{k}", mat(f"NRM{k}", "amber", emit=3), size=1); rim.scale = (0.7, 0.02, 0.38); rim.location = (0, 0.17, 0); rim.parent = nd
        f_in = t_build + k * 14
        start = (x + rnd.choice((-4, 4)), -2.0, z + 2.0)
        S.smooth_vec(nd, "location", [(1, start), (f_in, start), (f_in + 16, (x, 0, z)), (F + 1, (x, 0, z))])
        nodes.append((x, z, parent, f_in))
        lab = caption(f"NL{k}", op, (0, 0, 0), f_in + 14, e[2] + 20, size=0.17, colour="amber", frame=False, align="CENTER")
        lab.parent = nd; lab.location = (0, -0.22, -0.02)
    for k, (x, z, parent, f_in) in enumerate(nodes):
        if parent is not None:
            px, pz = nodes[parent][0], nodes[parent][1]
            ln = link(f"Edge{k}", (x, 0, z + 0.15), (px, 0, pz - 0.15), mat("EdgeM", "amber", emit=4)); ln.parent = tree_root
            scale_keys(ln, [(1, 0), (f_in + 16, 0), (f_in + 22, 1), (F + 1, 1)], base=tuple(ln.scale))
    tree_root.location = (TX, 0, 0.9)
    caption("Formula", "A formula — not code that runs", (TX, -0.6, 4.6), b[1] + 70, e[1] + 20, size=0.18, colour="amber", align="CENTER")

    # 3. The test chamber: prediction vs what price did next
    CX = 5.5
    glass = prim("cylinder", "Chamber", mat("ChamberM", "9FB6D9", rough=0.1, emit=0.2, alpha=0.18), vertices=64, radius=1.5, depth=3.4)
    glass.location = (CX, 0, 1.7)
    ring_m = mat("ChamberRing", "cyan", emit=4)
    for z in (0.02, 3.4):
        rr = prim("torus", f"CRing{z}", ring_m, major_radius=1.5, minor_radius=0.03); rr.location = (CX, 0, z)
    S.smooth_vec(tree_root, "location", [(1, (TX, 0, 0.9)), (b[2], (TX, 0, 0.9)), (b[2] + 40, (CX, 0, -0.1)), (F + 1, (CX, 0, -0.1))])
    scale_keys(tree_root, [(1, 1), (b[2] + 30, 1), (b[2] + 50, 0.55), (e[2] + 20, 0.55), (e[2] + 30, 0), (F + 1, 0)])
    dot_m = mat("DotM", "cyan", emit=6)
    for k in range(60):     # weak, noisy relationship (that's the honest picture)
        xv = rnd.uniform(-1, 1); yv = 0.15 * xv + rnd.gauss(0, 0.45)
        d = prim("uv_sphere", f"Dot{k}", dot_m, radius=0.03, segments=8, ring_count=4)
        d.location = (CX + xv * 1.0, -0.3, 1.8 + max(-1.2, min(1.2, yv)))
        f0 = b[2] + 45 + k
        scale_keys(d, [(1, 0), (f0, 0), (f0 + 3, 1), (e[2] + 20, 1), (e[2] + 30, 0), (F + 1, 0)])
    caption("Pred", "prediction  vs  what price did next", (CX, -1.6, 3.7), b[2] + 50, e[2] + 20, size=0.14, colour="white", align="CENTER")

    # 4. The rising bar and the score columns
    BX = 10.5
    bar = prim("cube", "Bar", mat("BarM", "red", emit=4, alpha=0.6), size=1); bar.scale = (5.4, 1.2, 0.025)
    bar_z = lambda n: BAR_Z0 + (BAR_Z1 - BAR_Z0) * math.log(max(1, n)) / math.log(109)
    t_start = b[3] + 10
    span = max(80, e[4] - t_start - 20)
    fr_trial = [t_start + int(span * k / len(TRIALS)) for k in range(len(TRIALS))]
    smooth(bar, "location", 2, [(1, BAR_Z0), (t_start, BAR_Z0)] + [(f + 10, bar_z(n)) for f, (_, n) in zip(fr_trial, TRIALS)] + [(F + 1, BAR_Z1)])
    bar.location.x = BX + 1.6; bar.location.y = 0
    scale_keys(bar, [(1, 0), (b[3] - 4, 0), (b[3] + 6, 1), (F + 1, 1)], base=(5.4, 1.2, 0.025))
    caption("BarL", "|t| NEEDED", (BX - 1.4, -0.6, 2.25), b[3] + 10, F - 110, size=0.16, colour="red", align="CENTER")
    for k, ((tv, n), f) in enumerate(zip(TRIALS, fr_trial)):
        h = BAR_Z0 * tv / 3.0          # |t| scaled to the same axis as the bar
        col_ = prim("cube", f"Score{k}", mat_state(f"ScoreM{k}", emit_scale=3), size=1)
        col_.location = (BX + k * 0.62 - 0.6, 0, 0)
        smooth(col_, "scale", 2, [(1, 0.001), (f, 0.001), (f + 14, h), (F + 1, h)]); smooth(col_, "location", 2, [(1, 0), (f, 0), (f + 14, h / 2), (F + 1, h / 2)])
        col_.scale.x = 0.36; col_.scale.y = 0.36
        state(col_, [(1, "cyan", 0.8), (f + 14, "cyan", 0.8), (f + 18, "red", 1.2), (F + 1, "red", 0.6)])
        sparks(f"Fail{k}", (BX + k * 0.62 - 0.6, 0, h), f + 18, n=8, colour="red", speed=0.4, seed=k)
    counter("Tried", [f"Ideas tried: {n}" for _, n in TRIALS], None, fr_trial, size=0.08, colour="white", hud_xy=(0.42, 0.82), until=F - 110)
    counter("Need", [f"|t| needed: {3.0 + (3.49 - 3.0) * math.log(max(1, n)) / math.log(109):.2f}" for _, n in TRIALS], None,
            [f + 10 for f in fr_trial], size=0.075, colour="red", hud_xy=(0.42, 0.68), until=F - 110)
    hud("Honest", "109 ideas tested · 0 accepted · best |t| 1.69", (-0.55, 0.32), b[4] + 10, e[4] + 40, size=0.09, colour="amber")

    title_card(data)
    subtitles("forge", L)
    end_card(data)

    keys = [(1, (RX - 1.0, -8.6, 3.8), (RX, 0.3, 1.0), S.LENS, 6), (b[0] + 40, (RX + 0.5, -8.0, 3.4), (RX, 0.3, 1.0), S.LENS, 6),
            (b[1] + 10, (TX - 1.2, -6.6, 3.4), (TX, 0, 2.6), S.LENS, 5), (e[1], (TX + 0.6, -6.0, 3.2), (TX, 0, 2.6), S.LENS, 5),
            (b[2] + 50, (CX - 0.4, -6.2, 2.6), (CX, 0, 1.8), S.LENS, 5), (b[3] + 20, (BX + 0.4, -7.4, 2.6), (BX + 1.4, 0, 1.3), S.LENS, 7),
            (e[4], (BX + 1.8, -6.8, 2.4), (BX + 1.6, 0, 1.3), S.LENS, 7), (b[5] + 10, (RX + 2.0, -6.0, 2.6), (RX + 2.6, 1.0, 1.3), S.LENS, 6),
            (F, (RX + 3.0, -5.6, 2.4), (RX + 3.4, 1.0, 1.3), S.LENS, 6)]
    S.camera_path(cam, tgt, keys)
    print(f"forge explainer: {F} frames ({F / 30:.1f}s)")


if globals().get("__name__") == "__main__" or "FILMS_DIR" in globals():
    build()
    save(os.path.abspath(globals().get("FILMS_OUT") or os.path.join(HERE, "..", "build", "forge.blend")))
