# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Films v2 kit ("Night Lab", docs/FILMS.md): dark glossy lab floor with a fading
# grid, cinematic light + haze + bloom, candlestick market worlds, the Probe
# (a strategy), holographic captions that face the camera, counters, sparks.
# Every film script imports this. Loops: frame 601 == frame 1.

import math, random
import bpy, bmesh
from mathutils import Vector, Matrix

FRAMES, FPS = 600, 30
FONT_PATH = r"C:\Windows\Fonts\seguisb.ttf"
HEX = {
    "floor": "0B0F17", "metal": "1A2130", "metal2": "2A3346", "cyan": "38E1FF", "teal": "2FD3A4",
    "amber": "FFB020", "red": "FF4D4D", "gold": "E8B84A", "white": "EAF2FF", "up": "2FD3A4", "down": "FF5A5A",
    "dim": "3A4458", "ink": "8FA3C7",
}
CAM = {"obj": None}


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def col(name, a=1.0):
    h = HEX.get(name, name)
    return (*(lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)), a)


# ─── Scene ────────────────────────────────────────────────────────────────────

def reset(film_id, haze=0.012):
    s = bpy.context.scene
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.curves,
                 bpy.data.actions, bpy.data.node_groups, bpy.data.images, bpy.data.worlds, bpy.data.fonts):
        for d in list(coll):
            try:
                coll.remove(d)
            except Exception:
                pass
    for c in list(s.collection.children):
        bpy.data.collections.remove(c)
    s.name = film_id
    r = s.render
    r.resolution_x, r.resolution_y, r.resolution_percentage, r.fps = 1920, 1080, 100, FPS
    s.frame_start, s.frame_end = 1, FRAMES
    try:
        r.engine = "BLENDER_EEVEE"
    except TypeError as e:
        print(e)
    ee = s.eevee
    ee.taa_render_samples = 16
    ee.use_shadows = True
    ee.use_raytracing = True
    ee.ray_tracing_method = "SCREEN"
    ee.use_fast_gi = True
    ee.volumetric_tile_size = "8"
    ee.volumetric_end = 80
    s.view_settings.view_transform = "AgX"
    looks = [i.identifier for i in s.view_settings.bl_rna.properties["look"].enum_items_static]
    s.view_settings.look = next((l for l in ("AgX - Punchy", "AgX - Medium High Contrast") if l in looks), "None")
    s.view_settings.exposure = 0.0
    w = bpy.data.worlds.new("NightLab"); s.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = next(n for n in nt.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = col("05070C"); bg.inputs[1].default_value = 1.0
    if haze:
        vol = nt.nodes.new("ShaderNodeVolumePrincipled")
        vol.inputs["Density"].default_value = haze
        vol.inputs["Color"].default_value = col("9FB6D9")
        out = next(n for n in nt.nodes if n.type == "OUTPUT_WORLD")
        nt.links.new(vol.outputs[0], out.inputs["Volume"])
    compositor(s)
    return s


def compositor(s, bloom=0.6, vignette=0.35):
    """Render -> bloom (Glare) -> vignette -> output. Skipped quietly if the API differs."""
    try:
        ng = bpy.data.node_groups.new("Grade", "CompositorNodeTree")
        ng.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
        rl = ng.nodes.new("CompositorNodeRLayers")
        gl = ng.nodes.new("CompositorNodeGlare")
        for name, v in (("Type", "Bloom"), ("Quality", "High"), ("Threshold", 0.8), ("Strength", bloom), ("Size", 7)):
            if name in gl.inputs:
                try:
                    gl.inputs[name].default_value = v
                except Exception:
                    pass
        em = ng.nodes.new("CompositorNodeEllipseMask")
        em.inputs["Size"].default_value = (1.25, 1.25)
        bl = ng.nodes.new("CompositorNodeBlur")
        for name, v in (("Size", (300, 300)),):
            try:
                bl.inputs[name].default_value = v
            except Exception:
                pass
        mix = ng.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
        mix.inputs[0].default_value = vignette
        inv = ng.nodes.new("ShaderNodeMix"); inv.data_type = "RGBA"
        out = ng.nodes.new("NodeGroupOutput")
        ng.links.new(rl.outputs["Image"], gl.inputs["Image"])
        ng.links.new(em.outputs["Mask"], bl.inputs["Image"])
        # vignette: mix(image, image * mask)
        mul = ng.nodes.new("ShaderNodeMix"); mul.data_type = "RGBA"; mul.blend_type = "MULTIPLY"; mul.inputs[0].default_value = 1.0
        ng.links.new(gl.outputs["Image"], mul.inputs[6]); ng.links.new(bl.outputs["Image"], mul.inputs[7])
        ng.links.new(gl.outputs["Image"], inv.inputs[6]); ng.links.new(mul.outputs[2], inv.inputs[7])
        inv.inputs[0].default_value = vignette
        ng.links.new(inv.outputs[2], out.inputs[0])
        s.compositing_node_group = ng
        s.render.use_compositing = True
    except Exception as e:
        print("[studio2] compositor skipped:", e)


# ─── Materials ────────────────────────────────────────────────────────────────

def _p(m):
    m.use_nodes = True
    return next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def mat(name, colour, rough=0.4, metal=0.0, emit=0.0, alpha=1.0, coat=0.0, emit_colour=None):
    m = bpy.data.materials.new(name)
    p = _p(m)
    c = col(colour) if isinstance(colour, str) else colour
    p.inputs["Base Color"].default_value = c
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if coat:
        p.inputs["Coat Weight"].default_value = coat
    if emit:
        ec = emit_colour or colour
        p.inputs["Emission Color"].default_value = col(ec) if isinstance(ec, str) else ec
        p.inputs["Emission Strength"].default_value = emit
    if alpha < 1:
        p.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
        m.use_transparency_overlap = True
    return m


def mat_state(name, rough=0.3, emit_scale=6.0):
    """Colour from obj.color (rgb), emission = rgb * alpha * emit_scale: animate obj.color per object."""
    m = bpy.data.materials.new(name)
    p = _p(m)
    nt = m.node_tree
    info = nt.nodes.new("ShaderNodeObjectInfo")
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = emit_scale
    nt.links.new(info.outputs["Color"], p.inputs["Base Color"])
    nt.links.new(info.outputs["Color"], p.inputs["Emission Color"])
    nt.links.new(info.outputs["Alpha"], mul.inputs[0])
    nt.links.new(mul.outputs[0], p.inputs["Emission Strength"])
    p.inputs["Roughness"].default_value = rough
    return m


def mat_floor():
    m = bpy.data.materials.new("LabFloor")
    p = _p(m)
    nt = m.node_tree
    p.inputs["Base Color"].default_value = col("floor")
    p.inputs["Roughness"].default_value = 0.22
    p.inputs["Metallic"].default_value = 0.2
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(tc.outputs["Object"], sep.inputs[0])
    lines = []
    for axis in ("X", "Y"):
        fr = nt.nodes.new("ShaderNodeMath"); fr.operation = "PINGPONG"; fr.inputs[1].default_value = 0.5
        nt.links.new(sep.outputs[axis], fr.inputs[0])
        lt = nt.nodes.new("ShaderNodeMath"); lt.operation = "LESS_THAN"; lt.inputs[1].default_value = 0.012
        nt.links.new(fr.outputs[0], lt.inputs[0]); lines.append(lt)
    mx = nt.nodes.new("ShaderNodeMath"); mx.operation = "MAXIMUM"
    nt.links.new(lines[0].outputs[0], mx.inputs[0]); nt.links.new(lines[1].outputs[0], mx.inputs[1])
    # fade the grid with distance from the origin
    ln = nt.nodes.new("ShaderNodeVectorMath"); ln.operation = "LENGTH"; nt.links.new(tc.outputs["Object"], ln.inputs[0])
    fade = nt.nodes.new("ShaderNodeMapRange"); fade.inputs[1].default_value = 6; fade.inputs[2].default_value = 45
    fade.inputs[3].default_value = 1.0; fade.inputs[4].default_value = 0.0
    nt.links.new(ln.outputs["Value"], fade.inputs[0])
    g = nt.nodes.new("ShaderNodeMath"); g.operation = "MULTIPLY"
    nt.links.new(mx.outputs[0], g.inputs[0]); nt.links.new(fade.outputs[0], g.inputs[1])
    s = nt.nodes.new("ShaderNodeMath"); s.operation = "MULTIPLY"; s.inputs[1].default_value = 0.35
    nt.links.new(g.outputs[0], s.inputs[0])
    p.inputs["Emission Color"].default_value = col("cyan")
    nt.links.new(s.outputs[0], p.inputs["Emission Strength"])
    return m


def assign(ob, m):
    ob.data.materials.clear(); ob.data.materials.append(m)


# ─── Stage ────────────────────────────────────────────────────────────────────

def stage(floor=300, key=1800, rim=2600):
    bpy.ops.mesh.primitive_plane_add(size=floor)
    f = bpy.context.object; f.name = "Floor"; assign(f, mat_floor())
    def area(name, energy, size, colour, loc, rot):
        d = bpy.data.lights.new(name, "AREA"); d.energy = energy; d.size = size; d.color = colour
        o = bpy.data.objects.new(name, d); bpy.context.collection.objects.link(o)
        o.location = loc; o.rotation_euler = tuple(math.radians(a) for a in rot)
        return o
    area("Key", key, 18, (0.75, 0.86, 1.0), (-12, -10, 18), (35, 0, -50))
    area("Rim", rim, 10, (1.0, 0.78, 0.55), (10, 16, 7), (-70, 0, 145))
    area("Fill", 300, 30, (0.6, 0.75, 1.0), (0, -25, 6), (80, 0, 0))
    return f


def spot(name, loc, target, energy=1500, colour=(0.8, 0.95, 1.0), size_deg=28):
    d = bpy.data.lights.new(name, "SPOT"); d.energy = energy; d.color = colour; d.spot_size = math.radians(size_deg); d.spot_blend = 0.5
    o = bpy.data.objects.new(name, d); bpy.context.collection.objects.link(o); o.location = loc
    c = o.constraints.new("TRACK_TO"); c.target = target; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"
    return o


# ─── Market worlds (3D candlesticks) ──────────────────────────────────────────

def candles(n, seed, vol=1.0):
    """Random-walk OHLC (abstract, not real data)."""
    r = random.Random(seed)
    px, out, drift = 0.0, [], r.uniform(-0.02, 0.02)
    for _ in range(n):
        o = px
        c = o + r.gauss(drift, 0.18 * vol)
        h = max(o, c) + abs(r.gauss(0, 0.08 * vol))
        l = min(o, c) - abs(r.gauss(0, 0.08 * vol))
        out.append((o, h, l, c)); px = c
        if r.random() < 0.05:
            drift = r.uniform(-0.04, 0.04)
    lo = min(x[2] for x in out)
    return [tuple(v - lo for v in x) for x in out]


class World:
    """A market world: a platform with candles. Probe path follows candle closes."""
    def __init__(self, name, centre, seed, n=40, length=4.2, depth=1.2, scale=0.32, base=0.22, mats=None):
        self.name, self.centre, self.n, self.length, self.scale, self.base = name, Vector((*centre, 0)), n, length, scale, base
        self.ohlc = candles(n, seed)
        self.mats = mats

    def x_of(self, i):
        return self.centre.x - self.length / 2 + (i + 0.5) * self.length / self.n

    def z_of(self, v):
        return self.base + 0.06 + v * self.scale

    def path(self, u):
        """Point riding the closes at u in [0,1] (smooth between candles)."""
        f = u * (self.n - 1); i = min(self.n - 2, int(f)); t = f - i
        t = t * t * (3 - 2 * t)
        z = (1 - t) * self.ohlc[i][3] + t * self.ohlc[i + 1][3]
        h = max(self.ohlc[i][1], self.ohlc[i + 1][1])
        return Vector((self.x_of(i) + t * self.length / self.n, self.centre.y, max(self.z_of(z), self.z_of(h) * 0.0) + 0.11))


def world_meshes(worlds, platform=True, depth=1.2):
    """All candles of many worlds in 3 meshes (up bodies, down bodies, wicks) + one platform mesh."""
    bms = {k: bmesh.new() for k in ("up", "down", "wick", "plat", "edge")}
    for w in worlds:
        cx, cy = w.centre.x, w.centre.y
        bw = w.length / w.n * 0.62
        for i, (o, h, l, c) in enumerate(w.ohlc):
            x = w.x_of(i)
            z0, z1 = w.z_of(min(o, c)), w.z_of(max(o, c))
            z1 = max(z1, z0 + 0.012)
            key = "up" if c >= o else "down"
            bmesh.ops.create_cube(bms[key], size=1, matrix=Matrix.Translation((x, cy, (z0 + z1) / 2)) @ Matrix.Diagonal((bw, bw, z1 - z0, 1)))
            zl, zh = w.z_of(l), w.z_of(h)
            bmesh.ops.create_cube(bms["wick"], size=1, matrix=Matrix.Translation((x, cy, (zl + zh) / 2)) @ Matrix.Diagonal((bw * 0.16, bw * 0.16, zh - zl, 1)))
        if platform:
            bmesh.ops.create_cube(bms["plat"], size=1, matrix=Matrix.Translation((cx, cy, w.base / 2)) @ Matrix.Diagonal((w.length + 0.4, depth, w.base, 1)))
            bmesh.ops.create_cube(bms["edge"], size=1, matrix=Matrix.Translation((cx, cy - depth / 2 - 0.004, w.base - 0.03)) @ Matrix.Diagonal((w.length + 0.4, 0.012, 0.018, 1)))
    obs = {}
    for k, bm in bms.items():
        if not len(bm.verts):
            bm.free(); continue
        me = bpy.data.meshes.new(f"Worlds_{k}"); bm.to_mesh(me); bm.free()
        ob = bpy.data.objects.new(f"Worlds_{k}", me); bpy.context.collection.objects.link(ob)
        obs[k] = ob
    m_up = mat("CandleUp", "up", rough=0.15, emit=0.9, coat=0.6)
    m_dn = mat("CandleDown", "down", rough=0.15, emit=0.7, coat=0.6)
    m_wick = mat("Wick", "white", rough=0.4, emit=0.4)
    m_plat = mat("Platform", "metal", rough=0.35, metal=0.7, coat=0.4)
    m_edge = mat("PlatEdge", "cyan", emit=1.8)
    for k, m in (("up", m_up), ("down", m_dn), ("wick", m_wick), ("plat", m_plat), ("edge", m_edge)):
        if k in obs:
            assign(obs[k], m)
            if k in ("up", "down", "plat"):
                bv = obs[k].modifiers.new("Bevel", "BEVEL"); bv.width = 0.006 if k != "plat" else 0.03; bv.segments = 2
    return obs


# ─── The Probe (a strategy) ───────────────────────────────────────────────────

_PROBE = {}


def probe_meshes():
    if _PROBE:
        return _PROBE
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
    bmesh.ops.scale(bm, vec=(0.17, 0.09, 0.065), verts=bm.verts)
    for sx in (-1, 1):
        bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((-0.06, sx * 0.085, -0.01)) @ Matrix.Diagonal((0.12, 0.05, 0.012, 1)))
    body = bpy.data.meshes.new("ProbeBody"); bm.to_mesh(body); bm.free()
    for p in body.polygons:
        p.use_smooth = True
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=False, segments=48, radius=0.1)
    ring = bpy.data.meshes.new("ProbeRingSrc"); bm.to_mesh(ring); bm.free()
    bpy.ops.mesh.primitive_torus_add(major_radius=0.098, minor_radius=0.012, major_segments=48, minor_segments=10)
    t = bpy.context.object; core = t.data; core.name = "ProbeCore"; bpy.data.objects.remove(t)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.022, segments=16, ring_count=8)
    t = bpy.context.object; lamp = t.data; lamp.name = "ProbeLamp"; bpy.data.objects.remove(t)
    body.materials.append(mat("ProbeHull", "6E7C99", rough=0.22, metal=0.9, coat=1.0))
    core.materials.append(mat_state("ProbeState", emit_scale=8.0))
    lamp.materials.append(mat("ProbeLampM", "white", emit=12.0))
    _PROBE.update(body=body, core=core, lamp=lamp)
    return _PROBE


