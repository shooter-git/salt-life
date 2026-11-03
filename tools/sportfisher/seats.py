# (M16) The sportfisher's moulded fittings: the fighting chair and the helm seat, modelled by script (subdivided, so their
# pads are soft and their frames rounded), exported as plain arrays for build-seats.mjs to pack into seats.data.js.
#   blender -b -P tools/sportfisher/seats.py -- out.json
# Shapes after a Murray Bros / Release Marine fighting chair and the Viking 48's helm chairs (docs/m16/sportfisher.md). Each
# seat's origin is on the deck under its pedestal, +Y forward as it faces, +Z up (swapped to the game's frame on export).
import bpy, bmesh, json, sys
from math import pi, radians

def clear():
	for o in list(bpy.data.objects): bpy.data.objects.remove(o)

def rounded(size, loc, rot=(0, 0, 0), bevel=0.25, sub=2):
	bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
	o = bpy.context.object
	o.scale = size
	bpy.ops.object.transform_apply(scale=True)
	m = o.modifiers.new('b', 'BEVEL'); m.width = min(size) * bevel; m.segments = 1; m.limit_method = 'NONE'
	s = o.modifiers.new('s', 'SUBSURF'); s.levels = sub
	return o

def cyl(r, h, loc, rot=(0, 0, 0), verts=16, r2=None):
	bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r if r2 is None else r2, depth=h, location=loc, rotation=rot)
	return bpy.context.object

