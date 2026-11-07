# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Film 4 — Shadow Run, explainer (docs/FILMS.md, films/narration.json): history vs the
# live market; candles arrive one by one; each decision is locked above the empty
# slot BEFORE the bar appears; the champion trades beside it; results drop into a
# permanent record; an evidence meter crosses the promotion line.

import os, sys, math, random, importlib
HERE = globals().get("FILMS_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import studio2 as S; importlib.reload(S)
from studio2 import (reset, stage, camera, World, world_meshes, probe, mat, mat_state, prim, state, smooth, bulk, sparks,
                     hud, hud_group, to_hud, counter, callout, caption, subtitles, title_card, end_card, narration, set_length,
                     spot, save, col, bevel)
import bpy, bmesh
from mathutils import Vector, Matrix

N = 34
LEN = 9.0


def scale_keys(ob, pts, base=(1, 1, 1)):
    for ax in range(3):
        smooth(ob, "scale", ax, [(f, v * base[ax]) for f, v in pts])


def build():
    reset("shadow", haze=0.012)
    data, L, total = narration("shadow")
    set_length(total)
    F = S.FRAMES
    b = [l["f0"] for l in L]; e = [l["f1"] for l in L]
    stage()
    cam, tgt = camera(S.LENS, 2.4)
    rnd = random.Random(31)

    # History archive (dim, frozen) on the left
    hist = World("Hist", (-13.0, 0.0), seed=777, n=40, length=6.0, depth=1.3, scale=0.28)
    ho = world_meshes([hist])
    dim = mat("Archive", "8FA3C7", rough=0.5, emit=0.6)
    for k in ("up", "down", "wick"):
        S.assign(ho[k], dim)
    caption("HistLab", "HISTORY  (already happened)", (-13.0, 0, 1.6), b[0] + 10, e[0] + 20, size=0.2, colour="ink", align="CENTER")

    # The live chart: candles appear one by one between b[1] and b[6]
    live = World("Live", (0.0, 0.0), seed=4040, n=N, length=LEN, depth=1.4, scale=0.6)
    base = mat("LivePlat", "metal", rough=0.35, metal=0.7)
    plat = prim("cube", "LivePlatform", base, size=1); plat.scale = (LEN + 0.5, 1.4, 0.22); plat.location = (0, 0, 0.11)
    edge = prim("cube", "LiveEdge", mat("LiveEdgeM", "red", emit=2.0), size=1); edge.scale = (LEN + 0.5, 0.012, 0.02); edge.location = (0, -0.71, 0.2)
    m_up, m_dn, m_wk = mat("UpL", "up", rough=0.15, emit=0.9, coat=0.6), mat("DnL", "down", rough=0.15, emit=0.7, coat=0.6), mat("WkL", "white", emit=0.4)
    t_first, t_last = b[1], b[6] + 40
    step = (t_last - t_first) / N
    appear = [int(t_first + i * step) for i in range(N)]
    bw = LEN / N * 0.62
    for i, (o, h, l, c) in enumerate(live.ohlc):
        x = live.x_of(i)
        z0, z1 = live.z_of(min(o, c)), max(live.z_of(max(o, c)), live.z_of(min(o, c)) + 0.012)
        body = prim("cube", f"C{i}", m_up if c >= o else m_dn, size=1)
        body.location = (x, 0, (z0 + z1) / 2); body.scale = (bw, bw, z1 - z0); bevel(body, 0.006, 2)
        wick = prim("cube", f"Wk{i}", m_wk, size=1)
        wick.location = (x, 0, (live.z_of(l) + live.z_of(h)) / 2); wick.scale = (bw * 0.16, bw * 0.16, live.z_of(h) - live.z_of(l))
        for ob in (body, wick):
            scale_keys(ob, [(1, 0), (appear[i], 0), (appear[i] + 5, 1), (F + 1, 1)], base=tuple(ob.scale))
        # the empty slot glows just before the bar arrives
        slot = prim("cube", f"Slot{i}", mat(f"SlotM{i}", "cyan", emit=1.2, alpha=0.12), size=1)
        top = live.z_of(max(x_ for x_ in live.ohlc[i]))
        slot.location = (x, 0, (0.25 + top) / 2 + 0.05); slot.scale = (bw * 1.3, bw * 1.3, top - 0.2)
        scale_keys(slot, [(1, 0), (appear[i] - 14, 0), (appear[i] - 10, 1), (appear[i], 1), (appear[i] + 2, 0), (F + 1, 0)], base=tuple(slot.scale))
        # decision locked above the slot, before the bar
        dec = rnd.choice(["LONG", "LONG", "SHORT", "FLAT"])
        big = b[2] <= appear[i] <= e[2] + 20
        tz = top + (0.55 if big else 0.4)
        tag = caption(f"Dec{i}", dec, (x, 0, tz), appear[i] - 12, appear[i] + (34 if big else 26),
                      size=0.14 if big else 0.08, colour={"LONG": "teal", "SHORT": "red", "FLAT": "ink"}[dec], align="CENTER")
        lk = prim("torus", f"Lock{i}", mat(f"LockM{i}", "amber", emit=4), major_radius=0.05 if big else 0.03, minor_radius=0.012)
        lk.location = (x, 0, tz + (0.17 if big else 0.1)); lk.rotation_euler = (math.radians(90), 0, 0)
        scale_keys(lk, [(1, 0), (appear[i] - 10, 0), (appear[i] - 6, 1), (appear[i] + (34 if big else 26), 1), (appear[i] + (40 if big else 30), 0), (F + 1, 0)])
        # result drops into the permanent record on the floor
        if i >= 2 and appear[i] >= b[4] - 30:
            blk = prim("cube", f"Rec{i}", mat(f"RecM{i}", "3E5C80", rough=0.3, emit=0.5), size=1)
            bevel(blk, 0.01, 2)
            smooth(blk, "location", 0, [(1, x), (F + 1, x)])
            smooth(blk, "location", 1, [(1, 0), (appear[i] + 6, 0), (appear[i] + 22, -1.6), (F + 1, -1.6)])
            smooth(blk, "location", 2, [(1, 1.0), (appear[i] + 6, 1.0), (appear[i] + 22, 0.12), (F + 1, 0.12)])
            scale_keys(blk, [(1, 0), (appear[i] + 5, 0), (appear[i] + 8, 1), (F + 1, 1)], base=(0.2, 0.2, 0.2))
            if i >= 3 and appear[i - 1] >= b[4] - 30:
                link = prim("cube", f"Link{i}", mat(f"LinkM{i}", "cyan", emit=3), size=1)
                link.location = (x - LEN / N / 2, -1.6, 0.12)
                scale_keys(link, [(1, 0), (appear[i] + 22, 0), (appear[i] + 26, 1), (F + 1, 1)], base=(LEN / N - 0.2, 0.03, 0.03))
    callout("CoRecord", "The record: permanent, in order", (live.x_of(N - 6), -1.6, 0.25), (0.6, -0.6, 0.9), b[4] + 20, e[4] + 40, size=0.14, colour="white")

    # The candidate (cyan) rides the newest close; the champion (gold) beside it on the same prices
    def tip(f):
        k = max(0, min(N - 1, int((f - t_first) / step)))
        frac = max(0.0, min(1.0, (f - appear[k]) / step))
        return live.path(min(1.0, (k + frac * 0.9) / (N - 1)))
    cand, cc = probe("Candidate", 1.2)
    champ, chc = probe("Champion", 1.05)
    fr = list(range(1, F + 2, 2))
    pts = [tip(f) for f in fr]
    for ax in range(3):
        bulk(cand, "location", ax, fr, [p[ax] + (0.06 if ax == 2 else 0) for p in pts])
        bulk(champ, "location", ax, fr, [p[ax] + (0.62 if ax == 1 else 0.06 if ax == 2 else 0) for p in pts])
    state(cc, [(1, "cyan", 0.8), (b[6] + 50, "cyan", 0.8), (b[6] + 56, "teal", 2.0), (F + 1, "teal", 1.6)])
    state(chc, [(1, "gold", 1.0), (F + 1, "gold", 1.0)])
    scale_keys(champ, [(1, 0), (b[3] - 4, 0), (b[3] + 6, 1.05), (F + 1, 1.05)])
    callout("CoCand", "The strategy under test", (0, 0, 0), (0, 0, 0), 99999, 99999)   # placeholder (keeps names stable)
    p = tip(b[1] + 40)
    callout("CoPaper", "Paper trades on live prices — no money", (p.x, 0, p.z + 0.1), (-0.8, -0.6, 0.9), b[1] + 30, e[1] + 30, size=0.12)
    p = tip(b[3] + 30)
    callout("CoChamp", "The current champion — same prices, its own calls", (p.x, 0.62, p.z + 0.1), (-0.6, 0.4, 1.0), b[3] + 20, e[3] + 30, size=0.12, colour="gold")
    callout("CoLock", "Decision locked before the bar exists", (live.x_of(int((b[2] + 30 - t_first) / step)), 0, 1.4), (1.0, -0.4, 0.7), b[2] + 30, e[2] + 20, size=0.12, colour="amber")

    # HUD: LIVE badge and the evidence meter
    hud("Live", "● LIVE  ·  SHADOW RUN  ·  GOLD (XAU/USD)", (-0.92, 0.82), b[1], F - 110, size=0.065, colour="red", frame=True)
    meter = hud_group("Meter", (-0.92, 0.55))
    t = S._rich_text("MeterT", "Evidence vs. the champion", 0.062, "white", "cyan", align="LEFT"); t.parent = meter
    back = prim("cube", "MeterBack", mat("MeterBackM", "1A2130", emit=0.2), size=1); back.parent = meter
    back.location = (0.45, -0.08, -0.005); back.scale = (0.9, 0.05, 0.002)
    fill = prim("cube", "MeterFill", mat_state("MeterFillM", emit_scale=1.6), size=1); fill.parent = meter
    line = prim("cube", "MeterLine", mat("MeterLineM", "white", emit=5), size=1); line.parent = meter
    line.location = (0.72, -0.08, 0.002); line.scale = (0.006, 0.09, 0.002)
    lab = S._rich_text("MeterLine", "promotion line", 0.045, "white", "white", align="CENTER"); lab.parent = meter; lab.location = (0.72, -0.16, 0)
    vals = [(b[5], 0.04), (b[5] + 25, 0.18), (b[5] + 45, 0.14), (b[5] + 70, 0.33), (b[5] + 95, 0.29), (b[6] + 10, 0.5), (b[6] + 30, 0.64), (b[6] + 50, 0.78), (F + 1, 0.8)]
    vals = [(1, 0.02)] + vals
    smooth(fill, "scale", 0, [(f, v * 0.9) for f, v in vals])
    smooth(fill, "location", 0, [(f, v * 0.45) for f, v in vals])
    fill.location.y = -0.08; fill.scale = (0.02, 0.05, 0.003)
    smooth(fill, "scale", 1, [(1, 0.05), (F + 1, 0.05)]); smooth(fill, "scale", 2, [(1, 0.003), (F + 1, 0.003)])
    state(fill, [(1, "cyan", 0.8), (b[6] + 48, "cyan", 0.8), (b[6] + 52, "teal", 1.6), (F + 1, "teal", 1.4)])
    scale_keys(meter, [(1, 0), (b[5] - 4, 0), (b[5] + 4, 1), (F - 110, 1), (F - 104, 0), (F + 1, 0)])
    to_hud(meter)
    hud("Promoted", "PROMOTED TO LIVE", (-0.25, 0.25), b[6] + 56, F - 110, size=0.14, colour="teal", frame=True)

    title_card(data)
    subtitles("shadow", L)
    end_card(data)

    # Camera: archive -> live stage -> track the tip -> record -> meter
    def side(f, back=3.8, up=1.5, ahead=-0.9):
        q = tip(f)
        return (q.x + 0.9, q.y - back, q.z + up), (q.x + ahead, q.y + 0.2, q.z + 0.35)
    keys = [(1, (-14.5, -6.5, 2.6), (-13.0, 0, 0.8), S.LENS, 5), (b[0] + 20, (-12.0, -6.6, 2.6), (-12.0, 0, 0.8), S.LENS, 5),
            (b[1] - 5, (-5.0, -6.0, 2.6), (-2.5, 0, 0.6), S.LENS, 6)]
    for f in (b[1] + 30, b[2], b[2] + (e[2] - b[2]) // 2, b[3] + 10, e[3]):
        c, t = side(f); keys.append((f, c, t, S.LENS, 3))
    c, t = side(b[4] + 20, back=4.8, up=2.4, ahead=0.0); keys.append((b[4] + 20, c, (t[0], -0.9, 0.4), S.LENS, 6))
    c, t = side(e[4], back=5.0, up=2.6, ahead=0.0); keys.append((e[4], c, (t[0], -0.9, 0.4), S.LENS, 6))
    keys += [(b[6] + 20, (1.0, -8.0, 3.2), (1.5, 0, 0.8), S.LENS, 8), (F, (2.0, -7.0, 2.6), (2.8, 0, 0.9), S.LENS, 8)]
    S.camera_path(cam, tgt, keys)
    print(f"shadow explainer: {F} frames ({F / 30:.1f}s)")


if globals().get("__name__") == "__main__" or "FILMS_DIR" in globals():
    build()
    save(os.path.abspath(globals().get("FILMS_OUT") or os.path.join(HERE, "..", "build", "shadow.blend")))