def probe(name, scale=1.0):
    """Root empty (animate this) with hull, glowing ring core (obj.color = state) and headlamp."""
    m = probe_meshes()
    root = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(root)
    hull = bpy.data.objects.new(f"{name}Hull", m["body"]); bpy.context.collection.objects.link(hull); hull.parent = root
    core = bpy.data.objects.new(f"{name}Core", m["core"]); bpy.context.collection.objects.link(core); core.parent = root
    core.rotation_euler = (0, math.radians(90), 0); core.location = (-0.02, 0, 0)
    lamp = bpy.data.objects.new(f"{name}Lamp", m["lamp"]); bpy.context.collection.objects.link(lamp); lamp.parent = root
    lamp.location = (0.165, 0, 0.005)
    root.scale = (scale, scale, scale)
    return root, core


# ─── Captions ─────────────────────────────────────────────────────────────────

_FONT = {}


def font():
    if "f" not in _FONT:
        try:
            _FONT["f"] = bpy.data.fonts.load(FONT_PATH)
        except Exception:
            _FONT["f"] = None
    return _FONT["f"]


def hud(name, text, xy, f_in, f_out, size=0.075, colour="cyan", frame=True, align="LEFT", emit=5.0):
    """Caption fixed to the camera (always framed). xy in [-1,1] screen units (x right, y up)."""
    cam = CAM["obj"]
    d = 2.0
    half_w = d * 18.0 / max(cam.data.lens, 1)          # sensor 36 mm
    ob = caption(name, text, (0, 0, 0), f_in, f_out, size=size, colour=colour, frame=frame, face_camera=False, align=align, emit=emit)
    ob.parent = cam
    ob.location = (xy[0] * half_w, xy[1] * half_w * 9 / 16, -d)
    return ob


