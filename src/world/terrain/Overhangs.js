import * as THREE from '../../engine/index.js';
import { hash2 } from './TerrainNoise.js';
import { CAVES, CAVE, tunnelAt } from './SeaCaves.js';
import { caveLightGrid, caveLightAttribute, caveWaterLight } from './CaveLight.js';

// (M14) Rock overhangs to shelter under on the shore: few of the scattered rocks overhang ground you can
// stand on (they sit sunk into it), so three are placed by hand, each its own, shaped after photographs
// of basalt shores:
//   ledge: a lava shelf of blocks at the foot of the slope at the bay's east end, its face undercut along
//     its length by the sea in a notch you can stand in, its crust overhanging (Malarrif, Snaefellsnes)
//   slab: a lava tumulus, a heap of big blocks in the scrub above the bay's west end, a low cave cut
//     into its front, its mouth an arch of the blocks (a rock shelter in the Oregon Badlands)
//   stack: a crag of blocks standing in the shallows off the west arm, notched all round at the waterline
//     and cut into on one side in an arched cave you can wade into (Akun Island's sea cave; El Tunco)
// Each is a signed distance (negative in the rock) in its own frame: a jumble of fractured blocks, each its
// own, fused, bent by a broad warp, then carved (its notch, hollow or cave, their roofs reckoned from the
// ground under them: a roof's underside keeps its height over the ground), and near its surface made
// basalt (its flows' layers, the joints they cooled into, broken back: basalt), meshed by surface nets on a
// grid (overhangMesh), creased where its faces meet sharply (creased), and shaded as the rocks are. What's worked out once a column is (column), and the
// weathering's fine detail only near the surface (DETAIL). Its colliders come from the same grid, column
// by column: what's in the way of someone standing there, not the roof over them (overhangColliders).
//   const o = buildOverhang( site, terrain, { cell } )   { geometry, matrix, x, y, z, radius, top, at }
//   overhangBuild( site, terrain, { cell } )   the same, a slice at a time: a generator that yields between
//     slices (a column of its grid sampled, a row of its cells meshed, a few hundred vertices creased or
//     shaded) and returns it
//   overhangColliders( o )   [ { center, half, rotY } ] (boxes about y)
//   standingRoom( o )   the ground under it with HEADROOM over it: { area, spots }
//   clears( o, x, z )   whether nothing grows at ( x, z ) (under it, in its mouth)

// the sites: where (the middle of its opening), the way it opens (unit, x z), its seed
export const OVERHANGS = [
	{ kind: 'ledge', x: 201.2, z: - 22, toward: [ - 1, 0 ], seed: 7 },
	{ kind: 'slab', x: - 195.2, z: - 24, toward: [ 1, 0 ], seed: 11 },
	{ kind: 'stack', x: - 166, z: 8, toward: [ 0.894, - 0.447 ], seed: 13 },
];

export const HEADROOM = 1.9; // m: room to stand under it
const STEP = 0.35, BODY = 1.75; // m: what of someone standing there the rock mustn't reach (the step they take up, their height)
const COLUMN = 0.35; // m: the colliders' columns
const DETAIL = 0.7; // m: the basalt's detail only this near the surface (it can't move it further)
const GROW = 0.25; // m: the blocks grown by about what the basalt's detail cuts back on the whole
// basalt: its flows' layers about this thick (m), each boundary up or down by up to 0.3 of it and wavering
// along it by up to WAVER (m); the columns its joints part each layer into, about this across (m)
const LAYER = 0.9, COLUMNS = 1.1, WAVER = 0.35;
// each flow stepped back by up to SETBACK (m); the groove weathered along each boundary (its rubbly crusts)
// up to GROOVE deep (m), GROOVE_H either side of it (m)
const SETBACK = 0.24, GROOVE = 0.22, GROOVE_H = 0.22;

// value noise on the integer lattice (-1..1) and its sum over octaves, as the rocks' (RockGeometry's
// noise3, fbm3), but with nothing made a call: the fields are sampled a few hundred thousand times
function lattice( i, j, k, s ) {

	let h = Math.imul( i, 374761393 ) + Math.imul( j, 668265263 ) + Math.imul( k, - 2048144777 ) + Math.imul( s, 1274126177 );
	h = Math.imul( h ^ ( h >>> 13 ), 1274126177 );
	h ^= h >>> 16;
	return ( h >>> 0 ) / 4294967296;

}

function noise3( x, y, z, s ) {

	const xi = Math.floor( x ), yi = Math.floor( y ), zi = Math.floor( z );
	const xf = x - xi, yf = y - yi, zf = z - zi;
	const u = xf * xf * ( 3 - 2 * xf ), v = yf * yf * ( 3 - 2 * yf ), w = zf * zf * ( 3 - 2 * zf );
	const a = lattice( xi, yi, zi, s ), b = lattice( xi + 1, yi, zi, s ), c = lattice( xi, yi + 1, zi, s ), d = lattice( xi + 1, yi + 1, zi, s );
	const e = lattice( xi, yi, zi + 1, s ), f = lattice( xi + 1, yi, zi + 1, s ), g = lattice( xi, yi + 1, zi + 1, s ), h = lattice( xi + 1, yi + 1, zi + 1, s );
	const x00 = a + ( b - a ) * u, x10 = c + ( d - c ) * u, x01 = e + ( f - e ) * u, x11 = g + ( h - g ) * u;
	const y0 = x00 + ( x10 - x00 ) * v, y1 = x01 + ( x11 - x01 ) * v;
	return ( y0 + ( y1 - y0 ) * w ) * 2 - 1;

}

function fbm3( x, y, z, oct, s ) {

	let a = 1, f = 1, sum = 0, n = 0;
	for ( let o = 0; o < oct; o ++ ) {

		sum += noise3( x * f, y * f, z * f, s + o * 7 ) * a;
		n += a;
		a *= 0.5;
		f *= 2.03;

	}

	return sum / n;

}

const smax = ( a, b, k ) => {

	const h = Math.max( k - Math.abs( a - b ), 0 ) / k;
	return Math.max( a, b ) + h * h * k * 0.25;

};

const smin = ( a, b, k ) => {

	const h = Math.max( k - Math.abs( a - b ), 0 ) / k;
	return Math.min( a, b ) - h * h * k * 0.25;

};

const sstep = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// a box's distance (centre c, half extents h), in x y z
const box = ( x, y, z, cx, cy, cz, hx, hy, hz ) => {

	const dx = Math.abs( x - cx ) - hx, dy = Math.abs( y - cy ) - hy, dz = Math.abs( z - cz ) - hz;
	return Math.min( Math.max( dx, dy, dz ), 0 ) + Math.hypot( Math.max( dx, 0 ), Math.max( dy, 0 ), Math.max( dz, 0 ) );

};

