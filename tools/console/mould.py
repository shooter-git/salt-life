# (M16) The center console's moulded parts, made in Blender, written as src/world/boat/console/Moulded.js (its figures in
# base64: no asset to fetch, so she's built in one go as her hull is):
#   blender -b -P tools/console/mould.py
#
# outboard: a 300 hp V6 outboard after the Regulator 23's photographs (the cowl's scalloped ribs and scoop, its split line,
#   the leg, the plate, the torpedo and the skeg, a three-blade prop). Origin on the swivel's axis at the mounting's top;
#   +Z toward the boat, +Y up. Sizes: Yamaha's F300, 25 in. shaft (0.635 m from mounting to plate), 15 in. prop.
# seat: the leaning post's double bucket seat after the same photographs, with its tall backs and the slot in each; its
#   origin at the base's top in the middle, facing +Z.
import bpy, bmesh, math, os, base64, struct

HERE = os.path.dirname( os.path.abspath( __file__ ) )
OUT = os.path.join( HERE, '..', '..', 'src', 'world', 'boat', 'console', 'Moulded.js' )

# colours as named in the mesh's vertex groups (index into PARTS, each a material in GeoKit's terms)
PARTS = [
	( 'cowl', 0xe8ebec, 0.28, 0 ),
	( 'chaps', 0xc9cdcf, 0.4, 0 ),
	( 'leg', 0xdfe2e3, 0.38, 0 ),
	( 'metal', 0xc4c8cc, 0.25, 1 ),
	( 'vinyl', 0xece6d6, 0.62, 0 ),
	( 'piping', 0xcfc8b6, 0.6, 0 ),
	( 'shell', 0xf0ece0, 0.4, 0 ),
]
PART = { p[ 0 ]: i for i, p in enumerate( PARTS ) }


def smooth( x, a, b ):

	t = max( 0, min( 1, ( x - a ) / ( b - a ) ) )
	return t * t * ( 3 - 2 * t )


def lerp( a, b, t ):

	return a + ( b - a ) * t


def table( rows, x ):

	if x <= rows[ 0 ][ 0 ]: return rows[ 0 ][ 1 ]
	for i in range( len( rows ) - 1 ):

		if x <= rows[ i + 1 ][ 0 ]:

			t = ( x - rows[ i ][ 0 ] ) / ( rows[ i + 1 ][ 0 ] - rows[ i ][ 0 ] )
			t = t * t * ( 3 - 2 * t ) * 0.5 + t * 0.5
			return lerp( rows[ i ][ 1 ], rows[ i + 1 ][ 1 ], t )

	return rows[ -1 ][ 1 ]


class Builder:

	def __init__( self ):

		self.v = []
		self.f = []  # ( a, b, c[, d] ), part

	def add( self, x, y, z ):

		self.v.append( ( x, y, z ) )
		return len( self.v ) - 1

	def grid( self, rows, part, closed = False, flip = False ):

		ni = len( rows ); nj = len( rows[ 0 ] )
		base = len( self.v )
		for r in rows:

			for p in r: self.v.append( tuple( p ) )

		jm = nj if closed else nj - 1
		for i in range( ni - 1 ):

			for j in range( jm ):

				j1 = ( j + 1 ) % nj
				a = base + i * nj + j; b = base + ( i + 1 ) * nj + j; c = base + ( i + 1 ) * nj + j1; d = base + i * nj + j1
				self.f.append( ( ( a, d, c, b ) if flip else ( a, b, c, d ), part ) )

		return base

	def cap( self, first, n, centre, part, flip = False ):

		c = self.add( *centre )
		for j in range( n ):

			a = first + j; b = first + ( j + 1 ) % n
			self.f.append( ( ( c, b, a ) if flip else ( c, a, b ), part ) )


# ---------------------------------------------------------------- the outboard