def caption(name, text, loc, f_in, f_out, size=0.22, colour="cyan", frame=True, face_camera=True, align="LEFT", emit=5.0):
    """Holographic caption with a bracket frame; pops in at f_in, out at f_out; faces the camera."""
    root = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(root); root.location = loc
    cu = bpy.data.curves.new(f"{name}Txt", "FONT"); cu.body = text; cu.size = size
    cu.align_x = align; cu.align_y = "CENTER"
    if font():
        cu.font = font()
    cu.extrude = 0.004
    tx = bpy.data.objects.new(f"{name}Txt", cu); bpy.context.collection.objects.link(tx); tx.parent = root
    m = mat(f"{name}M", colour, emit=emit)
    cu.materials.append(m)
    if frame:
        # measure text to size the bracket
        bpy.context.view_layer.update()
        dims = tx.dimensions
        w, h = max(dims.x, size * 2) + size * 0.8, size * 1.5
        x0 = {"LEFT": -size * 0.4, "CENTER": -w / 2, "RIGHT": -w + size * 0.4}[align]
        bm = bmesh.new()
        t = size * 0.035; arm = size * 0.55
        for (cx, cy, sx, sy) in ((x0, -h / 2, 1, 1), (x0, h / 2, 1, -1), (x0 + w, -h / 2, -1, 1), (x0 + w, h / 2, -1, -1)):
            bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((cx + sx * arm / 2, cy, 0)) @ Matrix.Diagonal((arm, t, t, 1)))
            bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((cx, cy + sy * arm / 2, 0)) @ Matrix.Diagonal((t, arm, t, 1)))
        bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Translation((x0 + w / 2, 0, -0.01)) @ Matrix.Diagonal((w, h, 0.001, 1)))
        me = bpy.data.meshes.new(f"{name}Frame"); bm.to_mesh(me); bm.free()
        fr = bpy.data.objects.new(f"{name}Frame", me); bpy.context.collection.objects.link(fr); fr.parent = root
        me.materials.append(m)
        me.materials.append(mat(f"{name}Back", "05070C", alpha=0.55))
        # last cube = backing panel -> second material
        for p in me.polygons[-6:]:
            p.material_index = 1
    if face_camera and CAM["obj"]:
        c = root.constraints.new("TRACK_TO"); c.target = CAM["obj"]; c.track_axis = "TRACK_Z"; c.up_axis = "UP_Y"
    pop(root, f_in, f_out)
    return root


