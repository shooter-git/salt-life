import { hash, towardOf, weatherAt, edgeAt } from './Weather.js';

// (M15) Something to find out there: weedlines, floating debris and birds working bait, placed about you
// as you go and drifting, from where they are and the island's time alone (as the weather is), so everyone
// out there sees the same weedline in the same place.
//
// Each is laid out on a lattice of CELL m squares in a frame drifting down the trades at DRIFT m a game hour
// (0.3 m/s in real time: the island's time runs 36 times faster), out past `near` m of the island's middle
// (faded in over the next `fadeIn`).
// Each cell has its own run of epochs, set off by its own phase, and in each epoch a thing or none:
//   - weed (Sargassum): in 1 cell in 5, a field of 1 to 3 lines lying down the wind of the epoch's middle
//     (Langmuir windrows: the wind's rolls gather the floating weed into lines along it), each hundreds of m
//     long and a few wide, a few tens of m apart, broken into mats (WaterSurface draws them on the sea),
//     gathering over the epoch's first stretch and scattering over its last; it lasts a day and a half or so;
//   - debris: now and then a log, a plank, a pallet, a crate or a lost float, for days (Flotsam floats them);
//   - bait: a school driven up to the surface, the water boiling white with it and birds working it (Birds:
//     frigatebirds circling over, terns diving), in the middle of its epoch, a quarter of a game hour to a few
//     (a few real minutes to ten); more where there's weed in the cell, over the drop-off and the hump, and
//     at dawn and dusk.
// Past the far grounds (the soft edge: Weather.edgeAt) the bait and the debris are fewer (`far`): the sea emptier.
// The front between the shelf's water and the deep's (WaterSurface's, step 5) gathers weed along it too: the
// sea's shader draws it there.
//
//   findsAbout( T, x, z, range, out ) -> { weed: [ { x0, z0, x1, z1, width, life, n } ],
//     debris: [ { x, z, kind, size, yaw, life, n } ], bait: [ { x, z, r, life, n } ] }   (world m; life 0..1)
//   (depthAt( x, z ): the sea's depth there (m), for the bait over the drop-off; optional)

export const FINDS = {
	cell: 2000,
	drift: 30, // m a game hour
	near: 3000,
	fadeIn: 600, // m: they fade in over this, out from `near`
	weed: { every: 36, chance: 0.2, lines: [ 1, 3 ], length: [ 300, 1200 ], width: [ 3, 9 ], gap: [ 40, 160 ], turn: 0.14, fade: 0.12 },
	debris: { every: 120, chance: 0.07, kinds: [ 'log', 'plank', 'pallet', 'crate', 'float' ], fade: 0.02 },
	bait: { every: 6, chance: 0.07, weed: 3, slope: 2.5, dawn: 2, on: [ 0.3, 0.7 ], r: [ 25, 60 ], fade: 0.06 },
	// (M15) past the far grounds (the soft edge: Weather.edgeAt), the share of each that's still there at full.
	// The island mass effect: the bait's richest about an island and thins out within tens of km of it, and
	// the terns working it keep within reach of where they nest; the drift's fewer for less of the island's
	// own wood; the weed's the ocean's, as much out there as anywhere
	far: { weed: 1, debris: 0.6, bait: 0.3 },
};
export const DEBRIS_SIZE = { log: [ 3, 6 ], plank: [ 1.6, 2.6 ], pallet: [ 1.2, 1.2 ], crate: [ 0.6, 0.9 ], float: [ 0.3, 0.5 ] };

const TRADES = towardOf( 0 );
const lerp = ( a, b, t ) => a + ( b - a ) * t;
const sstep = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};
// a cell's id for the hashes (its whole lattice point, as an int)
const cellId = ( i, j ) => ( Math.imul( i, 0x8da6b343 ) ^ Math.imul( j, 0xd8163841 ) ) | 0;
// how far into its epoch a cell is at T, and which epoch: [ epoch, fraction ]
function epochOf( T, every, id, salt ) {

	const t = T / every + hash( id, salt );
	const e = Math.floor( t );
	return [ e, t - e ];

}

// (M15) a cell's share of its kind still there past the far grounds (FINDS.far), from where the cell is at
// island time t (the middle of the epoch it's had for: it never comes or goes but as its life does)
const thinned = ( i, j, t, keep ) => keep >= 1 ? 1 : 1 - ( 1 - keep ) * edgeAt( ( i + 0.5 ) * FINDS.cell + TRADES.x * FINDS.drift * t, ( j + 0.5 ) * FINDS.cell + TRADES.y * FINDS.drift * t );

