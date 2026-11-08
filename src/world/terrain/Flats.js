import { Noise2D, smoothstep } from '../../util/Noise.js';
import { MANGROVE, mangroveAt } from './Mangrove.js';
import { freeNow } from '../../core/FreeNow.js';

// (M17) The flats. The island had almost none: its beaches fall to several metres at once, and on the west the shelf
// reaches 5 m within 150 m of the shore (docs/m17/before.md). So a flat is made on the west, seaward of the mangroves
// and in the lee of the trades, as the flats of Andros's west side lie: white sand a foot or two under at mean water,
// in low bars a spring low bares and long troughs between, turtle grass in beds over the deeper half, the mangroves' mud
// along its inner side, creeks winding out across it to its edge (the mangrove creek's own carried on to the sea, and
// two more), a few potholes, and its edge falling away to the shelf as it was: the deeper water the permit, the
// sharks and the barracuda cruise. About 11 ha. Cut in as the island's loaded, as the north beach is: the ground
// only raised under it (the hills and the mangroves' floor left as they are) but for its creeks and holes, and faded
// out where its edge comes back to the shore at either end. Its masks too: sand, the grass, the mud by the mangroves,
// rubble on its edge's slope, no rock. What it changed is kept for the placing of the rocks and the plants as they
// were (TerrainData.uncut), in windows of the island's own arrays, not texel by texel: tens of thousands of texels.
//   FLATS: where, and its measures
//   flatsAt( x, z, out ) -> { on, edge, surface, creek, bed, grass, mud }: on (0..1: the flat itself), edge (m: in
//     from its edge, < 0 off it), surface (its sand's height there, m), creek (0..1) and its bed (m), grass (0..1),
//     mud (0..1: the mangroves')
//   cutFlats( T ) -> what it changed ({ i0, j0, w, h, heights, masks: Map( the island's array -> its window ) })

