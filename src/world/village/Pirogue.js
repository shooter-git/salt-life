import { Matrix4, Vector3 } from '../../engine/index.js';
import { Builder, gridPart } from './GeoBuilder.js';
import { WOOD, lin } from '../Props.js';
import { mulberry32 } from '../../util/Noise.js';

// (M16) A pirogue, the working boat of the Caribbean's windward landing beaches, shaped after photographs of them at
// San Fernando, Moruga and Mayaro in Trinidad, her size the fisheries' own for Grenada's: 7.3 m by 1.9 m, 0.7 m deep,
// open from end to end. Long and low aft, her sheer sweeping up forward to a high, sharp, raked bow; a hard turn of
// bilge aft, a deep V forward; a flat transom with a big outboard on it. Painted as they are: a coloured top strake, the
// topsides white, a dark bottom, all of it scraped and patched, her inside bright blue, her name on her bow by hand.
// Everything's in the village's wood material, so she's one draw call, for she moves. Keel at y = 0, forward +z.
//   const P = buildPirogue( { lite } ) -> { geometry, drawn (indices without her lines to the jetty), all, motor }
// motor: { start, count, pivot } the outboard's vertices, to tilt it clear of the water (tiltMotor).

export const PIROGUE = { length: 7.3, beam: 1.9, depth: 0.7, draft: 0.3, name: 'STILL TRYING', quarterX: 0.8, quarterZ: - 3, washZ: - 3.9 };

const L = PIROGUE.length, HB = PIROGUE.beam / 2;
const clamp = ( x, a = 0, b = 1 ) => Math.min( b, Math.max( a, x ) );
const ss = ( a, b, x ) => {

	const t = clamp( ( x - a ) / ( b - a ) );
	return t * t * ( 3 - 2 * t );

};
const mix = ( a, b, t ) => a + ( b - a ) * t;

// t: 0 at the transom, 1 at the stem's head. Her lines:
export const sheerAt = ( t ) => 0.68 + 0.02 * t + 0.62 * Math.pow( Math.max( 0, ( t - 0.45 ) / 0.55 ), 2.3 );
export const keelAt = ( t ) => 1.32 * Math.pow( Math.max( 0, ( t - 0.55 ) / 0.45 ), 2.6 );
export const halfAt = ( t ) => t < 0.42 ? HB * ( 0.82 + 0.18 * Math.sin( t / 0.42 * Math.PI / 2 ) ) : HB * ( 1 - Math.pow( ( t - 0.42 ) / 0.58, 2.2 ) );

// a point on her skin: s from the keel (0) to the sheer (1); side +1 starboard... -1. The chine moves up and in forward.
function skin( t, s, side, out = [ 0, 0, 0 ] ) {

	const f = ss( 0.45, 0.95, t ), c = 0.42, xc = mix( 0.74, 0.4, f ), yc = mix( 0.13, 0.34, f );
	let x, y;
	if ( s < c ) {

		const u = s / c;
		x = xc * u;
		y = yc * u;

	} else {

		const u = ( s - c ) / ( 1 - c );
		x = xc + ( 1 - xc ) * Math.pow( u, 0.92 );
		y = yc + ( 1 - yc ) * u;

	}

	const k = keelAt( t ), h = sheerAt( t );
	out[ 0 ] = side * halfAt( t ) * x;
	out[ 1 ] = k + ( h - k ) * y;
	out[ 2 ] = - L / 2 + t * L;
	return out;

}

const _a = [ 0, 0, 0 ], _b = [ 0, 0, 0 ], _c = [ 0, 0, 0 ], _d = [ 0, 0, 0 ], _ta = new Vector3(), _tb = new Vector3();
function normalOf( t, s, side, out = [ 0, 0, 0 ] ) {

	const e = 0.012;
	skin( Math.max( 0, t - e ), s, side, _a );
	skin( Math.min( 1, t + e ), s, side, _b );
	skin( t, Math.max( 0, s - e * 3 ), side, _c );
	skin( t, Math.min( 1, s + e * 3 ), side, _d );
	_ta.set( _b[ 0 ] - _a[ 0 ], _b[ 1 ] - _a[ 1 ], _b[ 2 ] - _a[ 2 ] );
	_tb.set( _d[ 0 ] - _c[ 0 ], _d[ 1 ] - _c[ 1 ], _d[ 2 ] - _c[ 2 ] );
	_ta.cross( _tb ).normalize();
	// (outward)
	if ( _ta.x * side - _ta.y * 0.6 < 0 ) _ta.negate();
	out[ 0 ] = _ta.x;
	out[ 1 ] = _ta.y;
	out[ 2 ] = _ta.z;
	return out;

}

