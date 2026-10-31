import { Noise2D } from '../../util/Noise.js';

// (M15) The mangroves on the west: a stand of red mangrove on the shallow flat of the west's bight, in the lee
// of its northern headland, where the hills come down steep to the water. Its floor is mud a hand's depth
// under (the trees stand in the water on their prop roots), a band along the shore wider and narrower as it goes, its
// seaward edge lobed; a creek winds in through it from the open flat to a pool against the hillside, deep
// enough for a boat with care. TerrainData shapes the ground by it (its floor, the creek's bed, mud for
// sand), the vegetation stands the trees on it, and the bites fish it (the creek's water: Bites).
//
//   mangroveAt( x, z, out ) -> { stand, creek, fringe, floor, bed } (stand, creek, fringe: 0..1; floor, bed:
//   heights, m; fringe: the stand and the water a stone's throw off its edge, where its fish hunt)

export const MANGROVE = {
	// the shore it's along, north to south (x, z): where the bight's flat meets the hills
	shore: [ [ - 528, - 268 ], [ - 492, - 242 ], [ - 478, - 204 ], [ - 452, - 166 ], [ - 426, - 130 ], [ - 404, - 96 ] ],
	width: [ 46, 70 ], // m out from the shore, wandering
	ends: 24, // m: it thins out over this at either end of the shore
	floor: - 0.28, // m: its mud, under a hand's depth of water (none of it a waterline: no swash's foam)
	hummock: 0.07, // m: the mud's rise and fall
	// the creek, from the open flat to the pool (x, z), its half-width (m) and its bed (m)
	creek: [ [ - 528, - 118 ], [ - 506, - 128 ], [ - 488, - 124 ], [ - 472, - 138 ], [ - 478, - 158 ], [ - 470, - 176 ], [ - 482, - 192 ] ],
	half: [ 3.2, 5 ],
	bed: - 1.7,
	pool: { x: - 486, z: - 202, r: 13, bed: - 1.8 },
	window: [ - 640, - 290, - 370, - 70 ], // x0, z0, x1, z1: none of it outside
};

const noise = new Noise2D( 151 );
// (a polyline's corners rounded off: Catmull-Rom through its points, `n` to a leg)
function smoothLine( pts, n = 8 ) {

	const out = [], P = ( i ) => pts[ Math.max( 0, Math.min( pts.length - 1, i ) ) ];
	for ( let i = 0; i < pts.length - 1; i ++ ) for ( let k = 0; k < n; k ++ ) {

		const t = k / n, t2 = t * t, t3 = t2 * t, a = P( i - 1 ), b = P( i ), c = P( i + 1 ), d = P( i + 2 );
		out.push( [ 0, 1 ].map( ( q ) => 0.5 * ( 2 * b[ q ] + ( c[ q ] - a[ q ] ) * t + ( 2 * a[ q ] - 5 * b[ q ] + 4 * c[ q ] - d[ q ] ) * t2 + ( 3 * b[ q ] - a[ q ] - 3 * c[ q ] + d[ q ] ) * t3 ) ) );

	}

	out.push( pts[ pts.length - 1 ] );
	return out;

}

const CREEK = smoothLine( MANGROVE.creek ), SHORE = smoothLine( MANGROVE.shore, 4 );
const smoothstep = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// distance from ( x, z ) to a polyline, and how far along it (m) the nearest point is, and which side
// (+1: to its right, walking along it)
function along( pts, x, z ) {

	let best = Infinity, s = 0, at = 0, side = 1;
	for ( let i = 0; i < pts.length - 1; i ++ ) {

		const [ ax, az ] = pts[ i ], [ bx, bz ] = pts[ i + 1 ];
		const ex = bx - ax, ez = bz - az, L = Math.hypot( ex, ez );
		const t = Math.min( 1, Math.max( 0, ( ( x - ax ) * ex + ( z - az ) * ez ) / ( L * L ) ) );
		const d = Math.hypot( x - ax - ex * t, z - az - ez * t );
		if ( d < best ) {

			best = d;
			at = s + t * L;
			side = ( ex * ( z - az ) - ez * ( x - ax ) ) > 0 ? 1 : - 1;

		}

		s += L;

	}

	return [ best, at, side, s ];

}

const OUT = { stand: 0, creek: 0, fringe: 0, floor: 0, bed: 0 };
export function mangroveAt( x, z, out = OUT ) {

	const M = MANGROVE, [ x0, z0, x1, z1 ] = M.window;
	out.stand = 0; out.creek = 0; out.fringe = 0; out.floor = M.floor; out.bed = M.bed;
	if ( x < x0 || x > x1 || z < z0 || z > z1 ) return out;
	// (seaward of the shore: the bight's to the west of it, its left walking south along it)
	const [ d, s, side, len ] = along( SHORE, x, z );
	const seaward = side > 0 ? d : - d;
	const width = M.width[ 0 ] + ( M.width[ 1 ] - M.width[ 0 ] ) * ( noise.fbm( s / 70, 3.1, 3 ) * 0.5 + 0.5 );
	// (its seaward edge in lobes and bays, a few tens of m across, and ragged)
	const lobes = 16 * noise.fbm( s / 32, 7.7, 2 ) + 6 * noise.fbm( x / 9, z / 9, 2 );
	const ends = smoothstep( 0, M.ends, s + 8 * noise.fbm( x / 20, 5.5, 2 ) ) * smoothstep( len, len - M.ends, s );
	// (in to the shore itself: the ground's own waterline, wherever it is, keeps it off the land: TerrainData)
	out.stand = smoothstep( width + lobes + 5, width + lobes - 5, seaward ) * smoothstep( - 45, - 30, seaward ) * ends;
	out.fringe = smoothstep( width + lobes + 22, width + lobes, seaward ) * smoothstep( - 45, - 30, seaward ) * ends;
	out.floor = M.floor + M.hummock * noise.fbm( x / 6, z / 6, 3 );
	// the creek, and the pool at its head
	const [ dc0, sc ] = along( CREEK, x, z );
	const dc = dc0 + 1.2 * noise.fbm( x / 5, z / 5, 2 );
	const half = M.half[ 0 ] + ( M.half[ 1 ] - M.half[ 0 ] ) * ( noise.fbm( sc / 30, 1.9, 2 ) * 0.5 + 0.5 );
	const px = ( x - M.pool.x ) * 0.8, pz = ( z - M.pool.z ) * 1.15;
	const dp = Math.hypot( px, pz ) - M.pool.r * ( 1 + 0.3 * noise.fbm( x / 14, z / 14, 2 ) );
	out.creek = Math.max( smoothstep( half + 2.5, half - 1.5, dc ), smoothstep( 3, - 2, dp ) );
	out.bed = Math.min( M.bed + 0.3 * smoothstep( half * 0.3, half + 1.5, dc ), M.pool.bed + 0.4 * smoothstep( - 8, 2, dp ) );
	return out;

}
