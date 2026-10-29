import { zlibSync } from 'fflate';
import { Noise2D, smoothstep, clamp, lerp } from '../../util/Noise.js';
import { erosionNoise, softRamp } from './TerrainNoise.js';

// (M15) The seabed past the island's square, as it's made: a 32 m map of it over 32 km (64 m for
// low-powered devices), baked by tools/bake-terrain.mjs into public/world/offshore.bin and offshore-512.bin
// (seconds of work, too long on a phone) and read by Offshore.js. TerrainData reads it wherever its own
// 1 m map doesn't reach, and blends its square's edge into it (it faded to a flat 90 m before).
//
// A small volcanic island in the trades, after the Lesser Antilles' (Saba, Montserrat, St. Croix):
//   - the shelf: the island's own seabed (TerrainData's profile) going on out to its edge, the shelf break,
//     at 45 to 80 m; narrowest on the windward north, 1.3 km off, widest to the south-west, where it
//     reaches 3 km out toward the bank; its edge wandering, scalloped by the gullies' heads;
//   - the drop-off: steepest at the top (30 to 38 degrees, the windward side the steeper), easing as it
//     goes down to the deep's floor at about 1,800 m, cut by gullies down it;
//   - a ledge on the north: a terrace at about 210 m along the slope, 250 to 650 m wide, to deep-drop on;
//   - a canyon off the bay: its head cut into the shelf's edge 1.4 km south of the beach, a branch heading
//     further east, winding south 200 to 360 m deep into the slope to the deep;
//   - the hump: a seamount 6 km east-north-east, a ridge of three peaks rising from the deep, the
//     highest to 105 m;
//   - the bank: a reef-rimmed platform 10 km south-west, about 5.6 by 3.2 km, 6 m deep along its windward
//     rim and about 20 m over the middle, with walls to the deep all round; on its lee side a sandbar
//     1.4 km long, a channel through it, 0.4 m under at its crest (you can stand on it; the boat runs
//     aground).
// Placed by hand (SEABED) and roughened with noise of its own seed, so it's the same for everyone.
//
//   bakeSeabed( island, res )   -> Float32Array: the seabed's heights (m, y up) at the texel centres,
//                                  SEABED.size / res apart from - SEABED.size / 2 (island: a TerrainData)
//   encodeSeabed( heights, res, { sourceHash } ) -> the bake's bytes (format below)

// where the features are (world m, x east, z south; bearings from north, clockwise, about the island)
export const SEABED = {
	size: 32768, // the map, centred on the world's middle
	basin: 1800, // the deep's floor (m)
	centre: { x: 0, z: - 442 }, // the island's body, the bearings' centre
	shelf: { width: 1450, outer: 0.012 }, // to the break (m from the coast), and the outer shelf's slope
	slope: { length: 2700 }, // how far past the break it's two thirds of the way down (m, ±500 north/south)
	ledge: { from: - 35, to: 35, depth: 210, width: 450 }, // bearings (degrees), m
	// the canyon off the bay, and its branch from the east (their courses, head first; smoothed)
	canyon: [ [ 40, 1380 ], [ 90, 1800 ], [ 230, 2350 ], [ 170, 2900 ], [ 380, 3500 ], [ 700, 4200 ], [ 820, 5000 ], [ 1250, 5800 ], [ 1700, 6900 ], [ 1900, 8000 ], [ 2500, 9600 ], [ 2800, 11400 ] ],
	branch: [ [ 760, 1650 ], [ 830, 2100 ], [ 650, 2700 ], [ 420, 3300 ] ],
	// the hump's peaks: x, z, how deep its top, its top's radius (m)
	hump: [ [ 5200, - 3400, 105, 260 ], [ 5800, - 4050, 150, 220 ], [ 4550, - 2950, 195, 200 ] ],
	bank: { x: - 6200, z: 7400, a: 2800, b: 1600, top: 20, rim: 6 },
	sandbar: { lee: 900, half: 700, crest: 0.4 },
};

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const SQUARE = 1024; // the island's map's half size (WORLD.terrainSize / 2)
const BAND = [ 400, 1400 ]; // m outside the square: its own seabed's formula, then the offshore's (blended)
// the trades blow toward (Globals' windPrevailing): the bank's windward rim faces the other way
const LEE = ( () => {

	const x = 0.35, z = 0.94, l = Math.hypot( x, z );
	return { x: x / l, z: z / l };

} )();

