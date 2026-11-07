# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Film 9 — Proof of Process, explainer (docs/FILMS.md, films/narration.json): decisions
# chained before outcomes; tampering breaks every later link; the day folds into one
# Merkle seal at midnight; Verify runs in the visitor's own browser.

import os, sys, math, random, importlib, hashlib
HERE = globals().get("FILMS_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import studio2 as S; importlib.reload(S)
from studio2 import (reset, stage, camera, World, probe, mat, mat_state, prim, state, smooth, bulk, sparks,
                     hud, hud_group, to_hud, counter, callout, caption, subtitles, title_card, end_card, narration, set_length,
                     spot, save, col, bevel)
import bpy
from mathutils import Vector, Matrix

NB = 8
CY, CZ = -1.4, 0.5      # chain line


def scale_keys(ob, pts, base=(1, 1, 1)):
    for ax in range(3):
        smooth(ob, "scale", ax, [(f, v * base[ax]) for f, v in pts])


def build():
    reset("proof", haze=0.012)
    data, L, total = narration("proof")
    set_length(total)
    F = S.FRAMES
    b = [l["f0"] for l in L]; e = [l["f1"] for l in L]
    stage()
    cam, tgt = camera(S.LENS, 3.0)
    rnd = random.Random(99)

    # 0. Claim vs check
    caption("Claim", "“TRUST ME” — a claimed track record", (-2.3, 0.0, 2.4), b[0] + 5, e[0] + 15, size=0.26, colour="red", align="CENTER")
    caption("Check", "A record you can CHECK", (2.3, 0.0, 1.7), b[0] + 30, e[0] + 15, size=0.3, colour="teal", align="CENTER")

    # 1. Live candles + decision blocks chaining before each outcome
    w = World("Live", (0, 1.2), seed=777, n=NB, length=8.0, depth=1.2, scale=0.5)
    m_up, m_dn = mat("Up", "up", rough=0.15, emit=0.9, coat=0.6), mat("Dn", "down", rough=0.15, emit=0.7, coat=0.6)
    plat = prim("cube", "Plat", mat("PlatM", "metal", metal=0.7, rough=0.35), size=1); plat.scale = (8.4, 1.2, 0.22); plat.location = (0, 1.2, 0.11)
    t0, t1 = b[1] + 10, e[1] + 10
    step = (t1 - t0) / NB
    blk_m = mat("Block", "2A3346", rough=0.25, metal=0.6, coat=1.0, emit=0.2)
    blocks, links = [], []
    for i, (o, h, l, c) in enumerate(w.ohlc):
        x = w.x_of(i)
        fd = int(t0 + i * step)          # decision written
        fo = fd + int(step * 0.6)        # outcome (the candle) arrives later
        z0, z1 = w.z_of(min(o, c)), max(w.z_of(max(o, c)), w.z_of(min(o, c)) + 0.02)
        cd = prim("cube", f"C{i}", m_up if c >= o else m_dn, size=1); cd.location = (x, 1.2, (z0 + z1) / 2)
        scale_keys(cd, [(1, 0), (fo, 0), (fo + 5, 1), (F + 1, 1)], base=(0.35, 0.35, z1 - z0))
        blk = prim("cube", f"B{i}", blk_m, size=1); blk.data.transform(Matrix.Diagonal((0.62, 0.62, 0.62, 1))); bevel(blk, 0.04, 3)
        hsh = hashlib.sha256(f"d{i}".encode()).hexdigest()[:4] + "…"
        lab = caption(f"H{i}", hsh, (0, 0, 0), fd + 6, 99999, size=0.13, colour="cyan", frame=False, align="CENTER")
        lab.parent = blk; lab.location = (0, -0.4, 0.05)
        S.smooth_vec(blk, "location", [(1, (x, 1.2, 3.2)), (fd, (x, 1.2, 3.2)), (fd + 14, (x, CY, CZ)), (F + 1, (x, CY, CZ))])
        scale_keys(blk, [(1, 0), (fd - 2, 0), (fd + 4, 1), (F + 1, 1)])
        blocks.append((blk, fd))
        if i:
            ln = prim("cylinder", f"Link{i}", mat_state(f"LinkM{i}", emit_scale=5), vertices=12, radius=0.05, depth=1.0)
            ln.rotation_euler = (0, math.radians(90), 0); ln.location = (x - 0.5, CY, CZ)
            scale_keys(ln, [(1, 0), (fd + 14, 0), (fd + 20, 1), (F + 1, 1)], base=(1, 1, 0.38))
            links.append((ln, i))
        if i == 1:
            callout("CoBefore", "written BEFORE its outcome exists", (x, CY, CZ + 0.35), (0.4, -0.3, 0.9), fd + 14, e[1] + 10, size=0.13, colour="amber")
    # 2. Tamper: edit block 3 -> every later link breaks red; then restored
    tam = b[2] + 40
    restore = e[2] + 10
    hb, _ = blocks[3]
    smooth(hb, "delta_location", 2, [(1, 0), (tam - 1, 0), (tam + 4, 0.4), (tam + 12, 0), (F + 1, 0)])
    for ln, i in links:
        seq = [(1, "cyan", 0.6), (tam + (i - 3) * 6 if i > 3 else tam, "cyan", 0.6)]
        if i >= 3:
            ft = tam + 8 + (i - 3) * 6
            seq = [(1, "cyan", 0.6), (ft - 1, "cyan", 0.6), (ft, "red", 2.0), (restore, "red", 2.0), (restore + 10, "cyan", 0.6), (F + 1, "cyan", 0.6)]
            sparks(f"Brk{i}", ln.location, ft, n=8, colour="red", speed=0.4, seed=i)
        state(ln, seq)
    caption("Edit", "EDIT ONE ENTRY…", (w.x_of(3), CY, CZ + 1.3), tam - 4, restore, size=0.18, colour="red", align="CENTER")
    caption("Broken", "…EVERY LINK AFTER IT BREAKS", (w.x_of(6), CY, CZ + 1.3), tam + 20, restore, size=0.18, colour="red", align="CENTER")

    # 3. Midnight: blocks fold into a Merkle tree -> one seal
    mid = b[3] + 10
    moon = bpy.data.lights.new("Moon", "SUN"); moon.color = (0.5, 0.65, 1.0)
    mo = bpy.data.objects.new("Moon", moon); bpy.context.collection.objects.link(mo); mo.rotation_euler = (math.radians(40), 0, 0)
    for f, v in ((1, 0), (mid, 0), (mid + 20, 3.0), (F + 1, 3.0)):
        moon.energy = v; moon.keyframe_insert("energy", frame=f)
    hud("Clock", "00:00 UTC · the day is sealed", (-0.92, 0.82), mid, F - 110, size=0.07, colour="cyan")
    node_m = mat("Node", "cyan", emit=3, alpha=0.6)
    levels = [[w.x_of(i) for i in range(NB)]]
    while len(levels[-1]) > 1:
        prev = levels[-1]; levels.append([(prev[k] + prev[k + 1]) / 2 for k in range(0, len(prev), 2)])
    for lv in range(1, len(levels)):
        z = CZ + lv * 0.9
        for k, x in enumerate(levels[lv]):
            f0 = mid + 20 + lv * 18
            if lv == len(levels) - 1:
                nd = prim("ico_sphere", "Root", mat("RootM", "cyan", emit=8), subdivisions=1, radius=0.35)
            else:
                nd = prim("cube", f"M{lv}{k}", node_m, size=1); nd.data.transform(Matrix.Diagonal((0.45, 0.45, 0.45, 1)))
            nd.location = (x, CY, z)
            scale_keys(nd, [(1, 0), (f0, 0), (f0 + 8, 1.2), (f0 + 12, 1), (F + 1, 1)])
            for cx in (levels[lv - 1][2 * k], levels[lv - 1][2 * k + 1]):
                a_, c_ = Vector((cx, CY, z - 0.9 + 0.25)), Vector((x, CY, z - 0.25))
                v = c_ - a_
                ln = prim("cylinder", f"ML{lv}{k}{cx:.1f}", mat("MLM", "cyan", emit=4), vertices=8, radius=0.02, depth=1.0)
                ln.location = a_ + v / 2; ln.rotation_mode = "QUATERNION"; ln.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(v.normalized())
                smooth(ln, "scale", 2, [(1, 0), (f0 - 6, 0), (f0, v.length), (F + 1, v.length)])
    root_z = CZ + (len(levels) - 1) * 0.9
    caption("Seal", "ONE SEAL FOR THE WHOLE DAY", (levels[-1][0], CY, root_z + 0.8), mid + 20 + (len(levels) - 1) * 18 + 10, e[3] + 30, size=0.2, colour="cyan", align="CENTER")
    rot = bpy.data.objects.get("Root")
    if rot:
        bulk(rot, "rotation_euler", 2, [1, F + 1], [0, F / 30 * 1.2], interp="LINEAR")

    # 4. Verify in the browser: a scan along the chain, every link turns teal, the verifier's checks tick
    ver = b[4] + 20
    scan = prim("cube", "Scan", mat("ScanM", "teal", emit=8, alpha=0.5), size=1); scan.scale = (0.05, 1.2, 1.4)
    smooth(scan, "location", 0, [(1, w.x_of(0) - 0.6), (ver, w.x_of(0) - 0.6), (ver + 70, w.x_of(NB - 1) + 0.6), (F + 1, w.x_of(NB - 1) + 0.6)])
    scan.location.y = CY; scan.location.z = CZ
    scale_keys(scan, [(1, 0), (ver - 1, 0), (ver, 1), (ver + 70, 1), (ver + 72, 0), (F + 1, 0)], base=(0.05, 1.2, 1.4))
    for blk, fd in blocks:
        x = blk.location.x
        f_ok = ver + int((x - (w.x_of(0) - 0.6)) / (w.x_of(NB - 1) - w.x_of(0) + 1.2) * 70)
        ring = prim("torus", f"Ok{fd}", mat("OkM", "teal", emit=6), major_radius=0.45, minor_radius=0.02)
        ring.location = (x, CY, CZ); ring.rotation_euler = (math.radians(90), 0, 0)
        scale_keys(ring, [(1, 0), (f_ok, 0), (f_ok + 6, 1.15), (f_ok + 10, 1), (F + 1, 1)])
    panel = hud_group("Browser", (0.3, 0.66))
    frame_ = prim("plane", "BrowserBack", mat("BrowserBackM", "0E1420", alpha=0.85), size=1); frame_.parent = panel; frame_.scale = (0.98, 0.62, 1); frame_.location = (0.4, -0.15, -0.01)
    bar_ = prim("plane", "BrowserBar", mat("BrowserBarM", "2A3346", emit=0.3), size=1); bar_.parent = panel; bar_.scale = (0.98, 0.06, 1); bar_.location = (0.4, 0.13, 0)
    url = S._rich_text("Url", "tradedepot · /l/your-strategy", 0.035, "ink", "white", align="LEFT"); url.parent = panel; url.location = (-0.04, 0.12, 0.01)
    btn = prim("plane", "VerifyBtn", mat("VerifyBtnM", "teal", emit=1.5), size=1); btn.parent = panel; btn.scale = (0.26, 0.07, 1); btn.location = (0.04, 0.03, 0.005)
    bt = S._rich_text("VerifyT", "Verify", 0.045, "05070C", "05070C", align="CENTER"); bt.parent = panel; bt.location = (0.04, 0.025, 0.01)
    smooth(btn, "scale", 0, [(1, 0.26), (ver - 6, 0.26), (ver - 3, 0.22), (ver, 0.26), (F + 1, 0.26)])
    checks = ["Strategy record chain — intact", "Frozen before the Vault opened", "Decisions recorded before outcomes", "Numbers match the record", "Included in the daily seals"]
    for k, text in enumerate(checks):
        row = S._rich_text(f"Chk{k}", f"✓  {text}", 0.04, "teal", "teal", align="LEFT"); row.parent = panel; row.location = (-0.07, -0.08 - k * 0.07, 0.01)
        row.data.font = bpy.data.fonts.load("C:/Windows/Fonts/seguisym.ttf", check_existing=True)
        fk = ver + 14 + k * 12
        scale_keys(row, [(1, 0), (fk, 0), (fk + 4, 1), (F + 1, 1)])
    scale_keys(panel, [(1, 0), (b[4] - 4, 0), (b[4] + 6, 1), (F - 110, 1), (F - 104, 0), (F + 1, 0)])
    to_hud(panel)

    title_card(data)
    subtitles("proof", L)
    end_card(data)

    keys = [(1, (0, -6.5, 2.4), (0, 0.0, 2.0), S.LENS, 8), (b[1] + 10, (-2.5, -7.0, 2.8), (-1.5, 0, 1.0), S.LENS, 6),
            (e[1], (1.5, -7.2, 2.8), (1.0, -0.4, 1.0), S.LENS, 6), (b[2] + 30, (0.5, -6.8, 2.2), (0.5, CY, CZ + 0.4), S.LENS, 5),
            (e[2], (2.5, -6.6, 2.2), (2.0, CY, CZ + 0.4), S.LENS, 5), (b[3] + 40, (0, -9.0, 3.4), (0, CY, 2.0), S.LENS, 8),
            (b[4] + 10, (-1.0, -8.6, 2.6), (-0.5, CY, 1.2), S.LENS, 7), (F, (1.0, -8.2, 2.6), (0.5, CY, 1.2), S.LENS, 7)]
    S.camera_path(cam, tgt, keys)
    print(f"proof explainer: {F} frames ({F / 30:.1f}s)")


if globals().get("__name__") == "__main__" or "FILMS_DIR" in globals():
    build()
    save(os.path.abspath(globals().get("FILMS_OUT") or os.path.join(HERE, "..", "build", "proof.blend")))