export const FLATS = {
	window: [ - 930, - 430, - 330, 150 ], // x0 z0 x1 z1 (m): where it's worked out (its edge's skirt inside it)
	// its edge, from the land below the west's sea cave round to the land south of the bight (x, z), each end ashore
	// (the ground there's never changed, so the flat meets the shore wherever the shore is); and back about the land
	edge: [ [ - 518, - 342 ], [ - 560, - 338 ], [ - 612, - 336 ], [ - 672, - 322 ], [ - 722, - 292 ], [ - 762, - 240 ], [ - 784, - 176 ], [ - 788, - 116 ], [ - 770, - 64 ], [ - 728, - 22 ], [ - 664, 8 ], [ - 586, 26 ], [ - 500, 34 ], [ - 432, 30 ], [ - 386, 18 ], [ - 346, 22 ] ],
	land: [ [ - 300, 60 ], [ - 300, - 362 ], [ - 518, - 362 ] ],
	rim: - 0.85, // m: its sand at the edge, rising to
	top: - 0.32, // m: from `inward` m in (a spring low, -0.6, bares the bars; a neap's, -0.3, the highest of them)
	inward: 100,
	bars: 0.17, // m: the sand's bars and troughs, rising and falling
	ripple: 0.04, // m: its sand waves
	drop: [ 0.2, 0.4 ], // m a m: the edge falling away past its rim, to the seabed as it was (steepening after 15 m)
	skirt: [ - 95, - 65 ], // m off the edge: where its slope's let go of, into the seabed as it was
	// creeks, from the edge in, winding, with their branches ((x, z), the bed (m) and half-width (m) at each end, mouth
	// first): the mangrove creek's carried on out to the sea, one to the north and one to the south
	creeks: [
		{ line: [ [ - 794, - 96 ], [ - 760, - 92 ], [ - 736, - 108 ], [ - 712, - 126 ], [ - 686, - 120 ], [ - 664, - 100 ], [ - 640, - 96 ], [ - 616, - 112 ], [ - 596, - 128 ], [ - 574, - 122 ], [ - 552, - 110 ], [ - 532, - 119 ] ], bed: [ - 2.4, - 1.6 ], half: [ 11, 4 ] },
		{ line: [ [ - 664, - 100 ], [ - 652, - 124 ], [ - 650, - 150 ], [ - 636, - 170 ], [ - 612, - 180 ], [ - 596, - 198 ], [ - 590, - 222 ] ], bed: [ - 1.5, - 0.7 ], half: [ 4.5, 1.5 ] },
		{ line: [ [ - 736, - 108 ], [ - 732, - 84 ], [ - 716, - 62 ], [ - 698, - 54 ] ], bed: [ - 1.4, - 0.75 ], half: [ 3.5, 1.4 ] },
		{ line: [ [ - 774, - 226 ], [ - 746, - 236 ], [ - 722, - 226 ], [ - 700, - 212 ], [ - 676, - 222 ], [ - 660, - 244 ], [ - 640, - 256 ], [ - 618, - 254 ], [ - 600, - 268 ], [ - 588, - 290 ] ], bed: [ - 2.0, - 0.8 ], half: [ 8, 2 ] },
		{ line: [ [ - 700, - 212 ], [ - 690, - 190 ], [ - 672, - 178 ], [ - 660, - 160 ] ], bed: [ - 1.3, - 0.7 ], half: [ 3.5, 1.4 ] },
		{ line: [ [ - 740, - 32 ], [ - 712, - 22 ], [ - 690, - 32 ], [ - 668, - 48 ], [ - 644, - 44 ], [ - 622, - 30 ], [ - 598, - 24 ], [ - 574, - 36 ], [ - 552, - 44 ], [ - 528, - 36 ], [ - 506, - 26 ] ], bed: [ - 1.8, - 0.8 ], half: [ 7, 2 ] },
		{ line: [ [ - 622, - 30 ], [ - 610, - 6 ], [ - 590, 8 ], [ - 566, 12 ] ], bed: [ - 1.2, - 0.7 ], half: [ 3, 1.3 ] },
	],
	// potholes (x, z, radius m, bed m)
	holes: [ [ - 694, - 168, 9, - 2.4 ], [ - 622, - 296, 6, - 1.6 ], [ - 690, - 76, 7, - 1.9 ], [ - 742, - 262, 5, - 1.5 ], [ - 560, - 70, 4, - 1.3 ] ],
	grass: 0.48, // m of water at mean, where the turtle grass begins to take the sand
	// the shore's waves over it: this much of them taken out, from this far in from its edge to this (m) (the
	// mangroves' own, ShoreField's, past them)
	calm: [ 0.94, 10, 70 ],
};

const noise = new Noise2D( 1717 );

// (a polyline's corners rounded off: Catmull-Rom through its points, `n` to a leg)
function smoothLine( pts, n = 6 ) {

	const out = [], P = ( i ) => pts[ Math.max( 0, Math.min( pts.length - 1, i ) ) ];
	for ( let i = 0; i < pts.length - 1; i ++ ) for ( let k = 0; k < n; k ++ ) {

		const t = k / n, t2 = t * t, t3 = t2 * t, a = P( i - 1 ), b = P( i ), c = P( i + 1 ), d = P( i + 2 );
		out.push( [ 0, 1 ].map( ( q ) => 0.5 * ( 2 * b[ q ] + ( c[ q ] - a[ q ] ) * t + ( 2 * a[ q ] - 5 * b[ q ] + 4 * c[ q ] - d[ q ] ) * t2 + ( 3 * b[ q ] - a[ q ] - 3 * c[ q ] + d[ q ] ) * t3 ) ) );

	}

	out.push( pts[ pts.length - 1 ] );
	return out;

}

