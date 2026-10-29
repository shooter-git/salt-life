import { Vector2, Vector4, Box3, Frustum, Matrix4, Vector3, Sphere, InstancedBufferGeometry, BufferAttribute, InstancedBufferAttribute } from '../engine/index.js';

// (M15) the parity of an integer, for a negative one too
const parity = ( k ) => ( ( k % 2 ) + 2 ) % 2;

// Continuous distance-dependent LOD (Strugar 2010) quadtree grid.
// A single G x G grid mesh is instanced for every selected node. Vertices near the
// outer edge of each LOD range geomorph toward the next coarser grid so there are
// never cracks or pops between levels.
//
// GLSL (`cdlod.glsl`, names prefixed `cdlod`, or the `prefix` option): the material's vertex shader
// declares the instanced attribute `nodeData` (origin xz, size, lod) and calls
//   vec2 cdlodSnapped( vec4 node, vec2 grid )                         the vertex on its LOD's lattice
//   CdlodVertex cdlodMorph( vec4 node, vec2 grid, vec3 viewPos, float y0 )
//        (y0 = height at cdlodSnapped(), for the morph distance; 0 for the sea)
//   struct CdlodVertex { vec2 xz; float spacing; float morphK; float lod; float size; }
//        (xz: about the grid's origin)
// Uniforms (`cdlod.uniforms`, merged into the material's): <prefix>Morph[ lod ] = ( morph start,
// 1 / morph range, grid spacing, 0 ); (M15) <prefix>Origin[ lod ] = ( how far the origin is past a
// point of that LOD's lattice, x and z (m), the parity of that point's index, x and z ); <prefix>At, the
// origin (world xz); <prefix>View, the camera about it.
//
// (M15) The origin is the world's, or with `follow` (m) it follows the camera that many metres at a time:
// the nodes are sent and laid out about it, so a GPU's 32-bit floats keep their fineness tens of
// kilometres from the world's middle (at 20 km a float's step is 2 mm, and the lattice's snap missed on
// mid). The mesh is drawn at `origin` (three takes it there in doubles, on the CPU); each LOD's lattice is
// still the world's (its offset from the origin, and its parity, in <prefix>Origin), so nothing moves as the
// origin jumps.
export class CDLOD {

