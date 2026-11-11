import { FLATS, flatsAt } from '../terrain/Flats.js';
import { MANGROVE } from '../terrain/Mangrove.js';

// (M17, stream 2) The creeks running on the tide: out on the ebb and in on the flood, the flats' and the mangroves'
// water through their channels, a current a kayak's carried by and a swimmer too.
//
// It's the tide's own prism: as the sea rises at r (m a second, the real tide's: the island's clock runs fast, the water
// doesn't, as the wind and the waves don't), every square metre the tide covers upstream of a channel's section takes
// r more of water a second, and it all comes in through that section: Q = r A, its speed Q over the section's own
// wetted area. Each piece of the flat drains to the nearest of its creeks (if that's nearer than the flat's edge,
// over which it runs off as a sheet), each branch into the creek it joins, the mangroves' creek out into the main one.
// The section's taken from the ground as it is, across the channel; the water's quickest in its deepest part, as a
// channel's is (Manning's: as its depth to the two-thirds), and still where it's dry.
//
// The flats here are small (about 10 ha) and their creeks broad and deep for them, so the current's gentle: a few
// centimetres a second over most of a flood, a decimetre or two at springs where a creek's narrow or shallow. Real
// mangrove creeks run as gently: ebbs past 10 cm/s and floods of 2 cm/s in the Fukido River's mangroves (Ishigaki), ebbs up
// to three times the floods at Whitianga (Horstman et al. 2019). Measured in docs/m17/tide-seen.md.
//
//   const C = new Creeks( heightAt );   C.at( x, z, sea, rate, out ) -> { x, z } (m/s), rate in m an island hour

// the channels, mouth (downstream) first: the flats' creeks, then the mangrove creek from where it comes out onto the
// flat in to its pool; `into`: the channel it runs into, and where along it (m from its mouth)
const STEP = 8; // m: the tables' step along a channel
const LEVELS = [ - 1.0, 1.0, 0.1 ]; // the sea levels the tables are worked at (m): from, to, step
const REACH = 1.8; // a channel's water reaches this many of its half-widths from its middle line
const ACROSS = 13; // its section's ground read at this many points across it

function smoothLine( pts, n = 5 ) {

	const out = [], P = ( i ) => pts[ Math.max( 0, Math.min( pts.length - 1, i ) ) ];
	for ( let i = 0; i < pts.length - 1; i ++ ) for ( let k = 0; k < n; k ++ ) {

		const t = k / n, t2 = t * t, t3 = t2 * t, a = P( i - 1 ), b = P( i ), c = P( i + 1 ), d = P( i + 2 );
		out.push( [ 0, 1 ].map( ( q ) => 0.5 * ( 2 * b[ q ] + ( c[ q ] - a[ q ] ) * t + ( 2 * a[ q ] - 5 * b[ q ] + 4 * c[ q ] - d[ q ] ) * t2 + ( 3 * b[ q ] - a[ q ] - 3 * c[ q ] + d[ q ] ) * t3 ) ) );

	}

	out.push( pts[ pts.length - 1 ] );
	return out;

}

// a channel: its line resampled every STEP m, each point's tangent (downstream to upstream), its half-width
function channel( pts, half ) {

	const L = smoothLine( pts );
	const seg = [];
	let len = 0;
	for ( let i = 0; i < L.length - 1; i ++ ) {

		const d = Math.hypot( L[ i + 1 ][ 0 ] - L[ i ][ 0 ], L[ i + 1 ][ 1 ] - L[ i ][ 1 ] );
		seg.push( [ L[ i ], L[ i + 1 ], len, d ] );
		len += d;

	}

	const n = Math.max( 2, Math.ceil( len / STEP ) + 1 ), P = [];
	for ( let k = 0; k < n; k ++ ) {

		const s = Math.min( len, k * STEP );
		const g = seg.find( ( q ) => s <= q[ 2 ] + q[ 3 ] ) || seg[ seg.length - 1 ];
		const t = g[ 3 ] > 0 ? ( s - g[ 2 ] ) / g[ 3 ] : 0, [ a, b ] = g;
		const tx = ( b[ 0 ] - a[ 0 ] ) / ( g[ 3 ] || 1 ), tz = ( b[ 1 ] - a[ 1 ] ) / ( g[ 3 ] || 1 );
		P.push( { x: a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t, z: a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t, tx, tz, s, half: half[ 0 ] + ( half[ 1 ] - half[ 0 ] ) * s / len } );

	}

	return { P, len };

}

const sameP = ( a, b ) => Math.abs( a[ 0 ] - b[ 0 ] ) < 1e-6 && Math.abs( a[ 1 ] - b[ 1 ] ) < 1e-6;