// a polyline with its segments' lengths and its box (for skipping it from afar)
function line( pts ) {

	const segs = [];
	let s = 0, x0 = Infinity, z0 = Infinity, x1 = - Infinity, z1 = - Infinity;
	for ( let i = 0; i < pts.length - 1; i ++ ) {

		const [ ax, az ] = pts[ i ], [ bx, bz ] = pts[ i + 1 ], L = Math.hypot( bx - ax, bz - az );
		segs.push( [ ax, az, bx - ax, bz - az, L, s ] );
		s += L;

	}

	for ( const [ x, z ] of pts ) {

		x0 = Math.min( x0, x ); z0 = Math.min( z0, z ); x1 = Math.max( x1, x ); z1 = Math.max( z1, z );

	}

	return { segs, length: s, box: [ x0, z0, x1, z1 ] };

}

// the nearest point of a polyline to ( x, z ): [ distance, how far along it (m) ]
function nearest( L, x, z, out ) {

	let best = Infinity, at = 0;
	for ( const [ ax, az, ex, ez, len, s ] of L.segs ) {

		const t = Math.min( 1, Math.max( 0, ( ( x - ax ) * ex + ( z - az ) * ez ) / ( len * len ) ) );
		const d = Math.hypot( x - ax - ex * t, z - az - ez * t );
		if ( d < best ) {

			best = d;
			at = s + t * len;

		}

	}

	out[ 0 ] = best;
	out[ 1 ] = at;
	return out;

}

const EDGE = line( smoothLine( FLATS.edge, 5 ) );
const OUTLINE = [ ...FLATS.edge, ...FLATS.land ];
const CREEKS = FLATS.creeks.map( ( c ) => ( { ...c, L: line( smoothLine( c.line, 5 ) ) } ) );
const _n = [ 0, 0 ], _m = { stand: 0, creek: 0, fringe: 0, floor: 0, bed: 0 };

// inside the outline (its edge and the land behind it)?
function inside( x, z ) {

	let c = false;
	for ( let i = 0, j = OUTLINE.length - 1; i < OUTLINE.length; j = i ++ ) {

		const [ xi, zi ] = OUTLINE[ i ], [ xj, zj ] = OUTLINE[ j ];
		if ( ( zi > z ) !== ( zj > z ) && x < ( xj - xi ) * ( z - zi ) / ( zj - zi ) + xi ) c = ! c;

	}

	return c;

}

const OUT = { on: 0, edge: 0, surface: 0, creek: 0, bed: 0, grass: 0, mud: 0, ends: 0 };
const SLOW = { bars: 0, lift: 0, grass: 0, mud: 0 }, _c = { c: 0, bed: 0 };

// the slow noises at ( x, z ): the bars' and troughs' rise and fall, the rim's wander, where the grass takes, and the
// mangroves' mud (the cut reads them off a 4 m grid, the mud an 8 m one)
function slowAt( x, z, n = SLOW, mud = true ) {

	n.bars = FLATS.bars * ( noise.fbm( x / 70 + 3.3, z / 34 - 1.7, 3 ) * 1.2 + 0.25 * noise.fbm( x / 14, z / 22, 2 ) );
	n.lift = 18 * noise.fbm( x / 50, z / 50 + 9.1, 2 );
	n.grass = 0.35 * noise.fbm( x / 38 - 7.7, z / 38, 3 );
	if ( mud ) n.mud = mudAt( x, z );
	return n;

}

// (the mud of the mangroves' stand, and some way off it, its fringe's; faded out before the stand's window ends, where
// its fringe would be cut off short)
const mudAt = ( x, z ) => {

	mangroveAt( x, z, _m );
	const [ x0, z0, x1, z1 ] = MANGROVE.window;
	return Math.max( _m.stand, _m.fringe * 0.85 * smoothstep( 0, 20, Math.min( x - x0, z - z0, x1 - x, z1 - z ) ) );

};

