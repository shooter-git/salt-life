# Blender (3.4+) batch: one Rocketbox avatar's head and hair on another's body (both on the library's one 80-bone
# Bip01 skeleton), for a face whose avatar is dressed wrong for the island (build.sh's donor). The body avatar's
# head and hair faces are taken off and the donor's head and hair (its head and opacity materials) put on in their
# place: moved to where the body's head bone is, weighted to the body's skeleton by bone name, and the neck
# between the donor's head's lower edge and the body's opening bridged with the body's skin (its UVs those of the
# body's opening nearest it). Saved as a .blend for convert.py; its materials <name>_body, <name>_head,
# <name>_opacity.
# blender -b --python swap_head.py -- <body.fbx> <head donor.fbx> <name> <out.blend>
import bpy, sys, bmesh
from mathutils import Vector
argv = sys.argv[ sys.argv.index( '--' ) + 1: ]
body_path, donor_path, name, out = argv[ :4 ]
bpy.ops.wm.read_factory_settings( use_empty = True )


def load( path ):

	before = set( bpy.data.objects )
	bpy.ops.import_scene.fbx( filepath = path, use_anim = False, automatic_bone_orientation = False, ignore_leaf_bones = False )
	new = [ o for o in bpy.data.objects if o not in before ]
	for o in new:
		if o.type == 'EMPTY': bpy.data.objects.remove( o, do_unlink = True )
	new = [ o for o in bpy.data.objects if o not in before ]
	return next( o for o in new if o.type == 'ARMATURE' ), next( o for o in new if o.type == 'MESH' )


def kinds( mesh ):

	return { s.material.name.split( '_' )[ -1 ]: i for i, s in enumerate( mesh.material_slots ) }


def keep( mesh, wanted ):

	# (the faces of the wanted materials kept, the rest taken off; their seam verts (on both a head and a body face)
	# returned by their coordinates)
	K = kinds( mesh )
	bm = bmesh.new()
	bm.from_mesh( mesh.data )
	seam = [ v.co.copy() for v in bm.verts if any( f.material_index == K[ 'head' ] for f in v.link_faces ) and any( f.material_index == K[ 'body' ] for f in v.link_faces ) ]
	bmesh.ops.delete( bm, geom = [ f for f in bm.faces if f.material_index not in { K[ k ] for k in wanted } ], context = 'FACES' )
	bmesh.ops.delete( bm, geom = [ v for v in bm.verts if not v.link_faces ], context = 'VERTS' )
	bm.to_mesh( mesh.data )
	bm.free()
	return seam


arm_b, mesh_b = load( body_path )
arm_d, mesh_d = load( donor_path )
seam_b = keep( mesh_b, [ 'body' ] )
seam_d = keep( mesh_d, [ 'head', 'opacity' ] )

# the donor's head where the body's head bone is (the meshes are in their armatures' space, rest pose)
hb = arm_b.data.bones[ 'Bip01 Head' ].head_local
hd = arm_d.data.bones[ 'Bip01 Head' ].head_local
shift = mesh_d.matrix_world.inverted().to_3x3() @ ( arm_b.matrix_world @ hb - arm_d.matrix_world @ hd )
for v in mesh_d.data.vertices: v.co += shift
seam_d = [ c + shift for c in seam_d ]
print( 'SHIFT', tuple( round( x, 4 ) for x in shift ) )

# on the body's skeleton (its vertex groups are the bones' names), one mesh
for m in mesh_d.modifiers:
	if m.type == 'ARMATURE': m.object = arm_b
mesh_d.parent = arm_b
for o in bpy.context.view_layer.objects: o.select_set( False )
mesh_d.select_set( True )
mesh_b.select_set( True )
bpy.context.view_layer.objects.active = mesh_b
bpy.ops.object.join()
mesh = mesh_b
bpy.data.objects.remove( arm_d, do_unlink = True )

# its materials: the body's body, the donor's head and hair; named for convert.py
slots = [ s.material.name for s in mesh.material_slots ]
body_i = next( i for i, n in enumerate( slots ) if n.split( '_' )[ -1 ] == 'body' and n.startswith( slots[ 0 ].split( '_' )[ 0 ] ) )
head_i = next( i for i, n in enumerate( slots ) if n.split( '_' )[ -1 ] == 'head' and not n.startswith( slots[ 0 ].split( '_' )[ 0 ] ) )
hair_i = next( i for i, n in enumerate( slots ) if n.split( '_' )[ -1 ] == 'opacity' and not n.startswith( slots[ 0 ].split( '_' )[ 0 ] ) )

# the neck bridged: the body's opening (the body's seam verts, now an open edge loop) to the donor head's lower edge
bm = bmesh.new()
bm.from_mesh( mesh.data )
near = lambda co, pts: min( pts, key = lambda p: ( p - co ).length )
def loop_edges( pts ):
	# (the open edges whose ends are both seam points)
	tag = set( v for v in bm.verts if ( near( v.co, pts ) - v.co ).length < 1e-3 )
	return [ e for e in bm.edges if e.is_boundary and e.verts[ 0 ] in tag and e.verts[ 1 ] in tag ], tag
edges_b, ring_b = loop_edges( seam_b )
edges_d, ring_d = loop_edges( seam_d )
print( 'RINGS', len( ring_b ), len( edges_b ), len( ring_d ), len( edges_d ) )
res = bmesh.ops.bridge_loops( bm, edges = edges_b + edges_d )
uv = bm.loops.layers.uv.active
# (its skin from a clean patch of the body's: the middle of the upper arm's (bare under a vest, a T-shirt's sleeve
# short of it), each corner a little off it by where it is, so it isn't flat. The opening's own UVs lie on the
# island's edge, its padding grey, and it reaches down onto the chest)
deform = bm.verts.layers.deform.active
arm_g = mesh.vertex_groups.get( 'Bip01 L UpperArm' )
pts = []
for f in bm.faces:
	if f.material_index != body_i or f in res[ 'faces' ]: continue
	w = sum( l.vert[ deform ].get( arm_g.index, 0 ) for l in f.loops ) / len( f.loops ) if arm_g else 0
	if w > 0.9: pts.append( sum( ( l[ uv ].uv for l in f.loops ), Vector( ( 0, 0 ) ) ) / len( f.loops ) )
patch = sum( pts, Vector( ( 0, 0 ) ) ) / len( pts )
print( 'SKIN PATCH', tuple( round( x, 3 ) for x in patch ), 'from', len( pts ), 'faces' )
for f in res[ 'faces' ]:
	f.material_index = body_i
	f.smooth = True
	for l in f.loops:
		c = l.vert.co
		l[ uv ].uv = patch + Vector( ( ( c.x % 7 ) / 7 - 0.5, ( c.z % 7 ) / 7 - 0.5 ) ) * 0.012
print( 'BRIDGE', len( res[ 'faces' ] ), 'faces' )
bm.to_mesh( mesh.data )
bm.free()

# the unused slots off, the rest named
for i in sorted( set( range( len( mesh.material_slots ) ) ) - { body_i, head_i, hair_i }, reverse = True ):
	mesh.active_material_index = i
	bpy.ops.object.material_slot_remove()
for s in mesh.material_slots:
	s.material.name = name + '_' + s.material.name.split( '_' )[ -1 ]
print( 'MATERIALS', [ s.material.name for s in mesh.material_slots ] )
bpy.ops.wm.save_as_mainfile( filepath = out )
print( 'SAVED', out )