def pop(ob, f_in, f_out, s=1.0):
    """Scale 0 -> overshoot -> 1 at f_in; back to 0 at f_out (frames clamped to the loop)."""
    pts = [(1, 0.0)]
    if f_in > 1:
        pts += [(f_in, 0.0)]
    pts += [(f_in + 5, s * 1.12), (f_in + 9, s)]
    if f_out < FRAMES:
        pts += [(f_out, s), (f_out + 6, 0.0), (FRAMES + 1, 0.0)]
    else:
        pts += [(FRAMES + 1, s)]
    pts = sorted({f: v for f, v in pts}.items())
    for ax in range(3):
        smooth(ob, "scale", ax, pts)


def counter(name, values, loc, frames, size=0.3, colour="cyan", prefix="", hud_xy=None):
    """A number that steps through values at given frames (one text object per value)."""
    objs = []
    for k, (v, f0) in enumerate(zip(values, frames)):
        f1 = frames[k + 1] if k + 1 < len(frames) else None
        ob = (hud(f"{name}{k}", f"{prefix}{v}", hud_xy, f0, f1 or 9999, size=size, colour=colour, frame=False) if hud_xy
              else caption(f"{name}{k}", f"{prefix}{v}", loc, f0, f1 or 9999, size=size, colour=colour, frame=False))
        # hard cut instead of pop for steps after the first
        for fc in fcurves(ob.animation_data.action):
            fc.keyframe_points.clear()
        for ax in range(3):
            pts = [(1, 0.0), (f0, 0.0), (f0 + 1, 1.0)]
            if f1:
                pts += [(f1, 1.0), (f1 + 1, 0.0)]
            pts += [(FRAMES + 1, 0.0 if f1 else 1.0)]
            bulk(ob, "scale", ax, [p[0] for p in pts], [p[1] for p in pts], interp="CONSTANT")
        objs.append(ob)
    return objs