// ---- fractured blocks: each an ellipsoid cut by 8 to 12 planes about its middle (half to five sixths of
// the way out: angular), as the scattered rocks
// are made (RockGeometry), turned about y and tipped, each its own; a shape is a jumble of them fused, its
// lines bent by a broad warp (warped) so none runs straight, then carved
function block( s, k, cx, cy, cz, rx, ry, rz, yaw = 0, tipX = 0, tipZ = 0 ) {

	const e = new THREE.Matrix4().makeRotationFromEuler( new THREE.Euler( tipX, yaw, tipZ, 'YXZ' ) ).elements;
	const n = 8 + Math.floor( hash2( s, k, 10 ) * 5 ), planes = new Float64Array( n * 4 );
	for ( let i = 0; i < n; i ++ ) {

		const a = hash2( s, k * 37 + i, 11 ) * Math.PI * 2, y = ( hash2( s, k * 37 + i, 12 ) * 2 - 1 ) * 0.9, h = Math.sqrt( 1 - y * y );
		planes.set( [ Math.cos( a ) * h, y, Math.sin( a ) * h, 0.5 + hash2( s, k * 37 + i, 13 ) * 0.34 ], i * 4 );

	}

	const R = Math.max( rx, ry, rz );
	return { cx, cy, cz, rx, ry, rz, R, near: ( R + 0.8 ) ** 2, out: ( R + FAR ) ** 2, m: Math.min( rx, ry, rz ), e, planes };

}

// its distance at ( x, y, z ) (outside its bounding sphere, a bound on it; FAR at most)
const FAR = 3;
function blockAt( b, x, y, z ) {

	const dx = x - b.cx, dy = y - b.cy, dz = z - b.cz, d2 = dx * dx + dy * dy + dz * dz;
	if ( d2 > b.out ) return FAR;
	if ( d2 > b.near ) return Math.sqrt( d2 ) - b.R;
	const e = b.e, P = b.planes;
	const u = ( e[ 0 ] * dx + e[ 1 ] * dy + e[ 2 ] * dz ) / b.rx, v = ( e[ 4 ] * dx + e[ 5 ] * dy + e[ 6 ] * dz ) / b.ry, w = ( e[ 8 ] * dx + e[ 9 ] * dy + e[ 10 ] * dz ) / b.rz;
	let poly = - 1e9;
	for ( let i = 0; i < P.length; i += 4 ) poly = Math.max( poly, P[ i ] * u + P[ i + 1 ] * v + P[ i + 2 ] * w - P[ i + 3 ] );
	return smax( poly, Math.sqrt( u * u + v * v + w * w ) - 1, 0.03 ) * b.m;

}

// the blocks that may reach a column ( x, z ) (with the warp's reach, A m)
const nearColumn = ( blocks, x, z, A ) => blocks.filter( ( b ) => Math.hypot( x - b.cx, z - b.cz ) < b.R + 0.8 + A );

// the jumble's distance: the blocks fused (k m; those that may reach its column; grown by GROW, which the
// basalt's detail takes back) and its hollow cut out of
// them (hollow( x, y, z, a, warped ): negative in it; cut rounded, kc m); where it's near enough to the
// surface to matter, both in a space bent by the warp (A m, over 1/f m), so the hollow's edges bend with
// the rock, and the hollow's walls roughened: nothing of it a plane or a straight line
function carved( blocks, hollow, x, y, z, a, A, f, s, k = 0.3, kc = 0.45 ) {

	let u = FAR;
	for ( let i = 0; i < blocks.length; i ++ ) u = smin( u, blockAt( blocks[ i ], x, y, z ), k );
	const d = smax( u - GROW, - hollow( x, y, z, a, false ), kc );
	if ( Math.abs( d ) > A * 0.8 + 0.7 ) return d;
	const wx = x + noise3( x * f, y * f, z * f, s ) * A, wy = y + noise3( x * f + 5.2, y * f, z * f, s + 1 ) * A * 0.6, wz = z + noise3( x * f, y * f + 3.7, z * f, s + 2 ) * A;
	u = FAR;
	for ( let i = 0; i < blocks.length; i ++ ) u = smin( u, blockAt( blocks[ i ], wx, wy, wz ), k );
	return smax( u - GROW, - ( hollow( wx, wy, wz, a + wy - y, true ) + fbm3( x * 0.75, y * 0.75, z * 0.75, 2, s + 3 ) * 0.1 ), kc );

}

// ---- basalt, near its surface (as photographs of lava shores have it): the flows it's built of, in layers
// each its own thickness, each stepped back by its own amount, their boundaries wavering, ((M14) a groove
// weathered back along each, where the crusts are rubbly, so the flow's top under it is a ledge catching
// the light and the one over it a lip shading it: a rock shelter's in the Oregon Badlands);
// the joints it cooled into, parting each layer into columns (in plan, a crack where two of a layer's cells
// meet, the cells its own in each layer); each column's face broken back by its own amount; and pitted.
// All of it cuts into the rock, none builds it out, so no roof comes lower than it was cut
const bound = ( k, s ) => ( k + ( hash2( k, 1, s ) - 0.5 ) * 0.6 ) * LAYER;
const _layer = [ 0, 0, 0 ], _joint = [ 0, 0 ];
// (the flow at height yy: its index, its foot and its top)
function layerAt( yy, s ) {

	const k = Math.floor( yy / LAYER );
	let li = k, lo = bound( k, s ), hi = bound( k + 1, s );
	if ( yy < lo ) {

		li = k - 1;
		hi = lo;
		lo = bound( k - 1, s );

	} else if ( yy >= hi ) {

		li = k + 1;
		lo = hi;
		hi = bound( k + 2, s );

	}

	_layer[ 0 ] = li;
	_layer[ 1 ] = lo;
	_layer[ 2 ] = hi;

}

// the height ( x, y, z ) is in the flows (wavering along them)
const flowY = ( x, y, z, s ) => y + noise3( x * 0.18, 0.5, z * 0.18, s ) * WAVER;

function jointAt( x, z, li, s ) {

	const gx = x / COLUMNS, gz = z / COLUMNS, ix = Math.floor( gx ), iz = Math.floor( gz );
	let f1 = 9, f2 = 9, id = 0;
	for ( let dz = - 1; dz <= 1; dz ++ ) for ( let dx = - 1; dx <= 1; dx ++ ) {

		const cx = ix + dx, cz = iz + dz;
		const px = cx + 0.15 + hash2( cx * 7 + li, cz, s ) * 0.7, pz = cz + 0.15 + hash2( cx, cz * 7 + li, s + 1 ) * 0.7;
		const d = Math.hypot( gx - px, gz - pz );
		if ( d < f1 ) {

			f2 = f1;
			f1 = d;
			id = hash2( cx + li * 31, cz, s + 2 );

		} else if ( d < f2 ) f2 = d;

	}

	_joint[ 0 ] = ( f2 - f1 ) * COLUMNS * 0.5;
	_joint[ 1 ] = id;

}