def cowl_ring( h, n ):

	# height through the cowl, 0 at its seat on the chaps .. 1 at its crown: half-width, front and rear. Over 0.72 a round dome,
	# the whole outline drawn in about its middle, so the crown's one smooth shell
	H0 = 0.72
	u = min( h, H0 )
	b = table( [ ( 0, 0.225 ), ( 0.2, 0.25 ), ( 0.5, 0.262 ), ( H0, 0.258 ) ], u )
	f = table( [ ( 0, 0.2 ), ( 0.35, 0.22 ), ( H0, 0.19 ) ], u )
	r = table( [ ( 0, - 0.48 ), ( 0.35, - 0.63 ), ( 0.6, - 0.69 ), ( H0, - 0.7 ) ], u )
	mid = ( f + r ) / 2; a = ( f - r ) / 2
	k = 1.0
	if h > H0: k = max( 0, 1 - ( ( h - H0 ) / ( 1 - H0 ) ) ** 2.3 ) ** ( 1 / 2.3 )
	y = h * 0.72
	out = []
	for j in range( n ):

		th = 2 * math.pi * j / n
		cz = math.cos( th ); sx = math.sin( th )
		# drawn in to the front, round at the rear
		ex = 0.95 if cz > 0 else 0.72
		px = math.copysign( abs( sx ) ** ex, sx ) * b * k
		pz = math.copysign( abs( cz ) ** 0.9, cz ) * a * k
		# the scalloped ribs over the back of the crown, fanning from the scoop
		rear = smooth( - cz, - 0.1, 0.5 ) * smooth( h, 0.42, 0.62 ) * k
		rib = 1 + math.cos( th * 11 ) * 0.03 * rear
		# the split line between top and bottom cowl: a groove
		g = 1 - 0.012 * math.exp( - ( ( h - 0.34 ) / 0.012 ) ** 2 )
		# the shell's a shade higher at its back, falling to the nose
		dy = 0.035 * ( - cz ) * k * smooth( h, 0.5, 0.8 )
		out.append( ( px * rib * g, y + dy, mid + pz * rib * g ) )

	return out


def foil_ring( y, chord, thick, zc, n, tail = 0.0 ):

	out = []
	for j in range( n ):

		th = 2 * math.pi * j / n
		cz = math.cos( th ); sx = math.sin( th )
		# rounded nose ahead (+z), a fine trailing edge
		t = thick * sx * ( 0.72 + 0.28 * cz ) * ( 1 if cz > - 0.85 else 0.8 )
		out.append( ( t, y, zc + chord / 2 * cz - tail * max( 0, - cz ) ) )

	return out