# ─── Effects ──────────────────────────────────────────────────────────────────

_SPARK = {}


def sparks(name, origin, f0, n=10, colour="red", speed=0.6, seed=0):
    """A small burst of glowing shards flying out and fading at frame f0."""
    if "m" not in _SPARK:
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.014)
        t = bpy.context.object; _SPARK["m"] = t.data; bpy.data.objects.remove(t)
        _SPARK["mat"] = mat_state("SparkM", emit_scale=12.0)
        _SPARK["m"].materials.append(_SPARK["mat"])
    r = random.Random(seed)
    for k in range(n):
        ob = bpy.data.objects.new(f"{name}{k}", _SPARK["m"]); bpy.context.collection.objects.link(ob)
        d = Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(0.3, 1.2))).normalized() * speed * r.uniform(0.5, 1.0)
        o = Vector(origin)
        for ax in range(3):
            bulk(ob, "location", ax, [1, f0, f0 + 12, f0 + 24], [o[ax], o[ax], o[ax] + d[ax] * 0.7, o[ax] + d[ax] - (0.25 if ax == 2 else 0)], interp="LINEAR")
            bulk(ob, "scale", ax, [1, f0 - 1, f0, f0 + 24, f0 + 25, FRAMES + 1], [0, 0, 1.4, 0.2, 0, 0], interp="LINEAR")
        c = col(colour)
        for ch in range(4):
            bulk(ob, "color", ch, [1], [c[ch] if ch < 3 else 1.0], interp="CONSTANT")


# ─── Animation helpers ────────────────────────────────────────────────────────

def fcurves(action):
    if hasattr(action, "fcurves") and len(getattr(action, "fcurves", [])):
        return list(action.fcurves)
    out = []
    for layer in getattr(action, "layers", []):
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", []):
                out.extend(bag.fcurves)
    return out


def bulk(idb, path, index, frames, values, interp="LINEAR"):
    if not idb.animation_data:
        idb.animation_data_create()
    ad = idb.animation_data
    if not ad.action:
        ad.action = bpy.data.actions.new(f"{idb.name}Action")
    act = ad.action
    if hasattr(act, "fcurve_ensure_for_datablock"):
        fc = act.fcurve_ensure_for_datablock(idb, path, index=index)
    else:
        fc = act.fcurves.find(path, index=index) or act.fcurves.new(path, index=index)
    fc.keyframe_points.add(len(frames))
    co = []
    for f, v in zip(frames, values):
        co += [f, v]
    fc.keyframe_points.foreach_set("co", co)
    for kp in fc.keyframe_points:
        kp.interpolation = interp
    fc.update()
    return fc


def smooth(idb, path, index, pts):
    pts = sorted({f: v for f, v in pts}.items())
    fc = bulk(idb, path, index, [p[0] for p in pts], [p[1] for p in pts], interp="BEZIER")
    for kp in fc.keyframe_points:
        kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"
    fc.update()
    return fc


def smooth_vec(ob, path, pts):
    for i in range(3):
        smooth(ob, path, i, [(f, v[i]) for f, v in pts])


def state(ob, pts):
    """pts: [(frame, colour, glow)] on obj.color (used by mat_state)."""
    for ch in range(4):
        smooth(ob, "color", ch, [(f, (col(c) if isinstance(c, str) else c)[ch] if ch < 3 else g) for f, c, g in pts])


def ride(ob, world, u_of_frame, step=3, lift=0.0, bank=True):
    """Keyframe a probe riding a world's candle path; heading follows the slope."""
    fr = list(range(1, FRAMES + 2, step))
    pts = [world.path(max(0.0, min(1.0, u_of_frame(f)))) for f in fr]
    for ax in range(3):
        bulk(ob, "location", ax, fr, [p[ax] + (lift if ax == 2 else 0) for p in pts])
    if bank:
        pitch = []
        for k in range(len(pts)):
            a, b = pts[max(0, k - 1)], pts[min(len(pts) - 1, k + 1)]
            dx = (b - a).x or 1e-6
            pitch.append(-math.atan2((b - a).z, abs(dx)) * 0.8)
        bulk(ob, "rotation_euler", 1, fr, pitch)


