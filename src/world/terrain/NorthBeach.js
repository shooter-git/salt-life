import { Noise2D, smoothstep } from '../../util/Noise.js';

// (M15) The turtle beach. The north coast is a flat of rock and sand awash a few tenths of a metre under the
// sea, the land rising steeply straight out of it: nowhere dry for a turtle's nest. Between the headlands at x 70
// and x 235 (z about -825 to -858), where the flat's widest, a beach is made of it as the island's loaded, as
// a real nesting beach is (Tortuguero's, Jumby Bay's, Grande Riviere's): from the flat's seaward edge (`sea`),
// the beach face rising at about 1 in 7 (a tropical beach's coarse sand stands steep) to the berm's crest near
// 2 m up; the backshore behind it, dry sand, falling a little to the foot of the slope, where the plants begin.
// Its sand's on the ground's masks too (sand, no rock, seagrass or rubble). Faded out into the flat at its ends;
// the texels changed keep what they were (TerrainData._uncut, masksBefore), for placing the rocks and the plants
// as they were.
//   NORTH_BEACH: where, and the profile's measures
//   beachBerm( T, record, recordMask ): makes it (record( k, old height ), recordMask( array, k, old ) for each
//     texel changed)
//   bermAt( x, d ) -> the profile's height d m in from the flat's edge at x (m)

export const NORTH_BEACH = {
	window: [ 30, - 900, 280, - 790 ], // x0 z0 x1 z1 (m): where it's worked out
	ends: [ 70, 235 ], fade: 25, // m: the stretch along x, faded over this at each end
	sea: - 0.6, // m: the flat's seaward edge, where the beach face starts (the distance in's from there)
	crest: 1.9, // m: the berm's crest over the sea at rest
	face: 1 / 7, // the beach face's slope
	back: 0.025, // the backshore's fall to the slope's foot (m a m)
	wander: 0.25, // m: the crest's height wandering along the beach
};

const noise = new Noise2D( 677 );

export function bermAt( x, d ) {

	const B = NORTH_BEACH, crest = B.crest + B.wander * noise.fbm( x / 60, 3.1, 2 ), dc = ( crest - B.sea ) / B.face;
	return d < dc ? B.sea + d * B.face : crest - B.back * ( d - dc );

}

export function beachBerm( T, record, recordMask ) {

	const B = NORTH_BEACH, res = T.res, t = T.texel, o = T.origin, H = T.heights;
	const i0 = Math.max( 1, Math.floor( ( B.window[ 0 ] - o ) / t ) ), i1 = Math.min( res - 2, Math.ceil( ( B.window[ 2 ] - o ) / t ) );
	const j0 = Math.max( 1, Math.floor( ( B.window[ 1 ] - o ) / t ) ), j1 = Math.min( res - 2, Math.ceil( ( B.window[ 3 ] - o ) / t ) );
	const w = i1 - i0 + 1, h = j1 - j0 + 1, D = new Float32Array( w * h ).fill( 1e9 );
	// (how far in from the flat's edge each texel is: from the open sea (the deep water joined to the window's
	// seaward edge, not the pools in the flat), a two-pass chamfer distance, in m)
	const open = [];
	for ( let i = 0; i < w; i ++ ) if ( H[ j0 * res + i0 + i ] < B.sea ) {

		D[ i ] = 0;
		open.push( i );

	}

	while ( open.length ) {

		const q = open.pop(), i = q % w, j = ( q - i ) / w;
		for ( const [ di, dj ] of [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ] ) {

			const ii = i + di, jj = j + dj, n = jj * w + ii;
			if ( ii < 0 || jj < 0 || ii >= w || jj >= h || D[ n ] === 0 || H[ ( j0 + jj ) * res + i0 + ii ] >= B.sea ) continue;
			D[ n ] = 0;
			open.push( n );

		}

	}

	const s2 = t * Math.SQRT2;
	for ( let j = 0; j < h; j ++ ) for ( let i = 0; i < w; i ++ ) {

		const q = j * w + i;
		if ( i > 0 ) D[ q ] = Math.min( D[ q ], D[ q - 1 ] + t );
		if ( j > 0 ) D[ q ] = Math.min( D[ q ], D[ q - w ] + t, i > 0 ? D[ q - w - 1 ] + s2 : 1e9, i < w - 1 ? D[ q - w + 1 ] + s2 : 1e9 );

	}

	for ( let j = h - 1; j >= 0; j -- ) for ( let i = w - 1; i >= 0; i -- ) {

		const q = j * w + i;
		if ( i < w - 1 ) D[ q ] = Math.min( D[ q ], D[ q + 1 ] + t );
		if ( j < h - 1 ) D[ q ] = Math.min( D[ q ], D[ q + w ] + t, i < w - 1 ? D[ q + w + 1 ] + s2 : 1e9, i > 0 ? D[ q + w - 1 ] + s2 : 1e9 );

	}

	const masks = [ [ T.sand, 255 ], [ T.rock, 0 ], [ T.seagrass, 0 ], [ T.rubble, 0 ] ].filter( ( [ a ] ) => a );
	for ( let j = 0; j < h; j ++ ) for ( let i = 0; i < w; i ++ ) {

		const k = ( j0 + j ) * res + i0 + i, d = D[ j * w + i ];
		if ( d <= 0 || d > 60 ) continue;
		const x = o + ( i0 + i + 0.5 ) * t;
		const k1 = smoothstep( B.ends[ 0 ], B.ends[ 0 ] + B.fade, x ) * smoothstep( B.ends[ 1 ], B.ends[ 1 ] - B.fade, x );
		if ( k1 <= 0 ) continue;
		// (up to the slope's foot: the ground that's higher than the beach would be is the slope, left as it is)
		const to = bermAt( x, d );
		if ( to <= H[ k ] ) continue;
		record( k, H[ k ] );
		H[ k ] += ( to - H[ k ] ) * k1;
		for ( const [ a, v ] of masks ) {

			recordMask( a, k, a[ k ] );
			a[ k ] += ( v - a[ k ] ) * k1;

		}

	}

}