	constructor( {
		gridSize = 64, // quads per node side (even)
		leafSize = 8, // node size at LOD 0 (m)
		levels = 12,
		rangeFactor = 2.5, // LOD range = leafSize * 2^lod * rangeFactor
		morphStartRatio = 0.66,
		maxInstances = 1500,
		minY = - 20,
		maxY = 20,
		heightBounds = null, // optional (x0,z0,x1,z1) => [minY,maxY]
		center = null, // optional fixed world bounds for root grid { x, z, size }
		prefix = 'cdlod', // GLSL name prefix of this instance's functions and uniforms
		follow = 0, // (M15) metres the origin follows the camera by (0: the world's origin)
		reach = 1, // (M15) root nodes laid out each way about the camera's (without a fixed root)
		below = - Infinity, // (M15) nodes wholly lower than this (m) aren't drawn (a seabed too deep to be seen)
	} = {} ) {

		this.G = gridSize;
		this.leafSize = leafSize;
		this.levels = levels;
		this.minY = minY;
		this.maxY = maxY;
		this.heightBounds = heightBounds;
		this.fixedRoot = center;
		this.reach = reach;
		this.below = below;

		this.ranges = [];
		const morph = [];
		let prev = 0;
		for ( let l = 0; l < levels; l ++ ) {

			const r = leafSize * Math.pow( 2, l ) * rangeFactor;
			this.ranges.push( r );
			const start = prev + ( r - prev ) * morphStartRatio;
			morph.push( new Vector2( start, 1 / Math.max( 1e-3, r - start ) ) );
			prev = r;

		}

		const spacings = [];
		for ( let l = 0; l < levels; l ++ ) spacings.push( leafSize * Math.pow( 2, l ) / gridSize );
		// `.array` kept for callers
		this.uMorph = { array: morph };
		this.uSpacing = { array: spacings };
		const P = prefix;
		const Cap = P[ 0 ].toUpperCase() + P.slice( 1 );
		this.uniforms = {
			[ P + 'Morph' ]: { value: morph.map( ( m, l ) => new Vector4( m.x, m.y, spacings[ l ], 0 ) ) },
			[ P + 'Origin' ]: { value: spacings.map( () => new Vector4( 0, 0, 0, 0 ) ) }, // (a Vector4's w is 1 unless said)
			[ P + 'At' ]: { value: new Vector2() },
			[ P + 'View' ]: { value: new Vector3() },
		};
		this.prefix = P;
		// (M15) the origin the nodes are laid out about (world, y 0), and how far it follows the camera
		this.follow = follow;
		this.origin = new Vector3();
		this._spacings = spacings;
		this.glsl = /* glsl */`
attribute vec4 nodeData;
uniform vec4 ${ P }Morph[ ${ levels } ];
uniform vec4 ${ P }Origin[ ${ levels } ];
uniform vec2 ${ P }At;
uniform vec3 ${ P }View;
struct ${ Cap }Vertex { vec2 xz; float spacing; float morphK; float lod; float size; };

// Morph in world space on the LOD's own vertex lattice (spacing h). Quarter nodes of a
// partially subdivided parent carry the parent's LOD, so their extra vertices first snap
// onto that lattice; every node covering a point then computes the same position. ((M15) Counted from
// the lattice's point just short of the origin, and given about the origin)
vec2 ${ P }Snapped( vec4 node, vec2 grid ) {
	float h = ${ P }Morph[ int( node.w ) ].z;
	vec4 o = ${ P }Origin[ int( node.w ) ];
	vec2 p = node.xy + grid * node.z + o.xy;
	return floor( p / h + 1e-3 ) * h - o.xy;
}

${ Cap }Vertex ${ P }Morph_( vec4 node, vec2 grid, vec3 viewPos, float y0 ) {
	vec4 m = ${ P }Morph[ int( node.w ) ];
	vec4 og = ${ P }Origin[ int( node.w ) ];
	float h = m.z;
	vec2 p = node.xy + grid * node.z + og.xy;
	vec2 idx = floor( p / h + 1e-3 );
	vec2 snapped = idx * h - og.xy;
	float dist = length( viewPos - vec3( snapped.x, y0, snapped.y ) );
	float morphK = clamp( ( dist - m.x ) * m.y, 0.0, 1.0 );
	vec2 odd = fract( ( idx + og.zw ) * 0.5 ) * 2.0;
	${ Cap }Vertex o;
	o.xz = snapped - odd * h * morphK;
	o.spacing = h * ( morphK + 1.0 );
	o.morphK = morphK;
	o.lod = node.w;
	o.size = node.z;
	return o;
}
`;

		// grid geometry in [0,1]^2 on XZ
		const G = gridSize;
		const verts = new Float32Array( ( G + 1 ) * ( G + 1 ) * 3 );
		let p = 0;
		for ( let j = 0; j <= G; j ++ ) {

			for ( let i = 0; i <= G; i ++ ) {

				verts[ p ++ ] = i / G;
				verts[ p ++ ] = 0;
				verts[ p ++ ] = j / G;

			}

		}

		// quads in column strips of STRIP: the next row of a strip reuses vertices the GPU shaded a
		// moment ago (a full grid row is longer than its post-transform reuse window)
		const STRIP = 8;
		const idx = new Uint32Array( G * G * 6 );
		p = 0;
		for ( let i0 = 0; i0 < G; i0 += STRIP ) for ( let j = 0; j < G; j ++ ) {

			for ( let i = i0; i < Math.min( i0 + STRIP, G ); i ++ ) {

				const a = j * ( G + 1 ) + i;
				const b = a + 1;
				const c = a + ( G + 1 );
				const d = c + 1;
				// alternate diagonal for better symmetry
				if ( ( i + j ) % 2 === 0 ) {

					idx[ p ++ ] = a; idx[ p ++ ] = c; idx[ p ++ ] = b;
					idx[ p ++ ] = b; idx[ p ++ ] = c; idx[ p ++ ] = d;

				} else {

					idx[ p ++ ] = a; idx[ p ++ ] = c; idx[ p ++ ] = d;
					idx[ p ++ ] = a; idx[ p ++ ] = d; idx[ p ++ ] = b;

				}

			}

		}

		const geo = new InstancedBufferGeometry();
		geo.setAttribute( 'position', new BufferAttribute( verts, 3 ) );
		geo.setIndex( new BufferAttribute( idx, 1 ) );
		this.nodeArray = new Float32Array( maxInstances * 4 );
		this.nodeAttr = new InstancedBufferAttribute( this.nodeArray, 4 );
		geo.setAttribute( 'nodeData', this.nodeAttr );
		geo.instanceCount = 0;
		geo.boundingSphere = new Sphere( new Vector3(), 1e7 );
		geo.boundingBox = new Box3( new Vector3( - 1e7, - 1e7, - 1e7 ), new Vector3( 1e7, 1e7, 1e7 ) );
		this.geometry = geo;
		this.maxInstances = maxInstances;
		this.count = 0;

		this._box = new Box3();
		this._frustum = new Frustum();
		this._mat = new Matrix4();
		this._cam = new Vector3();
		this.lodCounts = new Array( levels ).fill( 0 );

	}