def prim(kind, name, m=None, **kw):
    getattr(bpy.ops.mesh, f"primitive_{kind}_add")(**kw)
    ob = bpy.context.object; ob.name = name
    if m is not None:
        assign(ob, m)
    return ob


def bevel(ob, width=0.01, segments=3):
    b = ob.modifiers.new("Bevel", "BEVEL"); b.width = width; b.segments = segments
    try:
        ob.data.shade_smooth()
    except Exception:
        pass
    return ob


def camera(lens=35, fstop=2.8):
    cd = bpy.data.cameras.new("Cam"); cd.lens = lens; cd.clip_end = 400; cd.sensor_width = 36
    cam = bpy.data.objects.new("Cam", cd); bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    tgt = bpy.data.objects.new("CamTarget", None); bpy.context.collection.objects.link(tgt)
    tr = cam.constraints.new("TRACK_TO"); tr.target = tgt; tr.track_axis = "TRACK_NEGATIVE_Z"; tr.up_axis = "UP_Y"
    cd.dof.use_dof = True; cd.dof.focus_object = tgt; cd.dof.aperture_fstop = fstop
    CAM["obj"] = cam
    return cam, tgt


def camera_path(cam, tgt, keys):
    """keys: [(frame, cam xyz, target xyz, lens, fstop)] eased."""
    smooth_vec(cam, "location", [(k[0], k[1]) for k in keys])
    smooth_vec(tgt, "location", [(k[0], k[2]) for k in keys])
    smooth(cam.data, "lens", 0, [(k[0], k[3]) for k in keys])
    smooth(cam.data, "dof.aperture_fstop", 0, [(k[0], k[4]) for k in keys])


def save(path):
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    print("saved", path)


# ─── Explainer kit: narration timing, subtitles, title/end cards, callouts ─────

import json as _json
import os as _os
import wave as _wave

ROOT = _os.path.abspath(_os.path.join(_os.path.dirname(__file__) if "__file__" in globals() else ".", ".."))
LENS = 30.0      # constant lens per film so camera-attached text keeps its size
TITLE_S = 3.4    # title card before the first line
GAP_S = 0.45     # pause between lines
END_S = 3.6      # end card after the last line


def set_length(n):
    global FRAMES
    FRAMES = int(n)
    bpy.context.scene.frame_end = FRAMES


def narration(film_id):
    """Lines with start/end frames. Audio durations win over the word-count estimate."""
    data = _json.load(open(_os.path.join(ROOT, "narration.json"), encoding="utf-8"))[film_id]
    t = TITLE_S
    out = []
    for n, raw in enumerate(data["lines"]):
        wav = _os.path.join(ROOT, "vo", film_id, f"{n:02d}.wav")
        if _os.path.exists(wav):
            with _wave.open(wav) as w:
                dur = w.getnframes() / w.getframerate()
        else:
            dur = len(raw.replace("*", "").split()) / 2.6 + 0.2
        out.append({"n": n, "raw": raw, "start": t, "dur": dur, "f0": int(t * FPS) + 1, "f1": int((t + dur) * FPS) + 1})
        t += dur + GAP_S
    total = t + END_S
    return data, out, int(total * FPS)


def _rich_text(name, raw, size, colour, hi_colour, width=None, align="CENTER"):
    """Text curve where *words* are highlighted (per-character material)."""
    plain, flags, on = "", [], False
    for ch in raw:
        if ch == "*":
            on = not on; continue
        plain += ch; flags.append(on)
    cu = bpy.data.curves.new(f"{name}Txt", "FONT"); cu.body = plain; cu.size = size
    cu.align_x = align; cu.align_y = "CENTER"
    if font():
        cu.font = font()
    if width:
        cu.text_boxes[0].width = width
        cu.text_boxes[0].x = -width / 2 if align == "CENTER" else 0
    cu.space_line = 1.05
    cu.materials.append(mat(f"{name}M", colour, emit=4.0))
    cu.materials.append(mat(f"{name}Hi", hi_colour, emit=7.0))
    for i, f in enumerate(flags):
        if f:
            cu.body_format[i].material_index = 1
    ob = bpy.data.objects.new(f"{name}Txt", cu); bpy.context.collection.objects.link(ob)
    return ob


def _cam_half_w(d):
    return d * 18.0 / LENS