def outboard():

	B = Builder()
	NC = 28
	hs = [ i / 14 for i in range( 11 ) ] + [ 0.8, 0.85, 0.89, 0.93, 0.96, 0.98, 0.995 ]
	# (extra rings about the split line)
	hs = sorted( set( hs + [ 0.31, 0.33, 0.34, 0.35, 0.37 ] ) )
	rows = [ cowl_ring( h, NC ) for h in hs ]
	first = B.grid( rows, PART[ 'cowl' ], closed = True, flip = True )
	B.cap( first + ( len( rows ) - 1 ) * NC, NC, ( 0, 0.72, - 0.25 ), PART[ 'cowl' ], flip = True )

	# the chaps under the cowl, dark: from the cowl's seat in to the leg's head
	rows = []
	r0 = cowl_ring( 0, NC )
	for y, k, d in [ ( 0.0, 0.96, 0 ), ( - 0.05, 0.94, 0 ), ( - 0.16, 0.74, 0.03 ), ( - 0.24, 0.5, 0.05 ) ]:

		rows.append( [ ( p[ 0 ] * k, y, ( p[ 2 ] + 0.15 ) * k - 0.15 + d ) for p in r0 ] )

	B.grid( rows, PART[ 'chaps' ], closed = True, flip = True )

	# the leg: a foil from the chaps to the plate; the exhaust relief at its back
	NL = 14
	rows = []
	for y, ch, th, zc in [ ( - 0.22, 0.46, 0.085, - 0.16 ), ( - 0.33, 0.4, 0.07, - 0.17 ), ( - 0.46, 0.37, 0.058, - 0.18 ), ( - 0.56, 0.36, 0.056, - 0.19 ), ( - 0.63, 0.36, 0.058, - 0.19 ) ]:

		rows.append( foil_ring( y, ch, th, zc, NL ) )

	B.grid( rows, PART[ 'leg' ], closed = True, flip = True )

	# the anti-ventilation plate: wide, drawn to a point aft
	PY = - 0.635
	plate = []
	for j in range( 16 ):

		th = 2 * math.pi * j / 16
		cz = math.cos( th ); sx = math.sin( th )
		plate.append( ( sx * 0.17 * ( 1 - 0.25 * max( 0, - cz ) ), PY, - 0.24 + cz * 0.3 ) )

	first = B.grid( [ [ ( p[ 0 ], p[ 1 ] + 0.012, p[ 2 ] ) for p in plate ], [ ( p[ 0 ], p[ 1 ] - 0.012, p[ 2 ] ) for p in plate ] ], PART[ 'leg' ], closed = True )
	B.cap( first, 16, ( 0, PY + 0.012, - 0.24 ), PART[ 'leg' ], flip = True )
	B.cap( first + 16, 16, ( 0, PY - 0.012, - 0.24 ), PART[ 'leg' ] )

	# below the plate to the torpedo, then the torpedo, nose ahead
	NL2 = 12
	rows = [ foil_ring( y, ch, th, zc, NL2 ) for y, ch, th, zc in [ ( - 0.63, 0.34, 0.05, - 0.2 ), ( - 0.7, 0.3, 0.045, - 0.2 ), ( - 0.76, 0.26, 0.045, - 0.2 ) ] ]
	B.grid( rows, PART[ 'leg' ], closed = True, flip = True )
	TY = - 0.79
	NT = 12
	rows = []
	for z, r in [ ( 0.06, 0.008 ), ( 0.05, 0.03 ), ( 0.02, 0.058 ), ( - 0.04, 0.078 ), ( - 0.14, 0.086 ), ( - 0.28, 0.08 ), ( - 0.38, 0.068 ), ( - 0.42, 0.06 ) ]:

		rows.append( [ ( r * math.sin( 2 * math.pi * j / NT ), TY + r * math.cos( 2 * math.pi * j / NT ), z ) for j in range( NT ) ] )

	first = B.grid( rows, PART[ 'leg' ], closed = True )
	B.cap( first, NT, ( 0, TY, 0.065 ), PART[ 'leg' ], flip = True )

	# the skeg under it
	sk = [ ( - 0.1, TY - 0.07 ), ( - 0.32, TY - 0.06 ), ( - 0.36, TY - 0.2 ), ( - 0.24, TY - 0.22 ) ]
	idx = []
	for side in ( 0.012, - 0.012 ):

		idx.append( [ B.add( side, y, z ) for z, y in sk ] )

	for j in range( 4 ):

		j1 = ( j + 1 ) % 4
		B.f.append( ( ( idx[ 0 ][ j ], idx[ 0 ][ j1 ], idx[ 1 ][ j1 ], idx[ 1 ][ j ] ), PART[ 'leg' ] ) )

	B.f.append( ( tuple( idx[ 0 ][ ::-1 ] ), PART[ 'leg' ] ) )
	B.f.append( ( tuple( idx[ 1 ] ), PART[ 'leg' ] ) )

	# the prop: a hub and three blades, 15 in. across
	NH = 10
	rows = []
	for z, r in [ ( - 0.43, 0.045 ), ( - 0.5, 0.05 ), ( - 0.55, 0.045 ), ( - 0.58, 0.02 ) ]:

		rows.append( [ ( r * math.sin( 2 * math.pi * j / NH ), TY + r * math.cos( 2 * math.pi * j / NH ), z ) for j in range( NH ) ] )

	first = B.grid( rows, PART[ 'metal' ], closed = True )
	B.cap( first + 3 * NH, NH, ( 0, TY, - 0.585 ), PART[ 'metal' ] )
	R = 0.19
	for bl in range( 3 ):

		a0 = 2 * math.pi * bl / 3
		rows = []
		for k in range( 6 ):

			u = k / 5
			r = lerp( 0.04, R, u )
			span = 0.42 * math.sin( math.pi * ( 0.12 + 0.82 * u ) ) * ( 1 - 0.15 * u )
			row = []
			for s in range( 5 ):

				v = s / 4 - 0.5
				a = a0 + v * span * 0.09 / max( r, 0.07 ) * 2 + u * 0.3
				# the blade's pitch: its leading edge forward
				z = - 0.495 + v * 0.11 * ( 1 - 0.3 * u )
				row.append( ( r * math.sin( a ), TY + r * math.cos( a ), z ) )

			rows.append( row )

		B.grid( rows, PART[ 'metal' ] )

	return B