// the s at a height y on her skin at t (by halving: it rises with s)
function sAtY( t, y ) {

	let lo = 0, hi = 1;
	for ( let i = 0; i < 12; i ++ ) {

		const m = ( lo + hi ) / 2;
		if ( skin( t, m, 1, _a )[ 1 ] < y ) lo = m;
		else hi = m;

	}

	return ( lo + hi ) / 2;

}

// the boat's hand-painted letters, as strokes in a unit square
const LETTERS = {
	S: [ [ [ 1, 0.85 ], [ 0.7, 1 ], [ 0.3, 1 ], [ 0.02, 0.8 ], [ 0.15, 0.56 ], [ 0.85, 0.44 ], [ 1, 0.2 ], [ 0.7, 0 ], [ 0.3, 0 ], [ 0, 0.15 ] ] ],
	T: [ [ [ 0, 1 ], [ 1, 1 ] ], [ [ 0.5, 1 ], [ 0.5, 0 ] ] ],
	I: [ [ [ 0.5, 1 ], [ 0.5, 0 ] ] ],
	L: [ [ [ 0, 1 ], [ 0, 0 ], [ 0.9, 0 ] ] ],
	R: [ [ [ 0, 0 ], [ 0, 1 ], [ 0.7, 1 ], [ 0.95, 0.8 ], [ 0.7, 0.52 ], [ 0, 0.52 ] ], [ [ 0.45, 0.52 ], [ 1, 0 ] ] ],
	Y: [ [ [ 0, 1 ], [ 0.5, 0.5 ], [ 1, 1 ] ], [ [ 0.5, 0.5 ], [ 0.5, 0 ] ] ],
	N: [ [ [ 0, 0 ], [ 0, 1 ], [ 1, 0 ], [ 1, 1 ] ] ],
	G: [ [ [ 1, 0.85 ], [ 0.7, 1 ], [ 0.3, 1 ], [ 0, 0.7 ], [ 0, 0.3 ], [ 0.3, 0 ], [ 0.7, 0 ], [ 1, 0.3 ], [ 1, 0.5 ], [ 0.55, 0.5 ] ] ],
};