def subtitles(film_id, lines, y=-0.74):
    """Narration as camera-attached subtitles with a soft backing bar."""
    cam = CAM["obj"]; d = 2.0; hw = _cam_half_w(d)
    for L in lines:
        root = bpy.data.objects.new(f"Sub{L['n']:02d}", None); bpy.context.collection.objects.link(root)
        root.parent = cam; root.location = (0, y * hw * 9 / 16, -d)
        tx = _rich_text(f"Sub{L['n']:02d}", L["raw"], 0.064, "white", "cyan", width=hw * 1.55)
        tx.parent = root
        bpy.context.view_layer.update()
        back = prim("plane", f"Sub{L['n']:02d}Back", mat(f"Sub{L['n']:02d}BackM", "05070C", alpha=0.6), size=1)
        back.parent = root; back.location = (0, 0, -0.005)
        back.scale = (hw * 1.7, max(0.13, tx.dimensions.y + 0.07), 1)
        f_out = L["f1"] + int(GAP_S * FPS) - 2
        for ax in range(3):
            bulk(root, "scale", ax, [1, L["f0"] - 1, L["f0"], f_out, f_out + 1, FRAMES + 1], [0, 0, 1, 1, 0, 0], interp="CONSTANT")


def title_card(data, f_out=None):
    """Big centred title + subtitle over the opening, with an underline that draws on."""
    cam = CAM["obj"]; d = 2.0; hw = _cam_half_w(d)
    f_out = f_out or int(TITLE_S * FPS)
    root = bpy.data.objects.new("TitleCard", None); bpy.context.collection.objects.link(root)
    root.parent = cam; root.location = (0, 0.12, -d)
    t = _rich_text("Title", data["title"].upper(), 0.2, "white", "cyan"); t.parent = root
    s = _rich_text("TitleSub", data["subtitle"], 0.07, "cyan", "white"); s.parent = root; s.location = (0, -0.2, 0)
    bar = prim("cube", "TitleBar", mat("TitleBarM", "cyan", emit=8), size=1); bar.parent = root
    bar.location = (0, -0.1, 0); bar.scale = (0.001, 0.006, 0.001)
    smooth(bar, "scale", 0, [(1, 0.001), (8, 0.001), (30, hw * 0.9), (FRAMES + 1, hw * 0.9)])
    for ax in range(3):
        smooth(root, "scale", ax, [(1, 0.0), (4, 1.06), (9, 1.0), (f_out - 8, 1.0), (f_out, 0.0), (FRAMES + 1, 0.0)])
    return root


def end_card(data):
    cam = CAM["obj"]; d = 2.0
    f0 = FRAMES - int(END_S * FPS) + 6
    root = bpy.data.objects.new("EndCard", None); bpy.context.collection.objects.link(root)
    root.parent = cam; root.location = (0, 0.05, -d)
    t = _rich_text("End", data["end"], 0.11, "white", "cyan"); t.parent = root
    b = _rich_text("Brand", "TRADE DEPOT · STRATEGY LAB", 0.05, "cyan", "white"); b.parent = root; b.location = (0, -0.16, 0)
    for ax in range(3):
        smooth(root, "scale", ax, [(1, 0.0), (f0, 0.0), (f0 + 6, 1.05), (f0 + 10, 1.0), (FRAMES + 1, 1.0)])
    return root


def callout(name, text, point, offset, f_in, f_out, size=0.09, colour="cyan"):
    """World label with a leader line and a dot on the thing it describes."""
    p = Vector(point); q = p + Vector(offset)
    lab = caption(name, text, q, f_in, f_out, size=size, colour=colour, align="CENTER")
    m = mat(f"{name}LineM", colour, emit=6)
    dot = prim("uv_sphere", f"{name}Dot", m, radius=size * 0.18, segments=12, ring_count=6); dot.location = p
    v = q - p
    line = prim("cylinder", f"{name}Line", m, vertices=8, radius=size * 0.035, depth=1.0)
    line.location = p + v / 2
    line.rotation_mode = "QUATERNION"; line.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(v.normalized())
    line.scale = (1, 1, v.length)
    for ob in (dot, line):
        for ax in range(3):
            base = ob.scale[ax]
            smooth(ob, "scale", ax, [(1, 0.0), (f_in, 0.0), (f_in + 6, base), (f_out, base), (f_out + 6, 0.0), (FRAMES + 1, 0.0)])
    return lab


# ─── HUD overlay scene (v3): all screen text renders in its own flat layer ────
# The 3D camera never blocks or blurs it. render.py renders it with alpha and
# lays it over the film frames; preview.py composites it too. Coordinates:
# x in [-1.2, 1.2], y in [-0.675, 0.675] (16:9), origin = screen centre.

HUD_W = 1.2
_reset_film = reset
_set_length_film = set_length


def reset(film_id, haze=0.012):
    s = _reset_film(film_id, haze)
    old = bpy.data.scenes.get(f"{film_id}_hud")
    if old:
        bpy.data.scenes.remove(old)
    h = bpy.data.scenes.new(f"{film_id}_hud")
    h.render.resolution_x, h.render.resolution_y, h.render.fps = 1920, 1080, FPS
    h.frame_start, h.frame_end = 1, FRAMES
    try:
        h.render.engine = "BLENDER_EEVEE"
    except TypeError:
        pass
    h.render.film_transparent = True
    h.view_settings.view_transform = "Standard"
    h.eevee.taa_render_samples = 8
    cd = bpy.data.cameras.new("HudCam"); cd.type = "ORTHO"; cd.ortho_scale = HUD_W * 2
    hc = bpy.data.objects.new("HudCam", cd); h.collection.objects.link(hc); hc.location = (0, 0, 10)
    h.camera = hc
    CAM["hud"] = h
    return s


def set_length(n):
    _set_length_film(n)
    if CAM.get("hud"):
        CAM["hud"].frame_end = int(n)