let detailed = true; // (buildOverhang's: none of it on a grid too coarse to show it)
function basalt( d, x, y, z, s ) {

	if ( ! detailed || Math.abs( d ) > DETAIL ) return d;
	const yy = flowY( x, y, z, s );
	layerAt( yy, s );
	const li = _layer[ 0 ], edge = Math.min( yy - _layer[ 1 ], _layer[ 2 ] - yy ) / GROOVE_H;
	jointAt( x, z, li, s + 3 );
	const crack = _joint[ 0 ], column = _joint[ 1 ];
	// (a groove's depth wanders along it; where a joint's crack meets it, the deeper of the two)
	const groove = edge < 1 ? ( 1 - edge * edge ) ** 2 * GROOVE * ( 0.6 + 0.4 * noise3( x * 0.5, li * 3.1, z * 0.5, s + 8 ) ) : 0;
	const cut = hash2( li, 5, s + 4 ) * SETBACK + column * 0.1 + Math.max( 0.25 * Math.max( 0, 1 - crack / 0.18 ), groove );
	return d + cut + fbm3( x * 0.9, y * 0.9, z * 0.9, 2, s + 5 ) * 0.05 + Math.abs( noise3( x * 2.4, y * 2.4, z * 2.4, s + 6 ) ) * 0.05;

}

// ---- the shapes: each built from its seed and the ground in its frame (x along its opening, z out of
// it, y up from where it's reckoned from: the ground at its opening, or the sea); its field ( x, y, z, a,
// what's the column's ), a the height over the ground there; the bounds of its grid; what's kept clear;
// its basalt's seed (the one its field's made basalt with)

function ledge( s, ground ) {

	// a shelf of blocks along the foot of the slope: a front row of them, uneven in height and in how far
	// each stands out, a bigger row behind going into the hill, and a few fallen at its ends
	let n = 0;
	const r = () => hash2( s, n ++, 77 );
	const blocks = [];
	for ( let x = - 7.2; x < 7.4; ) {

		const step = 1.5 + r() * 1.2, cx = x + step / 2;
		blocks.push( block( s, blocks.length, cx, 1.3 + r() * 0.7, - 0.55 - r() * 0.55, step * 0.68 + r() * 0.3, 2.6 + r() * 0.7, 2.2 + r() * 0.8, ( r() - 0.5 ) * 0.5, ( r() - 0.5 ) * 0.25, ( r() - 0.5 ) * 0.25 ) );
		x += step;

	}

	for ( let x = - 6.5; x < 7; ) {

		const step = 2.4 + r() * 1.2;
		blocks.push( block( s, blocks.length, x + step / 2, ground( x, - 4 ) + 0.4 + r() * 0.6, - 3.8 - r() * 0.8, 1.9 + r() * 0.5, 2.3 + r() * 0.5, 2.1 + r() * 0.5, ( r() - 0.5 ) * 0.6, ( r() - 0.5 ) * 0.3, ( r() - 0.5 ) * 0.3 ) );
		x += step;

	}

	for ( const side of [ - 1, 1 ] ) for ( let k = 0; k < 2; k ++ ) {

		const x = side * ( 7.6 + r() * 1.4 ), z = - 0.6 - r() * 2.2;
		blocks.push( block( s, blocks.length, x, ground( x, z ) + 0.2 + r() * 0.3, z, 0.7 + r() * 0.6, 0.6 + r() * 0.5, 0.7 + r() * 0.6, r() * 6.3, ( r() - 0.5 ) * 0.8, ( r() - 0.5 ) * 0.8 ) );

	}

	// the notch: its ends (abrupt, as where a joint stopped the sea) and how deep it goes along it, uneven;
	// its roof over the ground
	const x0 = - 6.0 + r() * 0.8, x1 = 5.0 + r() * 0.8;
	const deepAt = ( x ) => 5.0 * sstep( x0, x0 + 0.7, x ) * sstep( x1, x1 - 0.7, x ) * ( 1 + fbm3( x * 0.4, 5.5, 0, 1, s + 5 ) * 0.2 );
	const roofAt = ( x, z ) => 2.45 + fbm3( x * 0.35, 0.3, z * 0.5, 2, s + 4 ) * 0.35;
	return {
		bounds: [ [ - 10.4, - 2.6, - 7.2 ], [ 10.4, 5.4, 2.6 ] ],
		basalt: s + 7,
		clear: [ - 3.2, 3.5 ], // (z: under it and out of its mouth; its top, back in the hill, as the hill is)
		column( x, z ) {

			return [ nearColumn( blocks, x, z, 0.55 ), roofAt( x, z ), deepAt( x ) ];

		},
		f( x, y, z, a, col ) {

			// the notch: from the ground up to its roof (rising and falling over a metre or two, along it and in),
			// deepest low down, its back curving up into its roof, wandering; where it's shallow it doesn't reach
			// the blocks at all
			const hollow = ( x, y, z, a, bent ) => {

				const roof = bent ? roofAt( x, z ) : col[ 1 ], deep = bent ? deepAt( x ) : col[ 2 ];
				const back = 2.6 - deep * ( 1 - ( Math.max( 0, a - 0.85 ) / ( roof - 0.4 ) ) ** 2 ) + fbm3( x * 0.5, a * 0.6, 0, 2, s + 6 ) * 0.35;
				return smax( a - roof, back - z, 0.5 );

			};
			return basalt( carved( col[ 0 ], hollow, x, y, z, a, 0.35, 0.28, s + 20, 0.3, 0.4 ), x, y, z, s + 7 );

		},
	};

}