// angle difference wrapped to [-pi, pi]
const wrap = ( a ) => a - TAU * Math.round( a / TAU );
const bump = ( th, at, width ) => Math.exp( - ( ( wrap( th - at * DEG ) / ( width * DEG ) ) ** 2 ) );
// smooth minimum (the shallower of two depths)
const smin = ( a, b, k ) => {

	const h = clamp( 0.5 + 0.5 * ( b - a ) / k, 0, 1 );
	return lerp( b, a, h ) - k * h * ( 1 - h );

};

// a course through control points, smoothed (Catmull-Rom) and sampled every `step` m
function course( pts, step = 40 ) {

	const out = [];
	for ( let i = 0; i < pts.length - 1; i ++ ) {

		const p0 = pts[ Math.max( 0, i - 1 ) ], p1 = pts[ i ], p2 = pts[ i + 1 ], p3 = pts[ Math.min( pts.length - 1, i + 2 ) ];
		const n = Math.max( 1, Math.ceil( Math.hypot( p2[ 0 ] - p1[ 0 ], p2[ 1 ] - p1[ 1 ] ) / step ) );
		for ( let k = 0; k < n; k ++ ) {

			const t = k / n, t2 = t * t, t3 = t2 * t;
			out.push( [ 0, 1 ].map( ( c ) => 0.5 * ( 2 * p1[ c ] + ( p2[ c ] - p0[ c ] ) * t + ( 2 * p0[ c ] - 5 * p1[ c ] + 4 * p2[ c ] - p3[ c ] ) * t2 + ( 3 * p1[ c ] - p0[ c ] - 3 * p2[ c ] + p3[ c ] ) * t3 ) ) );

		}

	}

	out.push( pts[ pts.length - 1 ].slice() );
	return out;

}

// distance from p to a polyline, and how far along it the nearest point is (before its start and past its
// end, the distance along goes on): out = [ r, u ]
function polyline( pts, x, z, out ) {

	let best = Infinity, along = 0, u = 0;
	const last = pts.length - 2;
	for ( let i = 0; i <= last; i ++ ) {

		const ax = pts[ i ][ 0 ], az = pts[ i ][ 1 ], dx = pts[ i + 1 ][ 0 ] - ax, dz = pts[ i + 1 ][ 1 ] - az;
		const L2 = dx * dx + dz * dz, L = Math.sqrt( L2 );
		const t0 = ( ( x - ax ) * dx + ( z - az ) * dz ) / L2, t = clamp( t0, 0, 1 );
		const ex = x - ax - dx * t, ez = z - az - dz * t, r = Math.sqrt( ex * ex + ez * ez );
		if ( r < best ) {

			best = r;
			u = along + ( i === 0 ? Math.min( t, t0 ) : i === last ? Math.max( t, t0 ) : t ) * L;

		}

		along += L;

	}

	out[ 0 ] = best;
	out[ 1 ] = u;
	return out;

}

const pathLength = ( pts ) => pts.slice( 1 ).reduce( ( s, p, i ) => s + Math.hypot( p[ 0 ] - pts[ i ][ 0 ], p[ 1 ] - pts[ i ][ 1 ] ), 0 );
const boxOf = ( pts, m ) => pts.reduce( ( b, [ x, z ] ) => [ Math.min( b[ 0 ], x - m ), Math.min( b[ 1 ], z - m ), Math.max( b[ 2 ], x + m ), Math.max( b[ 3 ], z + m ) ], [ Infinity, Infinity, - Infinity, - Infinity ] );
const inBox = ( b, x, z ) => x > b[ 0 ] && z > b[ 1 ] && x < b[ 2 ] && z < b[ 3 ];