// a creek's channel at ( x, z ), dc0 m from its middle line, k of the way up it (0 its mouth), on sand at h: how much
// it's the channel (c, 0..1) and its bed there (m: the middle's, its banks shelving up to the sand)
function creekAt( C, dc0, k, x, z, h, o = _c ) {

	const half = ( C.half[ 0 ] + ( C.half[ 1 ] - C.half[ 0 ] ) * k ) * ( 1 + 0.25 * noise.fbm( k * C.L.length / 24, 4.4, 2 ) );
	const dc = dc0 + 1.5 * noise.fbm( x / 7, z / 7, 2 );
	o.c = smoothstep( half * 1.8, half * 0.6, dc );
	const b0 = C.bed[ 0 ] + ( C.bed[ 1 ] - C.bed[ 0 ] ) * k;
	o.bed = b0 + ( h - b0 ) * smoothstep( 0, half * 1.8, dc ) ** 1.5;
	return o;

}

// the sand at ( x, z ), e m in from the edge (< 0 off it), from the slow noises there (n)
function sandAt( x, z, e, n ) {

	const F = FLATS, lift = smoothstep( 0, F.inward, e + n.lift );
	if ( e < 0 ) {

		// (past the rim, falling away)
		const past = - e, D = F.drop;
		return F.rim + n.bars * 0.35 - ( past < 15 ? D[ 0 ] * past : D[ 0 ] * 15 + D[ 1 ] * ( past - 15 ) );

	}

	// the rim rising to the top inward, in bars and troughs across the flood's way in, and sand waves on them
	return F.rim + ( F.top - F.rim ) * lift + n.bars * ( 0.35 + 0.65 * lift ) + F.ripple * noise.noise( x / 5.5 + z / 13, z / 7.5 - x / 19 );

}

// the potholes at ( x, z ) over a creek's (creek, bed) on sand at h: into out
function holesAt( x, z, h, out ) {

	for ( const [ hx, hz, r, hb ] of FLATS.holes ) {

		const reach = r * 1.25 + 4;
		if ( Math.abs( hx - x ) > reach || Math.abs( hz - z ) > reach ) continue;
		const d0 = Math.hypot( hx - x, hz - z ) - r;
		if ( d0 > 4 + r * 0.25 ) continue;
		const dh = d0 - r * 0.25 * noise.fbm( x / 6, z / 6, 2 );
		if ( dh > 4 ) continue;
		const c = smoothstep( 4, - r * 0.5, dh );
		if ( c <= out.creek ) continue;
		out.creek = c;
		out.bed = hb + ( h - hb ) * smoothstep( - r * 0.6, 4, dh );

	}

}

// the rest of it at ( x, z ) from the sand (h), its creeks (out.creek, out.bed), its edge (e, ends) and the slow noises
function finish( x, z, h, e, ends, n, out ) {

	holesAt( x, z, h, out );
	out.edge = e;
	out.ends = ends;
	out.surface = out.creek > 0 ? Math.min( h, out.bed ) : h;
	out.on = ends * smoothstep( - 2, 6, e );
	// turtle grass in beds where the water's deeper at mean, and none on the bars nor the creeks' beds; the
	// mangroves' mud along their edge
	const deep = - out.surface;
	out.grass = smoothstep( FLATS.grass - 0.12, FLATS.grass + 0.2, deep + n.grass ) * ( 1 - smoothstep( 1.2, 2, deep ) ) * ( 1 - 0.85 * out.creek );
	out.mud = n.mud;
	return out;

}

export function flatsAt( x, z, out = OUT ) {

	const F = FLATS, [ x0, z0, x1, z1 ] = F.window;
	out.on = 0; out.edge = - Infinity; out.surface = - 30; out.creek = 0; out.bed = 0; out.grass = 0; out.mud = 0; out.ends = 0;
	if ( x < x0 || x > x1 || z < z0 || z > z1 ) return out;
	const [ d ] = nearest( EDGE, x, z, _n );
	const e = inside( x, z ) ? d : - d;
	// (its skirt let go of, off its edge)
	const ends = smoothstep( F.skirt[ 0 ], F.skirt[ 1 ], e );
	const n = slowAt( x, z ), h = sandAt( x, z, e, n );
	// the creeks winding out to the edge (the deepest of them where two meet)
	for ( const C of CREEKS ) {

		const b = C.L.box, reach = C.half[ 0 ] * 2 + 6;
		if ( x < b[ 0 ] - reach || x > b[ 2 ] + reach || z < b[ 1 ] - reach || z > b[ 3 ] + reach ) continue;
		const [ dc0, sc ] = nearest( C.L, x, z, _n );
		creekAt( C, dc0, sc / C.L.length, x, z, h );
		if ( _c.c > out.creek ) {

			out.creek = _c.c;
			out.bed = _c.bed;

		}

	}

	return finish( x, z, h, e, ends, n, out );

}

