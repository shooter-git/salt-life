import { smoothstep } from '../../util/Noise.js';
import { polylineDistance } from './IslandShape.js';

// (M15) The way over to the north beach on foot: the valley's hiking trail (IslandShape's PATHS[ 1 ]) carried on,
// from where it leaves it at ( 26, -236 ), round the island's east side and across the north's plateau, and down
// the sea cliff to the beach, its top at 78 m. Laid out as a trail's built (tools/trail-route.mjs: a least-cost
// path on the baked ground, its grade easy to 10% and steps to 45%, a bench cut across steep slopes, holding a
// bearing in legs): some 1.4 km, switchbacks on the slope above the cliff and tight zigzags down a gully through
// it. Cut in as the bake's loaded, as the turtle beach is (the rocks and plants placed from the ground as it was,
// then taken off it: trailClears):
//   - its tread, TRAIL.w m either side, at the ground's height along it (smoothed over SMOOTH m, graded to no
//     steeper than GRADE), level across, with a cut bank up into the slope and a fill down from it, and a level
//     landing at each switchback's turn;
//   - worn into the ground (the path mask) and sunk a little, as the valley's trail is;
//   - neither on the beach (none below SAND m: its sand, and the debris placed on it, as they were).
//   TRAIL: its half-width and points (x, z)
//   trailCut( T, record, recordMask ): cuts it (record( k, old height ), recordMask( array, k, old ) for each
//     texel changed)
//   trailAt( x, z ) -> [ distance from it (m), how far along it ]
//   trailClears( x, z, r = 0 ) -> whether a thing r m about ( x, z ) is in its way
//   trailTexels( res, origin, texel, r, fn ): fn( i, j ) for a grid's texels within r m of its tread

export const TRAIL = {
	w: 0.75,
	pts: [ [ 26, - 236 ], [ 58, - 246 ], [ 92, - 262 ], [ 106, - 262 ], [ 142, - 270 ], [ 160, - 268 ], [ 184, - 256 ], [ 208, - 232 ], [ 234, - 208 ], [ 240, - 196 ], [ 254, - 150 ], [ 260, - 152 ], [ 266, - 158 ], [ 284, - 194 ], [ 294, - 204 ], [ 314, - 244 ], [ 320, - 246 ], [ 334, - 282 ], [ 344, - 294 ], [ 352, - 320 ], [ 360, - 328 ], [ 364, - 336 ], [ 372, - 342 ], [ 386, - 368 ], [ 396, - 396 ], [ 396, - 410 ], [ 396, - 426 ], [ 380, - 464 ], [ 364, - 500 ], [ 356, - 524 ], [ 356, - 540 ], [ 370, - 540 ], [ 380, - 530 ], [ 384, - 542 ], [ 382, - 558 ], [ 358, - 572 ], [ 350, - 580 ], [ 348, - 588 ], [ 354, - 606 ], [ 352, - 616 ], [ 342, - 630 ], [ 338, - 642 ], [ 326, - 646 ], [ 314, - 654 ], [ 296, - 698 ], [ 276, - 742 ], [ 260, - 760 ], [ 236, - 770 ], [ 228, - 778 ], [ 212, - 786 ], [ 182, - 796 ], [ 160, - 788 ], [ 152, - 780 ], [ 158, - 798 ], [ 158, - 806 ], [ 152, - 800 ], [ 142, - 780 ], [ 142, - 794 ], [ 142, - 810 ], [ 130, - 780 ], [ 124, - 778 ], [ 122, - 784 ], [ 126, - 796 ], [ 126, - 816 ], [ 122, - 810 ], [ 116, - 808 ], [ 112, - 810 ], [ 118, - 812 ], [ 120, - 818 ], [ 114, - 816 ], [ 108, - 824 ], [ 120, - 828 ] ],
};

const SMOOTH = 5; // m along it, either way: its tread's height the ground's averaged over this
const SAND = 2.8; // m: below this, the beach: not cut, nor worn
const CLEAR = 1.1; // m past the tread: nothing grows or lies here
const LANDING = 1.6; // m: a switchback's landing about its turn
const GRADE = 0.25; // its steepest, m a metre along it

// its segments' boxes, for finding the nearest quickly
const SEGS = TRAIL.pts.slice( 1 ).map( ( b, n ) => {

	const a = TRAIL.pts[ n ];
	return { a, b, x0: Math.min( a[ 0 ], b[ 0 ] ), x1: Math.max( a[ 0 ], b[ 0 ] ), z0: Math.min( a[ 1 ], b[ 1 ] ), z1: Math.max( a[ 1 ], b[ 1 ] ) };

} );
const BOX = SEGS.reduce( ( o, s ) => [ Math.min( o[ 0 ], s.x0 ), Math.min( o[ 1 ], s.z0 ), Math.max( o[ 2 ], s.x1 ), Math.max( o[ 3 ], s.z1 ) ], [ Infinity, Infinity, - Infinity, - Infinity ] );