const _wind = new Map();
// the wind's way (where it blows toward) at island time t, to the half hour (kept: it's the same for all)
function windAt( t ) {

	const k = Math.round( t * 2 );
	let w = _wind.get( k );
	if ( ! w ) {

		if ( _wind.size > 256 ) _wind.clear();
		w = towardOf( weatherAt( k / 2 ).windAngle );
		_wind.set( k, w );

	}

	return w;

}

// a cell's weed field at T, in the drifting frame (m: add the frame's drift for the world's), or null: its
// lines' middles, lengths and widths, the way they lie ( ax, az ), the field's middle, and its life
function weedField( T, id, i, j, W, C ) {

	const [ e, f ] = epochOf( T, W.every, id, 0x3e1 ), n = Math.imul( id, 31 ) + e;
	if ( hash( n, 0x7a1 ) >= W.chance * thinned( i, j, ( e + 0.5 - hash( id, 0x3e1 ) ) * W.every, C.far.weed ) ) return null;
	const h = ( k ) => hash( n, 0x5c00 + k );
	const wind = windAt( ( e + 0.5 - hash( id, 0x3e1 ) ) * W.every ), turn = ( h( 1 ) - 0.5 ) * 2 * W.turn;
	const ax = wind.x * Math.cos( turn ) - wind.y * Math.sin( turn ), az = wind.x * Math.sin( turn ) + wind.y * Math.cos( turn );
	const count = W.lines[ 0 ] + Math.floor( h( 2 ) * ( W.lines[ 1 ] - W.lines[ 0 ] + 1 ) );
	// (the field's middle, somewhere in its cell)
	const mx = ( i + 0.5 + ( h( 3 ) - 0.5 ) * 0.7 ) * C.cell, mz = ( j + 0.5 + ( h( 4 ) - 0.5 ) * 0.7 ) * C.cell;
	const lines = [];
	let off = 0;
	for ( let k = 0; k < count; k ++ ) {

		const L = lerp( W.length[ 0 ], W.length[ 1 ], h( 10 + k ) ), shift = ( h( 20 + k ) - 0.5 ) * L * 0.5;
		lines.push( { x: mx - az * off + ax * shift, z: mz + ax * off + az * shift, L, width: lerp( W.width[ 0 ], W.width[ 1 ], h( 50 + k ) ), n: ( n * 4 + k ) | 0 } );
		off += lerp( W.gap[ 0 ], W.gap[ 1 ], h( 30 + k ) ) * ( h( 40 + k ) < 0.5 ? 1 : - 1 ) * ( k + 1 );

	}

	return { lines, ax, az, mx, mz, life: sstep( 0, W.fade, f ) * ( 1 - sstep( 1 - W.fade, 1, f ) ) };

}