// ---- the cut: the same, worked out over the island's texels in a window. The distances to the edge and to the creeks'
// middles by a chamfer from their lines drawn into it (each texel near a line its exact distance, how far along and
// which, carried out from there), inside the outline by scanlines, the slow noises off a 4 m grid: some tens of
// milliseconds, where a texel at a time took seconds

// each line's texels within 1.5 of it: their exact distance (m), and how far along (m) into D, S, and `id` into I
function drawLine( L, D, S, I, id, W, o, t ) {

	for ( const [ ax, az, ex, ez, len, s0 ] of L.segs ) {

		const steps = Math.ceil( len / ( t * 0.5 ) );
		for ( let q = 0; q <= steps; q ++ ) {

			const px = ax + ex * q / steps, pz = az + ez * q / steps;
			const ci = Math.floor( ( px - o ) / t ) - W.i0, cj = Math.floor( ( pz - o ) / t ) - W.j0;
			for ( let dj = - 1; dj <= 1; dj ++ ) for ( let di = - 1; di <= 1; di ++ ) {

				const i = ci + di, j = cj + dj;
				if ( i < 0 || j < 0 || i >= W.w || j >= W.h ) continue;
				const x = o + ( W.i0 + i + 0.5 ) * t, z = o + ( W.j0 + j + 0.5 ) * t;
				const u = Math.min( 1, Math.max( 0, ( ( x - ax ) * ex + ( z - az ) * ez ) / ( len * len ) ) );
				const d = Math.hypot( x - ax - ex * u, z - az - ez * u ), k = j * W.w + i;
				if ( d < D[ k ] ) {

					D[ k ] = d;
					S[ k ] = s0 + u * len;
					if ( I ) I[ k ] = id;

				}

			}

		}

	}

}

// a two-pass chamfer of D over the window (m), carrying S (and I) out from the nearest
function chamfer( D, S, I, w, h, t ) {

	const t2 = t * Math.SQRT2;
	const take = ( q, n, c ) => {

		if ( D[ n ] + c < D[ q ] ) {

			D[ q ] = D[ n ] + c;
			S[ q ] = S[ n ];
			if ( I ) I[ q ] = I[ n ];

		}

	};
	for ( let j = 0; j < h; j ++ ) for ( let i = 0; i < w; i ++ ) {

		const q = j * w + i;
		if ( i > 0 ) take( q, q - 1, t );
		if ( j > 0 ) {

			take( q, q - w, t );
			if ( i > 0 ) take( q, q - w - 1, t2 );
			if ( i < w - 1 ) take( q, q - w + 1, t2 );

		}

	}

	for ( let j = h - 1; j >= 0; j -- ) for ( let i = w - 1; i >= 0; i -- ) {

		const q = j * w + i;
		if ( i < w - 1 ) take( q, q + 1, t );
		if ( j < h - 1 ) {

			take( q, q + w, t );
			if ( i < w - 1 ) take( q, q + w + 1, t2 );
			if ( i > 0 ) take( q, q + w - 1, t2 );

		}

	}

}

// a window of one of the island's arrays, as it was where the flats changed it
class Kept {

	constructor( W, Type ) {

		this.W = W;
		this.data = new Type( W.w * W.h );

	}

	at( k, res ) {

		const W = this.W, i = ( k % res ) - W.i0, j = ( ( k - ( k % res ) ) / res ) - W.j0;
		return i >= 0 && j >= 0 && i < W.w && j < W.h && W.changed[ j * W.w + i ] ? j * W.w + i : - 1;

	}

}

