# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Film 2 — The Gauntlet, explainer (docs/FILMS.md, films/narration.json): the Hunter
# drone attacks the stop loss with gaps and spread blowouts; then Storm Mode reruns
# the strategy across 200 simulated worlds; 95% must stay inside the drawdown limit.

import os, sys, math, random, importlib
HERE = globals().get("FILMS_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import studio2 as S; importlib.reload(S)
from studio2 import (reset, stage, camera, World, world_meshes, probe, mat, mat_state, prim, state, smooth, bulk, sparks,
                     hud, hud_group, to_hud, counter, callout, caption, subtitles, title_card, end_card, narration, set_length,
                     spot, save, col, bevel)
import bpy, bmesh
from mathutils import Vector, Matrix

HX, HY = -16.0, 0.0
COLS, ROWS = 10, 20
PX, PY = 2.6, 1.3
FAILS = 8          # 192 / 200 = 96% inside the limit


def scale_keys(ob, pts, base=(1, 1, 1)):
    for ax in range(3):
        smooth(ob, "scale", ax, [(f, v * base[ax]) for f, v in pts])


def drone(name):
    root = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(root)
    shell = mat("DroneShell", "2A3346", rough=0.25, metal=0.8, coat=1.0)
    red = mat("DroneRed", "red", emit=8)
    body = prim("uv_sphere", f"{name}Body", shell, radius=0.22, segments=32, ring_count=16); body.parent = root; body.scale = (1.3, 1.0, 0.45)
    eye = prim("uv_sphere", f"{name}Eye", red, radius=0.06, segments=16, ring_count=8); eye.parent = root; eye.location = (0.27, 0, -0.02)
    rotors = []
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        arm = prim("cube", f"{name}Arm{k}", shell, size=1); arm.parent = root
        arm.location = (math.cos(a) * 0.3, math.sin(a) * 0.3, 0.02); arm.rotation_euler = (0, 0, a); arm.scale = (0.42, 0.04, 0.03)
        hubo = bpy.data.objects.new(f"{name}Rot{k}", None); bpy.context.collection.objects.link(hubo); hubo.parent = root
        hubo.location = (math.cos(a) * 0.5, math.sin(a) * 0.5, 0.08)
        disc = prim("cylinder", f"{name}Disc{k}", mat(f"RotorM{k}", "red", emit=1.5, alpha=0.35), vertices=24, radius=0.17, depth=0.005); disc.parent = hubo
        blade = prim("cube", f"{name}Blade{k}", shell, size=1); blade.parent = hubo; blade.scale = (0.34, 0.025, 0.006)
        rotors.append(hubo)
    fan = prim("cone", f"{name}Fan", mat("FanM", "red", emit=1.2, alpha=0.07), vertices=4, radius1=0.9, radius2=0.0, depth=1.6)
    fan.parent = root; fan.location = (0.5, 0, -0.75); fan.rotation_euler = (0, math.radians(-30), 0); fan.scale = (1, 0.12, 1)
    return root, rotors, fan


def build():
    reset("gauntlet", haze=0.012)
    data, L, total = narration("gauntlet")
    set_length(total)
    F = S.FRAMES
    b = [l["f0"] for l in L]; e = [l["f1"] for l in L]
    stage()
    cam, tgt = camera(S.LENS, 2.4)
    rnd = random.Random(23)

    # ── The hero world, candles as separate objects so the Hunter can damage them ──
    hw = World("Hero", (HX, HY), seed=515, n=30, length=6.0, depth=1.3, scale=0.5)
    plat = prim("cube", "HeroPlat", mat("PlatM", "metal", rough=0.35, metal=0.7), size=1); plat.scale = (6.4, 1.3, 0.22); plat.location = (HX, HY, 0.11)
    m_up, m_dn, m_wk = mat("UpH", "up", rough=0.15, emit=0.9, coat=0.6), mat("DnH", "down", rough=0.15, emit=0.7, coat=0.6), mat("WkH", "white", emit=0.5)
    bw = 6.0 / 30 * 0.62
    gap_from, gap_f = 17, b[2] + 15
    spread_idx, spread_f = (11, 12, 13), b[2] + 55
    for i, (o, h, l, c) in enumerate(hw.ohlc):
        x = hw.x_of(i)
        z0, z1 = hw.z_of(min(o, c)), max(hw.z_of(max(o, c)), hw.z_of(min(o, c)) + 0.012)
        body = prim("cube", f"HC{i}", m_up if c >= o else m_dn, size=1); body.location = (x, HY, (z0 + z1) / 2); body.scale = (bw, bw, z1 - z0); bevel(body, 0.006, 2)
        wick = prim("cube", f"HW{i}", m_wk, size=1); wick.location = (x, HY, (hw.z_of(l) + hw.z_of(h)) / 2); wick.scale = (bw * 0.16, bw * 0.16, hw.z_of(h) - hw.z_of(l))
        if i >= gap_from:     # the gap: everything after it opens lower
            for ob in (body, wick):
                z = ob.location.z
                smooth(ob, "location", 2, [(1, z), (gap_f, z), (gap_f + 3, z - 0.45), (F + 1, z - 0.45)])
        if i in spread_idx:   # spread blowout: wicks stretch
            smooth(wick, "scale", 2, [(1, wick.scale.z), (spread_f, wick.scale.z), (spread_f + 4, wick.scale.z * 4.5), (spread_f + 40, wick.scale.z * 4.5), (spread_f + 60, wick.scale.z), (F + 1, wick.scale.z)])
    sparks("GapSparks", (hw.x_of(gap_from) - 0.1, HY, 0.9), gap_f, n=14, colour="red", speed=0.6, seed=1)
    # stop loss line under the probe
    run0, run1 = 1, b[3]
    u_of = lambda f: 0.08 + 0.78 * max(0.0, min(1.0, (f - run0) / max(1, run1 - run0)))
    pr, pc = probe("Probe", 1.15)
    S.ride(pr, hw, u_of, step=2)
    state(pc, [(1, "cyan", 0.8), (gap_f, "cyan", 0.8), (gap_f + 3, "amber", 2.0), (gap_f + 30, "cyan", 0.8), (spread_f, "cyan", 0.8), (spread_f + 3, "amber", 2.0), (spread_f + 30, "cyan", 0.8), (F + 1, "cyan", 0.8)])
    stop = prim("cube", "StopLine", mat_state("StopM", emit_scale=6), size=1)
    stop.scale = (6.0, 0.02, 0.02); stop.location = (HX, HY - 0.68, 0.55)
    state(stop, [(1, "red", 0.6), (b[1] + 50, "red", 0.6), (b[1] + 55, "red", 2.5), (b[1] + 62, "red", 0.6), (gap_f + 2, "red", 0.6), (gap_f + 5, "red", 2.8), (gap_f + 14, "red", 0.6), (F + 1, "red", 0.6)])
    callout("CoStop", "Your stop loss", (HX - 2.0, HY - 0.68, 0.55), (-0.3, -0.6, 0.55), b[1] + 20, e[2] + 10, size=0.14, colour="red")
    # the Hunter
    dr, rotors, fan = drone("Hunter")
    for k, r_ in enumerate(rotors):
        bulk(r_, "rotation_euler", 2, [1, F + 1], [0, (F / 30) * 40 * (1 if k % 2 else -1)], interp="LINEAR")
    smooth_path = [(1, (HX - 9, HY - 6, 6)), (b[1] - 10, (HX - 9, HY - 6, 6)), (b[1] + 30, (HX - 1.0, HY - 0.4, 1.9)),
                   (gap_f - 10, (hw.x_of(gap_from) - 0.6, HY - 0.3, 1.7)), (spread_f - 10, (hw.x_of(12) - 0.4, HY - 0.4, 1.8)),
                   (b[3] + 10, (HX + 1.5, HY - 0.6, 2.2)), (b[3] + 60, (HX + 8, HY + 6, 7)), (F + 1, (HX + 8, HY + 6, 7))]
    S.smooth_vec(dr, "location", smooth_path)
    scale_keys(fan, [(1, 0), (b[1] + 30, 0), (b[1] + 40, 1), (b[3], 1), (b[3] + 10, 0), (F + 1, 0)], base=(1, 0.12, 1))
    callout("CoHunter", "The Hunter — an adversary", (HX - 1.0, HY - 0.4, 2.05), (0.2, -0.5, 0.75), b[1] + 34, e[1] + 10, size=0.14, colour="red")
    caption("Gap", "GAP", (hw.x_of(gap_from) + 0.3, HY - 0.3, 1.25), gap_f + 2, gap_f + 80, size=0.22, colour="red", align="CENTER")
    caption("Spread", "SPREAD ×5", (hw.x_of(12), HY - 0.3, 2.0), spread_f + 2, spread_f + 70, size=0.18, colour="amber", align="CENTER")
    spot("HeroSpot", (HX - 2, HY - 4, 5), pr, energy=700, size_deg=30)
    caption("HeroTag", "AAPL · stock", (HX - 2.6, HY, 1.5), 40, b[3] + 20, size=0.18, colour="white", align="CENTER")

    # ── Storm Mode: 200 worlds ──────────────────────────────────────────────
    centres = [((c - (COLS - 1) / 2) * PX, (r - (ROWS - 1) / 2) * PY) for r in range(ROWS) for c in range(COLS)]
    worlds = [World(f"S{k}", c, seed=rnd.randrange(10**6), n=18, length=2.1, depth=0.9, scale=0.22, base=0.16) for k, c in enumerate(centres)]
    wm = world_meshes(worlds, depth=0.9)
    for ob in wm.values():
        smooth(ob, "scale", 2, [(1, 0), (b[4] - 5, 0), (b[4] + 40, 1), (F + 1, 1)])
    fail = set(rnd.sample(range(len(worlds)), FAILS))
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Diagonal((2.3, 0.03, 0.035, 1)))
    lamp_me = bpy.data.meshes.new("SLamp"); bm.to_mesh(lamp_me); bm.free(); lamp_me.materials.append(mat_state("SLampM", emit_scale=3.0))
    judge0 = b[6] + 10
    for k, w in enumerate(worlds):
        appear = b[4] + 10 + int(math.hypot(*w.centre.xy) / 20 * 40)
        root, core = probe(f"SP{k:03d}", 0.6)
        ph = rnd.random()
        S.ride(root, w, lambda f, ph=ph: 0.5 - 0.45 * math.cos(2 * math.pi * ((f - 1) / 300 + ph)), step=4)
        lamp = bpy.data.objects.new(f"SL{k:03d}", lamp_me); bpy.context.collection.objects.link(lamp)
        lamp.location = (w.centre.x, w.centre.y - 0.47, w.base)
        jf = judge0 + int((k / len(worlds)) * max(30, e[6] - judge0 - 20))
        if k in fail:
            state(core, [(1, "cyan", 0.6), (jf, "cyan", 0.6), (jf + 3, "red", 2.0), (jf + 12, "red", 0.0), (F + 1, "red", 0.0)])
            scale_keys(root, [(1, 0), (appear, 0), (appear + 8, 0.6), (jf + 3, 0.6), (jf + 14, 0), (F + 1, 0)])
            sparks(f"SS{k:03d}", w.path(0.5), jf + 3, n=8, colour="red", seed=k)
            state(lamp, [(1, "dim", 0), (appear, "cyan", 0.5), (jf, "cyan", 0.5), (jf + 3, "red", 1.6), (F + 1, "red", 1.4)])
        else:
            state(core, [(1, "cyan", 0.6), (jf, "cyan", 0.6), (jf + 4, "teal", 1.2), (F + 1, "teal", 1.2)])
            scale_keys(root, [(1, 0), (appear, 0), (appear + 8, 0.6), (F + 1, 0.6)])
            state(lamp, [(1, "dim", 0), (appear, "cyan", 0.5), (jf, "cyan", 0.5), (jf + 4, "teal", 1.2), (F + 1, "teal", 1.2)])
    for n, (k, text) in enumerate(((22, "reshuffled history · gold"), (57, "regime shift"), (128, "earnings gap · stocks"), (173, "spread blowout · oil"))):
        w = worlds[k]
        callout(f"CoS{n}", text, (w.centre.x, w.centre.y, 0.5), (0, 0, 2.2), b[4] + 30 + n * 12, e[4] + 30, size=0.42, colour="white")
    # the storm: dark cell drifting over the grid with lightning
    cloud = prim("cube", "Cloud", None, size=1)
    cm = bpy.data.materials.new("CloudM"); cm.use_nodes = True
    nt = cm.node_tree
    for n_ in list(nt.nodes):
        if n_.type == "BSDF_PRINCIPLED":
            nt.nodes.remove(n_)
    vol = nt.nodes.new("ShaderNodeVolumePrincipled"); vol.inputs["Density"].default_value = 0.18; vol.inputs["Color"].default_value = col("1A2130")
    out = next(n_ for n_ in nt.nodes if n_.type == "OUTPUT_MATERIAL"); nt.links.new(vol.outputs[0], out.inputs["Volume"])
    cloud.data.materials.append(cm)
    cloud.scale = (14, 30, 2.2)
    S.smooth_vec(cloud, "location", [(1, (-40, 0, 7)), (b[3], (-40, 0, 7)), (b[4] + 40, (-6, 0, 7)), (e[5], (6, 0, 7)), (F + 1, (14, 0, 7))])
    bolt = bpy.data.lights.new("Lightning", "AREA"); bolt.size = 12; bolt.color = (0.75, 0.85, 1.0)
    lo = bpy.data.objects.new("Lightning", bolt); bpy.context.collection.objects.link(lo); lo.location = (0, 0, 9)
    flashes = [b[3] + 20, b[4] + 15, b[4] + 70, b[5] + 20, b[5] + 60]
    pts = [(1, 0)]
    for fl in flashes:
        pts += [(fl - 1, 0), (fl, 25000), (fl + 2, 0), (fl + 4, 15000), (fl + 6, 0)]
    pts += [(F + 1, 0)]
    for f, v in sorted(dict(pts).items()):
        bolt.energy = v; bolt.keyframe_insert("energy", frame=f)
    for fc in S.fcurves(bolt.animation_data.action):
        for kp in fc.keyframe_points:
            kp.interpolation = "CONSTANT"

    # HUD: storm count, gauge with the 95% notch, stamp
    hud("Storm", "STORM MODE · 200 simulated worlds", (-0.92, 0.82), b[3] + 30, F - 110, size=0.065, colour="amber")
    g = hud_group("Gauge", (-0.92, 0.6))
    t = S._rich_text("GaugeT", "Worlds inside the drawdown limit", 0.06, "white", "cyan", align="LEFT"); t.parent = g
    bk = prim("cube", "GaugeBack", mat("GaugeBackM", "1A2130", emit=0.2), size=1); bk.parent = g; bk.location = (0.5, -0.09, -0.005); bk.scale = (1.0, 0.05, 0.002)
    fill = prim("cube", "GaugeFill", mat("GaugeFillM", "teal", emit=1.4), size=1); fill.parent = g
    notch = prim("cube", "Notch", mat("NotchM", "white", emit=6), size=1); notch.parent = g; notch.location = (0.95, -0.09, 0.003); notch.scale = (0.006, 0.1, 0.002)
    nl = S._rich_text("NotchL", "95% needed", 0.045, "white", "white", align="CENTER"); nl.parent = g; nl.location = (0.95, -0.18, 0)
    fill.location.y = -0.09
    span = max(30, e[6] - judge0)
    smooth(fill, "scale", 0, [(1, 0.001), (judge0, 0.001), (judge0 + span, 0.96), (F + 1, 0.96)])
    smooth(fill, "location", 0, [(1, 0.0), (judge0, 0.0), (judge0 + span, 0.48), (F + 1, 0.48)])
    fill.scale.y = 0.05; fill.scale.z = 0.003
    smooth(fill, "scale", 1, [(1, 0.05), (F + 1, 0.05)]); smooth(fill, "scale", 2, [(1, 0.003), (F + 1, 0.003)])
    for ax in range(3):
        smooth(g, "scale", ax, [(1, 0), (b[6] - 4, 0), (b[6] + 4, 1), (F - 110, 1), (F - 104, 0), (F + 1, 0)])
    to_hud(g)
    steps = [0, 25, 50, 75, 100, 125, 150, 175, 192]
    counter("Inside", [f"{v} / 200" for v in steps], None, [judge0 + int(span * k / (len(steps) - 1)) for k in range(len(steps))],
            size=0.08, colour="teal", hud_xy=(-0.15, 0.6), until=F - 110)
    hud("Stamp", "STORM PASSED · 96%", (-0.3, 0.2), b[7] + 10, F - 110, size=0.15, colour="teal")

    title_card(data)
    subtitles("gauntlet", L)
    end_card(data)

    def near(f):
        q = hw.path(u_of(f))
        return (q.x - 0.9, q.y - 3.2, q.z + 1.4), (q.x + 0.6, q.y, q.z + 0.4)
    keys = []
    for f in (1, b[1], b[1] + 40, gap_f, spread_f, e[2]):
        c, t = near(f); keys.append((f, c, t, S.LENS, 3.5))
    keys += [(b[3] + 30, (HX + 2, HY - 9, 7), (HX + 6, 0, 2), S.LENS, 12),
             (b[4] + 40, (-6, -24, 12), (0, -2, 0), S.LENS, 16),
             (b[5] + 20, (5, -23, 11), (0, -2, 0), S.LENS, 16),
             (b[6] + 20, (-3, -21, 10), (0, -1, 0), S.LENS, 16),
             (F, (2, -20, 9.5), (0, 0, 0), S.LENS, 16)]
    S.camera_path(cam, tgt, keys)
    print(f"gauntlet explainer: {F} frames ({F / 30:.1f}s)")


if globals().get("__name__") == "__main__" or "FILMS_DIR" in globals():
    build()
    save(os.path.abspath(globals().get("FILMS_OUT") or os.path.join(HERE, "..", "build", "gauntlet.blend")))