const OUT = { weed: [], debris: [], bait: [] };
export function findsAbout( T, x, z, range = 3000, out = OUT, depthAt = null ) {

	const C = FINDS, W = C.weed, D = C.debris, B = C.bait;
	let nw = 0, nd = 0, nb = 0;
	const dx = TRADES.x * C.drift * T, dz = TRADES.y * C.drift * T; // (the frame's drift)
	const qx = x - dx, qz = z - dz;
	const i0 = Math.floor( ( qx - range ) / C.cell ), i1 = Math.floor( ( qx + range ) / C.cell );
	const j0 = Math.floor( ( qz - range ) / C.cell ), j1 = Math.floor( ( qz + range ) / C.cell );
	for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {

		const id = cellId( i, j ), cx = ( i + 0.5 ) * C.cell + dx, cz = ( j + 0.5 ) * C.cell + dz;
		// (none about the island: its bay, its shelf close in)
		if ( Math.hypot( cx, cz ) < C.near - C.cell ) continue;
		// (fading in over the last stretch out to it, as they drift in or out)
		const away = ( px, pz ) => sstep( C.near, C.near + C.fadeIn, Math.hypot( px, pz ) );

		// ---- weed
		const field = weedField( T, id, i, j, W, C );
		if ( field ) for ( const k of field.lines ) {

			const px = k.x + dx, pz = k.z + dz, life = field.life * away( px, pz );
			if ( life <= 0 ) continue;
			const q = out.weed[ nw ] || ( out.weed[ nw ] = {} );
			nw ++;
			q.x0 = px - field.ax * k.L / 2; q.z0 = pz - field.az * k.L / 2;
			q.x1 = px + field.ax * k.L / 2; q.z1 = pz + field.az * k.L / 2;
			q.width = k.width;
			q.life = life;
			q.n = k.n;

		}

		// ---- debris
		{

			const [ e, f ] = epochOf( T, D.every, id, 0x9d3 ), n = Math.imul( id, 37 ) + e;
			if ( hash( n, 0x4b2 ) < D.chance * thinned( i, j, ( e + 0.5 - hash( id, 0x9d3 ) ) * D.every, C.far.debris ) ) {

				const h = ( k ) => hash( n, 0x6100 + k );
				const px = cx + ( h( 1 ) - 0.5 ) * C.cell * 0.9, pz = cz + ( h( 2 ) - 0.5 ) * C.cell * 0.9;
				const life = sstep( 0, D.fade, f ) * ( 1 - sstep( 1 - D.fade, 1, f ) ) * away( px, pz );
				if ( life > 0 ) {

					const kind = D.kinds[ Math.floor( h( 3 ) * D.kinds.length ) ], S = DEBRIS_SIZE[ kind ];
					const q = out.debris[ nd ] || ( out.debris[ nd ] = {} );
					nd ++;
					q.x = px; q.z = pz; q.kind = kind; q.size = lerp( S[ 0 ], S[ 1 ], h( 4 ) ); q.yaw = h( 5 ) * Math.PI * 2; q.life = life; q.n = n | 0;

				}

			}

		}

		// ---- bait, and the birds working it: whether there's a school this epoch, and where, settled at the
		// epoch's middle (the hour then, the cell's weed then, the drop-off there), so it never comes or goes
		// but as its life does
		{

			const [ e, f ] = epochOf( T, B.every, id, 0x2b7 ), n = Math.imul( id, 41 ) + e;
			const h = ( k ) => hash( n, 0x7300 + k );
			const mid = ( e + 0.5 - hash( id, 0x2b7 ) ) * B.every;
			let fx = ( i + 0.5 + ( h( 1 ) - 0.5 ) * 0.8 ) * C.cell, fz = ( j + 0.5 + ( h( 2 ) - 0.5 ) * 0.8 ) * C.cell;
			// (along a weedline, where there's one in the cell)
			const weed = weedField( mid, id, i, j, W, C ), weedy = weed && weed.life > 0.5 ? 1 : 0;
			if ( weedy ) {

				fx = lerp( fx, weed.mx, 0.85 ); fz = lerp( fz, weed.mz, 0.85 );

			}

			const hm = ( ( mid % 24 ) + 24 ) % 24, dawn = Math.max( sstep( 4.5, 6, hm ) * ( 1 - sstep( 7, 8.5, hm ) ), sstep( 16.5, 18, hm ) * ( 1 - sstep( 19, 20, hm ) ) );
			let chance = B.chance * ( 1 + ( B.weed - 1 ) * weedy ) * ( 1 + ( B.dawn - 1 ) * dawn ) * thinned( i, j, mid, C.far.bait );
			if ( depthAt ) {

				const d = depthAt( fx + TRADES.x * C.drift * mid, fz + TRADES.y * C.drift * mid );
				chance *= 1 + ( B.slope - 1 ) * sstep( 70, 120, d ) * ( 1 - sstep( 500, 900, d ) );

			}

			// (the school moving about under it as it's worked)
			const a = h( 4 ) * Math.PI * 2 + f * 3, wander = 60 * f;
			const px = fx + dx + Math.cos( a ) * wander, pz = fz + dz + Math.sin( a ) * wander;
			const life = sstep( B.on[ 0 ], B.on[ 0 ] + B.fade, f ) * ( 1 - sstep( B.on[ 1 ] - B.fade, B.on[ 1 ], f ) ) * away( px, pz );
			if ( h( 3 ) < chance && life > 0 ) {

				const q = out.bait[ nb ] || ( out.bait[ nb ] = {} );
				nb ++;
				q.x = px; q.z = pz;
				q.r = lerp( B.r[ 0 ], B.r[ 1 ], h( 5 ) ); q.life = life; q.n = n | 0;

			}

		}

	}

	out.weed.length = nw;
	out.debris.length = nd;
	out.bait.length = nb;
	return out;

}

// the weedline nearest ( x, z ) and how far it is (m), or null
export function nearestWeed( weed, x, z ) {

	let best = null, bd = Infinity;
	for ( const w of weed ) {

		const ex = w.x1 - w.x0, ez = w.z1 - w.z0, L2 = ex * ex + ez * ez;
		const t = Math.min( 1, Math.max( 0, ( ( x - w.x0 ) * ex + ( z - w.z0 ) * ez ) / L2 ) );
		const d = Math.hypot( x - w.x0 - ex * t, z - w.z0 - ez * t );
		if ( d < bd ) {

			bd = d;
			best = w;

		}

	}

	return best ? { weed: best, d: bd } : null;

}