export function trailAt( x, z, reach = 12 ) {

	if ( x < BOX[ 0 ] - reach || x > BOX[ 2 ] + reach || z < BOX[ 1 ] - reach || z > BOX[ 3 ] + reach ) return [ Infinity, 0 ];
	if ( ! SEGS.some( ( s ) => x > s.x0 - reach && x < s.x1 + reach && z > s.z0 - reach && z < s.z1 + reach ) ) return [ Infinity, 0 ];
	return polylineDistance( TRAIL.pts, x, z );

}

export function trailClears( x, z, r = 0 ) {

	return trailAt( x, z )[ 0 ] < TRAIL.w + CLEAR + r;

}

// fn( i, j ) for each texel of a res² grid ( origin, texel m ) whose middle's within r m of the tread's edge
// (some more than once)
export function trailTexels( res, origin, texel, r, fn ) {

	const R = TRAIL.w + r;
	for ( const s of SEGS ) {

		const i0 = Math.max( 0, Math.floor( ( s.x0 - R - origin ) / texel ) ), i1 = Math.min( res - 1, Math.ceil( ( s.x1 + R - origin ) / texel ) );
		const j0 = Math.max( 0, Math.floor( ( s.z0 - R - origin ) / texel ) ), j1 = Math.min( res - 1, Math.ceil( ( s.z1 + R - origin ) / texel ) );
		for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {

			const x = origin + ( i + 0.5 ) * texel, z = origin + ( j + 0.5 ) * texel;
			if ( polylineDistance( [ s.a, s.b ], x, z )[ 0 ] < R ) fn( i, j );

		}

	}

}