// distance from an ellipse's rim along the ray from its middle (m, negative inside): true enough far off
const rimDistance = ( x, z, cx, cz, rx, rz ) => {

	const dx = x - cx, dz = z - cz, rho = Math.hypot( dx / rx, dz / rz );
	return ( rho - 1 ) * Math.hypot( dx, dz ) / Math.max( rho, 1e-6 );

};

// and as the island's coast has it (TerrainData: scaled by the narrower radius; it falls short far off,
// half the way at 10 km, but its seabed's depths go by it)
const islandDistance = ( x, z, cx, cz, rx, rz ) => ( Math.hypot( ( x - cx ) / rx, ( z - cz ) / rz ) - 1 ) * Math.min( rx, rz );

// how far down a seamount's or a bank's flank, 0 at its rim to 1 (past the deep's floor) `reach` m out:
// steepest at the top, its foot meeting the floor with no step
const foot = ( r, reach ) => 1 - ( 1 - clamp( softRamp( r, 40 ) / reach, 0, 1 ) ) ** 2.2;

// a large-scale field worked out on a coarse lattice over the map and read bilinearly (cheaper than
// working it out at every texel; it has no detail finer than the lattice)
class Lattice {

	constructor( fn, step, size = SEABED.size ) {

		this.step = step;
		this.n = Math.ceil( size / step ) + 3;
		this.o = - size / 2 - step;
		this.v = new Float32Array( this.n * this.n );
		for ( let j = 0; j < this.n; j ++ ) for ( let i = 0; i < this.n; i ++ ) this.v[ j * this.n + i ] = fn( this.o + i * step, this.o + j * step );

	}

	at( x, z ) {

		const { n, o, step, v } = this;
		const fx = clamp( ( x - o ) / step, 0, n - 1.001 ), fz = clamp( ( z - o ) / step, 0, n - 1.001 );
		const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * n + i;
		return ( v[ k ] * ( 1 - tx ) + v[ k + 1 ] * tx ) * ( 1 - tz ) + ( v[ k + n ] * ( 1 - tx ) + v[ k + n + 1 ] * tx ) * tz;

	}

}

// The seabed's model, at a point (m, y up). `island`: the TerrainData it goes round (its own seabed's
// formula next to its square, and its noise).
export class SeabedModel {

	constructor( island ) {

		this.island = island;
		const n = this.noise = new Noise2D( 7 * 977 + 3 );
		this.noise2 = new Noise2D( 7 * 1307 + 11 );
		// the shelf's width and the slope's length by bearing (720 steps round)
		this.W = new Float32Array( 721 );
		this.L = new Float32Array( 721 );
		const S = SEABED;
		for ( let i = 0; i <= 720; i ++ ) {

			const th = i / 720 * TAU - Math.PI, c = Math.cos( th ), s = Math.sin( th );
			this.W[ i ] = S.shelf.width + 220 * n.fbm( c * 2.2 + 5, s * 2.2 - 3, 3 ) - 150 * bump( th, 0, 40 ) + 250 * bump( th, 180, 30 ) + 1500 * bump( th, - 135, 32 );
			this.L[ i ] = S.slope.length - 500 * c + 300 * n.fbm( c * 1.7 - 2, s * 1.7 + 8, 2 );

		}

		// the deep floor's swell, and a wander for outlines (the bank's, the hump's)
		this.swell = new Lattice( ( x, z ) => n.fbm( x / 4000, z / 4000, 3 ), 256 );
		this.wanderX = new Lattice( ( x, z ) => n.fbm( x / 3000, z / 3000, 3 ), 96 );
		this.wanderZ = new Lattice( ( x, z ) => n.fbm( x / 3000 + 9.1, z / 3000 - 4.7, 3 ), 96 );

		this.canyon = course( S.canyon );
		this.branch = course( S.branch );
		this.canyonLength = pathLength( this.canyon );
		this.canyonBox = boxOf( S.canyon.concat( S.branch ), 2000 );
		// the sandbar's crest line: a crescent across the wind on the bank's lee side, its horns downwind
		const B = S.bank, sb = S.sandbar, ax = - LEE.z, az = LEE.x;
		this.bar = { x: B.x + LEE.x * sb.lee, z: B.z + LEE.z * sb.lee, pts: [] };
		for ( let t = - sb.half; t <= sb.half + 1e-6; t += 50 ) {

			const k = ( t / sb.half ) ** 2;
			this.bar.pts.push( [ this.bar.x + ax * t + LEE.x * 140 * k, this.bar.z + az * t + LEE.z * 140 * k ] );

		}

		this._pr = [ 0, 0 ];
		this._out = { h: 0, rock: 0, d: 0, bz: 0, carve: 0 };
		// how deep the slope is where the canyon comes out on it: its floor goes no deeper (no hollow at its mouth)
		this.mouth = Infinity;
		const end = this.canyon[ this.canyon.length - 1 ];
		this.mouth = this.depthAt( end[ 0 ], end[ 1 ], false );

	}