	// GLSL statement (vertex shader) computing `<Cap>Vertex <out> = <prefix>Morph_( ... )` for the
	// current vertex. `heightFn` optional GLSL function name ( vec2 xz ) -> float used for the morph
	// distance (defaults to sea level 0); `viewPos` a GLSL vec3 (defaults to the camera, (M15) about the origin).
	vertexNodes( heightFn = null, { out = 'lod', viewPos = null } = {} ) {

		const P = this.prefix;
		viewPos = viewPos || ( this.follow ? P + 'View' : 'cameraPosition' );
		const Cap = P[ 0 ].toUpperCase() + P.slice( 1 );
		const y0 = heightFn ? `${ heightFn }( ${ P }Snapped( nodeData, position.xz ) )` : '0.0';
		return `${ Cap }Vertex ${ out } = ${ P }Morph_( nodeData, position.xz, ${ viewPos }, ${ y0 } );`;

	}

	update( camera ) {

		camera.updateMatrixWorld();
		this._mat.multiplyMatrices( camera.projectionMatrix, camera.matrixWorldInverse );
		this._frustum.setFromProjectionMatrix( this._mat, camera.coordinateSystem );
		camera.getWorldPosition( this._cam );
		if ( this.follow ) this._follow( this._cam );
		const O = this.origin;
		this.uniforms[ this.prefix + 'View' ].value.subVectors( this._cam, O );

		this.count = 0;
		this.lodCounts.fill( 0 );

		const top = this.levels - 1;
		const rootSize = this.leafSize * Math.pow( 2, top );

		if ( this.fixedRoot ) {

			const { x, z, size } = this.fixedRoot;
			const n = Math.ceil( size / rootSize );
			for ( let j = 0; j < n; j ++ ) for ( let i = 0; i < n; i ++ ) {

				this._select( x + i * rootSize, z + j * rootSize, rootSize, top );

			}

		} else {

			const cx = Math.floor( this._cam.x / rootSize );
			const cz = Math.floor( this._cam.z / rootSize );
			const R = this.reach;
			for ( let j = - R; j <= R; j ++ ) for ( let i = - R; i <= R; i ++ ) {

				this._select( ( cx + i ) * rootSize, ( cz + j ) * rootSize, rootSize, top );

			}

		}

		// front-to-back order so early depth testing rejects hidden wave faces
		const n = this.count;
		const order = this._order || ( this._order = [] );
		order.length = n;
		const arr = this.nodeArray;
		const c = this.uniforms[ this.prefix + 'View' ].value; // (the camera about the origin, as the nodes are)
		for ( let i = 0; i < n; i ++ ) {

			const s = arr[ i * 4 + 2 ];
			const dx = Math.max( arr[ i * 4 ] - c.x, 0, c.x - arr[ i * 4 ] - s );
			const dz = Math.max( arr[ i * 4 + 1 ] - c.z, 0, c.z - arr[ i * 4 + 1 ] - s );
			order[ i ] = { d: dx * dx + dz * dz, x: arr[ i * 4 ], z: arr[ i * 4 + 1 ], s, l: arr[ i * 4 + 3 ] };

		}

		order.sort( ( a, b ) => a.d - b.d );
		for ( let i = 0; i < n; i ++ ) {

			const o = order[ i ];
			arr[ i * 4 ] = o.x; arr[ i * 4 + 1 ] = o.z; arr[ i * 4 + 2 ] = o.s; arr[ i * 4 + 3 ] = o.l;

		}

		this.geometry.instanceCount = this.count;
		this.nodeAttr.clearUpdateRanges();
		this.nodeAttr.addUpdateRange( 0, this.count * 4 );
		this.nodeAttr.needsUpdate = true;

	}

