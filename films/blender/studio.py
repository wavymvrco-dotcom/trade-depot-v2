# Copyright (c) 2026 [OWNER ENTITY]. All rights reserved. Proprietary and confidential.
# Shared studio for the system films (docs/FILMS.md): a clean paper-white floor
# with a faint grid, soft light, brand materials, "market tiles" (slabs carrying
# a price-line ribbon), and an eased camera rig. Every film imports this.
# Loops are seamless: anything periodic uses t = (frame - 1) / FRAMES.

import math
import bpy
import bmesh
from mathutils import Vector

FRAMES = 600
FPS = 30

# Brand colours (sRGB hex) -> linear for shader inputs
HEX = {
    "paper": "F4F1EA", "ink": "1F3A5F", "pos": "2F6B5E", "neg": "8C2F22", "warn": "8A4B00",
    "gold": "C9A227", "grey": "9A968E", "slab": "E9E5DC", "dark": "22262C", "white": "FBFAF7",
}


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def col(name, a=1.0):
    h = HEX.get(name, name)
    return (*(srgb_to_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)), a)


def reset(film_id):
    """Empty scene with the film's render settings."""
    # Wipe data by hand (read_factory_settings would also reset preferences and add-ons)
    s = bpy.context.scene
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras,
                 bpy.data.curves, bpy.data.actions, bpy.data.node_groups, bpy.data.images, bpy.data.worlds, bpy.data.fonts):
        for d in list(coll):
            try: coll.remove(d)
            except Exception: pass
    for c in list(s.collection.children): bpy.data.collections.remove(c)
    s.name = film_id
    s.render.resolution_x, s.render.resolution_y, s.render.resolution_percentage = 1920, 1080, 100
    s.render.fps = FPS
    s.frame_start, s.frame_end = 1, FRAMES
    try:
        s.render.engine = "BLENDER_EEVEE"
    except TypeError as e:
        print("engine:", e)
    ee = s.eevee
    ee.taa_render_samples = 24
    ee.use_shadows = True
    ee.use_raytracing = False
    ee.use_fast_gi = True
    ee.fast_gi_distance = 2.0
    s.view_settings.view_transform = "AgX"
    s.view_settings.look = "AgX - Medium High Contrast" if "AgX - Medium High Contrast" in [i.identifier for i in s.view_settings.bl_rna.properties["look"].enum_items_static] else "None"
    s.render.film_transparent = False
    s.view_settings.exposure = 0.15
    world = bpy.data.worlds.new("Studio")
    s.world = world
    world.use_nodes = True
    bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
    bg.inputs[0].default_value = col("paper")
    bg.inputs[1].default_value = 0.7
    return s


# ─── Materials ────────────────────────────────────────────────────────────────

def _principled(mat):
    mat.use_nodes = True
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def mat_solid(name, colour, rough=0.55, metal=0.0, emit=0.0, alpha=1.0, transmission=0.0):
    m = bpy.data.materials.new(name)
    p = _principled(m)
    p.inputs["Base Color"].default_value = col(colour) if isinstance(colour, str) else colour
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metal
    if emit:
        p.inputs["Emission Color"].default_value = col(colour) if isinstance(colour, str) else colour
        p.inputs["Emission Strength"].default_value = emit
    if transmission:
        p.inputs["Transmission Weight"].default_value = transmission
    if alpha < 1:
        p.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    return m


def mat_object_colour(name, rough=0.4, emit_scale=1.5):
    """Base colour = object colour RGB; emission = colour x alpha x emit_scale. Animate obj.color per object."""
    m = bpy.data.materials.new(name)
    p = _principled(m)
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
    """Paper floor with a faint 1 m grid."""
    m = bpy.data.materials.new("Floor")
    p = _principled(m)
    nt = m.node_tree
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])
    lines = []
    for axis in ("X", "Y"):
        fr = nt.nodes.new("ShaderNodeMath"); fr.operation = "FRACT"
        nt.links.new(sep.outputs[axis], fr.inputs[0])
        d = nt.nodes.new("ShaderNodeMath"); d.operation = "PINGPONG"; d.inputs[1].default_value = 0.5
        nt.links.new(fr.outputs[0], d.inputs[0])
        st = nt.nodes.new("ShaderNodeMath"); st.operation = "LESS_THAN"; st.inputs[1].default_value = 0.008
        nt.links.new(d.outputs[0], st.inputs[0])
        lines.append(st)
    mx = nt.nodes.new("ShaderNodeMath"); mx.operation = "MAXIMUM"
    nt.links.new(lines[0].outputs[0], mx.inputs[0]); nt.links.new(lines[1].outputs[0], mx.inputs[1])
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
    mix.inputs[6].default_value = col("paper")
    mix.inputs[7].default_value = col("D9D4C8")
    nt.links.new(mx.outputs[0], mix.inputs[0])
    nt.links.new(mix.outputs[2], p.inputs["Base Color"])
    p.inputs["Roughness"].default_value = 0.85
    return m


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# ─── Studio ───────────────────────────────────────────────────────────────────