	_table( T, th ) {

		const f = ( th + Math.PI ) / TAU * 720, i = Math.min( 719, Math.max( 0, Math.floor( f ) ) ), t = f - i;
		return T[ i ] + ( T[ i + 1 ] - T[ i ] ) * t;

	}

	// the island's seabed as its own formula has it (TerrainData's profile, before its 1 m detail and the
	// fade at its square's edge): depth (m)
	_near( x, z ) {

		const I = this.island, F = I._fields( x, z, false );
		return Math.max( 0, - I._base( x, z, F, this._out ).h );

	}

	// how far from the island's coast (m): its body and headlands, as its coast has them but for its wobbles
	distance( x, z ) {

		return smin( rimDistance( x, z, 0, - 442, 565, 400 ), smin( rimDistance( x, z, - 272, - 25, 92, 205 ), rimDistance( x, z, 288, - 12, 108, 228 ), 40 ), 75 );

	}

	// a canyon's cut at a point: [ how deep (m), how far into it (0 at its rim, 1 down its middle) ]
	_cut( path, x, z, A, w ) {

		const [ r, u ] = polyline( path, x, z, this._pr );
		const wu = w( u ) * ( 1 + 0.22 * this.noise2.fbm( u / 900, 3.7, 2 ) );
		const p = 1 - ( ( r + 50 * this.noise2.fbm( x / 350, z / 350, 2 ) ) / wu ) ** 2;
		return p > 0 ? [ A( u ) * p ** 1.3, p ] : [ 0, 0 ];

	}