function slab( s, ground ) {

	// a lava tumulus: a heap of big blocks, a massive one at its heart and others shouldered against it and
	// tipped across its top, more heaped about its flanks; and in its front a cave, a low vault you can
	// stand in, its mouth an arch of the blocks, ragged
	let n = 0;
	const r = () => hash2( s, n ++, 77 );
	const g = ( x, z ) => ground( x, z );
	const roofAt = ( x, z ) => 2.5 + fbm3( x * 0.5, 0.2, z * 0.5, 2, s + 3 ) * 0.25;
	const blocks = [];
	const add = ( cx, cz, rx, ry, rz, up, tip = 0.5 ) => blocks.push( block( s, blocks.length, cx, g( cx, cz ) + up, cz, rx, ry, rz, r() * 6.3, ( r() - 0.5 ) * tip, ( r() - 0.5 ) * tip ) );
	add( 0.1, - 1.6, 4.1, 3.1, 3.5, 1.3, 0.2 );
	add( - 2.8, 0.1, 2.2, 2.4, 2.1, 1.2 );
	add( 2.9, - 0.3, 2.1, 2.3, 2.0, 1.1 );
	add( 0.3, 1.0, 2.6, 1.3, 1.6, 2.95, 0.3 );
	add( - 0.9, - 1.0, 1.9, 1.2, 1.8, 3.5 );
	add( 1.3, - 2.4, 1.7, 1.1, 1.6, 3.3 );
	for ( const [ R0, up, size ] of [ [ 4.4, 0.9, 1.4 ], [ 5.5, 0.3, 1.0 ] ] ) for ( let k = 0; k < 11; k ++ ) {

		const t = ( k / 11 + r() * 0.06 ) * Math.PI * 2, cx = Math.sin( t ) * ( R0 + r() * 0.6 ), cz = - 1.0 - Math.cos( t ) * ( R0 * 0.9 + r() * 0.6 );
		if ( cz > 0.8 && Math.abs( cx ) < 3.0 ) continue; // (not across its mouth)
		add( cx, cz, size * ( 0.8 + r() * 0.5 ), size * ( 0.7 + r() * 0.5 ), size * ( 0.8 + r() * 0.5 ), up * ( 0.6 + r() * 0.6 ) );

	}

	return {
		bounds: [ [ - 7.8, - 2.4, - 7.8 ], [ 7.8, 6.0, 4.6 ] ],
		basalt: s + 7,
		clear: [ - 7.8, 4.6 ],
		column( x, z ) {

			return [ nearColumn( blocks, x, z, 0.45 ), roofAt( x, z ) ];

		},
		f( x, y, z, a, col ) {

			// the cave: a vault, its sides and back ragged and curving up into its roof, so its mouth is an arch
			const hollow = ( x, y, z, a, bent ) => {

				const side = 2.35 + fbm3( 1.1, a * 0.6, z * 0.6, 2, s + 4 ) * 0.35, back = - 2.6 + fbm3( x * 0.6, a * 0.6, 2.2, 2, s + 5 ) * 0.4;
				return smax( smax( Math.abs( x - 0.1 ) - side, back - z, 1.0 ), a - ( bent ? roofAt( x, z ) : col[ 1 ] ), 1.1 );

			};
			return basalt( carved( col[ 0 ], hollow, x, y, z, a, 0.3, 0.32, s + 20, 0.45, 0.45 ), x, y, z, s + 7 );

		},
	};

}

function stack( s ) {

	// a crag: a column, a second leaning on it, a shoulder, a cap tipped across its top, standing on a broad
	// foot under the water, rubble on it either side of the cave
	let n = 0;
	const r = () => hash2( s, n ++, 77 );
	const blocks = [
		block( s, 0, 0.2, 2.2, - 0.2, 2.5, 3.6, 2.3, r() * 6.3, 0.06, - 0.05 ),
		block( s, 1, - 1.8, 1.6, - 0.9, 1.6, 2.9, 1.5, r() * 6.3, - 0.1, 0.22 ),
		block( s, 2, 1.8, 2.9, - 1.0, 1.3, 1.7, 1.4, r() * 6.3, 0.15, - 0.2 ),
		block( s, 3, - 0.3, 3.9, 0.0, 1.8, 1.25, 1.6, r() * 6.3, 0.25, 0.1 ),
		block( s, 4, 0.1, - 0.3, - 0.5, 3.6, 1.6, 3.1, r() * 6.3, 0.05, 0.08 ),
		block( s, 5, 2.5, 0.9, 0.2, 1.4, 1.3, 1.3, r() * 6.3, 0.3, 0.2 ),
		block( s, 6, - 2.6, 0.8, 0.1, 1.5, 1.2, 1.3, r() * 6.3, - 0.2, 0.3 ),
	];
	return {
		bounds: [ [ - 4.8, - 1.6, - 4.0 ], [ 4.8, 6.2, 4.0 ] ],
		basalt: s + 4,
		clear: [ - 4.0, 4.5 ],
		column( x, z ) {

			return [ nearColumn( blocks, x, z, 0.35 ) ];

		},
		f( x, y, z, a, [ near ] ) {

			// the cave: an arch from the seabed, its crown about 2 m over the sea, its sides wandering, its back
			// curving in
			const hollow = ( x, y, z ) => {

				const yb = - 0.6, W = 1.8 + fbm3( 0, y * 0.5, z * 0.5, 2, s + 1 ) * 0.3, Hc = 2.65 + fbm3( x * 0.6, 0, z * 0.6, 1, s + 5 ) * 0.25;
				const arch = Math.hypot( ( x + fbm3( 0, y * 0.4, z * 0.4, 1, s + 2 ) * 0.35 ) / W, Math.max( 0, y - yb ) / Hc ) - 1;
				const back = - 0.5 + fbm3( x * 0.7, y * 0.7, 0, 2, s + 6 ) * 0.35 - 0.3 * ( 1 - Math.min( 1, Math.abs( x ) / W ) );
				return smax( arch * 1.3, back - z, 0.5 );

			};
			let d = carved( near, hollow, x, y, z, a, 0.25, 0.35, s + 20, 0.4, 0.35 );
			// the notch all round at the waterline (bitten in by the sea and what lives in it)
			d += 0.25 * sstep( - 0.5, 0, y ) * sstep( 0.9, 0.4, y );
			return basalt( d, x, y, z, s + 4 );

		},
	};

}