export const CHANNELS = ( () => {

	const C = FLATS.creeks.map( ( c ) => ( { ...channel( c.line, c.half ), line: c.line, into: null } ) );
	C.push( { ...channel( [ ...MANGROVE.creek, [ MANGROVE.pool.x, MANGROVE.pool.z ] ], [ MANGROVE.half[ 1 ], MANGROVE.half[ 0 ] ] ), line: MANGROVE.creek, into: null, mangrove: true } );
	// (a branch starts on a point of the creek it leaves; the mangrove creek comes out at the main creek's head)
	C.forEach( ( c, i ) => {

		if ( c.mangrove ) {

			c.into = { c: 0, s: C[ 0 ].len };
			return;

		}

		C.forEach( ( o, j ) => {

			if ( j === i || o.mangrove || c.into ) return;
			const k = o.line.findIndex( ( p ) => sameP( p, c.line[ 0 ] ) );
			if ( k < 0 ) return;
			let best = 0, d = Infinity;
			for ( const p of o.P ) {

				const e = Math.hypot( p.x - c.line[ 0 ][ 0 ], p.z - c.line[ 0 ][ 1 ] );
				if ( e < d ) {

					d = e;
					best = p.s;

				}

			}

			c.into = { c: j, s: best };

		} );

	} );
	return C;

} )();

const NL = Math.round( ( LEVELS[ 1 ] - LEVELS[ 0 ] ) / LEVELS[ 2 ] ) + 1;

export class Creeks {

	// heightAt( x, z ): the ground (TerrainData's, with the flats cut in)
	constructor( heightAt ) {

		this.heightAt = heightAt;
		this.ready = false;
		const xs = CHANNELS.flatMap( ( c ) => c.P.map( ( p ) => p.x ) ), zs = CHANNELS.flatMap( ( c ) => c.P.map( ( p ) => p.z ) );
		const m = 20;
		this.box = [ Math.min( ...xs ) - m, Math.min( ...zs ) - m, Math.max( ...xs ) + m, Math.max( ...zs ) + m ];

	}

	// on or by the channels (their box)?
	near( x, z ) {

		const b = this.box;
		return x >= b[ 0 ] && x <= b[ 2 ] && z >= b[ 1 ] && z <= b[ 3 ];

	}

	// the tables, worked out over a few frames the first time they're wanted (some tens of milliseconds in all): each
	// channel's area upstream of each of its points that's under water at each level (`up`, NL a point), and its section's
	// ground across it (`across`). build( ms ): work for about that long; -> ready
	build( ms = Infinity ) {

		if ( this.ready ) return true;
		const H = this.heightAt, cell = 8, t0 = performance.now();
		const [ x0, z0, x1, z1 ] = FLATS.window;
		if ( ! this._b ) {

			this.up = CHANNELS.map( ( c ) => new Float32Array( c.P.length * NL ) );
			this.across = CHANNELS.map( ( c ) => {

				const A = new Float32Array( c.P.length * ACROSS );
				c.P.forEach( ( p, k ) => {

					const w = p.half * REACH;
					for ( let a = 0; a < ACROSS; a ++ ) {

						const u = ( a / ( ACROSS - 1 ) * 2 - 1 ) * w;
						A[ k * ACROSS + a ] = H( p.x - p.tz * u, p.z + p.tx * u );

					}

				} );
				return A;

			} );
			this._b = { z: z0 + cell / 2, own: CHANNELS.map( ( c ) => new Float32Array( c.P.length * NL ) ), f: {},
				boxes: CHANNELS.map( ( c ) => [ Math.min( ...c.P.map( ( p ) => p.x ) ), Math.min( ...c.P.map( ( p ) => p.z ) ), Math.max( ...c.P.map( ( p ) => p.x ) ), Math.max( ...c.P.map( ( p ) => p.z ) ) ] ) };

		}

		// (each cell of the flats and the mangroves drains to its nearest channel point, unless the flat's edge is
		// nearer: its area into that point's table at every level above its ground. Only what the tide covers and
		// bares, its creeks' beds and the deep water off the edge apart, and only the channels whose box could be nearer;
		// a row at a time)
		const B = this._b, own = B.own, f = B.f;
		for ( ; B.z < z1; B.z += cell ) {

			if ( performance.now() - t0 > ms ) return false;
			const z = B.z;
			for ( let x = x0 + cell / 2; x < x1; x += cell ) {

				const g = H( x, z );
				if ( g > LEVELS[ 1 ] || g < - 1.2 ) continue;
				flatsAt( x, z, f );
				if ( f.on <= 0.5 ) continue;
				let best = 160 * 160, bc = - 1, bk = 0;
				for ( let ci = 0; ci < CHANNELS.length; ci ++ ) {

					const b = B.boxes[ ci ], ex = Math.max( b[ 0 ] - x, 0, x - b[ 2 ] ), ez = Math.max( b[ 1 ] - z, 0, z - b[ 3 ] );
					if ( ex * ex + ez * ez >= best ) continue;
					const P = CHANNELS[ ci ].P;
					for ( let k = 0; k < P.length; k ++ ) {

						const d = ( P[ k ].x - x ) ** 2 + ( P[ k ].z - z ) ** 2;
						if ( d < best ) {

							best = d;
							bc = ci;
							bk = k;

						}

					}

				}

				if ( bc < 0 || Math.sqrt( best ) > Math.max( f.edge, 0 ) ) continue;
				const from = Math.max( 0, Math.ceil( ( g - LEVELS[ 0 ] ) / LEVELS[ 2 ] ) );
				for ( let l = from; l < NL; l ++ ) own[ bc ][ bk * NL + l ] += cell * cell;

			}

		}

		// (summed down each channel from its head, the branches and the mangrove creek in where they join: the heads
		// first, so a branch's total is there before the creek it joins is summed)
		const done = new Set(), sum = ( ci ) => {

			if ( done.has( ci ) ) return;
			CHANNELS.forEach( ( o, j ) => o.into && o.into.c === ci && sum( j ) );
			const c = CHANNELS[ ci ], A = this.up[ ci ], O = own[ ci ];
			for ( let k = c.P.length - 1; k >= 0; k -- ) for ( let l = 0; l < NL; l ++ ) A[ k * NL + l ] = O[ k * NL + l ] + ( k < c.P.length - 1 ? A[ ( k + 1 ) * NL + l ] : 0 );
			CHANNELS.forEach( ( o, j ) => {

				if ( ! o.into || o.into.c !== ci ) return;
				const at = Math.min( c.P.length - 1, Math.round( o.into.s / STEP ) );
				for ( let k = 0; k <= at; k ++ ) for ( let l = 0; l < NL; l ++ ) A[ k * NL + l ] += this.up[ j ][ l ];

			} );
			done.add( ci );

		};

		CHANNELS.forEach( ( c, ci ) => sum( ci ) );
		this._b = null;
		this.ready = true;
		return true;

	}