export function buildPirogue( { lite = false, seed = 0.37 } = {} ) {

	const B = new Builder(), r = mulberry32( 24091 ), rnd = () => r();
	B.lite = lite;
	const NT = lite ? 20 : 30, I = new Matrix4();
	const paint = ( hex, wear = 0.72, pattern = 0 ) => ( { tint: lin( hex ), data: WOOD( seed + rnd() * 0.2, 0.45, wear, pattern ) } );
	const TOP = 0x2c6a44, WHITE = 0xd9d5c8, BOTTOM = 0x5a2f26, INSIDE = 0x2474b4, SEAT = 0xc9c6b8;
	// t along her: bunched toward the bow, where her lines turn
	const T = ( i ) => 0.002 + 0.993 * Math.pow( i / NT, 0.88 );
	const top = ( t ) => sheerAt( t ) - mix( 0.13, 0.22, ss( 0.5, 1, t ) ) - 0.012 * Math.sin( t * 19 ); // the top strake's lower edge
	const boot = ( t ) => PIROGUE.draft + 0.04 + 0.012 * Math.sin( t * 31 ) + 0.05 * t * t; // her boot top

	// ---- her skin, each band its own, so its edge is a painted line
	for ( const side of [ - 1, 1 ] ) {

		const band = ( lo, hi, rows, col ) => {

			const part = gridPart( NT, rows, ( i, j ) => {

				const t = T( i ), a = lo( t ), b = Math.max( a, hi( t ) ), s = a + ( b - a ) * j / rows, g = ( sheerAt( t ) - keelAt( t ) + halfAt( t ) ) * s;
				return { p: skin( t, s, side ).slice(), n: normalOf( t, s, side ).slice(), uv: [ t * L, g ] };

			} );
			B.add( 'wood', part, I, col.tint, col.data );

		};

		const sBoot = ( t ) => t > 0.85 ? 0 : sAtY( t, boot( t ) ), sTop = ( t ) => sAtY( t, top( t ) );
		band( () => 0, sBoot, lite ? 3 : 4, paint( BOTTOM, 0.55, 6 ) );
		band( sBoot, sTop, lite ? 2 : 3, paint( WHITE, 0.7, 6 ) );
		band( sTop, () => 1, lite ? 1 : 2, paint( TOP, 0.62, 6 ) );

		// ---- scraped and patched: what the beach and the jetty have done to her paint (her own, each side)
		const patch = ( t0, y0, w, h, col ) => {

			const n = 7, c = [ ...Array( n ) ].map( ( _, k ) => {

				const a = k / n * Math.PI * 2, q = 0.55 + rnd() * 0.65;
				return [ t0 + Math.cos( a ) * w * q / L, y0 + Math.sin( a ) * h * q ];

			} );
			const at = ( t, y ) => {

				const q = clamp( t, 0.004, 0.98 ), s = sAtY( q, y ), p = skin( q, s, side ), nn = normalOf( q, s, side );
				return { p: [ p[ 0 ] + nn[ 0 ] * 0.007, p[ 1 ] + nn[ 1 ] * 0.007, p[ 2 ] + nn[ 2 ] * 0.007 ], n: nn.slice() };

			};
			const mid = at( t0, y0 ), rim = c.map( ( q ) => at( q[ 0 ], q[ 1 ] ) );
			const part = gridPart( n, 1, ( i, j ) => j === 0 ? { ...mid, uv: [ t0 * L, y0 ] } : { ...rim[ i % n ], uv: [ c[ i % n ][ 0 ] * L, c[ i % n ][ 1 ] ] } );
			B.add( 'wood', part, I, col.tint, col.data );

		};

		const scars = lite ? 8 : 15;
		for ( let k = 0; k < scars; k ++ ) {

			const t = 0.04 + rnd() * 0.72, y = sheerAt( t ), low = boot( t );
			const pick = rnd();
			if ( pick < 0.4 ) patch( t, low + 0.03 + rnd() * 0.08, 0.2 + rnd() * 0.5, 0.025 + rnd() * 0.03, paint( 0x7f8f70, 0.5 ) ); // weed and old green along her waterline
			else if ( pick < 0.65 ) patch( t, top( t ) - 0.03 - rnd() * 0.1, 0.06 + rnd() * 0.25, 0.015 + rnd() * 0.02, paint( 0x8f8a78, 0.35 ) ); // rubbed through to the wood's undercoat
			else if ( pick < 0.85 ) patch( t, low - 0.07 - rnd() * 0.05, 0.15 + rnd() * 0.3, 0.03, paint( 0x2f7f86, 0.6 ) ); // an old coat of teal showing through the bottom
			else patch( t, y - 0.07, 0.08 + rnd() * 0.18, 0.02, paint( WHITE, 0.4 ) ); // the top strake knocked back to white

		}

		// ---- her name, by hand, on the white of her bow (reading from bow to stern on one side, stern to bow on the other)
		const name = PIROGUE.name, H = 0.135, W = 0.088, adv = 0.128, width = name.length * adv;
		const stroke = ( x, y, rough ) => {

			// x: along her from the name's start (m), y: over its foot
			const at = 0.78 * L - 0.5 * width - L * 0.0, u = side > 0 ? at + width - x : at + x, t = clamp( u / L ), yy = top( t ) - 0.045 - H + y + rough;
			const s = sAtY( t, yy ), p = skin( t, s, side ), nn = normalOf( t, s, side );
			return { p: [ p[ 0 ] + nn[ 0 ] * 0.01, p[ 1 ] + nn[ 1 ] * 0.01, p[ 2 ] + nn[ 2 ] * 0.01 ], n: nn.slice() };

		};

		for ( let c = 0; c < name.length; c ++ ) {

			const lean = ( rnd() - 0.5 ) * 0.012, small = 0.93 + rnd() * 0.1;
			for ( const line of LETTERS[ name[ c ] ] || [] ) for ( let k = 0; k < line.length - 1; k ++ ) {

				const [ x0, y0 ] = line[ k ], [ x1, y1 ] = line[ k + 1 ];
				const X0 = c * adv + x0 * W, X1 = c * adv + x1 * W, Y0 = y0 * H * small, Y1 = y1 * H * small;
				const dx = X1 - X0, dy = Y1 - Y0, l = Math.hypot( dx, dy ) || 1, w = 0.0085, nx = - dy / l * w, ny = dx / l * w;
				const corner = [ stroke( X0 - nx, Y0 - ny, lean ), stroke( X1 - nx, Y1 - ny, lean ), stroke( X0 + nx, Y0 + ny, lean ), stroke( X1 + nx, Y1 + ny, lean ) ];
				const part = gridPart( 1, 1, ( i, j ) => ( { ...corner[ j * 2 + i ], uv: [ X0 + i * l, j * 0.02 ] } ) );
				B.add( 'wood', part, I, lin( 0x14243a ), WOOD( seed, 0.1, 1, 0 ) );

			}

		}

		// ---- her inside
		const inner = gridPart( NT, lite ? 3 : 4, ( i, j ) => {

			const t = Math.min( 0.93, T( i ) ), s = 0.16 + 0.84 * j / ( lite ? 3 : 4 ), p = skin( t, s, side ), nn = normalOf( t, s, side );
			return { p: [ p[ 0 ] - nn[ 0 ] * 0.035, p[ 1 ] - nn[ 1 ] * 0.035, p[ 2 ] - nn[ 2 ] * 0.035 ], n: [ - nn[ 0 ], - nn[ 1 ], - nn[ 2 ] ], uv: [ t * L, s ] };

		} );
		const insideCol = paint( INSIDE, 0.8, 5 );
		B.add( 'wood', inner, I, insideCol.tint, insideCol.data );

		// ---- her gunwale and a rubbing strake below it
		const rail = ( dy, dx, w, h, col ) => {

			const part = gridPart( NT, 4, ( i, j ) => {

				const t = T( i ), s = skin( t, 1, side ), a = j / 4 * Math.PI * 2 + Math.PI / 4;
				const ox = Math.cos( a ) * w, oy = Math.sin( a ) * h, nl = Math.hypot( ox / w, oy / h ) || 1;
				return { p: [ s[ 0 ] + side * dx + ox, s[ 1 ] + dy + oy, s[ 2 ] ], n: [ ox / w / nl, oy / h / nl, 0 ], uv: [ t * L, j * 0.04 ] };

			} );
			B.add( 'wood', part, I, col.tint, col.data );

		};

		rail( 0.004, - 0.005, 0.032, 0.022, paint( SEAT, 0.55 ) );
		if ( ! lite ) rail( - 0.11, 0.006, 0.016, 0.018, paint( 0x1f2a2c, 0.6 ) );

	}

	// ---- stem and keel band: the paint's worn off its edge
	{

		const pts = [];
		for ( let k = 0; k <= 10; k ++ ) {

			const t = 0.56 + 0.44 * k / 10;
			pts.push( new Vector3( 0, keelAt( t ) + ( k === 10 ? 0.005 : - 0.002 ), - L / 2 + t * L + 0.004 ) );

		}

		B.tube( 'wood', pts, 0.02, { tint: lin( 0xb9b09a ), data: WOOD( seed, 0.75, 0.4, 0 ), radial: 4 } );
		B.rod( 'wood', [ 0, 0.01, - L / 2 + 0.05 ], [ 0, 0.008, 0.56 * L - L / 2 ], 0.024, 0.024, { tint: lin( 0x2c221c ), data: WOOD( seed, 0.8, 0.5, 0 ), segs: 4 } );

	}

	// ---- her transom: flat, the white carried round, her motor board on it
	{

		const t = 0.002, n = 6;
		const part = gridPart( 1, n, ( i, j ) => {

			const s = 1 - j / n, side = i ? 1 : - 1, p = skin( t, s, side );
			return { p: [ p[ 0 ], p[ 1 ], p[ 2 ] ], n: [ 0, 0, - 1 ], uv: [ p[ 0 ], p[ 1 ] ] };

		} );
		B.add( 'wood', part, I, ( x, y ) => y < PIROGUE.draft + 0.05 ? lin( BOTTOM ) : y > top( t ) ? lin( TOP ) : lin( WHITE ), WOOD( seed + 0.2, 0.5, 0.65, 6 ) );
		const inside = gridPart( 1, 3, ( i, j ) => {

			const s = 1 - 0.8 * j / 3, side = i ? 1 : - 1, p = skin( 0.012, s, side );
			return { p: [ p[ 0 ] * 0.96, p[ 1 ], p[ 2 ] + 0.03 ], n: [ 0, 0, 1 ], uv: [ p[ 0 ], p[ 1 ] ] };

		} );
		const c = paint( INSIDE, 0.75, 5 );
		B.add( 'wood', inside, I, c.tint, c.data );
		const mb = paint( 0x6a6f60, 0.3 );
		B.box( 'wood', 0, 0.54, - L / 2 - 0.03, 0.52, 0.34, 0.05, { grain: 0, tint: mb.tint, data: mb.data } );

	}

	// ---- her floor, a fore deck, the thwarts
	{

		const rows = 8, floor = gridPart( 2, rows, ( i, j ) => {

			const t = 0.03 + 0.74 * j / rows, w = halfAt( t ) * mix( 0.52, 0.2, ss( 0.5, 0.77, t ) ), y = 0.17 + keelAt( t ) * 0.8;
			return { p: [ - w + i * w, y, - L / 2 + t * L ], n: [ 0, 1, 0 ], uv: [ t * L, i * w ] };

		} );
		const fl = paint( 0x315f80, 0.6, 7 );
		B.add( 'wood', floor, I, fl.tint, fl.data );
		const deck = gridPart( 2, 6, ( i, j ) => {

			const t = 0.8 + 0.19 * j / 6, s = skin( t, 1, 1 ), x = ( i - 1 ) * s[ 0 ] * 0.98;
			return { p: [ x, s[ 1 ] - 0.02 + 0.015 * ( 1 - Math.abs( i - 1 ) ), s[ 2 ] ], n: [ 0, 0.99, 0.12 ], uv: [ t * L, x ] };

		} );
		const dk = paint( SEAT, 0.5 );
		B.add( 'wood', deck, I, dk.tint, dk.data );
		// (each thwart's its own: a little out of square, one replaced in bare timber)
		for ( const [ t, col, off ] of [ [ 0.1, SEAT, 0.015 ], [ 0.32, 0x2f83c4, - 0.012 ], [ 0.53, SEAT, 0.02 ], [ 0.72, 0xa89c7e, - 0.006 ] ] ) {

			const y = sheerAt( t ) - 0.16, w = halfAt( t ) * 0.93, z = - L / 2 + t * L;
			const c = paint( col, col === 0xa89c7e ? 0.15 : 0.6 );
			B.box( 'wood', 0, y, z + off, w * 2, 0.04, 0.2, { grain: 1, ry: off * 1.5, tint: c.tint, data: c.data } );
			if ( ! lite ) for ( const sx of [ - 1, 1 ] ) B.box( 'wood', sx * w * 0.5, y - ( y - 0.17 ) / 2, z + off, 0.04, y - 0.19, 0.07, { grain: 1, tint: c.tint, data: c.data } );

		}

	}

	// ---- what's in her: the ice box they sit on, the fuel, a coil, the grapnel on her bow, bamboo for the lines
	{

		const hb = ( x, y, z, w, h, d, hex, ry = 0 ) => {

			const c = paint( hex, 0.82 );
			B.box( 'wood', x, y, z, w, h, d, { ry, tint: c.tint, data: c.data } );

		};

		hb( 0.08, 0.44, - 0.25, 0.94, 0.5, 0.62, 0xd8d6cc, 0.05 );
		hb( 0.08, 0.705, - 0.25, 0.96, 0.05, 0.64, 0xc8c8be, 0.05 );
		hb( - 0.42, 0.33, - 2.9, 0.34, 0.3, 0.5, 0xa8281f, 0.12 );
		hb( 0.38, 0.33, - 2.82, 0.34, 0.3, 0.5, 0xb6301f, - 0.08 );
		const hoseCol = paint( 0x101010, 0.8 );
		B.tube( 'wood', [ [ - 0.42, 0.5, - 3.0 ], [ - 0.3, 0.42, - 3.25 ], [ - 0.12, 0.62, - 3.5 ], [ 0, 0.78, - 3.68 ] ].map( ( q ) => new Vector3( ...q ) ), 0.009, { tint: hoseCol.tint, data: hoseCol.data, radial: 3 } );
		// (a coil of line forward, on the floor)
		const rope = paint( 0xb49a6c, 0.2 );
		for ( let k = 0; k < ( lite ? 2 : 4 ); k ++ ) B.torus( 'wood', 0.05 + k * 0.012, 0.3 + k * 0.022, 1.4, 0.2 - k * 0.012, 0.013, { rx: Math.PI / 2, radial: 3, tubular: 10, tint: rope.tint, data: rope.data } );
		// (the grapnel over her bow thwart, its line going to the coil)
		const iron = paint( 0x2a2520, 0.55 ), gx = - 0.14, gy = sheerAt( 0.8 ) - 0.1, gz = 2.15;
		B.rod( 'wood', [ gx, gy + 0.28, gz + 0.05 ], [ gx + 0.02, gy - 0.1, gz - 0.02 ], 0.014, 0.014, { segs: 4, tint: iron.tint, data: iron.data } );
		for ( let k = 0; k < 4; k ++ ) {

			const a = k * Math.PI / 2 + 0.4;
			B.tube( 'wood', [ [ gx + 0.02, gy - 0.1, gz - 0.02 ], [ gx + 0.02 + Math.cos( a ) * 0.11, gy - 0.1, gz - 0.02 + Math.sin( a ) * 0.11 ], [ gx + 0.02 + Math.cos( a ) * 0.16, gy + 0.03, gz - 0.02 + Math.sin( a ) * 0.16 ] ].map( ( q ) => new Vector3( ...q ) ), 0.01, { tint: iron.tint, data: iron.data, radial: 3 } );

		}

		// (bamboo: an upright whip aft, as in the San Fernando photograph, and two lashed along her side for the lines)
		const bamboo = paint( 0xa8945c, 0.15 );
		B.rod( 'wood', [ - 0.62, 0.42, - 3.05 ], [ - 0.74, 3.2, - 3.28 ], 0.022, 0.009, { segs: 5, tint: bamboo.tint, data: bamboo.data } );
		B.rod( 'wood', [ 0.68, 0.72, - 2.6 ], [ 0.72, 0.8, 1.4 ], 0.018, 0.011, { segs: 4, tint: bamboo.tint, data: bamboo.data } );
		if ( ! lite ) B.rod( 'wood', [ 0.6, 0.7, - 2.4 ], [ 0.66, 0.77, 0.9 ], 0.016, 0.01, { segs: 4, tint: bamboo.tint, data: bamboo.data } );

	}

	// ---- the outboard: a big two-stroke's black cowl on its clamps, tiller forward, shaft and lower unit
	const batch = B.batch( 'wood' ), motorStart = batch.vcount;
	const pivot = new Vector3( 0, 0.66, - L / 2 - 0.1 );
	{

		const z0 = pivot.z - 0.14, cowl = paint( 0x17181a, 0.95 ), pan = paint( 0x2a2c2e, 0.8 ), metal = paint( 0x34383a, 0.55 );
		const rings = lite ? 5 : 7, segs = lite ? 8 : 10;
		const cw = 0.21, cl = 0.3, ch = 0.56, cy = 0.84;
		const body = gridPart( segs, rings, ( i, j ) => {

			const v = j / rings, a = i / segs * Math.PI * 2, k = Math.sqrt( 1 - Math.pow( clamp( v * 1.1 - 0.1, 0, 1 ), 3.2 ) * 0.93 );
			// (a rounded rectangle, narrower aft: the cowl's plan)
			const c = Math.cos( a ), sn = Math.sin( a ), e = 0.45, X = Math.sign( c ) * Math.pow( Math.abs( c ), e ), Z = Math.sign( sn ) * Math.pow( Math.abs( sn ), e );
			const w = cw * ( Z < 0 ? 0.82 : 1 ) * k, l = cl * k;
			return { p: [ X * w, cy + v * ch, z0 + Z * l - v * 0.03 ], n: [ c * ( 1 - v * 0.6 ), v * 0.8 + 0.1, sn * ( 1 - v * 0.6 ) ], uv: [ a * 0.2, v * 0.5 ] };

		} );
		B.add( 'wood', body, I, cowl.tint, cowl.data );
		// (its lid's cap)
		B.box( 'wood', 0, cy + ch - 0.002, z0 - 0.03, cw * 0.42, 0.016, cl * 0.42, { tint: cowl.tint, data: cowl.data } );
		// (a pale stripe round the cowl's side, and the lower pan)
		const stripe = paint( 0xa6a8a6, 0.8 );
		for ( const sx of [ - 1, 1 ] ) B.box( 'wood', sx * cw * 0.985, cy + 0.2, z0, 0.006, 0.05, cl * 1.15, { tint: stripe.tint, data: stripe.data } );
		B.box( 'wood', 0, cy - 0.025, z0, cw * 2.04, 0.1, cl * 2.04, { tint: pan.tint, data: pan.data } );
		// shaft: broad and flat, tapering; anti-cavitation plate; torpedo; skeg; three blades
		B.box( 'wood', 0, 0.41, z0, 0.13, 0.78, 0.3, { tint: metal.tint, data: metal.data } );
		B.box( 'wood', 0, 0.015, z0 - 0.02, 0.26, 0.016, 0.42, { tint: metal.tint, data: metal.data } );
		B.rod( 'wood', [ 0, - 0.11, z0 + 0.22 ], [ 0, - 0.11, z0 - 0.26 ], 0.055, 0.06, { segs: 7, tint: metal.tint, data: metal.data } );
		B.box( 'wood', 0, - 0.08, z0, 0.1, 0.18, 0.2, { tint: metal.tint, data: metal.data } );
		B.box( 'wood', 0, - 0.24, z0 - 0.02, 0.016, 0.18, 0.2, { tint: metal.tint, data: metal.data } );
		const prop = paint( 0x77797a, 0.2 );
		for ( let k = 0; k < 3; k ++ ) {

			const a = k / 3 * Math.PI * 2 + 0.3;
			B.box( 'wood', Math.cos( a ) * 0.1, - 0.11 + Math.sin( a ) * 0.1, z0 - 0.3, 0.13, 0.016, 0.045, { ry: 0.5, tint: prop.tint, data: prop.data } );

		}

		// bracket on the transom; the tiller, lying forward to port
		B.box( 'wood', 0, 0.66, pivot.z + 0.02, 0.2, 0.2, 0.12, { tint: metal.tint, data: metal.data } );
		B.rod( 'wood', [ 0, 0.94, z0 + 0.28 ], [ - 0.2, 1.0, z0 + 0.92 ], 0.016, 0.022, { segs: 5, tint: cowl.tint, data: cowl.data } );

	}
	const motorCount = batch.vcount - motorStart;

	// ---- her lines to the jetty, drawn only alongside: bow and stern, from a cleat on its face (in her frame, lying at her berth)
	const drawn = batch.icount;
	{

		const line = paint( 0xb49a6c, 0.2 );
		for ( const [ from, to ] of [ [ [ 0, sheerAt( 0.9 ) - 0.02, 2.75 ], [ - 1.58, 1.85, 2.4 ] ], [ [ - 0.6, 0.72, - 3.1 ], [ - 1.58, 1.85, - 2.6 ] ] ] ) {

			const mid = [ ( from[ 0 ] + to[ 0 ] ) / 2, Math.min( from[ 1 ], to[ 1 ] ) - 0.12, ( from[ 2 ] + to[ 2 ] ) / 2 ];
			B.tube( 'wood', [ from, mid, to ].map( ( q ) => new Vector3( ...q ) ), 0.012, { tint: line.tint, data: line.data, radial: 3 } );

		}

	}

	const all = batch.icount;
	const geometry = batch.build();
	return { geometry, drawn, all, motor: { start: motorStart, count: motorCount, pivot } };

}