	depthAt( x, z, canyons = true ) {

		const S = SEABED, n = this.noise, n2 = this.noise2;
		const d = this.distance( x, z );
		const cx = x - S.centre.x, cz = z - S.centre.z, rc = Math.hypot( cx, cz ) || 1;
		const th = Math.atan2( cx, - cz );
		const L = this._table( this.L, th );
		// (the break's line wanders, and the gullies' heads scallop it)
		let s = d - this._table( this.W, th ) + 220 * n.fbm( x / 1300, z / 1300, 3 );

		// the shelf: the island's profile (TerrainData's: by its coast's distance as it measures it), to 85 m
		// by 1.5 km out, then on gently to the break
		const di = lerp( smin( islandDistance( x, z, 0, - 442, 565, 400 ), smin( islandDistance( x, z, - 272, - 25, 92, 205 ), islandDistance( x, z, 288, - 12, 108, 228 ), 40 ), 75 ), d, smoothstep( 1500, 4000, d ) );
		let shelf = Math.min( 85, di < 70 ? di * 0.05 : di < 260 ? 3.5 + ( di - 70 ) * 0.06 : di < 700 ? 14.9 + ( di - 260 ) * 0.07 : 45.7 + ( di - 700 ) * 0.05 );
		shelf += S.shelf.outer * softRamp( di - 1486, 150 );
		// (its unevenness, the island's own and broader: nothing to the slope's)
		if ( s < 400 ) shelf -= ( this.island.noise.fbm( x / 220, z / 220, 4 ) * 6 * smoothstep( 60, 400, d ) + 4 * n.fbm( x / 700, z / 700, 3 ) * smoothstep( 1200, 1800, d ) ) * ( 1 - smoothstep( 200, 400, s ) );
		// next to the square, the island's own formula, as its edge is blended into this
		const kFar = smoothstep( BAND[ 0 ], BAND[ 1 ], Math.max( Math.abs( x ), Math.abs( z ) ) - SQUARE );
		if ( kFar < 1 ) shelf = lerp( this._near( x, z ), shelf, kFar );

		// the ledge: a terrace where the slope reaches its depth, along its stretch of the slope
		const ledge = smoothstep( S.ledge.from - 12, S.ledge.from, th / DEG ) * ( 1 - smoothstep( S.ledge.to, S.ledge.to + 12, th / DEG ) );
		let flat = 0;
		if ( ledge > 0 && s > 0 ) {

			const dl = S.ledge.depth + 25 * n.fbm( th * 6, 1.3, 2 ), lw = S.ledge.width * ( 1 + 0.45 * n.fbm( th * 5, 7.7, 2 ) );
			const s1 = - L * Math.log( 1 - clamp( ( dl - shelf ) / ( S.basin - shelf ), 0, 0.99 ) );
			const u = ( s - s1 ) / lw;
			s -= ledge * 0.95 * lw * ( softRamp( u, 0.1 ) - softRamp( u - 1, 0.1 ) );
			flat = ledge * smoothstep( - 0.15, 0.1, u ) * ( 1 - smoothstep( 0.9, 1.15, u ) );

		}

		// past the break, down the slope to the deep (an exponential: steepest at the top)
		const fall = 1 - Math.exp( - softRamp( s, 60 ) / L );
		let depth = shelf + ( S.basin - shelf ) * fall;
		const steep = ( S.basin - shelf ) / L * Math.exp( - Math.max( 0, s ) / L ); // the slope (m/m) there

		// the canyon and its branch: a rounded V cut down the slope, deepest midway, its floor never past the
		// deep's
		let inCanyon = 0;
		if ( canyons && inBox( this.canyonBox, x, z ) ) {

			const CL = this.canyonLength;
			const [ a, pa ] = this._cut( this.canyon, x, z, ( u ) => ( 130 * smoothstep( - 200, 400, u ) + 230 * smoothstep( 300, 2600, u ) ) * ( 1 - smoothstep( CL - 1000, CL, u ) ), ( u ) => 260 + 560 * smoothstep( 0, 3000, u ) + 480 * smoothstep( 3000, 7000, u ) + 600 * smoothstep( 7000, 11000, u ) );
			const [ b, pb ] = this._cut( this.branch, x, z, ( u ) => 90 * smoothstep( - 200, 400, u ) + 90 * smoothstep( 300, 1500, u ), ( u ) => 220 + 300 * smoothstep( 0, 1500, u ) );
			inCanyon = Math.max( pa, pb );
			// (its floor runs down to its mouth's depth, and out level onto the deep's floor)
			if ( a > 0 || b > 0 ) depth += smin( Math.max( a, b ), Math.max( 0, this.mouth - depth ), 40 );

		}

		// gullies down the slope (none on the ledge's flat, few down the canyon), and the deep floor's swell
		const gully = smoothstep( 0, 300, s ) * ( 1 - smoothstep( 0.7, 0.95, fall ) ) * ( 1 - inCanyon * 0.6 ) * ( 1 - 0.9 * flat );
		if ( gully > 0 ) {

			const g = Math.min( steep, 0.9 );
			depth -= gully * erosionNoise( x, z, - g * cx / rc, - g * cz / rc, 3, 700, 40 );

		}

		if ( fall > 0.6 ) depth -= smoothstep( 0.6, 0.95, fall ) * 45 * this.swell.at( x, z ) * ( 1 - inCanyon );

		// the hump: a ridge of peaks rising from the deep, their flanks gullied
		const P = S.hump, [ px, pz ] = P[ 0 ], hr = Math.hypot( x - px, z - pz );
		if ( hr < 6800 ) {

			const wx = x + 450 * this.wanderX.at( x * 0.7 + 3000, z * 0.7 ), wz = z + 450 * this.wanderZ.at( x * 0.7 + 3000, z * 0.7 );
			const ragged = 140 * n2.fbm( x / 450, z / 450, 3 ); // (each top's own outline)
			const peak = ( [ hx, hz, top, R ] ) => top + ( S.basin + 200 - top ) * foot( Math.hypot( wx - hx, wz - hz ) - R + ragged, 5500 );
			let hump = peak( P[ 0 ] );
			for ( let i = 1; i < P.length; i ++ ) hump = smin( hump, peak( P[ i ] ), 120 );
			const r = Math.hypot( wx - px, wz - pz ) || 1, hf = ( hump - P[ 0 ][ 2 ] ) / ( S.basin - P[ 0 ][ 2 ] );
			const g = 0.7 * ( 1 - hf );
			hump -= smoothstep( 0, 300, r - P[ 0 ][ 3 ] ) * ( 1 - smoothstep( 0.75, 0.95, hf ) ) * erosionNoise( x + 5000, z, - g * ( wx - px ) / r, - g * ( wz - pz ) / r, 3, 600, 35 );
			hump -= 8 * n2.ridged( x / 160, z / 160, 3 ) * ( 1 - smoothstep( 0.05, 0.2, hf ) );
			depth = smin( depth, hump, 60 );

		}

		// the bank: a platform with walls to the deep, its rim shoaling to windward, and its sandbar
		const B = S.bank;
		if ( Math.hypot( x - B.x, z - B.z ) < B.a + 7000 ) {

			// (wandering, broadly and in spurs and bays a kilometre across, never so fast it folds over)
			const fx = 3 * ( x - B.x ), fz = 3 * ( z - B.z );
			const dx = x + 420 * this.wanderX.at( x, z ) + 150 * this.wanderZ.at( fx, fz ) - B.x, dz = z + 420 * this.wanderZ.at( x, z ) + 150 * this.wanderX.at( fz, fx ) - B.z, ax = - LEE.z, az = LEE.x;
			const a = ( dx * ax + dz * az ) / B.a, b = ( dx * LEE.x + dz * LEE.z ) / B.b;
			const rho = Math.max( Math.hypot( a, b ), 1e-3 );
			const sd = ( rho - 1 ) * Math.hypot( dx, dz ) / rho; // m outside its rim (along the ray from its middle)
			if ( sd < 5000 ) {

				const windward = smoothstep( - 0.2, 0.6, - b / rho ), lee = smoothstep( 0.2, 0.8, b / rho );
				const rim = smoothstep( - 600, - 80, Math.min( sd, 0 ) );
				let top = B.top - ( B.top - B.rim ) * rim * windward + 4 * lee * rim;
				// its top's unevenness: patch reefs over it, and heads along the rim
				const rough = 1 - smoothstep( 100, 300, sd );
				if ( rough > 0 ) top += rough * ( 3 * n2.fbm( x / 500, z / 500, 3 ) - ( 2.5 + 3 * rim * windward ) * smoothstep( 0.45, 0.8, n2.ridged( x / 140, z / 140, 3 ) ) );
				const wall = top + ( S.basin + 200 - top ) * foot( sd, 5000 );
				depth = smin( depth, wall, 80 );

				// the sandbar: wider and narrower as it goes, a channel through it a third of the way along
				const bar = this.bar;
				if ( Math.hypot( x - bar.x, z - bar.z ) < 1400 ) {

					const [ rb, ub ] = polyline( bar.pts, x, z, this._pr );
					const t = clamp( ub / S.sandbar.half - 1, - 1, 1 ), k = t * t, wob = n.fbm( ub / 260, 4.2, 2 );
					const hw = ( 40 + 90 * ( 1 - k ) ) * ( 1 + 0.35 * wob );
					// (the channel a swale across it, slanting with the wander)
					const gap = Math.exp( - ( ( ( t - 0.32 + rb / 2000 ) / 0.11 ) ** 2 ) );
					const crest = S.sandbar.crest + 1.4 * k + 0.5 * Math.max( 0, wob ) + 2.3 * gap + 0.15 * n.fbm( x / 60, z / 60, 2 );
					// (to its flanks' foot, where it's the bank's top again: none of it past the bank's rim)
					if ( rb < 2.6 * hw ) depth = Math.min( depth, crest + ( top - crest ) * smoothstep( 0.25 * hw, 2.6 * hw, rb ) ** 0.8 );

				}

			}

		}

		// the map's edge: the deep's floor alone
		const edge = smoothstep( S.size / 2 - 2500, S.size / 2 - 600, Math.max( Math.abs( x ), Math.abs( z ) ) );
		return lerp( depth, S.basin, edge );

	}