// (M15) a sea cave (terrain/SeaCaves.js, its plan: the ground's cut its floor in, the gully, the inlet and the
// cave): the inlet's walls, near sheer, splaying a little to the sea and upward; at its head the cave, cut into
// the rock under the slope: a cleft (tall and narrow, widest low down, closing to a crack, its walls bulging and
// pinching) running in, lower and narrower, to the beach at its back; and over the slot the floor's cut leaves,
// the rock up to the slope's own surface (as the ground either side of the cut has it), a little proud of it
// over the cut and under it past the cut's edges. In its frame x is the plan's -x (the overhangs' frame turns
// the other way)
function seacave( s, ground, site ) {

	const c = site.cave, M = - c.inset, B = M - c.depth;
	const T = ( z ) => tunnelAt( c, Math.min( 0.5, z ) );
	// (the slope's own height over a column the floor's cut: from the ground either side of the cut)
	const orig = ( x, z ) => {

		const t = T( z ), xc = - t.wander, hc = t.half + CAVE.margin + 1.4;
		if ( Math.abs( x - xc ) >= hc ) return ground( x, z );
		const a = ground( xc - hc, z ), b = ground( xc + hc, z ), u = ( x - xc + hc ) / ( 2 * hc );
		return a + ( b - a ) * u;

	};
	let top = 0;
	for ( let z = B - 5; z <= 1; z += 1.5 ) for ( let x = - 11; x <= 11; x += 1.5 ) top = Math.max( top, orig( x, z ) );
	return {
		bounds: [ [ - 11.5, - 3.6, B - 5 ], [ 11.5, top + 1.5, 1.5 ] ],
		basalt: s + 7,
		clear: [ B - 5, 1.5 ],
		// (nothing grows over the cut, nor in the inlet: a strip of bare rock up the slope over it)
		clearHalf: 8.5,
		column( x, z ) {

			// the rock's top: the slope's, a little proud of it over the cut, under it past the cut's edges and
			// its inland end
			// (its edges ragged: out past the cut here and there, each side its own)
			const t = T( z ), xc = - t.wander, e = t.half + CAVE.margin + 0.5 + 1.6 * Math.max( 0, noise3( x > xc ? 3.1 : - 3.1, 0.7, z * 0.16, s + 11 ) + 0.25 );
			const past = Math.max( sstep( e, e + 1.5, Math.abs( x - xc ) ), sstep( B - 1, B - 2.5, z ) );
			return [ orig( x, z ) + 0.2 - past * 0.9, t, xc ];

		},
		f( x, y, z, a, col ) {

			const [ roof, t, xc ] = col;
			const A = 0.4, fr = 0.22;
			const wx = x + noise3( x * fr, y * fr, z * fr, s ) * A, wy = y + noise3( x * fr + 5.2, y * fr, z * fr, s + 1 ) * A * 0.6, wz = z + noise3( x * fr, y * fr + 3.7, z * fr, s + 2 ) * A;
			const rock = Math.max( wy - roof - 0.15 * noise3( x * 0.4, 0.5, z * 0.4, s + 4 ), wz - 0.6 );
			const across = Math.abs( wx - xc ), wall = 0.16 * noise3( 0.3, y * 0.5, z * 0.3, s + 6 );
			// the inlet: from the waterline in to the cave's mouth, open to the sky
			const hwN = t.half * ( 1 + 0.3 * sstep( M, 0, z ) ) * ( 1 + 0.03 * Math.max( 0, wy ) ) * ( 1 + wall );
			const inlet = Math.max( across - hwN, M + 0.5 * noise3( x * 0.3, y * 0.3, 0.5, s + 8 ) - wz );
			// the cave: from below the floor (the ground's the floor) to its top, widest low down, closing to a
			// crack; its back rounded off
			const tp = Math.min( t.top, 1e3 ), yb = t.floor - 1.4, u = Math.min( 1, Math.max( 0, ( wy - yb ) / ( tp - yb ) ) );
			const hw = t.half * Math.pow( Math.max( 0, 1 - u * u ), 0.55 ) * ( 1 + wall );
			const cave = Math.max( across - hw, wy - tp, B + 0.8 * noise3( x * 0.4, y * 0.4, 0.5, s + 7 ) - wz, wz - M - 0.5 );
			// (the basalt's flows and joints in its walls; its top, the slope's, only roughened, as the ground
			// about it: its flows' steps read as brickwork up the slope)
			const hollow = Math.min( inlet, cave ), d = smax( rock, - hollow, 0.4 ), walls = sstep( 3.5, 1.5, hollow );
			if ( walls <= 0 ) return d + fbm3( x * 0.6, y * 0.6, z * 0.6, 2, s + 9 ) * 0.12;
			return d + ( basalt( d, x, y, z, s + 7 ) - d ) * walls + fbm3( x * 0.6, y * 0.6, z * 0.6, 2, s + 9 ) * 0.12 * ( 1 - walls );

		},
	};

}

const KINDS = { ledge, slab, stack, seacave };

// (M15) the sea caves as overhang sites (terrain/SeaCaves.js' plan): each its own (its frame turned to its
// mouth, the sea's height), on a grid a little coarser than the shelters' (cellK: a far bigger rock; still
// fine enough on the low tier for the basalt's detail)
export const SEA_CAVE_SITES = CAVES.map( ( c, k ) => ( { kind: 'seacave', x: c.x, z: c.z, toward: c.out, seed: 17 + k * 6, cave: c, cellK: 1.3 } ) );

// a grid's value at ( fx, fy, fz ) in its cells (n: its points along x y z), trilinear
function trilinear( F, n, fx, fy, fz ) {

	const [ nx, ny, nz ] = n;
	const i = Math.min( nx - 2, Math.max( 0, Math.floor( fx ) ) ), j = Math.min( ny - 2, Math.max( 0, Math.floor( fy ) ) ), k = Math.min( nz - 2, Math.max( 0, Math.floor( fz ) ) );
	const u = fx - i, w = fy - j, t = fz - k;
	const at = ( a, b, c ) => F[ a + nx * ( b + ny * c ) ];
	const l = ( a, b, f ) => a + ( b - a ) * f;
	return l( l( l( at( i, j, k ), at( i + 1, j, k ), u ), l( at( i, j + 1, k ), at( i + 1, j + 1, k ), u ), w ), l( l( at( i, j, k + 1 ), at( i + 1, j, k + 1 ), u ), l( at( i, j + 1, k + 1 ), at( i + 1, j + 1, k + 1 ), u ), w ), t );

}

// ---- the faces of the mesh meeting at more than CREASE (radians) meet at a crease, as broken rock does:
// the vertex there is split, each side's faces smoothed among themselves, its normal theirs (area-weighted);
// faces meeting more gently are smoothed together
const CREASE = 0.6;
function* creased( pos, idx, angle ) {

	const nv = pos.length / 3, nt = idx.length / 3, fn = new Float32Array( nt * 3 );
	for ( let t = 0; t < nt; t ++ ) {

		if ( t % 4000 === 3999 ) yield;
		const a = idx[ t * 3 ] * 3, b = idx[ t * 3 + 1 ] * 3, c = idx[ t * 3 + 2 ] * 3;
		const ux = pos[ b ] - pos[ a ], uy = pos[ b + 1 ] - pos[ a + 1 ], uz = pos[ b + 2 ] - pos[ a + 2 ];
		const vx = pos[ c ] - pos[ a ], vy = pos[ c + 1 ] - pos[ a + 1 ], vz = pos[ c + 2 ] - pos[ a + 2 ];
		fn[ t * 3 ] = uy * vz - uz * vy;
		fn[ t * 3 + 1 ] = uz * vx - ux * vz;
		fn[ t * 3 + 2 ] = ux * vy - uy * vx;

	}

	// the faces about each vertex
	const start = new Int32Array( nv + 1 );
	for ( const v of idx ) start[ v + 1 ] ++;
	for ( let v = 0; v < nv; v ++ ) start[ v + 1 ] += start[ v ];
	const fill = start.slice( 0, nv ), around = new Int32Array( idx.length );
	for ( let k = 0; k < idx.length; k ++ ) around[ fill[ idx[ k ] ] ++ ] = k;
	// each vertex's faces in groups of those within the angle of the group's normal: a vertex out for each
	const cos = Math.cos( angle ), P = [], N = [], out = new Uint32Array( idx.length );
	const unit = ( t ) => {

		const x = fn[ t * 3 ], y = fn[ t * 3 + 1 ], z = fn[ t * 3 + 2 ], l = Math.hypot( x, y, z ) || 1;
		return [ x / l, y / l, z / l ];

	};
	for ( let v = 0; v < nv; v ++ ) {

		if ( v % 100 === 99 ) yield;
		const groups = [];
		for ( let i = start[ v ]; i < start[ v + 1 ]; i ++ ) {

			const corner = around[ i ], t = Math.floor( corner / 3 ), [ x, y, z ] = unit( t );
			let gr = null;
			for ( const q of groups ) {

				const l = Math.hypot( q.x, q.y, q.z ) || 1;
				if ( ( q.x * x + q.y * y + q.z * z ) / l > cos ) {

					gr = q;
					break;

				}

			}

			if ( ! gr ) groups.push( gr = { x: 0, y: 0, z: 0, corners: [] } );
			gr.x += fn[ t * 3 ];
			gr.y += fn[ t * 3 + 1 ];
			gr.z += fn[ t * 3 + 2 ];
			gr.corners.push( corner );

		}

		for ( const q of groups ) {

			const id = P.length / 3, l = Math.hypot( q.x, q.y, q.z ) || 1;
			P.push( pos[ v * 3 ], pos[ v * 3 + 1 ], pos[ v * 3 + 2 ] );
			N.push( q.x / l, q.y / l, q.z / l );
			for ( const corner of q.corners ) out[ corner ] = id;

		}

	}

	const g = new THREE.BufferGeometry();
	g.setAttribute( 'position', new THREE.BufferAttribute( new Float32Array( P ), 3 ) );
	g.setAttribute( 'normal', new THREE.BufferAttribute( new Float32Array( N ), 3 ) );
	g.setIndex( new THREE.BufferAttribute( out, 1 ) );
	return g;

}