	// (M15) the origin moved on to the camera's step, and each LOD's lattice's offset from it
	_follow( cam ) {

		const s = this.follow, O = this.origin;
		const x = Math.round( cam.x / s ) * s, z = Math.round( cam.z / s ) * s;
		if ( x === O.x && z === O.z ) return;
		O.set( x, 0, z );
		this.uniforms[ this.prefix + 'At' ].value.set( x, z );
		const off = this.uniforms[ this.prefix + 'Origin' ].value;
		this._spacings.forEach( ( h, l ) => {

			const kx = Math.floor( x / h + 1e-9 ), kz = Math.floor( z / h + 1e-9 );
			off[ l ].set( x - kx * h, z - kz * h, parity( kx ), parity( kz ) );

		} );

	}

	_bounds( x, z, size ) {

		if ( this.heightBounds ) {

			const [ a, b ] = this.heightBounds( x, z, x + size, z + size );
			this._box.min.set( x, a, z );
			this._box.max.set( x + size, b, z + size );

		} else {

			this._box.min.set( x, this.minY, z );
			this._box.max.set( x + size, this.maxY, z + size );

		}

		return this._box;

	}

	_intersectsSphere( box, r ) {

		const c = this._cam;
		const dx = Math.max( box.min.x - c.x, 0, c.x - box.max.x );
		const dy = Math.max( box.min.y - c.y, 0, c.y - box.max.y );
		const dz = Math.max( box.min.z - c.z, 0, c.z - box.max.z );
		return dx * dx + dy * dy + dz * dz <= r * r;

	}

	_add( x, z, size, lod ) {

		if ( this.count >= this.maxInstances ) return;
		const o = this.count * 4;
		this.nodeArray[ o ] = x - this.origin.x;
		this.nodeArray[ o + 1 ] = z - this.origin.z;
		this.nodeArray[ o + 2 ] = size;
		this.nodeArray[ o + 3 ] = lod;
		this.count ++;
		this.lodCounts[ lod ] ++;

	}

	_select( x, z, size, lod ) {

		const box = this._bounds( x, z, size );
		if ( ! this._intersectsSphere( box, this.ranges[ lod ] ) ) return false;
		if ( ! this._frustum.intersectsBox( box ) || box.max.y < this.below ) return true;

		if ( lod === 0 || ! this._intersectsSphere( box, this.ranges[ lod - 1 ] ) ) {

			this._add( x, z, size, lod );
			return true;

		}

		const h = size * 0.5;
		const children = [ [ x, z ], [ x + h, z ], [ x, z + h ], [ x + h, z + h ] ];
		for ( const [ cx, cz ] of children ) {

			if ( ! this._select( cx, cz, h, lod - 1 ) ) {

				// quadrant outside the finer range: draw it at this node's LOD
				const b = this._bounds( cx, cz, h );
				if ( this._frustum.intersectsBox( b ) && b.max.y >= this.below ) this._add( cx, cz, h, lod );

			}

		}

		return true;

	}

}