export function trailCut( T, record, recordMask ) {

	const res = T.res, t = T.texel, o = T.origin, H = T.heights;
	// its tread's height along it: the ground's at each metre, averaged over SMOOTH m either way
	const len = SEGS.reduce( ( L, s ) => L + Math.hypot( s.b[ 0 ] - s.a[ 0 ], s.b[ 1 ] - s.a[ 1 ] ), 0 );
	const N = Math.ceil( len ) + 1, ground = new Float32Array( N ), tread = new Float32Array( N );
	{

		let n = 0, acc = 0;
		for ( const s of SEGS ) {

			const L = Math.hypot( s.b[ 0 ] - s.a[ 0 ], s.b[ 1 ] - s.a[ 1 ] );
			for ( ; n < N && n <= acc + L; n ++ ) {

				const f = ( n - acc ) / L;
				ground[ n ] = T.heightAt( s.a[ 0 ] + ( s.b[ 0 ] - s.a[ 0 ] ) * f, s.a[ 1 ] + ( s.b[ 1 ] - s.a[ 1 ] ) * f );

			}

			acc += L;

		}

		for ( ; n < N; n ++ ) ground[ n ] = ground[ n - 1 ];
		for ( let k = 0; k < N; k ++ ) {

			let sum = 0, w = 0;
			for ( let q = Math.max( 0, k - SMOOTH ); q <= Math.min( N - 1, k + SMOOTH ); q ++ ) {

				const c = 1 - Math.abs( q - k ) / ( SMOOTH + 1 );
				sum += ground[ q ] * c;
				w += c;

			}

			tread[ k ] = sum / w;

		}

		// graded: no steeper than GRADE along it anywhere (the ground's own short pitches cut down or filled), as
		// near the ground as that leaves it (each metre held within GRADE of the next, both ways, until it holds)
		for ( let pass = 0; pass < 8; pass ++ ) {

			for ( let k = 1; k < N; k ++ ) tread[ k ] = Math.min( tread[ k - 1 ] + GRADE, Math.max( tread[ k - 1 ] - GRADE, tread[ k ] ) );
			for ( let k = N - 2; k >= 0; k -- ) tread[ k ] = Math.min( tread[ k + 1 ] + GRADE, Math.max( tread[ k + 1 ] - GRADE, tread[ k ] ) );

		}

	}

	const treadAt = ( s ) => {

		const f = Math.min( N - 1.001, Math.max( 0, s ) ), i = Math.floor( f );
		return tread[ i ] + ( tread[ i + 1 ] - tread[ i ] ) * ( f - i );

	};
	// its turns past 90° (the switchbacks) each a level landing, LANDING m about the turn, at the tread's height
	// there: the legs either side of it are its height apart a step off the turn
	const landings = [];
	{

		let a = 0;
		for ( let n = 1; n < SEGS.length; n ++ ) {

			const p = SEGS[ n - 1 ], q = SEGS[ n ];
			a += Math.hypot( p.b[ 0 ] - p.a[ 0 ], p.b[ 1 ] - p.a[ 1 ] );
			const ux = p.b[ 0 ] - p.a[ 0 ], uz = p.b[ 1 ] - p.a[ 1 ], vx = q.b[ 0 ] - q.a[ 0 ], vz = q.b[ 1 ] - q.a[ 1 ];
			if ( ( ux * vx + uz * vz ) / ( Math.hypot( ux, uz ) * Math.hypot( vx, vz ) ) < 0 ) landings.push( [ q.a[ 0 ], q.a[ 1 ], treadAt( a ) ] );

		}

	}
	const R = TRAIL.w + 6;
	const i0 = Math.max( 1, Math.floor( ( BOX[ 0 ] - R - o ) / t ) ), i1 = Math.min( res - 2, Math.ceil( ( BOX[ 2 ] + R - o ) / t ) );
	const j0 = Math.max( 1, Math.floor( ( BOX[ 1 ] - R - o ) / t ) ), j1 = Math.min( res - 2, Math.ceil( ( BOX[ 3 ] + R - o ) / t ) );
	// (each texel's distance to it and how far along it, from the segments near it)
	const w = i1 - i0 + 1, D = new Float32Array( w * ( j1 - j0 + 1 ) ).fill( Infinity ), S = new Float32Array( D.length );
	let acc = 0;
	for ( const s of SEGS ) {

		const [ ax, az ] = s.a, [ bx, bz ] = s.b, L = Math.hypot( bx - ax, bz - az );
		const si0 = Math.max( i0, Math.floor( ( s.x0 - R - o ) / t ) ), si1 = Math.min( i1, Math.ceil( ( s.x1 + R - o ) / t ) );
		const sj0 = Math.max( j0, Math.floor( ( s.z0 - R - o ) / t ) ), sj1 = Math.min( j1, Math.ceil( ( s.z1 + R - o ) / t ) );
		for ( let j = sj0; j <= sj1; j ++ ) for ( let i = si0; i <= si1; i ++ ) {

			const x = o + ( i + 0.5 ) * t, z = o + ( j + 0.5 ) * t;
			let f = ( ( x - ax ) * ( bx - ax ) + ( z - az ) * ( bz - az ) ) / ( L * L );
			f = f < 0 ? 0 : f > 1 ? 1 : f;
			const d = Math.hypot( x - ax - ( bx - ax ) * f, z - az - ( bz - az ) * f ), q = ( j - j0 ) * w + i - i0;
			if ( d < D[ q ] ) {

				D[ q ] = d;
				S[ q ] = acc + f * L;

			}

		}

		acc += L;

	}

	for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {

		const q = ( j - j0 ) * w + i - i0, d = D[ q ];
		if ( d > R ) continue;
		const k = j * res + i, h = H[ k ], s = S[ q ], x = o + ( i + 0.5 ) * t, z = o + ( j + 0.5 ) * t;
		let to = treadAt( s );
		for ( const [ lx, lz, lh ] of landings ) {

			const e = Math.hypot( x - lx, z - lz );
			if ( e < LANDING + 1.5 ) to += ( lh - to ) * ( 1 - smoothstep( LANDING, LANDING + 1.5, e ) );

		}
		// (on the beach: as it was)
		const land = smoothstep( SAND, SAND + 1.2, Math.min( h, to ) );
		if ( land <= 0 ) continue;
		// the tread, its width wandering a little; the bank cut up into the slope or the fill down from it, about
		// as steep as the ground stands (1 in 0.9), and a few centimetres worn into it
		// (no narrower than the ground's texels will hold level: on the low tier's 2 m, 1.5 m either side)
		const tw = Math.max( TRAIL.w, t * 0.75 ) * ( 1 + 0.15 * Math.sin( s * 0.37 ) * Math.sin( s * 0.13 + 1 ) );
		const m = smoothstep( tw, tw + 0.35 + Math.abs( h - to ) * 0.9, d );
		const sink = 0.07 * ( 1 - smoothstep( tw * 0.4, tw * 1.1, d ) );
		const nh = h + ( to - sink + ( h - to ) * m - h ) * land;
		if ( Math.abs( nh - h ) > 0.002 ) {

			record( k, h );
			H[ k ] = nh;

		}

		// worn: as the valley's trail is (IslandShape's PATHS: the path mask)
		if ( T.path ) {

			const v = Math.round( ( 1 - smoothstep( tw * 0.6, tw * 1.9, d ) ) * 255 * land );
			if ( v > T.path[ k ] ) {

				recordMask( T.path, k, T.path[ k ] );
				T.path[ k ] = v;

			}

		}

	}

}