// ---- the mesh: surface nets over the field sampled on a grid (cell m), its outer layer outside so the
// surface closes; the cavity term in the ao attribute (as the rocks' geometry has it: 0.35 shut in .. 1 open).
// A row of cells at a time (overhangBuild's slices)
const EDGES = [ [ 0, 1 ], [ 2, 3 ], [ 4, 5 ], [ 6, 7 ], [ 0, 2 ], [ 1, 3 ], [ 4, 6 ], [ 5, 7 ], [ 0, 4 ], [ 1, 5 ], [ 2, 6 ], [ 3, 7 ] ];
const SPECK = 48;
function* overhangMesh( F, o, n, c ) {

	const [ nx, ny, nz ] = n, NX = nx - 1, NY = ny - 1;
	const at = ( i, j, k ) => F[ i + nx * ( j + ny * k ) ];
	const cell = new Int32Array( ( nx - 1 ) * ( ny - 1 ) * ( nz - 1 ) ).fill( - 1 );
	const pos = [];
	const v = new Float32Array( 8 );
	for ( let k = 0; k < nz - 1; k ++ ) for ( let j = 0; j < ny - 1; j ++ ) for ( let i = 0; i < nx - 1; i ++ ) {

		if ( i === 0 ) yield;
		let mask = 0;
		for ( let q = 0; q < 8; q ++ ) {

			v[ q ] = at( i + ( q & 1 ), j + ( ( q >> 1 ) & 1 ), k + ( q >> 2 ) );
			if ( v[ q ] < 0 ) mask |= 1 << q;

		}

		if ( mask === 0 || mask === 255 ) continue;
		let px = 0, py = 0, pz = 0, m = 0;
		for ( const [ a, b ] of EDGES ) {

			if ( ( v[ a ] < 0 ) === ( v[ b ] < 0 ) ) continue;
			const t = v[ a ] / ( v[ a ] - v[ b ] );
			px += ( a & 1 ) + ( ( b & 1 ) - ( a & 1 ) ) * t;
			py += ( ( a >> 1 ) & 1 ) + ( ( ( b >> 1 ) & 1 ) - ( ( a >> 1 ) & 1 ) ) * t;
			pz += ( a >> 2 ) + ( ( b >> 2 ) - ( a >> 2 ) ) * t;
			m ++;

		}

		cell[ i + NX * ( j + NY * k ) ] = pos.length / 3;
		pos.push( o[ 0 ] + ( i + px / m ) * c, o[ 1 ] + ( j + py / m ) * c, o[ 2 ] + ( k + pz / m ) * c );

	}

	// a quad about each grid edge the surface crosses, facing out of the rock
	const idx = [];
	const C = ( i, j, k ) => cell[ i + NX * ( j + NY * k ) ];
	const quad = ( a, b, cc, d, flip ) => {

		if ( a < 0 || b < 0 || cc < 0 || d < 0 ) return;
		if ( flip ) idx.push( a, cc, b, a, d, cc );
		else idx.push( a, b, cc, a, cc, d );

	};
	for ( let k = 1; k < nz - 1; k ++ ) for ( let j = 1; j < ny - 1; j ++ ) for ( let i = 0; i < nx - 1; i ++ ) {

		if ( i === 0 && j % 8 === 1 ) yield;
		const a = at( i, j, k ) < 0, b = at( i + 1, j, k ) < 0;
		if ( a !== b ) quad( C( i, j - 1, k - 1 ), C( i, j, k - 1 ), C( i, j, k ), C( i, j - 1, k ), b );

	}

	for ( let k = 1; k < nz - 1; k ++ ) for ( let j = 0; j < ny - 1; j ++ ) for ( let i = 1; i < nx - 1; i ++ ) {

		if ( i === 1 && j % 8 === 0 ) yield;
		const a = at( i, j, k ) < 0, b = at( i, j + 1, k ) < 0;
		if ( a !== b ) quad( C( i - 1, j, k - 1 ), C( i - 1, j, k ), C( i, j, k ), C( i, j, k - 1 ), b );

	}

	for ( let k = 0; k < nz - 1; k ++ ) for ( let j = 1; j < ny - 1; j ++ ) for ( let i = 1; i < nx - 1; i ++ ) {

		if ( i === 1 && j % 8 === 1 ) yield;
		const a = at( i, j, k ) < 0, b = at( i, j, k + 1 ) < 0;
		if ( a !== b ) quad( C( i - 1, j - 1, k ), C( i, j - 1, k ), C( i, j, k ), C( i - 1, j, k ), b );

	}

	// (pieces of it of fewer than SPECK triangles left out: the grid's specks, in the rock or by it)
	const parent = new Int32Array( pos.length / 3 ).map( ( _, i ) => i );
	const root = ( a ) => {

		while ( parent[ a ] !== a ) a = parent[ a ] = parent[ parent[ a ] ];
		return a;

	};
	for ( let t = 0; t < idx.length; t += 3 ) {

		const a = root( idx[ t ] );
		parent[ root( idx[ t + 1 ] ) ] = a;
		parent[ root( idx[ t + 2 ] ) ] = root( idx[ t + 1 ] );

	}

	yield;
	const tris = new Int32Array( parent.length );
	for ( let t = 0; t < idx.length; t += 3 ) tris[ root( idx[ t ] ) ] ++;
	const kept = idx.filter( ( v, k ) => tris[ root( idx[ k - k % 3 ] ) ] >= SPECK );
	const g = yield* creased( pos, kept, CREASE );
	// the cavity: how far the field's risen a step out along the normal (as open as a flat face, or shut in)
	const P = g.attributes.position, Nn = g.attributes.normal, ao = new Float32Array( P.count );
	const sample = ( x, y, z ) => trilinear( F, n, Math.min( nx - 1, Math.max( 0, ( x - o[ 0 ] ) / c ) ), Math.min( ny - 1, Math.max( 0, ( y - o[ 1 ] ) / c ) ), Math.min( nz - 1, Math.max( 0, ( z - o[ 2 ] ) / c ) ) );
	for ( let q = 0; q < P.count; q ++ ) {

		if ( q % 300 === 299 ) yield;
		const r = 0.6;
		const f = sample( P.getX( q ) + Nn.getX( q ) * r, P.getY( q ) + Nn.getY( q ) * r, P.getZ( q ) + Nn.getZ( q ) * r ) / r;
		ao[ q ] = Math.max( 0.35, Math.min( 1, 0.3 + f * 0.75 ) );

	}

	g.setAttribute( 'ao', new THREE.BufferAttribute( ao, 1 ) );
	g.computeBoundingBox();
	g.computeBoundingSphere();
	return g;

}