// (M17) what the flats changed in a mask, as TerrainData.uncut's masksBefore keeps a mask's: has( texel ), get( texel ),
// after what the north beach and the trail kept of it (a Map) if they did
export class KeptMask {

	constructor( before, kept, res ) {

		this.before = before || null;
		this.kept = kept;
		this.res = res;

	}

	// (as a Map's: none kept, 0)
	get size() {

		return ( this.before !== null ? this.before.size : 0 ) + this.kept.W.w * this.kept.W.h;

	}

	has( k ) {

		return ( this.before !== null && this.before.has( k ) ) || this.kept.at( k, this.res ) >= 0;

	}

	get( k ) {

		if ( this.before !== null && this.before.has( k ) ) return this.before.get( k );
		const q = this.kept.at( k, this.res );
		return q >= 0 ? this.kept.data[ q ] : undefined;

	}

}

// (M17) how much of the shore's waves are left at ( x, z ) over the flat (1 off it), from cutFlats' grid (`calm`)
export function calmAt( C, x, z ) {

	if ( ! C ) return 1;
	const fx = ( x - C.x0 ) / C.cell, fz = ( z - C.z0 ) / C.cell;
	if ( fx < 0 || fz < 0 || fx >= C.w - 1 || fz >= C.h - 1 ) return 1;
	const a = Math.floor( fx ), b = Math.floor( fz );
	return bilinear( C.data, b * C.w + a, C.w, fx - a, fz - b );

}

const bilinear = ( A, g, w, tx, tz ) => ( A[ g ] * ( 1 - tx ) + A[ g + 1 ] * tx ) * ( 1 - tz ) + ( A[ g + w ] * ( 1 - tx ) + A[ g + w + 1 ] * tx ) * tz;

