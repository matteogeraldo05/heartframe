"""Build heartframe.blend from the OpenSCAD part exports.

    ./export_blender.sh          (or by hand:)
    blender -b --factory-startup --python blender_scene.py -- bl heartframe.blend

Reads bl/*.off (each part in assembled position, OpenSCAD's physical coordinates),
bl/info.log (sizes) and bl/screen.png (the welcome screen), and writes a scene in
millimetres: Z up, the frame standing on the floor at Z = 0, front facing -Y (Blender's
Front view, numpad 1), centred left/right on X = 0.
"""
import math
import os
import re
import sys

import bpy
from mathutils import Euler, Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SRC = os.path.abspath(argv[0] if argv else "bl")
OUT = os.path.abspath(argv[1] if len(argv) > 1 else "heartframe.blend")

info = dict(re.findall(r"(\w+)=([\d.]+)", re.search(r"HF_BL (.*)\"", open(os.path.join(SRC, "info.log")).read()).group(1)))
info = {k: float(v) for k, v in info.items()}
W = info["W"]


# ----------------------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = "Heart Frame"
us = scene.unit_settings
us.system = "METRIC"
us.scale_length = 0.001
us.length_unit = "MILLIMETERS"


def collection(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(c)
    return c


col_case = collection("Case (white plastic)")
col_screen = collection("Display")
col_elec = collection("Electronics")
col_studio = collection("Studio (camera, lights, floor)")


# ----------------------------------------------------------------------------- materials
def material(name, color, rough=0.5, metal=0.0, spec=0.5, coat=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if "Specular IOR Level" in b.inputs:
        b.inputs["Specular IOR Level"].default_value = spec
    if coat and "Coat Weight" in b.inputs:
        b.inputs["Coat Weight"].default_value = coat
    m.diffuse_color = (*color, 1.0)  # solid-view colour
    m.roughness = rough
    return m


def srgb(h):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


MAT = {
    "resin": material("White resin (matte)", srgb("#f2f1ee"), rough=0.62, spec=0.35),
    "paper": material("E-paper border", srgb("#d6d4cc"), rough=0.45, spec=0.4, coat=0.6),
    "pcb_dark": material("Display PCB", srgb("#1d2a3a"), rough=0.4),
    "perf": material("Perfboard", srgb("#3f6b3a"), rough=0.45),
    "feather": material("Feather PCB", srgb("#151515"), rough=0.35),
    "plastic_black": material("Black plastic", srgb("#1a1a1a"), rough=0.5),
    "metal": material("Metal", srgb("#c8c8c8"), rough=0.25, metal=1.0),
    "battery": material("Battery wrap", srgb("#2f62c8"), rough=0.3, coat=0.4),
    "floor": material("Floor", srgb("#e9e6e1"), rough=0.8, spec=0.2),
}

# screen: image texture on the active area
img = bpy.data.images.load(os.path.join(SRC, "screen.png"))
img.pack()
img.name = "welcome-screen.png"
m = bpy.data.materials.new("E-paper (welcome screen)")
m.use_nodes = True
nt = m.node_tree
b = nt.nodes["Principled BSDF"]
b.inputs["Roughness"].default_value = 0.45
if "Specular IOR Level" in b.inputs:
    b.inputs["Specular IOR Level"].default_value = 0.4
if "Coat Weight" in b.inputs:
    b.inputs["Coat Weight"].default_value = 0.6
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = img
tex.interpolation = "Closest"  # keep the e-paper pixels crisp
tex.location = (-400, 300)
nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
m.diffuse_color = (*srgb("#d6d4cc"), 1.0)
MAT["screen"] = m


# ----------------------------------------------------------------------------- meshes
def load_off(path):
    with open(path) as f:
        tok = f.read().split()
    assert tok[0] == "OFF", path
    nv, nf = int(tok[1]), int(tok[2])
    i = 4
    verts = []
    for _ in range(nv):
        x, y, z = (float(t) for t in tok[i:i + 3])
        i += 3
        # OpenSCAD physical coords (X mirrored by phys(), Y up, Z = depth from the front face)
        # -> Blender (X right as you face the screen, Y = depth, Z up). Proper rotation, no mirror.
        verts.append((W / 2 - x, z, y))
    faces = []
    for _ in range(nf):
        n = int(tok[i])
        faces.append(tuple(int(t) for t in tok[i + 1:i + 1 + n]))
        i += 1 + n
    return verts, faces


def part(file, name, mat, coll, smooth=True, cad=False):
    verts, faces = load_off(os.path.join(SRC, file + ".off"))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    me.update()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
        if hasattr(me, "use_auto_smooth"):  # Blender < 4.1; newer versions convert it to a modifier
            me.use_auto_smooth = True
            me.auto_smooth_angle = math.radians(30)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    coll.objects.link(ob)
    if smooth and cad:
        # CAD meshes have huge flat faces next to finely divided curves; weighting the
        # normals by face area keeps the flat faces flat (no shading bands round the
        # finger dish or the rounded edges).
        wn = ob.modifiers.new("Weighted Normal", "WEIGHTED_NORMAL")
        wn.mode = "FACE_AREA"
        wn.keep_sharp = True
    # origin at the part's centre, so it can be moved or exploded easily
    centre = sum((Vector(v) for v in verts), Vector()) / len(verts)
    me.transform(Matrix.Translation(-centre))
    ob.location = centre
    return ob


front = part("front", "Front shell", MAT["resin"], col_case, cad=True)
back = part("back", "Back cover", MAT["resin"], col_case, cad=True)
part("button_body", "Push button (body)", MAT["plastic_black"], col_case)
part("button_nut", "Push button (nut)", MAT["metal"], col_case, smooth=False)
part("button_cap", "Push button (cap)", MAT["plastic_black"], col_case)

part("panel", "E-paper glass", MAT["paper"], col_screen, smooth=False)
part("module", "Display PCB", MAT["pcb_dark"], col_screen, smooth=False)

part("perfboard", "Perfboard (5x7 cm)", MAT["perf"], col_elec, smooth=False)
part("feather", "ESP32-S3 Feather", MAT["feather"], col_elec, smooth=False)
part("headers", "Header strips", MAT["plastic_black"], col_elec, smooth=False)
part("usbc", "USB-C port", MAT["metal"], col_elec, smooth=False)
part("battery", "18650 battery", MAT["battery"], col_elec)

# The picture: a thin plane on the glass, the size of the active area, behind the window.
aw, ah = info["aa_w"], info["aa_h"]
cx, cz = info["win_cx"] - W / 2, info["win_cy"]
y = info["front_t"] - 0.02
me = bpy.data.meshes.new("Screen image")
me.from_pydata([(-aw / 2, 0, -ah / 2), (aw / 2, 0, -ah / 2), (aw / 2, 0, ah / 2), (-aw / 2, 0, ah / 2)], [], [(0, 1, 2, 3)])
uv = me.uv_layers.new(name="UVMap")
for loop, co in zip(uv.data, [(0, 0), (1, 0), (1, 1), (0, 1)]):
    loop.uv = co
me.materials.append(MAT["screen"])
scr = bpy.data.objects.new("Screen image (welcome screen)", me)
scr.location = (cx, y, cz)
col_screen.objects.link(scr)
# normal must face -Y (towards the viewer)
if me.polygons[0].normal.y > 0:
    me.flip_normals()

# The separate stand, and the frame sitting in it: everything above is parented to one
# empty that leans the frame back by the stand's tilt and puts the stand on the floor.
col_stand = collection("Stand (separate part)")
stand = None
if os.path.exists(os.path.join(SRC, "stand.off")):
    stand = part("stand", "Stand", MAT["resin"], col_stand, cad=True)
rig = bpy.data.objects.new("Frame on its stand", None)
scene.collection.objects.link(rig)
for c in (col_case, col_screen, col_elec, col_stand):
    for ob in c.objects:
        ob.parent = rig
tilt = math.radians(info.get("stand_tilt", 0)) if stand else 0.0
rig.rotation_euler = (-tilt, 0, 0)               # top leans back, towards +Y
bpy.context.view_layer.update()
low = min((ob.matrix_world @ v.co).z for ob in (col_stand.objects if stand else col_case.objects) for v in ob.data.vertices)
rig.location.z = -low


# ----------------------------------------------------------------------------- studio
bpy.ops.mesh.primitive_plane_add(size=900, location=(0, 60, 0))
floor = bpy.context.active_object
floor.name = "Floor"
floor.data.materials.append(MAT["floor"])
for c in floor.users_collection:
    c.objects.unlink(floor)
col_studio.objects.link(floor)

world = bpy.data.worlds.new("Studio")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (*srgb("#d9dde3"), 1)
bg.inputs["Strength"].default_value = 0.55

target = bpy.data.objects.new("Look-at target", None)
target.location = (0, 20, 52)
col_studio.objects.link(target)


def light(name, loc, strength, angle_deg, color=(1, 1, 1)):
    # Sun lights: their strength doesn't depend on distance, so the millimetre scale
    # of the scene doesn't matter. Only the direction (towards the target) counts.
    ld = bpy.data.lights.new(name, "SUN")
    ld.energy = strength
    ld.angle = math.radians(angle_deg)
    ld.color = color
    if hasattr(ld, "shadow_cascade_max_distance"):
        ld.shadow_cascade_max_distance = 3000
        ld.use_contact_shadow = True
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    con = ob.constraints.new("TRACK_TO")
    con.target = target
    con.track_axis = "TRACK_NEGATIVE_Z"
    con.up_axis = "UP_Y"
    col_studio.objects.link(ob)
    return ob


light("Key light", (-260, -330, 380), 3.2, 14, color=(1.0, 0.96, 0.9))
light("Fill light", (380, -220, 120), 0.9, 40, color=(0.9, 0.94, 1.0))
light("Rim light", (120, 380, 300), 1.6, 12)

cam_data = bpy.data.cameras.new("Camera")
cam_data.lens = 70
cam_data.clip_start = 1
cam_data.clip_end = 5000
cam = bpy.data.objects.new("Camera", cam_data)
cam.location = (190, -430, 215)
con = cam.constraints.new("TRACK_TO")
con.target = target
con.track_axis = "TRACK_NEGATIVE_Z"
con.up_axis = "UP_Y"
col_studio.objects.link(cam)
scene.camera = cam

r = scene.render
r.resolution_x, r.resolution_y = 1600, 1200
r.engine = "BLENDER_EEVEE"
if hasattr(scene, "eevee"):
    scene.eevee.use_soft_shadows = True
    scene.eevee.use_gtao = True
    scene.eevee.gtao_distance = 8
    scene.eevee.taa_render_samples = 64
    scene.eevee.shadow_cascade_size = "4096"
scene.cycles.samples = 128
scene.cycles.use_denoising = True
try:
    scene.view_settings.view_transform = "AgX"
except TypeError:
    scene.view_settings.view_transform = "Filmic"

# Open on a view of the whole frame in Material Preview, not a tiny dot at the origin.
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == "VIEW_3D":
            sp = area.spaces[0]
            sp.shading.type = "MATERIAL"
            sp.clip_start = 0.5
            sp.clip_end = 10000
            r3 = sp.region_3d
            r3.view_location = target.location
            r3.view_distance = 330
            r3.view_perspective = "PERSP"
            r3.view_rotation = Euler((math.radians(70), 0, math.radians(28)), "XYZ").to_quaternion()

bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True)
print("saved", OUT)