	// the water's flow at ( x, z ) with the sea at `sea` (m) rising at `rate` (m an island hour, the tide's: < 0 falling):
	// out.x, out.z (m/s), and out.q, the section's flow (m3/s), out.u its mean speed (m/s); 0 off the channels
	at( x, z, sea, rate, out = { x: 0, z: 0, q: 0, u: 0 } ) {

		out.x = out.z = out.q = out.u = 0;
		const b = this.box;
		if ( x < b[ 0 ] || x > b[ 2 ] || z < b[ 1 ] || z > b[ 3 ] || ! rate ) return out;
		if ( ! this.ready ) return out;
		// (the nearest channel point, within its water's reach)
		let best = Infinity, bi = 0, bk = 0;
		CHANNELS.forEach( ( c, ci ) => {

			for ( let k = 0; k < c.P.length; k ++ ) {

				const p = c.P[ k ], d = ( p.x - x ) ** 2 + ( p.z - z ) ** 2;
				if ( d < best ) {

					best = d;
					bi = ci;
					bk = k;

				}

			}

		} );
		const bc = CHANNELS[ bi ], up = this.up[ bi ], across = this.across[ bi ];

		const p = bc.P[ bk ], w = p.half * REACH;
		if ( Math.sqrt( best ) > w ) return out;
		// (its area upstream under water now, between the levels)
		const lf = Math.min( NL - 1.001, Math.max( 0, ( sea - LEVELS[ 0 ] ) / LEVELS[ 2 ] ) ), l = Math.floor( lf ), t = lf - l;
		const A = up[ bk * NL + l ] * ( 1 - t ) + up[ bk * NL + l + 1 ] * t;
		// (its section: the depth across it)
		let area = 0, wide = 0;
		const n = ACROSS, dw = 2 * w / ( n - 1 );
		for ( let a = 0; a < n; a ++ ) {

			const d = sea - across[ bk * n + a ];
			if ( d > 0 ) {

				area += d * dw;
				wide += dw;

			}

		}

		const here = sea - this.heightAt( x, z );
		if ( area < 0.05 || here <= 0 ) return out;
		const q = A * rate / 3600, u = q / area;
		// (quickest in its deepest water, still in its shallows)
		const k = Math.min( 2, Math.pow( here / ( area / wide ), 2 / 3 ) );
		// (up the channel on the flood: its tangent runs from its mouth up)
		out.x = p.tx * u * k;
		out.z = p.tz * u * k;
		out.q = q;
		out.u = u;
		return out;

	}

}