def studio(floor_size=200):
    bpy.ops.mesh.primitive_plane_add(size=floor_size, location=(0, 0, 0))
    floor = bpy.context.object; floor.name = "Floor"
    assign(floor, mat_floor())
    key = bpy.data.lights.new("Key", "AREA"); key.energy = 5000; key.size = 30; key.color = (1.0, 0.97, 0.92)
    k = bpy.data.objects.new("Key", key); bpy.context.collection.objects.link(k)
    k.location = (-18, -14, 26); k.rotation_euler = (math.radians(38), 0, math.radians(-50))
    sun = bpy.data.lights.new("Fill", "SUN"); sun.energy = 1.2; sun.angle = math.radians(12)
    f = bpy.data.objects.new("Fill", sun); bpy.context.collection.objects.link(f)
    f.rotation_euler = (math.radians(50), math.radians(10), math.radians(140))
    return floor


# ─── Market tiles ─────────────────────────────────────────────────────────────

def ribbon_height(u, seed):
    """Abstract price-line height at u in [0, 1] (not real data; never shows returns)."""
    s = seed * 1.618
    return (0.10 * math.sin(6.3 * u + s) + 0.06 * math.sin(14.1 * u + 2.3 * s)
            + 0.035 * math.sin(31.7 * u + 0.7 * s) + 0.02 * math.sin(57.0 * u + 1.9 * s))


def ribbon_point(cx, cy, u, seed, length=0.84, base=0.08, scale=1.0):
    return Vector((cx - length / 2 + u * length, cy, base + 0.16 + ribbon_height(u, seed) * scale))


def tiles_mesh(name, centres, seeds, size=0.92, thick=0.06, ribbon_w=0.035, steps=96, length=0.84, scale=1.0):
    """One mesh holding every slab, and one holding every ribbon (fast to render as two objects)."""
    slab_bm, rib_bm = bmesh.new(), bmesh.new()
    for (cx, cy), seed in zip(centres, seeds):
        bmesh.ops.create_cube(slab_bm, size=1.0, matrix=_mat_trs((cx, cy, thick / 2), (size, size, thick)))
        top, bot = [], []
        for i in range(steps + 1):
            u = i / steps
            p = ribbon_point(cx, cy, u, seed, length, thick, scale)
            top.append(rib_bm.verts.new((p.x, p.y - ribbon_w / 2, p.z)))
            bot.append(rib_bm.verts.new((p.x, p.y + ribbon_w / 2, p.z)))
        for i in range(steps):
            rib_bm.faces.new((top[i], top[i + 1], bot[i + 1], bot[i]))
    slabs = _obj_from_bm(f"{name}Slabs", slab_bm)
    ribs = _obj_from_bm(f"{name}Ribbons", rib_bm)
    sol = ribs.modifiers.new("Thick", "SOLIDIFY"); sol.thickness = 0.012
    return slabs, ribs


def _mat_trs(loc, scl):
    from mathutils import Matrix
    return Matrix.Translation(loc) @ Matrix.Diagonal((*scl, 1.0))


def _obj_from_bm(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def grid_centres(nx, ny, pitch=1.15):
    out = []
    for j in range(ny):
        for i in range(nx):
            out.append(((i - (nx - 1) / 2) * pitch, (j - (ny - 1) / 2) * pitch))
    return out


# ─── Animation helpers ────────────────────────────────────────────────────────

def key(obj, path, frame, value, index=-1):
    if index >= 0:
        getattr(obj, path)[index] = value
    else:
        setattr(obj, path, value)
    obj.keyframe_insert(path, frame=frame, index=index)


def ease_all(obj, interp="BEZIER", easing="EASE_IN_OUT"):
    ad = obj.animation_data
    if not ad or not ad.action:
        return
    for fc in _fcurves(ad.action):
        for kp in fc.keyframe_points:
            kp.interpolation = interp
            kp.easing = easing
            kp.handle_left_type = kp.handle_right_type = "AUTO_CLAMPED"


def linear_all(obj):
    ad = obj.animation_data
    if ad and ad.action:
        for fc in _fcurves(ad.action):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"


def _fcurves(action):
    # Blender 5 layered actions keep curves in channelbags
    if hasattr(action, "fcurves") and len(getattr(action, "fcurves", [])):
        return list(action.fcurves)
    out = []
    for layer in getattr(action, "layers", []):
        for strip in layer.strips:
            for bag in getattr(strip, "channelbags", []):
                out.extend(bag.fcurves)
    return out


def camera(lens=35, dof_target=None, fstop=2.8):
    cd = bpy.data.cameras.new("Cam"); cd.lens = lens; cd.clip_end = 500
    cam = bpy.data.objects.new("Cam", cd); bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    tgt = bpy.data.objects.new("CamTarget", None); bpy.context.collection.objects.link(tgt)
    tr = cam.constraints.new("TRACK_TO"); tr.target = tgt; tr.track_axis = "TRACK_NEGATIVE_Z"; tr.up_axis = "UP_Y"
    if dof_target is not None:
        cd.dof.use_dof = True; cd.dof.focus_object = tgt; cd.dof.aperture_fstop = fstop
    return cam, tgt


def camera_path(cam, tgt, keys):
    """keys: [(frame, (cam xyz), (target xyz), lens or None)]; eased between keys."""
    for f, c, t, lens in keys:
        key(cam, "location", f, Vector(c))
        key(tgt, "location", f, Vector(t))
        if lens:
            cam.data.lens = lens; cam.data.keyframe_insert("lens", frame=f)
    ease_all(cam); ease_all(tgt)
    if cam.data.animation_data:
        for fc in _fcurves(cam.data.animation_data.action):
            for kp in fc.keyframe_points:
                kp.interpolation = "BEZIER"; kp.easing = "EASE_IN_OUT"


def save(path):
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    print("saved", path)
