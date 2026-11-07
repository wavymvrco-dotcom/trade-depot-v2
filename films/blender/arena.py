# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Film 1 — The Arena, explainer (docs/FILMS.md, films/narration.json). Each narration
# line drives a visual beat: the Probe on one world, the sandbox of 144 worlds,
# simultaneous runs, selection, mutation, generations, and the champion.

import os, sys, math, random, importlib
HERE = globals().get("FILMS_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import studio2 as S; importlib.reload(S)
from studio2 import (reset, stage, camera, World, world_meshes, probe, mat, mat_state, prim, state, smooth, bulk, sparks,
                     hud, hud_group, to_hud, counter, callout, caption, subtitles, title_card, end_card, narration, set_length, ride, spot, save, col)
import bpy, bmesh
from mathutils import Vector, Matrix

COLS, ROWS = 8, 18
PX, PY = 3.7, 1.65
N_CANDLES, LEN = 30, 3.1
WORLD_TAGS = [  # (col, row, label) — what makes each world different: market, stretch of history, costs, fills
    (1, 14, "EURUSD · a calm stretch"), (6, 15, "NVDA · a volatile stretch"),
    (2, 4, "Gold · a trending stretch"), (6, 6, "Crude oil · costs ×2.3 · missed fills"),
    (4, 2, "AAPL · earnings season"), (1, 10, "S&P 500 · a sell-off"),
]


def u_ping(f, phase=0.0):
    return 0.5 - 0.45 * math.cos(2 * math.pi * ((f - 1) / 600 + phase))


def drive(ob, world, phase, step=3):
    ride(ob, world, lambda f: u_ping(f, phase), step=step)
    fr = list(range(1, S.FRAMES + 2, step))
    bulk(ob, "rotation_euler", 2, fr, [0.0 if u_ping(f + 1, phase) >= u_ping(f - 1, phase) else math.pi for f in fr])


def scale_keys(ob, pts, base=1.0):
    for ax in range(3):
        smooth(ob, "scale", ax, [(f, v * base) for f, v in pts])


def build():
    reset("arena", haze=0.01)
    data, L, total = narration("arena")
    set_length(total)
    F = S.FRAMES
    b = [l["f0"] for l in L]                      # beat start frames
    e = [l["f1"] for l in L]
    stage()
    cam, tgt = camera(S.LENS, 2.0)
    rnd = random.Random(1107)
    centres = [((c - (COLS - 1) / 2) * PX, (r - (ROWS - 1) / 2) * PY) for r in range(ROWS) for c in range(COLS)]
    hero_i = 9 * COLS + 4
    worlds = [World(f"W{k}", c, seed=rnd.randrange(10**6), n=N_CANDLES, length=LEN, depth=1.15, scale=0.3) for k, c in enumerate(centres)]
    hero = worlds[hero_i]; hx, hy = hero.centre.x, hero.centre.y

    # The sandbox: other worlds rise out of the floor when it is introduced (line 4)
    others = world_meshes([w for k, w in enumerate(worlds) if k != hero_i])
    for ob in others.values():
        smooth(ob, "scale", 2, [(1, 0.0), (b[4] - 10, 0.0), (b[4] + 35, 1.0), (F + 1, 1.0)])
    hero_obs = world_meshes([hero])
    for k in ("up", "down", "wick"):
        smooth(hero_obs[k], "scale", 2, [(1, 0.1), (10, 0.1), (b[0] + 40, 1.0), (F + 1, 1.0)])

    # Status lamps on every world's front edge: off -> cyan (running) -> red / teal (judged)
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Diagonal((LEN + 0.3, 0.035, 0.04, 1)))
    lamp_me = bpy.data.meshes.new("StatusLamp"); bm.to_mesh(lamp_me); bm.free()
    lamp_me.materials.append(mat_state("LampState", emit_scale=3.2))

    fitness = [rnd.random() for _ in worlds]; fitness[hero_i] = 2.0
    cut = sorted(fitness)[int(0.68 * len(fitness))]
    ymin, ymax = min(c[1] for c in centres), max(c[1] for c in centres)
    sweep0, sweep1 = b[6] + 8, e[6]
    split0 = b[7] + 6
    hero_root = None
    for k, w in enumerate(worlds):
        dist = math.hypot(w.centre.x - hx, w.centre.y - hy) / 30
        appear = 1 if k == hero_i else b[4] + 10 + int(dist * 60)
        judge = sweep0 + int((w.centre.y - ymin) / (ymax - ymin) * (sweep1 - sweep0))
        root, core = probe(f"P{k:03d}", 1.0)
        if k == hero_i:
            hero_root = root
        drive(root, w, 0.0 if k == hero_i else rnd.random())
        lamp = bpy.data.objects.new(f"Lamp{k:03d}", lamp_me); bpy.context.collection.objects.link(lamp)
        lamp.location = (w.centre.x, w.centre.y - 1.15 / 2 - 0.02, w.base + 0.01)
        lose = fitness[k] < cut
        end_c = "red" if lose else "teal"
        state(lamp, [(1, "dim", 0.0 if k != hero_i else 0.5), (appear, "dim", 0.0 if k != hero_i else 0.5), (appear + 6, "cyan", 0.5),
                     (judge, "cyan", 0.5), (judge + 4, end_c, 1.4), (F + 1, end_c, 1.2)])
        if lose:
            state(core, [(1, "cyan", 0.6), (judge, "cyan", 0.6), (judge + 3, "red", 2.0), (judge + 14, "red", 0.0), (F + 1, "red", 0.0)])
            scale_keys(root, [(1, 0), (appear, 0), (appear + 8, 1), (judge + 4, 1), (judge + 16, 0), (F + 1, 0)])
            sparks(f"S{k:03d}", w.path(u_ping(judge)), judge + 4, n=8, colour="red", seed=k)
        else:
            state(core, [(1, "cyan", 0.6), (judge, "cyan", 0.6), (judge + 6, "teal", 1.6), (F + 1, "teal", 1.4)])
            if k != hero_i:
                scale_keys(root, [(1, 0), (appear, 0), (appear + 8, 1), (F + 1, 1)])
            kid, kcore = probe(f"K{k:03d}", 0.85)
            drive(kid, w, rnd.random())
            state(kcore, [(1, "teal", 1.4), (F + 1, "teal", 1.4)])
            f_kid = split0 + int((w.centre.y - ymin) / (ymax - ymin) * 40)
            scale_keys(kid, [(1, 0), (f_kid, 0), (f_kid + 14, 0.85), (F + 1, 0.85)])
            sparks(f"T{k:03d}", w.path(0.5), f_kid, n=6, colour="teal", speed=0.4, seed=k + 999)

    # Sweep curtain for the selection beat
    W, H = COLS * PX + 2, ROWS * PY + 2
    sweep = prim("cube", "Sweep", mat("SweepM", "red", emit=5, alpha=0.4), size=1)
    sweep.location = (0, -H / 2, 0.3)
    smooth(sweep, "location", 1, [(1, -H / 2 - 1), (sweep0 - 4, -H / 2 - 1), (sweep1 + 4, H / 2 + 1), (F + 1, H / 2 + 1)])
    for ax, v in enumerate((W, 0.03, 0.5)):
        bulk(sweep, "scale", ax, [1, sweep0 - 5, sweep0 - 4, sweep1 + 4, sweep1 + 5, F + 1], [0, 0, v, v, 0, 0], interp="CONSTANT")

    # Line 1: SKILL? / LUCK?
    p = hero.path(u_ping(b[1]))
    caption("Skill", "SKILL?", (p.x - 0.55, hy, p.z + 0.5), b[1] + 20, e[1] + 10, size=0.13, colour="teal", frame=False, align="CENTER")
    caption("Luck", "LUCK?", (p.x + 0.65, hy, p.z + 0.5), b[1] + 38, e[1] + 10, size=0.13, colour="amber", frame=False, align="CENTER")
    # Line 2: what you are looking at
    pp = hero.path(u_ping(b[2] + 30))
    callout("CoProbe", "Your strategy — its rules", (pp.x, hy, pp.z + 0.05), (-0.35, -0.2, 0.45), b[2] + 8, e[2] + 6, size=0.06)
    ci = 22
    callout("CoCandles", "Real price history (training data only)", (hero.x_of(ci), hy, hero.z_of(hero.ohlc[ci][1])), (0.3, 0.1, 0.5), b[2] + 30, e[2] + 6, size=0.06, colour="white")
    up_m, dn_m = mat("ChevUp", "teal", emit=7), mat("ChevDn", "red", emit=7)
    for n, (f, upward) in enumerate(((b[2] + 20, True), (b[2] + 60, False), (b[3] - 10, True))):
        q = hero.path(u_ping(f))
        ch = prim("cone", f"Chev{n}", up_m if upward else dn_m, vertices=3, radius1=0.05, radius2=0, depth=0.07)
        ch.location = (q.x, q.y, q.z + 0.28); ch.rotation_euler = (0 if upward else math.pi, 0, 0)
        scale_keys(ch, [(1, 0), (f, 0), (f + 4, 1.3), (f + 8, 1), (b[4], 1), (b[4] + 10, 0), (F + 1, 0)])
    q = hero.path(u_ping(b[2] + 60))
    callout("CoTrade", "Each arrow: a trade it takes", (q.x, hy, q.z + 0.3), (0.35, -0.15, 0.35), b[2] + 64, e[2] + 6, size=0.055, colour="white")

    # Line 4: what makes worlds different
    for n, (c, r, text) in enumerate(WORLD_TAGS):
        w = worlds[r * COLS + c]
        callout(f"CoW{n}", text, (w.centre.x, w.centre.y, 0.6), (0, 0, 2.6), b[4] + 30 + n * 14, e[4] + 4, size=0.5, colour="white")
    hud("Worlds", "144 worlds", (0.5, 0.82), b[4] + 20, e[5] + 10, size=0.1, colour="white", frame=False)
    # Line 5: simultaneous runs -> trades counter
    n_steps = 18
    span = max(1, e[5] - b[5])
    counter("Trades", [f"Trades simulated: {v:,}" for v in range(0, 21601, 1200)], None,
            [b[5] + int(span * k / n_steps) for k in range(n_steps + 1)], size=0.075, colour="cyan", hud_xy=(0.5, 0.68), until=e[5] + 10)

    # Line 7: mutation panel (settings = layer weights)
    panel = hud_group("Genome", (0.3, 0.2))
    title = S._rich_text("GenomeT", "A survivor's *settings*, mutated", 0.055, "white", "cyan", align="LEFT"); title.parent = panel
    title.location = (0, 0.12, 0)
    names = ["Trend", "Momentum", "Mean reversion", "Volatility", "Session", "Higher timeframe"]
    rr = random.Random(5)
    bar_m = mat("GenBar", "teal", emit=4)
    for i, nm in enumerate(names):
        y = -i * 0.07
        lab = S._rich_text(f"Gn{i}", nm, 0.042, "white", "cyan", align="LEFT"); lab.parent = panel; lab.location = (0, y, 0)
        bar = prim("cube", f"GnBar{i}", bar_m, size=1); bar.parent = panel
        v0, v1, v2 = rr.uniform(0.08, 0.34), rr.uniform(0.08, 0.34), rr.uniform(0.08, 0.34)
        bar.scale = (v0, 0.035, 0.002)
        smooth(bar, "scale", 0, [(1, v0), (b[7] + 20, v0), (b[7] + 32, v1), (b[7] + 52, v1), (b[7] + 64, v2), (F + 1, v2)])
        smooth(bar, "location", 0, [(f, 0.36 + v / 2) for f, v in ((1, v0), (b[7] + 20, v0), (b[7] + 32, v1), (b[7] + 52, v1), (b[7] + 64, v2), (F + 1, v2))])
        bar.location.y = y
    for ax in range(3):
        smooth(panel, "scale", ax, [(1, 0), (b[7] + 4, 0), (b[7] + 10, 1), (e[7] + 8, 1), (e[7] + 14, 0), (F + 1, 0)])
    back = prim("plane", "GenomeBack", mat("GenomeBackM", "05070C", alpha=0.6), size=1)
    back.parent = panel; back.scale = (0.95, 0.56, 1); back.location = (0.42, -0.13, -0.01)
    to_hud(panel)

    # Line 8: generations + versions counted
    steps = 12
    span = max(12, e[8] - b[8])
    gen_frames = [b[8] + int(span * k / steps) for k in range(steps)]
    counter("Gen", [f"Generation {g}" for g in range(1, 13)], None, gen_frames, size=0.1, colour="white", hud_xy=(0.5, 0.82), until=F - 100)
    counter("Tried", [f"Versions tried: {144 * g:,}" for g in range(1, 13)], None, gen_frames, size=0.075, colour="cyan", hud_xy=(0.5, 0.68), until=F - 100)

    # Line 9: the champion lifts toward the Vault
    lift = b[9] + 10
    for ax in range(3):
        smooth(hero_root, "delta_location", ax, [(1, 0), (lift, 0), (lift + 40, (0, 0, 0.55)[ax]), (F + 1, (0, 0, 0.55)[ax])])
    beam = prim("cylinder", "ChampBeam", mat("BeamM", "teal", emit=3, alpha=0.12), vertices=32, radius=0.18, depth=6)
    beam.location = (hx, hy, 3.0)
    for ax in range(3):
        bulk(beam, "scale", ax, [1, lift - 1, lift, lift + 20, F + 1], [0, 0, (0.2, 0.2, 1)[ax], (1, 1, 1)[ax], (1, 1, 1)[ax]], interp="LINEAR")
    caption("ToVault", "→ THE VAULT EXAM", (hx + 0.9, hy, 1.4), lift + 30, F + 1, size=0.16, colour="teal", align="CENTER")
    spot("HeroSpot", (hx - 1.0, hy - 2.0, 4.0), hero_root, energy=900, size_deg=22)

    # Narration on screen + cards
    title_card(data)
    subtitles("arena", L)
    end_card(data)

    # Camera, keyed to the beats
    def near(f, dx=-0.85, dy=-1.05, dz=0.3):
        q = hero.path(u_ping(f))
        return (q.x + dx, q.y + dy, q.z + dz), (q.x + 0.15, q.y, q.z + 0.08)
    keys = []
    for f in (1, b[1], b[2], (b[2] + e[2]) // 2, b[3]):
        c, t = near(f); keys.append((f, c, t, S.LENS, 1.6))
    keys += [
        (b[4] + 30, (-4.5, -19, 9), (-1, -4, 0), S.LENS, 16),
        (b[5] + 20, (4, -18, 7.5), (0, -3, 0), S.LENS, 16),
        (b[6] + 20, (-2, -20, 9.5), (0, -2, 0), S.LENS, 16),
        (b[7] + 10, (hx - 4, hy - 7, 3.6), (hx, hy + 1, 0.3), S.LENS, 8),
        (b[8] + 10, (9, -17, 8.5), (1, -1, 0), S.LENS, 16),
    ]
    c, t = near(b[9] + 20, -1.6, -2.4, 1.0); keys.append((b[9] + 20, c, (hx, hy, 0.9), S.LENS, 3))
    keys.append((F, (hx - 2.0, hy - 3.2, 1.3), (hx + 0.2, hy, 1.0), S.LENS, 3))
    S.camera_path(cam, tgt, keys)
    print(f"arena explainer: {F} frames ({F / 30:.1f}s), {len(L)} lines")


if globals().get("__name__") == "__main__" or "FILMS_DIR" in globals():
    build()
    save(os.path.abspath(globals().get("FILMS_OUT") or os.path.join(HERE, "..", "build", "arena.blend")))