// cut the flats into the island's ground and masks (TerrainData: heights, rock, sand, seagrass, rubble), keeping
// what each changed texel was
export function cutFlats( T ) {

	const F = FLATS, res = T.res, t = T.texel, o = T.origin, H = T.heights;
	const i0 = Math.max( 1, Math.floor( ( F.window[ 0 ] - o ) / t ) ), i1 = Math.min( res - 2, Math.ceil( ( F.window[ 2 ] - o ) / t ) );
	const j0 = Math.max( 1, Math.floor( ( F.window[ 1 ] - o ) / t ) ), j1 = Math.min( res - 2, Math.ceil( ( F.window[ 3 ] - o ) / t ) );
	const W = { i0, j0, w: i1 - i0 + 1, h: j1 - j0 + 1, changed: null }, N = W.w * W.h;
	W.changed = new Uint8Array( N );
	// the edge's distance and how far along it; the creeks' middles' distance, how far up and which
	const ED = new Float32Array( N ).fill( 1e9 ), ES = new Float32Array( N );
	drawLine( EDGE, ED, ES, null, 0, W, o, t );
	chamfer( ED, ES, null, W.w, W.h, t );
	const CD = new Float32Array( N ).fill( 1e9 ), CS = new Float32Array( N ), CI = new Uint8Array( N );
	CREEKS.forEach( ( C, c ) => drawLine( C.L, CD, CS, CI, c, W, o, t ) );
	chamfer( CD, CS, CI, W.w, W.h, t );
	// the slow noises on a 4 m grid over it, the mud on an 8 m one
	const G = 4, gw = Math.ceil( W.w * t / G ) + 2, gh = Math.ceil( W.h * t / G ) + 2, gx0 = o + i0 * t, gz0 = o + j0 * t;
	const NB = new Float32Array( gw * gh ), NL = new Float32Array( gw * gh ), NG = new Float32Array( gw * gh );
	for ( let b = 0; b < gh; b ++ ) for ( let a = 0; a < gw; a ++ ) {

		const n = slowAt( gx0 + a * G, gz0 + b * G, SLOW, false ), q = b * gw + a;
		NB[ q ] = n.bars;
		NL[ q ] = n.lift;
		NG[ q ] = n.grass;

	}

	const G8 = 8, mw = Math.ceil( W.w * t / G8 ) + 2, mh = Math.ceil( W.h * t / G8 ) + 2, NM = new Float32Array( mw * mh );
	for ( let b = 0; b < mh; b ++ ) for ( let a = 0; a < mw; a ++ ) NM[ b * mw + a ] = mudAt( gx0 + a * G8, gz0 + b * G8 );

	// (the mangroves' own creek and its pool, which the flat's never to fill: its box)
	const MC = [ ...MANGROVE.creek, [ MANGROVE.pool.x, MANGROVE.pool.z ] ], mc = [ Math.min( ...MC.map( ( p ) => p[ 0 ] ) ) - 22, Math.min( ...MC.map( ( p ) => p[ 1 ] ) ) - 22, Math.max( ...MC.map( ( p ) => p[ 0 ] ) ) + 22, Math.max( ...MC.map( ( p ) => p[ 1 ] ) ) + 22 ];
	const heights = new Kept( W, Float32Array );
	const masks = new Map(), kept = [];
	for ( const a of [ T.sand, T.rock, T.seagrass, T.rubble ] ) if ( a ) {

		masks.set( a, new Kept( W, a.constructor ) );
		kept.push( a, masks.get( a ).data );

	}
	const f = { ...OUT }, n = { ...SLOW }, cross = [];
	for ( let j = j0; j <= j1; j ++ ) {

		const z = o + ( j + 0.5 ) * t;
		// (inside the outline along this row: where it crosses it, in order)
		cross.length = 0;
		for ( let p = 0, r = OUTLINE.length - 1; p < OUTLINE.length; r = p ++ ) {

			const [ xp, zp ] = OUTLINE[ p ], [ xr, zr ] = OUTLINE[ r ];
			if ( ( zp > z ) !== ( zr > z ) ) cross.push( ( xr - xp ) * ( z - zp ) / ( zr - zp ) + xp );

		}

		cross.sort( ( a, b ) => a - b );
		const gzf = ( z - gz0 ) / G, gb = Math.min( gh - 2, Math.floor( gzf ) ), tz = gzf - gb;
		const mzf = ( z - gz0 ) / G8, mb = Math.min( mh - 2, Math.floor( mzf ) ), tm = mzf - mb;
		let c0 = 0;
		for ( let i = i0; i <= i1; i ++ ) {

			const x = o + ( i + 0.5 ) * t, k = j * res + i, was = H[ k ];
			// (never the land: above the highest the tide reaches, and the creeks never cut into it)
			if ( was > 0.8 ) continue;
			const q = ( j - j0 ) * W.w + ( i - i0 );
			while ( c0 < cross.length && cross[ c0 ] < x ) c0 ++;
			const e = c0 % 2 === 1 ? ED[ q ] : - ED[ q ];
			const ends = smoothstep( F.skirt[ 0 ], F.skirt[ 1 ], e );
			if ( ends <= 0 ) continue;
			const gxf = ( x - gx0 ) / G, ga = Math.min( gw - 2, Math.floor( gxf ) ), tx = gxf - ga, g = gb * gw + ga;
			n.bars = bilinear( NB, g, gw, tx, tz );
			n.lift = bilinear( NL, g, gw, tx, tz );
			n.grass = bilinear( NG, g, gw, tx, tz );
			const mxf = ( x - gx0 ) / G8, ma = Math.min( mw - 2, Math.floor( mxf ) );
			n.mud = bilinear( NM, mb * mw + ma, mw, mxf - ma, tm );
			const h = sandAt( x, z, e, n );
			f.creek = 0;
			f.bed = 0;
			const C = CREEKS[ CI[ q ] ];
			if ( CD[ q ] < C.half[ 0 ] * 1.8 * 1.25 + 3 ) {

				creekAt( C, CD[ q ], CS[ q ] / C.L.length, x, z, h );
				f.creek = _c.c;
				f.bed = _c.bed;

			}

			finish( x, z, h, e, ends, n, f );
			let to = Math.max( was, f.surface );
			if ( f.creek > 0 && f.edge > - 4 && was < 0.3 ) to = Math.min( to, f.bed );
			to = was + ( to - was ) * ends;
			// (the mangroves' creek and pool left open: raised no higher than their own bed, so the creek runs on out
			// over the flat where it was deeper)
			if ( to > was && was < - 0.45 && x > mc[ 0 ] && x < mc[ 2 ] && z > mc[ 1 ] && z < mc[ 3 ] ) {

				mangroveAt( x, z, _m );
				to += ( Math.max( was, Math.min( to, _m.bed ) ) - to ) * smoothstep( 0, 0.4, _m.creek );

			}
			const on = f.on, slope = e < 0 ? ends * smoothstep( 0, - 8, e ) * smoothstep( - 60, - 20, e ) : 0;
			if ( Math.abs( to - was ) < 1e-4 && on <= 0 && slope <= 0 ) continue;
			W.changed[ q ] = 1;
			heights.data[ q ] = was;
			for ( let p = 0; p < kept.length; p += 2 ) kept[ p + 1 ][ q ] = kept[ p ][ k ];
			H[ k ] = to;
			// (its sand: white on the flat, the mangroves' mud along them; the grass in its beds; rubble and a little
			// grass on the edge's slope; no rock under the sand)
			if ( on > 0 ) {

				const sand = 255 - 205 * f.mud;
				if ( T.sand ) T.sand[ k ] = Math.round( T.sand[ k ] + ( sand - T.sand[ k ] ) * on );
				if ( T.rock ) T.rock[ k ] *= 1 - on;
				if ( T.seagrass ) T.seagrass[ k ] = Math.round( T.seagrass[ k ] + ( 255 * f.grass * ( 1 - f.mud ) - T.seagrass[ k ] ) * on );
				if ( T.rubble ) T.rubble[ k ] = Math.round( T.rubble[ k ] * ( 1 - on ) );

			}

			if ( slope > 0 ) {

				if ( T.rubble ) T.rubble[ k ] = Math.round( T.rubble[ k ] + ( 150 * ( 0.5 + 0.5 * noise.noise( x / 9, z / 9 ) ) - T.rubble[ k ] ) * slope );
				if ( T.rock ) T.rock[ k ] *= 1 - slope;
				if ( T.sand ) T.sand[ k ] = Math.round( T.sand[ k ] + ( 200 - T.sand[ k ] ) * slope );

			}

		}

	}

	// (the shore's waves let go of over the flat: an 8 m grid of how much of them is left, read by ShoreField's solve.
	// A swell breaks on its rim and dies away over the first tens of metres of a flat in a few tenths of a metre of
	// water; inside it's calm, but for the wind's own ripples)
	const calm = new Float32Array( mw * mh );
	for ( let b = 0; b < mh; b ++ ) for ( let a = 0; a < mw; a ++ ) {

		const x = gx0 + a * G8, z = gz0 + b * G8, i = Math.min( W.w - 1, Math.max( 0, Math.floor( ( x - o ) / t ) - i0 ) ), j = Math.min( W.h - 1, Math.max( 0, Math.floor( ( z - o ) / t ) - j0 ) );
		const e = inside( x, z ) ? ED[ j * W.w + i ] : - ED[ j * W.w + i ];
		calm[ b * mw + a ] = 1 - F.calm[ 0 ] * smoothstep( F.calm[ 1 ], F.calm[ 2 ], e ) * ( 1 - NM[ b * mw + a ] );

	}

	freeNow( ED, ES, CD, CS, CI, NB, NL, NG, NM );
	return { ...W, heights, masks, calm: { x0: gx0, z0: gz0, cell: G8, w: mw, h: mh, data: calm } };

}