# ---------------------------------------------------------------- the leaning post's seat

def pillow( B, w, h, cx, cy, cz, part, nu, nv, depth, facing = 1, tilt = 0.0, bulge = 0.02, chan = 0.0, slot = None, top = None ):

	# a cushion in the x-y plane, rounded at its edges, facing +z (facing -1: -z); tilt: rad back about x; top: a height
	# function narrowing it as it rises. chan: channels' depth; slot: ( y0, y1, half-width ) of the opening through the back
	rows = []
	for iv in range( nv + 1 ):

		v = iv / nv
		row = []
		for iu in range( nu + 1 ):

			u = iu / nu
			# pushed to the edges so the rounding's fine
			su = ( u - 0.5 ) * 2; sv = ( v - 0.5 ) * 2
			x = w / 2 * math.copysign( abs( su ) ** 0.75, su )
			y = h / 2 * math.copysign( abs( sv ) ** 0.75, sv )
			if top: x *= top( ( y / h ) + 0.5 )
			# how far in from the edge: the rounding
			e = min( w / 2 - abs( x ), h / 2 - abs( y ) )
			dome = math.sqrt( max( 0, 1 - ( 1 - min( 1, e / 0.045 ) ) ** 2 ) )
			z = depth / 2 * dome + bulge * ( 1 - su * su ) * ( 1 - sv * sv )
			if chan:

				z -= chan * max( 0, math.cos( x / ( w / 2 ) * math.pi * 3.5 ) ) ** 6 * dome

			if slot and slot[ 0 ] < y < slot[ 1 ] and abs( x ) < slot[ 2 ]: z = - depth * 0.1
			row.append( ( x, y, z * facing ) )

		rows.append( row )

	# the back's plain, a little domed
	back = [ [ ( p[ 0 ], p[ 1 ], - depth * 0.45 * facing * ( 1 - 0.3 * ( p[ 0 ] / ( w / 2 ) ) ** 2 ) if max( abs( p[ 0 ] ) / ( w / 2 ), abs( p[ 1 ] ) / ( h / 2 ) ) < 0.97 else p[ 2 ] ) for p in r ] for r in rows ]
	c = math.cos( tilt ); s = math.sin( tilt )
	place = lambda p: ( cx + p[ 0 ], cy + p[ 1 ] * c + p[ 2 ] * s, cz - p[ 1 ] * s + p[ 2 ] * c )
	B.grid( [ [ place( p ) for p in r ] for r in rows ], part, flip = facing < 0 )
	B.grid( [ [ place( p ) for p in r ] for r in back ], part, flip = facing > 0 )


def seat():

	B = Builder()
	W = 0.47
	for sx in ( - 0.25, 0.25 ):

		# the bolster-flip cushion: seat, its front rolled
		pillow( B, W, 0.46, sx, 0.09, 0.03, PART[ 'vinyl' ], 10, 8, 0.1, tilt = - math.pi / 2 + 0.04, bulge = 0.022, chan = 0.006 )
		# the tall back, its channels and the slot through its head
		pillow( B, W, 0.72, sx, 0.47, - 0.23, PART[ 'vinyl' ], 12, 14, 0.13, tilt = 0.14, bulge = 0.018, chan = 0.008, slot = ( 0.17, 0.27, 0.12 ), top = lambda v: 1 - 0.13 * smooth( v, 0.6, 1 ) )
		# its moulded shell behind
		pillow( B, W + 0.02, 0.74, sx, 0.47, - 0.28, PART[ 'shell' ], 6, 8, 0.05, tilt = 0.14, bulge = 0.01, facing = - 1, top = lambda v: 1 - 0.13 * smooth( v, 0.6, 1 ) )

	return B


# ---------------------------------------------------------------- through Blender