def tube(points, r, verts=8):
	c = bpy.data.curves.new('c', 'CURVE'); c.dimensions = '3D'
	s = c.splines.new('POLY'); s.points.add(len(points) - 1)
	for p, q in zip(s.points, points): p.co = (*q, 1)
	c.bevel_depth = r; c.bevel_resolution = max(0, verts // 4 - 1); c.use_fill_caps = True
	o = bpy.data.objects.new('t', c); bpy.context.collection.objects.link(o)
	bpy.context.view_layer.objects.active = o; o.select_set(True)
	bpy.ops.object.convert(target='MESH')
	return o

def join(objs, name, ratio=1):
	out = []
	deps = bpy.context.evaluated_depsgraph_get()
	for o in objs:
		e = o.evaluated_get(deps); out.append(bpy.data.meshes.new_from_object(e, depsgraph=deps).copy() if False else (e.to_mesh().copy(), o.matrix_world.copy()))
	bm = bmesh.new()
	for me, mw in out:
		me.transform(mw); bm.from_mesh(me)
	bmesh.ops.triangulate(bm, faces=bm.faces)
	res = bpy.data.meshes.new(name); bm.to_mesh(res); bm.free()
	ob = bpy.data.objects.new(name, res); bpy.context.collection.objects.link(ob)
	for p in res.polygons: p.use_smooth = True
	return ob

def export(ob):
	me = ob.data
	me.calc_normals_split() if hasattr(me, 'calc_normals_split') else None
	P, N, I = [], [], []
	seen = {}
	for t in me.polygons:
		for li in t.loop_indices:
			l = me.loops[li]; v = me.vertices[l.vertex_index]
			# (flat where a loop's normal says so; smooth otherwise)
			n = l.normal
			key = (l.vertex_index, round(n.x, 2), round(n.y, 2), round(n.z, 2))
			k = seen.get(key)
			if k is None:
				k = seen[key] = len(P) // 3
				# game frame: x as is, y up, z forward
				P += [v.co.x, v.co.z, v.co.y]; N += [n.x, n.z, n.y]
			I.append(k)
	# blender's (x, y, z) to the game's (x, z, y) mirrors: reverse the winding
	for i in range(0, len(I), 3): I[i + 1], I[i + 2] = I[i + 2], I[i + 1]
	return {'p': P, 'n': N, 'i': I}

def decimated(ob, ratio):
	o = ob.copy(); o.data = ob.data.copy(); bpy.context.collection.objects.link(o)
	m = o.modifiers.new('d', 'DECIMATE'); m.ratio = ratio
	deps = bpy.context.evaluated_depsgraph_get()
	e = o.evaluated_get(deps); me = e.to_mesh().copy()
	bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
	r = bpy.data.objects.new('l', me); bpy.context.collection.objects.link(r)
	for p in me.polygons: p.use_smooth = True
	return r

def seat_parts(parts):
	out = {}
	for key, objs in parts.items():
		ob = join(objs, key)
		out[key] = {'high': export(ob), 'low': export(decimated(ob, 0.22))}
	return out

# ---------------------------------------------------------------- the fighting chair
clear()
SEAT = 0.5  # the seat's height off the deck
ped = [
	cyl(0.25, 0.015, (0, 0, 0.008), verts=24),
	cyl(0.17, 0.09, (0, 0, 0.055), verts=24, r2=0.085),
	cyl(0.075, SEAT - 0.17, (0, 0, (SEAT + 0.05) / 2), verts=20),
	cyl(0.1, 0.04, (0, 0, SEAT - 0.06), verts=20),
	# the swivel's arm, the footrest's post and rest (adjustable bar with two plates)
	tube([(0, -0.05, 0.28), (0, -0.25, 0.28), (0, -0.46, 0.2)], 0.02),
	tube([(-0.2, -0.5, 0.2), (0.2, -0.5, 0.2)], 0.016),
	# the gimbal for the rod's butt, at the front of the seat
	cyl(0.028, 0.14, (0, -0.33, SEAT + 0.035), rot=(radians(35), 0, 0), verts=12),
	tube([(-0.05, -0.28, SEAT - 0.01), (-0.05, -0.33, SEAT + 0.03)], 0.008),
	tube([(0.05, -0.28, SEAT - 0.01), (0.05, -0.33, SEAT + 0.03)], 0.008),
]
teak = [
	# the seat's teak base and the back's frame
	rounded((0.56, 0.5, 0.04), (0, 0, SEAT - 0.01), bevel=0.3, sub=1),
	rounded((0.05, 0.05, 0.56), (-0.26, 0.24, SEAT + 0.28), rot=(radians(-12), 0, 0), bevel=0.3, sub=1),
	rounded((0.05, 0.05, 0.56), (0.26, 0.24, SEAT + 0.28), rot=(radians(-12), 0, 0), bevel=0.3, sub=1),
	# the arms: broad teak rails, rising a little aft
	rounded((0.075, 0.5, 0.034), (-0.32, -0.02, SEAT + 0.2), rot=(radians(4), 0, 0), bevel=0.35, sub=1),
	rounded((0.075, 0.5, 0.034), (0.32, -0.02, SEAT + 0.2), rot=(radians(4), 0, 0), bevel=0.35, sub=1),
	rounded((0.035, 0.035, 0.2), (-0.32, -0.2, SEAT + 0.1), bevel=0.3, sub=1),
	rounded((0.035, 0.035, 0.2), (0.32, -0.2, SEAT + 0.1), bevel=0.3, sub=1),
	rounded((0.035, 0.035, 0.2), (-0.31, 0.16, SEAT + 0.1), bevel=0.3, sub=1),
	rounded((0.035, 0.035, 0.2), (0.31, 0.16, SEAT + 0.1), bevel=0.3, sub=1),
	# the top rail across the back
	rounded((0.58, 0.05, 0.05), (0, 0.3, SEAT + 0.58), rot=(radians(-12), 0, 0), bevel=0.3, sub=1),
]
pads = [
	rounded((0.5, 0.46, 0.09), (0, -0.01, SEAT + 0.055), bevel=0.42, sub=2),
	rounded((0.46, 0.09, 0.48), (0, 0.2, SEAT + 0.32), rot=(radians(-12), 0, 0), bevel=0.42, sub=2),
]
chair = seat_parts({'steel': ped, 'teak': teak, 'pad': pads})

# ---------------------------------------------------------------- the helm seat: a tall pedestal, a bolstered seat and back
clear()
SEAT = 0.75
ped = [
	cyl(0.2, 0.012, (0, 0, 0.006), verts=20),
	cyl(0.14, 0.05, (0, 0, 0.035), verts=20, r2=0.06),
	cyl(0.05, SEAT - 0.09, (0, 0, (SEAT + 0.0) / 2), verts=16),
	cyl(0.11, 0.03, (0, 0, SEAT - 0.04), verts=16),
	tube([(-0.17, -0.3, 0.36), (0.17, -0.3, 0.36)], 0.014),
	tube([(0, -0.02, 0.33), (0, -0.3, 0.36)], 0.016),
]
pads = [
	rounded((0.5, 0.46, 0.1), (0, -0.01, SEAT + 0.03), bevel=0.42, sub=2),
	rounded((0.5, 0.11, 0.6), (0, 0.22, SEAT + 0.36), rot=(radians(-10), 0, 0), bevel=0.4, sub=2),
	# its bolsters
	rounded((0.08, 0.42, 0.13), (-0.25, 0, SEAT + 0.05), bevel=0.42, sub=1),
	rounded((0.08, 0.42, 0.13), (0.25, 0, SEAT + 0.05), bevel=0.42, sub=1),
]
trim = [
	rounded((0.07, 0.34, 0.05), (-0.31, -0.04, SEAT + 0.26), bevel=0.4, sub=1),
	rounded((0.07, 0.34, 0.05), (0.31, -0.04, SEAT + 0.26), bevel=0.4, sub=1),
	rounded((0.035, 0.035, 0.26), (-0.31, 0.1, SEAT + 0.12), bevel=0.3, sub=1),
	rounded((0.035, 0.035, 0.26), (0.31, 0.1, SEAT + 0.12), bevel=0.3, sub=1),
]
helm = seat_parts({'steel': ped, 'pad': pads, 'teak': trim})

out = sys.argv[sys.argv.index('--') + 1]
json.dump({'chair': chair, 'helm': helm}, open(out, 'w'))
print('wrote', out, {k: len(v['high']['i']) // 3 for k, v in chair.items()}, {k: len(v['high']['i']) // 3 for k, v in helm.items()})
