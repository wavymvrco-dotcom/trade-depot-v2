# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Film 5 — Licensed + Tripwire, explainer (docs/FILMS.md, films/narration.json).

import os, sys, math, random, importlib
HERE = globals().get("FILMS_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import studio2 as S; importlib.reload(S)
from studio2 import (reset, stage, camera, World, probe, mat, mat_state, prim, state, smooth, bulk, sparks,
                     hud, hud_group, to_hud, callout, caption, subtitles, title_card, end_card, narration, set_length,
                     spot, save, col, bevel)
import bpy
from mathutils import Vector

N, LEN = 40, 8.0
PLAQUE_HOME = (0.0, 0.6, 2.6)
RACK = (-6.2, 1.2, 1.3)


def scale_keys(ob, pts, base=(1, 1, 1)):
    for ax in range(3):
        smooth(ob, "scale", ax, [(f, v * base[ax]) for f, v in pts])


def build():
    reset("licensed", haze=0.012)
    data, L, total = narration("licensed")
    set_length(total)
    F = S.FRAMES
    b = [l["f0"] for l in L]; e = [l["f1"] for l in L]
    stage()
    cam, tgt = camera(S.LENS, 2.8)

    # Plaque: the strategy's credential
    root = bpy.data.objects.new("Plaque", None); bpy.context.collection.objects.link(root)
    face = prim("cube", "PlaqueFace", mat("PlaqueM", "3A4760", rough=0.3, metal=0.5, coat=1.0), size=1); face.parent = root
    face.scale = (1.7, 0.08, 1.05); bevel(face, 0.03, 3)
    rim = prim("cube", "PlaqueRim", mat("PlaqueRimM", "cyan", emit=3), size=1); rim.parent = root; rim.scale = (1.74, 0.06, 1.09); rim.location = (0, 0.02, 0)
    t1 = S._rich_text("PlaqueT", "LONDON BREAKOUT", 0.17, "white", "cyan", align="LEFT"); t1.parent = root
    t1.rotation_euler = (math.radians(90), 0, 0); t1.location = (-0.75, -0.05, 0.3)
    t2 = S._rich_text("PlaqueS", "Vault ✓  Storm ✓  Shadow ✓", 0.11, "teal", "white", align="LEFT"); t2.parent = root
    t2.rotation_euler = (math.radians(90), 0, 0); t2.location = (-0.75, -0.05, 0.02)
    try:
        t2.data.font = bpy.data.fonts.load("C:/Windows/Fonts/seguisym.ttf", check_existing=True)
    except Exception:
        pass
    pull = b[4] + 20
    S.smooth_vec(root, "location", [(1, (0, 0.6, 7.0)), (b[0] - 10, (0, 0.6, 7.0)), (b[0] + 30, PLAQUE_HOME), (pull, PLAQUE_HOME),
                                    (pull + 40, RACK), (F + 1, RACK)])
    smooth(root, "rotation_euler", 2, [(1, 0), (pull, 0), (pull + 40, math.radians(18)), (F + 1, math.radians(18))])
    # Gold seal: stamps on, blows off when the tripwire fires
    seal = bpy.data.objects.new("Seal", None); bpy.context.collection.objects.link(seal); seal.parent = root
    gold = mat("Gold", "gold", rough=0.2, metal=1.0, emit=1.0)
    disc = prim("cylinder", "SealDisc", gold, vertices=64, radius=0.24, depth=0.05); disc.parent = seal; disc.rotation_euler = (math.radians(90), 0, 0)
    ring = prim("torus", "SealRing", gold, major_radius=0.2, minor_radius=0.015); ring.parent = seal; ring.rotation_euler = (math.radians(90), 0, 0); ring.location = (0, -0.03, 0)
    st = prim("cone", "SealStar", gold, vertices=5, radius1=0.11, radius2=0.0, depth=0.03); st.parent = seal; st.rotation_euler = (math.radians(-90), 0, 0); st.location = (0, -0.04, 0)
    stamp = b[0] + 45
    S.smooth_vec(seal, "location", [(1, (0.55, -1.4, -0.25)), (stamp - 12, (0.55, -1.4, -0.25)), (stamp, (0.55, -0.07, -0.25)),
                                    (pull - 2, (0.55, -0.07, -0.25)), (pull + 14, (1.6, -1.6, 1.2)), (F + 1, (1.6, -1.6, 1.2))])
    scale_keys(seal, [(1, 0), (stamp - 14, 0), (stamp - 10, 1), (stamp, 1.15), (stamp + 4, 1), (pull + 6, 1), (pull + 16, 0), (F + 1, 0)])
    sparks("StampSparks", (0.55, 0.45, PLAQUE_HOME[2] - 0.25), stamp, n=20, colour="gold", speed=0.9, seed=2)
    caption("Lic", "LICENSED", (0.0, 0.5, 3.55), stamp + 4, pull, size=0.3, colour="gold", align="CENTER")

    # Live chart below, candles arriving; it sags until a wick touches the tripwire
    rnd = random.Random(8)
    w = World("Live", (0, 0), seed=31337, n=N, length=LEN, depth=1.4, scale=0.6)
    plat = prim("cube", "LivePlat", mat("LivePlatM", "metal", rough=0.35, metal=0.7), size=1); plat.scale = (LEN + 0.5, 1.4, 0.22); plat.location = (0, 0, 0.11)
    m_up, m_dn, m_wk = mat("UpL", "up", rough=0.15, emit=0.9, coat=0.6), mat("DnL", "down", rough=0.15, emit=0.7, coat=0.6), mat("WkL", "white", emit=0.5)
    bw = LEN / N * 0.62
    t0, t1_ = b[1], b[4] + 10
    appear = [int(t0 + i * (t1_ - t0) / N) for i in range(N)]
    lows = []
    # sag: later candles drift down so the lowest wick reaches the wire exactly at the trip
    for i, (o, h, l, c) in enumerate(w.ohlc):
        sag = -0.9 * max(0.0, (i - N * 0.45) / (N * 0.55)) ** 1.6
        x = w.x_of(i)
        z0, z1 = w.z_of(min(o, c)) + 0.6 + sag, max(w.z_of(max(o, c)), w.z_of(min(o, c)) + 0.012) + 0.6 + sag
        zl, zh = w.z_of(l) + 0.6 + sag, w.z_of(h) + 0.6 + sag
        lows.append(zl)
        body = prim("cube", f"C{i}", m_up if c >= o else m_dn, size=1); body.location = (x, 0, (z0 + z1) / 2); body.scale = (bw, bw, z1 - z0)
        wick = prim("cube", f"W{i}", m_wk, size=1); wick.location = (x, 0, (zl + zh) / 2); wick.scale = (bw * 0.16, bw * 0.16, zh - zl)
        for ob in (body, wick):
            scale_keys(ob, [(1, 0), (appear[i], 0), (appear[i] + 5, 1), (F + 1, 1)], base=tuple(ob.scale))
    wire_z = min(lows[-4:]) + 0.005
    wire = prim("cylinder", "Tripwire", mat_state("WireM", emit_scale=8), vertices=12, radius=0.018, depth=LEN + 0.6)
    wire.rotation_euler = (0, math.radians(90), 0); wire.location = (0, -0.05, wire_z)
    trip = appear[-3] + 3
    state(wire, [(1, "red", 0.0), (b[2], "red", 0.0), (b[2] + 8, "red", 0.9), (trip - 1, "red", 0.9)] +
          [(trip + k * 6, "red", 3.5 if k % 2 == 0 else 0.6) for k in range(8)] + [(F + 1, "red", 1.0)])
    scale_keys(wire, [(1, 0), (b[2], 0), (b[2] + 14, 1), (F + 1, 1)])
    for k in range(2):
        em = prim("cube", f"WireEmitter{k}", mat("EmitterM", "4A5468", metal=0.8, rough=0.3), size=1)
        em.scale = (0.18, 0.18, 0.3); em.location = ((LEN / 2 + 0.4) * (1 if k else -1), -0.05, wire_z)
    sparks("TripSparks", (w.x_of(N - 3), -0.05, wire_z), trip, n=24, colour="red", speed=0.8, seed=5)
    callout("CoWire", "TRIPWIRE", (-LEN / 2 + 0.6, -0.05, wire_z), (-0.2, -0.8, 0.5), b[2] + 10, e[3] + 30, size=0.18, colour="red")
    callout("CoMarket", "Gold (XAU/USD) · live", (w.x_of(6), 0, 1.2), (0.0, -0.4, 0.9), b[1] + 10, e[1] + 20, size=0.15, colour="white")
    alarm = bpy.data.lights.new("Alarm", "POINT"); alarm.color = (1.0, 0.2, 0.2)
    ao = bpy.data.objects.new("Alarm", alarm); bpy.context.collection.objects.link(ao); ao.location = (w.x_of(N - 3), -1.0, 1.8)
    for k in range(10):
        alarm.energy = 0 if k % 2 else 3000; alarm.keyframe_insert("energy", frame=trip + k * 6)
    alarm.energy = 0; alarm.keyframe_insert("energy", frame=1); alarm.keyframe_insert("energy", frame=trip - 1); alarm.keyframe_insert("energy", frame=F + 1)

    # The rack where pulled strategies wait (Shadow Run)
    rack = prim("cube", "Rack", mat("RackM", "1E2533", rough=0.4, metal=0.8), size=1); rack.scale = (2.3, 0.5, 0.1); rack.location = (RACK[0], RACK[1] + 0.2, RACK[2] - 0.62)
    for sx in (-1, 1):
        leg = prim("cube", f"RackLeg{sx}", mat(f"RackLegM{sx}", "1E2533", rough=0.4, metal=0.8), size=1)
        leg.scale = (0.08, 0.08, RACK[2] - 0.62); leg.location = (RACK[0] + sx * 1.0, RACK[1] + 0.2, (RACK[2] - 0.62) / 2)
    caption("RackLab", "SHADOW RUN  · earn it again", (RACK[0], RACK[1], RACK[2] - 1.0), b[4] + 10, F - 110, size=0.16, colour="cyan", align="CENTER")

    # HUD: the two things the tripwire watches
    g = hud_group("Watch", (0.22, 0.62))
    hdr = S._rich_text("WatchT", "THE TRIPWIRE WATCHES", 0.055, "red", "white", align="LEFT"); hdr.parent = g; hdr.location = (0, 0.08, 0)
    for k, (text, end_v) in enumerate((("Drift from what the Vault promised", 1.0), ("Drawdown vs. deepest seen in the Vault", 0.82))):
        y = -k * 0.15
        lab = S._rich_text(f"WatchL{k}", text, 0.055, "white", "white", align="LEFT"); lab.parent = g; lab.location = (0, y, 0)
        bk = prim("cube", f"WatchB{k}", mat(f"WatchBM{k}", "1A2130", emit=0.2), size=1); bk.parent = g; bk.location = (0.45, y - 0.06, -0.005); bk.scale = (0.9, 0.035, 0.002)
        fill = prim("cube", f"WatchF{k}", mat_state(f"WatchFM{k}", emit_scale=1.4), size=1); fill.parent = g; fill.location.y = y - 0.06
        lim = prim("cube", f"WatchLim{k}", mat("WatchLimM", "white", emit=5), size=1); lim.parent = g; lim.location = (0.88, y - 0.06, 0.003); lim.scale = (0.006, 0.07, 0.002)
        vals = [(1, 0.05), (b[3], 0.1), (b[3] + 40, 0.35), (b[3] + 80, 0.6), (trip, end_v * 0.98), (F + 1, end_v * 0.98)]
        smooth(fill, "scale", 0, [(f, v * 0.9) for f, v in vals]); smooth(fill, "location", 0, [(f, v * 0.45) for f, v in vals])
        smooth(fill, "scale", 1, [(1, 0.035), (F + 1, 0.035)]); smooth(fill, "scale", 2, [(1, 0.003), (F + 1, 0.003)])
        state(fill, [(1, "amber", 0.8), (trip - 10, "amber", 0.8), (trip, "red", 1.6), (F + 1, "red", 1.4)])
    for ax in range(3):
        smooth(g, "scale", ax, [(1, 0), (b[3] - 4, 0), (b[3] + 4, 1), (F - 110, 1), (F - 104, 0), (F + 1, 0)])
    to_hud(g)
    hud("Trip", "TRIPWIRE TRIGGERED · licence pulled", (-0.42, 0.22), trip + 2, b[5] + 30, size=0.1, colour="red")

    title_card(data)
    subtitles("licensed", L)
    end_card(data)

    keys = [(1, (1.5, -6.5, 3.6), (0, 0.5, 2.6), S.LENS, 4), (b[0] + 40, (1.0, -5.2, 3.0), (0.2, 0.5, 2.5), S.LENS, 4),
            (b[1] + 20, (-1.2, -6.4, 2.6), (0, 0, 1.3), S.LENS, 6), (b[2] + 10, (-3.4, -6.8, 2.2), (-1.5, 0, wire_z + 0.3), S.LENS, 5),
            (b[3] + 30, (0.4, -6.6, 2.5), (0.6, 0, 1.3), S.LENS, 7), (trip - 10, (3.4, -5.0, 1.8), (w.x_of(N - 3), 0, wire_z + 0.3), S.LENS, 4),
            (pull + 20, (-1.0, -8.0, 3.0), (-2.6, 0.6, 1.8), S.LENS, 7), (F, (-4.2, -6.5, 2.6), (-5.6, 1.0, 1.4), S.LENS, 6)]
    S.camera_path(cam, tgt, keys)
    print(f"licensed explainer: {F} frames ({F / 30:.1f}s)")


if globals().get("__name__") == "__main__" or "FILMS_DIR" in globals():
    build()
    save(os.path.abspath(globals().get("FILMS_OUT") or os.path.join(HERE, "..", "build", "licensed.blend")))