def through_blender( B, name, budget ):

	bpy.ops.wm.read_factory_settings( use_empty = True )
	me = bpy.data.meshes.new( name )
	bm = bmesh.new()
	vs = [ bm.verts.new( p ) for p in B.v ]
	bm.verts.ensure_lookup_table()
	layer = bm.faces.layers.int.new( 'part' )
	for f, part in B.f:

		try:

			face = bm.faces.new( [ vs[ i ] for i in f ] )
			face[ layer ] = part

		except ValueError:

			pass  # (a collapsed quad at a pole)

	# (a quad with two corners on one point: gone, its neighbours kept)
	bmesh.ops.remove_doubles( bm, verts = bm.verts, dist = 0.0005 )
	bmesh.ops.dissolve_degenerate( bm, edges = bm.edges, dist = 0.0002 )
	bmesh.ops.recalc_face_normals( bm, faces = bm.faces )
	bm.to_mesh( me )
	bm.free()
	ob = bpy.data.objects.new( name, me )
	bpy.context.scene.collection.objects.link( ob )
	bpy.context.view_layer.objects.active = ob
	ob.select_set( True )
	tris = sum( len( p.vertices ) - 2 for p in me.polygons )
	if tris > budget:

		m = ob.modifiers.new( 'dec', 'DECIMATE' )
		m.ratio = budget / tris
		m.use_collapse_triangulate = True
		bpy.ops.object.modifier_apply( modifier = m.name )

	# triangles, with normals smooth but for the hard edges (over 40 degrees)
	m = ob.modifiers.new( 'tri', 'TRIANGULATE' )
	bpy.ops.object.modifier_apply( modifier = m.name )
	me = ob.data
	me.use_auto_smooth = True
	me.auto_smooth_angle = math.radians( 40 )
	for p in me.polygons: p.use_smooth = True
	me.calc_normals_split()
	parts = me.attributes.get( 'part' )
	# one vertex per position, normal and part
	verts = {}
	pos = []; nor = []; col = []; idx = []
	for poly in me.polygons:

		part = parts.data[ poly.index ].value if parts else 0
		for li in poly.loop_indices:

			loop = me.loops[ li ]
			p = me.vertices[ loop.vertex_index ].co; n = loop.normal
			key = ( loop.vertex_index, round( n.x, 2 ), round( n.y, 2 ), round( n.z, 2 ), part )
			if key not in verts:

				verts[ key ] = len( pos )
				pos.append( ( p.x, p.y, p.z ) ); nor.append( ( n.x, n.y, n.z ) ); col.append( part )

			idx.append( verts[ key ] )

	print( 'MOULDED', name, 'triangles', len( idx ) // 3, 'vertices', len( pos ) )
	return { 'pos': pos, 'nor': nor, 'col': col, 'idx': idx }


def encode( m ):

	S = 32767 / 1.2  # position: 16 bits over +-1.2 m
	pos = b''.join( struct.pack( '<hhh', *[ max( - 32767, min( 32767, round( c * S ) ) ) for c in p ] ) for p in m[ 'pos' ] )
	nor = b''.join( struct.pack( '<bbb', *[ max( - 127, min( 127, round( c * 127 ) ) ) for c in n ] ) for n in m[ 'nor' ] )
	col = bytes( m[ 'col' ] )
	idx = b''.join( struct.pack( '<H', i ) for i in m[ 'idx' ] )
	e = lambda b: base64.b64encode( b ).decode()
	return "{ pos: '%s', nor: '%s', part: '%s', idx: '%s' }" % ( e( pos ), e( nor ), e( col ), e( idx ) )


meshes = { 'outboard': through_blender( outboard(), 'outboard', 3600 ), 'seat': through_blender( seat(), 'seat', 2400 ) }
with open( OUT, 'w' ) as f:

	f.write( '// (M16) Written by tools/console/mould.py (Blender): the center console\'s moulded parts, as base64 of int16 positions (x y z,\n// over +-1.2 m), int8 normals, each vertex\'s part, uint16 triangles. Don\'t edit: run it again.\n' )
	f.write( 'export const POSITION_SCALE = 1.2 / 32767;\n' )
	f.write( 'export const PARTS = [ %s ];\n' % ', '.join( "{ name: '%s', color: 0x%06x, rough: %g, metal: %d }" % p for p in PARTS ) )
	for k, m in meshes.items(): f.write( 'export const %s = %s;\n' % ( k.upper(), encode( m ) ) )

print( 'WROTE', OUT, os.path.getsize( OUT ) )