// the overhang at a site: its frame (the ground at its opening, or the sea for the stack), its field there
// (frame coordinates in, the ground under each point looked up), its mesh at `cell` m; at once, or a slice
// at a time (overhangBuild)
export function buildOverhang( site, terrain, opts ) {

	const build = overhangBuild( site, terrain, opts );
	let r;
	while ( ! ( r = build.next() ).done );
	return r.value;

}

export function* overhangBuild( site, terrain, { cell = 0.2, light = null } = {} ) {

	cell *= site.cellK || 1;
	const yaw = Math.atan2( site.toward[ 0 ], site.toward[ 1 ] ), cs = Math.cos( yaw ), sn = Math.sin( yaw );
	const y0 = site.kind === 'stack' || site.kind === 'seacave' ? 0 : terrain.heightAt( site.x, site.z );
	const world = ( x, z ) => [ site.x + cs * x + sn * z, site.z - sn * x + cs * z ];
	const ground = ( x, z ) => {

		const [ wx, wz ] = world( x, z );
		return terrain.heightAt( wx, wz ) - y0;

	};
	const shape = KINDS[ site.kind ]( site.seed, ground, site );
	// sampled column by column (the ground and what's the column's looked up once): first on a grid three
	// times as coarse, then finely only where that's within two of its cells of the surface (further off,
	// the coarse grid's value will do: it's the sign that matters there)
	const [ lo, hi ] = shape.bounds;
	const sample = ( c ) => {

		const n = [ 0, 1, 2 ].map( ( a ) => Math.ceil( ( hi[ a ] - lo[ a ] ) / c ) + 1 );
		return { n, F: new Float32Array( n[ 0 ] * n[ 1 ] * n[ 2 ] ) };

	};
	const coarse = sample( cell * 3 ), { n, F } = sample( cell ), CC = cell * 3, near = cell * 6, fine = cell < 0.4;
	for ( const [ grid, c, rough ] of [ [ coarse, CC, null ], [ { n, F }, cell, coarse ] ] ) for ( let k = 0; k < grid.n[ 2 ]; k ++ ) for ( let i = 0; i < grid.n[ 0 ]; i ++ ) {

		// (a column a slice; another's build may have run between them)
		yield;
		detailed = fine;
		const x = lo[ 0 ] + i * c, z = lo[ 2 ] + k * c, g = ground( x, z ), col = shape.column( x, z );
		for ( let j = 0; j < grid.n[ 1 ]; j ++ ) {

			const y = lo[ 1 ] + j * c, edge = i === 0 || k === 0 || j === 0 || i === grid.n[ 0 ] - 1 || j === grid.n[ 1 ] - 1 || k === grid.n[ 2 ] - 1;
			let v = edge ? c : rough ? trilinear( rough.F, rough.n, ( x - lo[ 0 ] ) / CC, ( y - lo[ 1 ] ) / CC, ( z - lo[ 2 ] ) / CC ) : null;
			if ( ! edge && ( v === null || Math.abs( v ) < near ) ) v = shape.f( x, y, z, y - g, col );
			grid.F[ i + grid.n[ 0 ] * ( j + grid.n[ 1 ] * k ) ] = v;

		}

	}

	const geometry = yield* overhangMesh( F, lo, n, cell );
	// ((M14) each vertex's flow, for its shading: the flow's own tone (-1..1), and how near its top's crust
	// it is (0..1), where the lava cooled frothy and rusted)
	const P = geometry.attributes.position, flow = new Float32Array( P.count * 2 ), bs = shape.basalt;
	for ( let q = 0; q < P.count; q ++ ) {

		if ( q % 1000 === 999 ) yield;
		const yy = flowY( P.getX( q ), P.getY( q ), P.getZ( q ), bs );
		layerAt( yy, bs );
		flow[ q * 2 ] = hash2( _layer[ 0 ], 9, bs ) * 2 - 1;
		flow[ q * 2 + 1 ] = sstep( _layer[ 2 ] - 0.45, _layer[ 2 ] - 0.05, yy );

	}

	geometry.setAttribute( 'flow', new THREE.BufferAttribute( flow, 2 ) );
	const matrix = new THREE.Matrix4().makeRotationY( yaw ).setPosition( site.x, y0, site.z );
	const b = geometry.boundingSphere, c = b.center.clone().applyMatrix4( matrix );
	// the field as sampled, anywhere in its frame (trilinear; outside it, outside the rock)
	const at = ( x, y, z ) => {

		const fx = ( x - lo[ 0 ] ) / cell, fy = ( y - lo[ 1 ] ) / cell, fz = ( z - lo[ 2 ] ) / cell;
		if ( fx < 0 || fy < 0 || fz < 0 || fx > n[ 0 ] - 1 || fy > n[ 1 ] - 1 || fz > n[ 2 ] - 1 ) return cell;
		return trilinear( F, n, fx, fy, fz );

	};
	const o = { site, geometry, matrix, yaw, y0, x: c.x, y: c.y, z: c.z, radius: b.radius, top: geometry.boundingBox.max.y + y0, at, ground, world, bounds: shape.bounds, clear: shape.clear, clearHalf: shape.clearHalf };
	// ((M15) a sea cave's light: what each place in it sees of the sky and the sunlit sea (CaveLight.js), worked
	// out once (its finer rock takes its coarser's), its rock's faces' and the sea's in it)
	if ( site.kind === 'seacave' ) {

		o.light = light || ( yield* caveLightGrid( o, shape.column ) );
		caveLightAttribute( geometry, o.light );
		o.waterLight = caveWaterLight( o.light );

	}

	return o;

}