// the outboard tilted about its bracket (a: radians, up out of the water, its foot swinging out astern), from its rest
// positions and normals (kept the first time)
export function tiltMotor( P, a ) {

	const g = P.geometry, pos = g.attributes.position, nor = g.attributes.normal, m = P.motor;
	if ( ! m.rest ) m.rest = { p: pos.array.slice( m.start * 3, ( m.start + m.count ) * 3 ), n: nor.array.slice( m.start * 3, ( m.start + m.count ) * 3 ) };
	const c = Math.cos( a ), s = Math.sin( a ), { p, n } = m.rest, py = m.pivot.y, pz = m.pivot.z;
	for ( let i = 0; i < m.count; i ++ ) {

		const y = p[ i * 3 + 1 ] - py, z = p[ i * 3 + 2 ] - pz, q = ( m.start + i ) * 3;
		pos.array[ q + 1 ] = py + y * c - z * s;
		pos.array[ q + 2 ] = pz + y * s + z * c;
		const ny = n[ i * 3 + 1 ], nz = n[ i * 3 + 2 ];
		nor.array[ q + 1 ] = ny * c - nz * s;
		nor.array[ q + 2 ] = ny * s + nz * c;

	}

	pos.needsUpdate = true;
	nor.needsUpdate = true;

}