	heightAt( x, z ) {

		return - this.depthAt( x, z );

	}

}

// the model over the map, `res` texels a side. Inside the island's square, but for its last 200 m (which
// its own edge blends to), its own map is read instead: left at sea level
export function bakeSeabed( island, res ) {

	const model = new SeabedModel( island );
	const size = SEABED.size, t = size / res, o = - size / 2;
	const H = new Float32Array( res * res );
	for ( let j = 0; j < res; j ++ ) for ( let i = 0; i < res; i ++ ) {

		const x = o + ( i + 0.5 ) * t, z = o + ( j + 0.5 ) * t, out = Math.max( Math.abs( x ), Math.abs( z ) ) - SQUARE;
		if ( out < - 200 ) H[ j * res + i ] = 0;
		else if ( out < BAND[ 1 ] ) {

			// (next to the island, where its own seabed's finer than a texel, 4 x 4 samples' mean)
			let sum = 0;
			for ( let b = 0; b < 4; b ++ ) for ( let a = 0; a < 4; a ++ ) sum += model.heightAt( x + ( a - 1.5 ) * t / 4, z + ( b - 1.5 ) * t / 4 );
			H[ j * res + i ] = sum / 16;

		} else H[ j * res + i ] = model.heightAt( x, z );
		if ( ! Number.isFinite( H[ j * res + i ] ) ) throw new Error( `the seabed's model: ${ H[ j * res + i ] } at ${ x }, ${ z }` );

	}

	return H;

}