def to_hud(ob):
    """Move an object (and its children) out of the film scene into the HUD scene."""
    h = CAM["hud"]
    for o in [ob, *ob.children_recursive]:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        h.collection.objects.link(o)
    for c in ob.constraints:
        ob.constraints.remove(c)
    return ob


def hud_group(name, xy):
    g = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(g)
    g.location = (xy[0] * HUD_W, xy[1] * HUD_W * 9 / 16, 0)
    return g


def hud(name, text, xy, f_in, f_out, size=0.075, colour="cyan", frame=True, align="LEFT", emit=5.0):
    ob = caption(name, text, (0, 0, 0), f_in, f_out, size=size, colour=colour, frame=frame, face_camera=False, align=align, emit=emit)
    ob.location = (xy[0] * HUD_W, xy[1] * HUD_W * 9 / 16, 0)
    return to_hud(ob)


def counter(name, values, loc, frames, size=0.3, colour="cyan", prefix="", hud_xy=None, until=None):
    """Value steps at given frames; the last value stays until `until` (default: end)."""
    objs = []
    for k, (v, f0) in enumerate(zip(values, frames)):
        f1 = frames[k + 1] if k + 1 < len(frames) else until
        ob = (hud(f"{name}{k}", f"{prefix}{v}", hud_xy, f0, 9999, size=size, colour=colour, frame=False) if hud_xy
              else caption(f"{name}{k}", f"{prefix}{v}", loc, f0, 9999, size=size, colour=colour, frame=False))
        for fc in fcurves(ob.animation_data.action):
            fc.keyframe_points.clear()
        for ax in range(3):
            pts = [(1, 0.0), (f0, 0.0), (f0 + 1, 1.0)]
            if f1:
                pts += [(f1, 1.0), (f1 + 1, 0.0)]
            pts += [(FRAMES + 1, 0.0 if f1 else 1.0)]
            pts = sorted({f: v for f, v in pts}.items())
            bulk(ob, "scale", ax, [p[0] for p in pts], [p[1] for p in pts], interp="CONSTANT")
        objs.append(ob)
    return objs


def subtitles(film_id, lines, y=-0.78):
    for L in lines:
        root = hud_group(f"Sub{L['n']:02d}", (0, y))
        tx = _rich_text(f"Sub{L['n']:02d}", L["raw"], 0.072, "white", "cyan", width=HUD_W * 1.6)
        tx.parent = root
        bpy.context.view_layer.update()
        back = prim("plane", f"Sub{L['n']:02d}Back", mat(f"Sub{L['n']:02d}BackM", "05070C", alpha=0.62), size=1)
        back.parent = root; back.location = (0, 0, -0.01)
        back.scale = (HUD_W * 1.75, max(0.14, tx.dimensions.y + 0.08), 1)
        f_out = L["f1"] + int(GAP_S * FPS) - 2
        for ax in range(3):
            bulk(root, "scale", ax, [1, L["f0"] - 1, L["f0"], f_out, f_out + 1, FRAMES + 1], [0, 0, 1, 1, 0, 0], interp="CONSTANT")
        to_hud(root)


def title_card(data, f_out=None):
    f_out = f_out or int(TITLE_S * FPS)
    root = hud_group("TitleCard", (0, 0.1))
    shade = prim("plane", "TitleShade", mat("TitleShadeM", "05070C", alpha=0.55), size=1)
    shade.parent = root; shade.scale = (HUD_W * 2.2, 0.5, 1); shade.location = (0, -0.05, -0.02)
    t = _rich_text("Title", data["title"].upper(), 0.2, "white", "cyan"); t.parent = root
    s = _rich_text("TitleSub", data["subtitle"], 0.07, "cyan", "white"); s.parent = root; s.location = (0, -0.2, 0)
    bar = prim("cube", "TitleBar", mat("TitleBarM", "cyan", emit=8), size=1); bar.parent = root
    bar.location = (0, -0.1, 0); bar.scale = (0.001, 0.006, 0.001)
    smooth(bar, "scale", 0, [(1, 0.001), (8, 0.001), (30, HUD_W * 0.9), (FRAMES + 1, HUD_W * 0.9)])
    for ax in range(3):
        smooth(root, "scale", ax, [(1, 0.0), (4, 1.06), (9, 1.0), (f_out - 8, 1.0), (f_out, 0.0), (FRAMES + 1, 0.0)])
    return to_hud(root)


def end_card(data):
    f0 = FRAMES - int(END_S * FPS) + 6
    root = hud_group("EndCard", (0, 0.05))
    shade = prim("plane", "EndShade", mat("EndShadeM", "05070C", alpha=0.6), size=1)
    shade.parent = root; shade.scale = (HUD_W * 2.2, 0.45, 1); shade.location = (0, -0.05, -0.02)
    t = _rich_text("End", data["end"], 0.11, "white", "cyan"); t.parent = root
    b = _rich_text("Brand", "TRADE DEPOT · STRATEGY LAB", 0.05, "cyan", "white"); b.parent = root; b.location = (0, -0.16, 0)
    for ax in range(3):
        smooth(root, "scale", ax, [(1, 0.0), (f0, 0.0), (f0 + 6, 1.05), (f0 + 10, 1.0), (FRAMES + 1, 1.0)])
    return to_hud(root)