// what's in the way of someone standing under it, column by column (COLUMN m): wherever the rock reaches
// between the step they take and their height over the ground there, a box from under the ground up to
// its top in that column; runs along its length merged. The roof over them isn't in the way. ((M15) A sea
// cave's: what's in the way of someone wading or swimming in it, or a boat (up to CAVE_REACH over the sea),
// its boxes no higher than that, so that over it, on its roof, nothing's in the way (Rocks.roofAt has them
// stand on it))
const CAVE_REACH = 2.0, CAVE_WALL = 3.5;
export function overhangColliders( o ) {

	const [ lo, hi ] = o.bounds, out = [], cave = o.site.kind === 'seacave';
	const nz = Math.ceil( ( hi[ 2 ] - lo[ 2 ] ) / COLUMN ), nx = Math.ceil( ( hi[ 0 ] - lo[ 0 ] ) / COLUMN );
	for ( let k = 0; k < nz; k ++ ) {

		let run = null;
		const flush = () => {

			if ( ! run ) return;
			const cx = ( run.x0 + run.x1 ) / 2, cz = lo[ 2 ] + ( k + 0.5 ) * COLUMN;
			const [ wx, wz ] = o.world( cx, cz );
			const bottom = run.bottom + o.y0 - 0.6, top = cave ? Math.min( run.top, CAVE_WALL ) + o.y0 : run.top + o.y0;
			out.push( { center: new THREE.Vector3( wx, ( bottom + top ) / 2, wz ), half: new THREE.Vector3( ( run.x1 - run.x0 ) / 2, ( top - bottom ) / 2, COLUMN / 2 ), rotY: o.yaw } );
			run = null;

		};
		for ( let i = 0; i < nx; i ++ ) {

			const x = lo[ 0 ] + ( i + 0.5 ) * COLUMN, z = lo[ 2 ] + ( k + 0.5 ) * COLUMN, g = o.ground( x, z );
			let blocks = false;
			for ( let y = g + STEP, y1 = cave ? Math.max( g + BODY, CAVE_REACH ) : g + BODY; y <= y1; y += 0.12 ) if ( o.at( x, y, z ) < 0 ) {

				blocks = true;
				break;

			}

			if ( ! blocks ) {

				flush();
				continue;

			}

			let top = g + BODY;
			for ( let y = g + BODY, y1 = cave ? CAVE_WALL + 0.2 : hi[ 1 ]; y < y1; y += 0.15 ) if ( o.at( x, y, z ) < 0 ) top = y;
			if ( run && Math.abs( top - run.top ) < 0.5 ) {

				run.x1 = x + COLUMN / 2;
				run.top = Math.max( run.top, top );
				run.bottom = Math.min( run.bottom, g );

			} else {

				flush();
				run = { x0: x - COLUMN / 2, x1: x + COLUMN / 2, top, bottom: g };

			}

		}

		flush();

	}

	return out;

}

// (M15) a sea cave's roof, for walking on (the ground under it is cut to its floor): over each ROOF_STEP m
// column of it, the rock's top where it's over the cut ground (NaN elsewhere: the inlet's open, the ground
// itself past the cut). Looked up by caveRoofAt (world x z, the height or -Infinity)
const ROOF_STEP = 0.5;
export function caveRoof( o ) {

	const [ lo, hi ] = o.bounds, nx = Math.ceil( ( hi[ 0 ] - lo[ 0 ] ) / ROOF_STEP ) + 1, nz = Math.ceil( ( hi[ 2 ] - lo[ 2 ] ) / ROOF_STEP ) + 1;
	const H = new Float32Array( nx * nz ).fill( NaN );
	for ( let k = 0; k < nz; k ++ ) for ( let i = 0; i < nx; i ++ ) {

		const x = lo[ 0 ] + i * ROOF_STEP, z = lo[ 2 ] + k * ROOF_STEP, g = o.ground( x, z );
		// (down from over its top till the rock's met)
		let prev = o.at( x, hi[ 1 ], z );
		for ( let y = hi[ 1 ] - 0.15; y > g + 0.8; y -= 0.15 ) {

			const v = o.at( x, y, z );
			if ( v < 0 ) {

				H[ k * nx + i ] = y + 0.15 * v / ( v - prev ) + o.y0;
				break;

			}

			prev = v;

		}

	}

	return { H, nx, nz, lo: [ lo[ 0 ], lo[ 2 ] ] };

}

export function caveRoofAt( o, roof, x, z ) {

	const dx = x - o.site.x, dz = z - o.site.z, cs = Math.cos( o.yaw ), sn = Math.sin( o.yaw );
	const fx = ( cs * dx - sn * dz - roof.lo[ 0 ] ) / ROOF_STEP, fz = ( sn * dx + cs * dz - roof.lo[ 1 ] ) / ROOF_STEP;
	if ( fx < 0 || fz < 0 || fx > roof.nx - 1 || fz > roof.nz - 1 ) return - Infinity;
	const i = Math.min( roof.nx - 2, Math.floor( fx ) ), k = Math.min( roof.nz - 2, Math.floor( fz ) ), u = fx - i, v = fz - k, H = roof.H, n = roof.nx;
	const a = H[ k * n + i ], b = H[ k * n + i + 1 ], c = H[ ( k + 1 ) * n + i ], d = H[ ( k + 1 ) * n + i + 1 ];
	// (by its nearest corner where it's at its edge)
	if ( Number.isNaN( a + b + c + d ) ) {

		const h = H[ Math.round( fz ) * n + Math.round( fx ) ];
		return Number.isNaN( h ) ? - Infinity : h;

	}

	return ( a * ( 1 - u ) + b * u ) * ( 1 - v ) + ( c * ( 1 - u ) + d * u ) * v;

}

// the ground under it with HEADROOM over it and nothing in the way of standing there (a grid of `step` m):
// its area (m²) and the spots (world x z, the ground's height, the rock's underside over it)
export function standingRoom( o, step = 0.25 ) {

	const [ lo, hi ] = o.bounds, spots = [];
	for ( let z = lo[ 2 ] + step / 2; z < hi[ 2 ]; z += step ) for ( let x = lo[ 0 ] + step / 2; x < hi[ 0 ]; x += step ) {

		const g = o.ground( x, z );
		let clear = true;
		for ( let y = g + 0.05; y <= g + HEADROOM; y += 0.1 ) if ( o.at( x, y, z ) < 0 ) {

			clear = false;
			break;

		}

		if ( ! clear ) continue;
		let under = null;
		for ( let y = g + HEADROOM; y < hi[ 1 ]; y += 0.1 ) if ( o.at( x, y, z ) < 0 ) {

			under = y;
			break;

		}

		if ( under === null ) continue;
		const [ wx, wz ] = o.world( x, z );
		spots.push( { x: wx, z: wz, ground: g + o.y0, under: under + o.y0 } );

	}

	return { area: spots.length * step * step, spots };

}

// whether nothing grows at world ( x, z ): along it, under it and out of its mouth (its clear)
export function clears( o, x, z ) {

	const dx = x - o.site.x, dz = z - o.site.z, cs = Math.cos( o.yaw ), sn = Math.sin( o.yaw );
	const lx = cs * dx - sn * dz, lz = sn * dx + cs * dz;
	const h = o.clearHalf;
	return ( h ? Math.abs( lx ) < h : lx > o.bounds[ 0 ][ 0 ] && lx < o.bounds[ 1 ][ 0 ] ) && lz > o.clear[ 0 ] && lz < o.clear[ 1 ];

}