// half as many texels a side (each the mean of four)
export function halveSeabed( H, res ) {

	const r = res / 2, out = new Float32Array( r * r );
	for ( let j = 0; j < r; j ++ ) for ( let i = 0; i < r; i ++ ) {

		const k = 2 * j * res + 2 * i;
		out[ j * r + i ] = ( H[ k ] + H[ k + 1 ] + H[ k + res ] + H[ k + res + 1 ] ) / 4;

	}

	return out;

}

//   'SLO1' | u32 header length | header (JSON: res, size, basin, sourceHash, min, step) | the heights,
//   quantized to u16 (~3 cm steps) as differences along each row, zlib-compressed (as the island's)
export const SEABED_MAGIC = 'SLO1';

export function encodeSeabed( H, res, { sourceHash } ) {

	let min = Infinity, max = - Infinity;
	for ( const h of H ) {

		if ( h < min ) min = h;
		if ( h > max ) max = h;

	}

	const step = ( max - min ) / 65535 || 1;
	const q = new Uint16Array( res * res );
	for ( let j = 0; j < res; j ++ ) {

		let prev = 0;
		for ( let i = 0; i < res; i ++ ) {

			const k = j * res + i, v = Math.round( ( H[ k ] - min ) / step );
			q[ k ] = ( v - prev ) & 0xffff;
			prev = v;

		}

	}

	const z = zlibSync( new Uint8Array( q.buffer ), { level: 9 } );
	const header = new TextEncoder().encode( JSON.stringify( { version: 1, res, size: SEABED.size, basin: SEABED.basin, sourceHash, min, step } ) );
	const out = new Uint8Array( 8 + header.length + z.length );
	out.set( new TextEncoder().encode( SEABED_MAGIC ), 0 );
	new DataView( out.buffer ).setUint32( 4, header.length, true );
	out.set( header, 8 );
	out.set( z, 8 + header.length );
	return out;

}
