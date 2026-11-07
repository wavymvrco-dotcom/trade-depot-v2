# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Film 3 — The Vault Exam, explainer (docs/FILMS.md, films/narration.json).
# A: the cheat (peeking at the future) and the 60/20/20 split with the last 20% locked away.
# B: a massive vault door opens once; inside, the strategy drives over candles it has
#    never seen (covers lift only as it passes) through five laser gates; grades; the door seals.

import os, sys, math, random, importlib
HERE = globals().get("FILMS_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import studio2 as S; importlib.reload(S)
from studio2 import (reset, stage, camera, World, world_meshes, probe, mat, mat_state, prim, state, smooth, bulk, sparks,
                     hud, hud_group, to_hud, counter, callout, caption, subtitles, title_card, end_card, narration, set_length,
                     spot, save, col, bevel)
import bpy, bmesh
from mathutils import Vector, Matrix

AX, AY = -16.0, -3.0          # scene A: the timeline
DOOR_R, DOOR_Z = 1.5, 1.75    # scene B: the vault door in the wall at x = 0
GATES = [(2.4, "Costs ×2"), (4.5, "Luck adjustment"), (6.6, "Beats the default model"), (8.7, "Drawdown in range"), (10.8, "Enough trades")]


def scale_keys(ob, pts, base=(1, 1, 1)):
    for ax in range(3):
        smooth(ob, "scale", ax, [(f, v * base[ax]) for f, v in pts])


def build():
    reset("vault", haze=0.014)
    data, L, total = narration("vault")
    set_length(total)
    F = S.FRAMES
    b = [l["f0"] for l in L]; e = [l["f1"] for l in L]
    stage()
    cam, tgt = camera(S.LENS, 2.2)
    rnd = random.Random(77)

    # ── Scene A: one long history ───────────────────────────────────────────
    hist = World("Hist", (AX, AY), seed=4242, n=90, length=10.0, depth=1.3, scale=0.32)
    world_meshes([hist])
    x0, x1 = AX - 5.0, AX + 5.0
    pA, cA = probe("ProbeA", 1.1)
    S.ride(pA, hist, lambda f: min(0.55, 0.05 + 0.5 * (f - 1) / max(1, b[1] - 1)), step=3)
    state(cA, [(1, "cyan", 0.7), (F + 1, "cyan", 0.7)])
    scale_keys(pA, [(1, 1.1), (b[2], 1.1), (b[2] + 10, 0), (F + 1, 0)])
    # the future, glowing red: "peeking at the answers"
    fut = prim("cube", "Future", mat("FutureM", "red", emit=1.5, alpha=0.16), size=1)
    fut.location = (AX + 2.6, AY, 1.0)
    scale_keys(fut, [(1, 0), (b[0] + 20, 0), (b[0] + 30, 1), (e[0] + 10, 1), (e[0] + 20, 0), (F + 1, 0)], base=(4.6, 1.3, 1.9))
    caption("FutLab", "THE FUTURE  (the answers)", (AX + 2.6, AY, 2.2), b[0] + 26, e[0] + 12, size=0.2, colour="red", align="CENTER")
    caption("Cheat", "Most backtests peek here", (AX - 1.8, AY, 1.7), b[0] + 40, e[0] + 12, size=0.14, colour="white", align="CENTER")
    # the split: 60 / 20 / 20
    for n, (a0, a1, c, text) in enumerate(((0.0, 0.6, "cyan", "Training · 60%"), (0.6, 0.8, "teal", "Validation · 20%"), (0.8, 1.0, "amber", "Vault · 20%"))):
        bar = prim("cube", f"Split{n}", mat(f"SplitM{n}", c, emit=5), size=1)
        bar.location = (x0 + (a0 + a1) / 2 * 10.0, AY - 0.75, 0.05)
        scale_keys(bar, [(1, 0), (b[1] + 8 + n * 12, 0), (b[1] + 18 + n * 12, 1), (e[2], 1), (e[2] + 10, 0), (F + 1, 0)], base=((a1 - a0) * 10.0 - 0.08, 0.08, 0.06))
        caption(f"SplitL{n}", text, (x0 + (a0 + a1) / 2 * 10.0, AY - 0.95, 0.35), b[1] + 14 + n * 12, e[2], size=0.17, colour=c, align="CENTER", frame=False)
    # last 20% locked under frosted glass with a padlock
    lock = prim("cube", "LockGlass", mat("LockGlassM", "9FB6D9", rough=0.15, emit=0.4, alpha=0.45), size=1)
    lock.location = (x0 + 9.0, AY, 0.9)
    smooth(lock, "location", 2, [(1, 4.0), (b[1] + 50, 4.0), (b[1] + 70, 0.9), (F + 1, 0.9)])
    scale_keys(lock, [(1, 1), (F + 1, 1)], base=(2.1, 1.35, 1.6))
    pad = prim("torus", "Padlock", mat("PadM", "amber", rough=0.25, metal=0.9, emit=1.5), major_radius=0.18, minor_radius=0.04)
    pad.location = (x0 + 9.0, AY - 0.7, 2.0); pad.rotation_euler = (math.radians(90), 0, 0)
    padb = prim("cube", "PadBody", mat("PadBM", "amber", rough=0.25, metal=0.9, emit=1.5), size=1)
    padb.location = (x0 + 9.0, AY - 0.7, 1.75); padb.scale = (0.42, 0.12, 0.32)
    for o in (pad, padb):
        scale_keys(o, [(1, 0), (b[1] + 72, 0), (b[1] + 80, 1.2), (b[1] + 86, 1), (F + 1, 1)], base=tuple(o.scale))
    caption("VTag", "NVDA · 10 years of history", (AX - 3.0, AY, 1.9), 30, e[1] + 30, size=0.18, colour="white", align="CENTER")
    caption("Never", "Never seen in training", (x0 + 9.0, AY, 2.75), b[1] + 82, e[1] + 30, size=0.16, colour="amber", align="CENTER")

    # ── Scene B: the vault ──────────────────────────────────────────────────
    steel = mat("Steel", "8994AA", rough=0.32, metal=0.55, coat=0.6)
    dark = mat("SteelDark", "1E2533", rough=0.35, metal=0.9)
    wall = prim("cube", "Wall", dark, size=1); wall.scale = (0.5, 9, 5.5); wall.location = (0, 0, 2.75)
    cut = prim("cylinder", "Cut", None, vertices=96, radius=DOOR_R + 0.08, depth=2)
    cut.rotation_euler = (0, math.radians(90), 0); cut.location = (0, 0, DOOR_Z)
    bo = wall.modifiers.new("Hole", "BOOLEAN"); bo.object = cut; bo.operation = "DIFFERENCE"; cut.hide_render = True; cut.hide_viewport = True
    seam = mat("Seam", "cyan", emit=2.0)
    for z in (0.9, 2.75, 4.6):
        s = prim("cube", f"SeamH{z}", seam, size=1); s.scale = (0.02, 9, 0.02); s.location = (-0.26, 0, z)
    collar = prim("torus", "Collar", steel, major_radius=DOOR_R + 0.18, minor_radius=0.12, major_segments=96)
    collar.rotation_euler = (0, math.radians(90), 0); collar.location = (-0.26, 0, DOOR_Z)
    hinge = bpy.data.objects.new("Hinge", None); bpy.context.collection.objects.link(hinge); hinge.location = (-0.1, -DOOR_R, DOOR_Z)
    door = prim("cylinder", "Door", steel, vertices=96, radius=DOOR_R, depth=0.4); bevel(door, 0.03)
    door.rotation_euler = (0, math.radians(90), 0); door.parent = hinge; door.location = (0, DOOR_R, 0)
    for k, rr in enumerate((1.25, 0.95, 0.6)):
        ring = prim("torus", f"Ring{k}", dark if k % 2 else steel, major_radius=rr, minor_radius=0.04, major_segments=96)
        ring.parent = door; ring.location = (0, 0, -0.21); ring.rotation_euler = (0, 0, 0)
    wheel = bpy.data.objects.new("Wheel", None); bpy.context.collection.objects.link(wheel); wheel.parent = door; wheel.location = (0, 0, -0.32)
    wr = prim("torus", "WheelRim", steel, major_radius=0.48, minor_radius=0.045, major_segments=64); wr.parent = wheel
    for k in range(3):
        sp = prim("cylinder", f"Spoke{k}", steel, vertices=12, radius=0.03, depth=0.96); sp.parent = wheel
        sp.rotation_euler = (math.radians(90), 0, k * math.pi / 3)
    hub = prim("cylinder", "Hub", seam, vertices=32, radius=0.1, depth=0.08); hub.parent = wheel
    bolts = []
    for k in range(12):
        a = 2 * math.pi * k / 12
        bt = prim("cylinder", f"Bolt{k}", steel, vertices=16, radius=0.07, depth=0.5)
        bt.parent = door; bt.rotation_euler = (math.radians(90), 0, a + math.pi / 2)
        bt.location = (math.cos(a) * (DOOR_R + 0.05), math.sin(a) * (DOOR_R + 0.05), 0)
        bolts.append((bt, a))
    open0, open1 = b[2] + 30, b[2] + 75
    close0, close1 = b[7] + 95, b[7] + 140
    smooth(wheel, "rotation_euler", 2, [(1, 0), (b[2] + 5, 0), (b[2] + 30, math.radians(-270)), (close1 + 5, math.radians(-270)), (close1 + 30, 0), (F + 1, 0)])
    for bt, a in bolts:
        for ax, dv in ((0, math.cos(a)), (1, math.sin(a))):
            base = bt.location[ax]
            smooth(bt, "location", ax, [(1, base), (b[2] + 18, base), (b[2] + 30, base - dv * 0.35), (close1, base - dv * 0.35), (close1 + 10, base), (F + 1, base)])
    smooth(hinge, "rotation_euler", 2, [(1, 0), (open0, 0), (open1, math.radians(108)), (close0, math.radians(108)), (close1, 0), (F + 1, 0)])
    glow = bpy.data.lights.new("Inside", "AREA"); glow.energy = 700; glow.size = 6; glow.color = (1.0, 0.92, 0.78)
    g = bpy.data.objects.new("Inside", glow); bpy.context.collection.objects.link(g); g.location = (4.0, 0, 5.0); g.rotation_euler = (0, math.radians(-30), 0)
    for f, v in ((1, 0), (open0, 0), (open1, 700), (close0, 700), (close1, 0), (F + 1, 0)):
        glow.energy = v; glow.keyframe_insert("energy", frame=f)
    door_aim = bpy.data.objects.new("DoorAim", None); bpy.context.collection.objects.link(door_aim); door_aim.location = (0, 0, DOOR_Z)
    spot("DoorSpot", (-5.5, -2.5, 4.8), door_aim, energy=1400, colour=(0.85, 0.93, 1.0), size_deg=35)
    counter("Open", ["Vault openings: 0 / 1", "Vault openings: 1 / 1"], None, [b[2], open0], size=0.075, colour="amber", hud_xy=(0.5, 0.82), until=None)

    # Chamber: candles it has never seen, under frosted covers that lift as it passes
    ch = World("Chamber", (6.6, 0), seed=9001, n=60, length=10.5, depth=1.6, scale=0.3)
    world_meshes([ch])
    run0, run1 = b[3] + 10, b[7] + 5
    def u_run(f):
        return max(0.0, min(1.0, (f - run0) / max(1, run1 - run0)))
    pB, cB = probe("ProbeB", 1.25)
    S.ride(pB, ch, u_run, step=2)
    entry = [(1, (-3.5, 0, 0.45)), (b[2] + 60, (-3.5, 0, 0.45)), (run0, tuple(ch.path(0.0)))]
    for ax in range(3):   # drive in through the door before riding the candles
        smooth(pB, "delta_location", ax, [(1, 0), (F + 1, 0)])
    scale_keys(pB, [(1, 0), (b[2] + 40, 0), (b[2] + 50, 1.25), (F + 1, 1.25)])
    glass = mat("Frost", "9FB6D9", rough=0.2, emit=0.15, alpha=0.3)
    for k in range(10):
        cov = prim("cube", f"Cover{k}", glass, size=1)
        cx = ch.x_of(k * 6 + 2.5)
        cov.location = (cx, 0, 0.55); cov.scale = (1.0, 1.2, 0.55)
        f_lift = run0 + int((k * 6 + 2.5) / 59 * (run1 - run0)) - 12
        smooth(cov, "location", 2, [(1, 0.55), (f_lift, 0.55), (f_lift + 14, 2.6), (F + 1, 2.6)])
        scale_keys(cov, [(1, 1), (f_lift + 6, 1), (f_lift + 16, 0), (F + 1, 0)], base=(1.0, 1.2, 0.55))
    # Five gates with laser sheets; the gate lights teal when passed (gate 4 hesitates amber)
    post_m = mat("Post", "4A5468", rough=0.3, metal=0.9)
    check = hud_group("Checklist", (0.38, 0.32))
    hdr = S._rich_text("ChkH", "THE FIVE GATES", 0.055, "white", "cyan", align="LEFT"); hdr.parent = check; hdr.location = (0, 0.1, 0)
    bk = prim("plane", "ChkBack", mat("ChkBackM", "05070C", alpha=0.6), size=1); bk.parent = check; bk.scale = (0.78, 0.55, 1); bk.location = (0.33, -0.12, -0.01)
    for n, (gx, name) in enumerate(GATES):
        u = (gx - (6.6 - 5.25)) / 10.5
        f_pass = run0 + int(u * (run1 - run0))
        for sy in (-1, 1):
            p = prim("cube", f"G{n}P{sy}", post_m, size=1); p.scale = (0.12, 0.12, 2.2); p.location = (gx, sy * 0.95, 1.1)
        top = prim("cube", f"G{n}Top", post_m, size=1); top.scale = (0.14, 2.0, 0.12); top.location = (gx, 0, 2.2)
        bm = bmesh.new()
        for zz in [0.35 + 0.22 * i for i in range(8)]:
            bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((0, 0, zz)) @ Matrix.Diagonal((0.012, 1.8, 0.012, 1)))
        me = bpy.data.meshes.new(f"G{n}LaserMesh"); bm.to_mesh(me); bm.free()
        sheet = bpy.data.objects.new(f"G{n}Laser", me); bpy.context.collection.objects.link(sheet)
        sheet.location = (gx, 0, 0); me.materials.append(mat_state(f"LaserM{n}", emit_scale=9.0))
        seq = [(1, "cyan", 0.5), (f_pass - 6, "cyan", 0.5)]
        if n == 3:
            seq += [(f_pass, "amber", 1.4), (f_pass + 10, "amber", 0.4), (f_pass + 16, "amber", 1.4), (f_pass + 30, "teal", 1.4)]
        else:
            seq += [(f_pass + 2, "teal", 1.4)]
        seq += [(F + 1, "teal", 1.0)]
        state(sheet, seq)
        caption(f"G{n}Lab", f"{n + 1} · {name}", (gx, 0, 2.6), b[3 + min(n, 3)] if n < 4 else b[6] + 30, F - 120, size=0.16, colour="white", align="CENTER")
        # checklist row in the HUD
        row = S._rich_text(f"Chk{n}", f"{n + 1}  {name}", 0.045, "ink", "white", align="LEFT"); row.parent = check; row.location = (0.06, -n * 0.075, 0)
        tick = S._rich_text(f"Tick{n}", "✓", 0.06, "teal", "teal", align="LEFT"); tick.parent = check; tick.location = (0.0, -n * 0.075, 0)
        try:
            tick.data.font = bpy.data.fonts.load("C:/Windows/Fonts/seguisym.ttf", check_existing=True)
        except Exception:
            pass
        tf = f_pass + (30 if n == 3 else 4)
        scale_keys(tick, [(1, 0), (tf, 0), (tf + 4, 1.4), (tf + 8, 1), (F + 1, 1)])
    scale_keys(check, [(1, 0), (b[3], 0), (b[3] + 8, 1), (b[7] + 30, 1), (b[7] + 38, 0), (F + 1, 0)])
    to_hud(check)

    # Verdict: three possible grades; this one earns Licensed (the seal is the only gold)
    gx_end = ch.centre.x + 5.8
    for n, (text, c, dz) in enumerate((("LICENSED", "gold", 0.0), ("PROBATION", "amber", -0.55), ("SCRAPPED", "red", -1.1))):
        caption(f"Grade{n}", text, (gx_end + 0.8, 0, 2.6 + dz), b[7] + 6 + n * 8, F - 110, size=0.26, colour=c, align="CENTER")
    seal = prim("cylinder", "Seal", mat("SealM", "gold", rough=0.2, metal=1.0, emit=1.2), vertices=64, radius=0.2, depth=0.05)
    seal.rotation_euler = (math.radians(90), 0, math.radians(90))
    endp = ch.path(1.0)
    smooth(seal, "location", 0, [(1, endp.x), (F + 1, endp.x)]); seal.location.y = 0
    smooth(seal, "location", 2, [(1, 5.0), (b[7] + 30, 5.0), (b[7] + 44, endp.z + 0.32), (F + 1, endp.z + 0.32)])
    sparks("SealSpark", (endp.x, 0, endp.z + 0.32), b[7] + 44, n=16, colour="gold", speed=0.7, seed=3)
    state(cB, [(1, "cyan", 0.7), (b[7] + 44, "cyan", 0.7), (b[7] + 48, "gold", 1.6), (F + 1, "gold", 1.4)])

    title_card(data)
    subtitles("vault", L)
    end_card(data)

    # Camera
    def a_at(f):
        q = hist.path(min(0.55, 0.05 + 0.5 * (f - 1) / max(1, b[1] - 1)))
        return (q.x - 1.2, q.y - 2.6, q.z + 0.8), (q.x + 1.4, q.y, q.z + 0.3)
    keys = []
    for f in (1, b[0] + 30):
        c, t = a_at(f); keys.append((f, c, t, S.LENS, 2.4))
    keys += [(b[1] + 10, (AX + 1.0, AY - 9.0, 3.4), (AX + 1.0, AY, 0.8), S.LENS, 11),
             (e[1] + 10, (AX + 4.5, AY - 5.5, 2.4), (AX + 4.0, AY, 1.0), S.LENS, 8),
             (b[2] + 5, (-7.5, -3.5, 2.4), (0, 0, DOOR_Z), S.LENS, 8),
             (open1, (-5.2, -1.2, 1.9), (0.5, 0, DOOR_Z - 0.2), S.LENS, 6)]
    for f in (run0, (run0 + run1) // 2, run1 - 30):
        q = ch.path(u_run(f)); keys.append((f, (q.x - 2.4, -2.6, 1.9), (q.x + 1.0, 0, 1.0), S.LENS, 4))
    keys += [(b[7] + 30, (ch.centre.x + 1.5, -5.6, 2.3), (gx_end + 0.4, 0, 2.0), S.LENS, 8),
             (b[7] + 70, (ch.centre.x + 1.8, -5.8, 2.4), (gx_end + 0.4, 0, 2.0), S.LENS, 8),
             (b[7] + 92, (3.0, -9.8, 3.2), (0, 0, DOOR_Z), S.LENS, 10),
             (close0 + 15, (-6.5, -3.0, 2.3), (0, 0, DOOR_Z), S.LENS, 8),
             (F, (-7.8, -3.8, 2.4), (0, 0, DOOR_Z), S.LENS, 8)]
    S.camera_path(cam, tgt, keys)
    print(f"vault explainer: {F} frames ({F / 30:.1f}s)")


if globals().get("__name__") == "__main__" or "FILMS_DIR" in globals():
    build()
    save(os.path.abspath(globals().get("FILMS_OUT") or os.path.join(HERE, "..", "build", "vault.blend")))
