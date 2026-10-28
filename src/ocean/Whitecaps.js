// (M14) The open sea's crests breaking: whitecaps, each its own, as photographs of a sea in a breeze show
// them (from a ship's deck, and from the air): a small, solid white roller where a crest's spilling, a thin
// line of white along the crest from it, and behind it the foam it's left on the water, marbled and thinning
// into lace as it goes (WaterSurface draws it); scattered over the sea, not in patches, and more of them, and
// bigger, as the wind gets up.
//
// The wind sea's waves carry them (Waves' 11 m and 23 m waves, on every tier). Along each crest of theirs,
// cells a wavelength long; in each, now and then (at most once in EPOCH periods, by the wind's chance), the
// crest breaks for a while (DUR periods) over a stretch of it (REACH of the cell, opening and closing as it
// goes, its edge ragged): a white roller on its front face while it breaks (ROLLER wavelengths: the active
// whitecap, stage A), and the foam left behind it as it went, fading over DECAY periods (the residual
// whitecap, stage B). Its foam rides the water (the grid's Lagrangian points), not the crest.
// How much of the sea's white is Monahan & O'Muircheartaigh's (1980) share for the wind: 3.84e-6 U^3.41 (a
// fair day's 7 m/s: 0.3%, "fairly frequent white horses"; 11 m/s: 1.4%; 15 m/s: 4%; capped at a gale's),
// none below 3 m/s ("glassy crests, not breaking"); the chance a cell breaks is that share over what one
// cell's breaking whitens (COVER, measured: test/whitecaps.mjs), split between the two waves.
// The same on the CPU (foamAt, rollers: the spray off them, fx/WhitecapSpray), with the same integer hash,
// so the spray flies where you see a crest breaking.
//   const caps = new Whitecaps( { waves, tier } );  caps.uniforms, caps.glsl   (WaterSurface's fragment:
//   whitecapsAt( x0 ) -> ( roller, white ))
//   caps.set( windSpeed )   (WeatherDriver, each frame)
//   caps.foamAt( x0, z0, t ) -> { roller, foam }   caps.rollers( x, z, R, t, cb )

import { Vector4 } from '../engine/index.js';
import { G } from '../core/Globals.js';

// Waves' wind sea that carries them (11 m, 23 m), and each one's salt and share of the white
export const CARRIERS = [ { wave: 3, salt: 0x68bc21eb, share: 0.5 }, { wave: 2, salt: 0x02e5be93, share: 0.5 } ];
const CELL = 1; // a crest's cells (wavelengths along it)
const EPOCH = 1.6; // periods: each cell breaks at most once in this long
const DUR = [ 0.35, 0.8 ]; // periods: how long a crest breaks (at size 1: longer as they're bigger)
const REACH = [ 0.08, 0.36 ]; // its stretch's half-length at its widest (of a cell, at size 1)
// (and no more than fits its cell, lip and all, from where its middle is: cut off at the cell's end, its
// foam was a white block)
const FIT = 2.2;
const ROLLER = 0.08; // wavelengths: the roller down the front face, ahead of the crest
// (step 5) how much its front's ragged along the crest (of its width: it thins to its ends as its stretch
// does, a lens on the face, not the strip it was: a gale's big ones were white slabs)
const ROLLER_RAG = [ 0.18, 0.1 ];
// its lip: a thin line of white along the crest either side of the roller (LIP: of its stretch, LIP_W
// wavelengths wide, as bright), where it's only beginning to spill
const LIP = 1.35, LIP_W = 0.025, LIP_WHITE = 0.55;
const DECAY = 1; // periods: its foam's e-folding behind it (seen to go in two or three)
const LEFT = 0.7; // how white the foam it leaves is, at first (the roller's 1: it's lacy at once)
// cells a period: the foam left spreading and thinning at its edges as it ages (its edge softened by so
// much more: a gale's big ones were white blocks, their sides as straight as when they were laid)
const SPREAD = 0.08;
const AGES = 3; // crests behind looked at: the foam's gone by then (the low tier's GPU looks at two)
// the share of the sea a wave's whitecaps whiten, a unit of chance at size 1 (test/whitecaps.mjs measures
// it), and as their size goes (bigger, and breaking longer: as size^SIZE_COVER, measured)
export const COVER = 0.0158;
const SIZE_COVER = 1.25;
// m/s: none below the first; Monahan's share capped at the second's (a gale's: past it the sea's streaked
// with blown foam, WaterSurface's spume); and their size, from a light breeze's to a gale's
const WIND = [ 3, 19 ];
const SIZE = [ 0.7, 1.6 ];
const monahan = ( u ) => 3.84e-6 * Math.pow( Math.max( 0, u ), 3.41 );
const smooth = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// the share of the sea breaking white in a wind of u m/s (0..1)
export const whitecapCover = ( u ) => Math.max( 0, monahan( Math.min( u, WIND[ 1 ] ) ) - monahan( WIND[ 0 ] ) );

const INV32 = 1 / 4294967296;
// pcg3d (Jarzynski & Olano 2020), as the GPU does it: uint arithmetic, wrapped
export function pcg3d( x, y, z, out = [ 0, 0, 0 ] ) {

	x = ( Math.imul( x, 1664525 ) + 1013904223 ) >>> 0;
	y = ( Math.imul( y, 1664525 ) + 1013904223 ) >>> 0;
	z = ( Math.imul( z, 1664525 ) + 1013904223 ) >>> 0;
	x = ( x + Math.imul( y, z ) ) >>> 0; y = ( y + Math.imul( z, x ) ) >>> 0; z = ( z + Math.imul( x, y ) ) >>> 0;
	x = ( x ^ ( x >>> 16 ) ) >>> 0; y = ( y ^ ( y >>> 16 ) ) >>> 0; z = ( z ^ ( z >>> 16 ) ) >>> 0;
	x = ( x + Math.imul( y, z ) ) >>> 0; y = ( y + Math.imul( z, x ) ) >>> 0; z = ( z + Math.imul( x, y ) ) >>> 0;
	out[ 0 ] = x;
	out[ 1 ] = y;
	out[ 2 ] = z;
	return out;

}

const u32 = ( f ) => ( f | 0 ) >>> 0; // (a float holding an integer, as uint( int( f ) ))
const fract = ( x ) => x - Math.floor( x );
const _h = [ 0, 0, 0 ], _h2 = [ 0, 0, 0 ];
const _ev = { on: 0, lip: 0, ph: 0, c: 0, reach: 0, open: 0, f: 0, m: 0, prof: 0 };

// a crest's break: crest n, s along it (cells), at time tau, a wave of period T; how strong it is there
// (0..1; 0 where it isn't breaking) in _ev.on, and its lip's (_ev.lip), with where it is along the cell
// (_ev.c, _ev.reach, and how far open now, _ev.open; _ev.prof, how far in from its ends) and how far on
// (_ev.ph). fw: the pixel's span of s (cells: its edge softened as the
// GPU's is)
function event( n, s, tau, T, chance, salt, size, fw = 0 ) {

	_ev.on = _ev.lip = _ev.ph = _ev.c = _ev.reach = _ev.open = _ev.prof = 0;
	const un = u32( n );
	pcg3d( un, salt, 0x51ed27, _h );
	const q = s + _h[ 0 ] * INV32;
	const m = Math.floor( q ), f = q - m, um = u32( m );
	_ev.m = m;
	_ev.f = f;
	pcg3d( un, um, salt, _h );
	const ho = _h[ 1 ] * INV32, E = EPOCH * T;
	const e = Math.floor( tau / E + ho );
	pcg3d( un, um, ( u32( e ) ^ salt ) >>> 0, _h );
	if ( _h[ 0 ] * INV32 >= chance ) return _ev;
	const ry = _h[ 1 ] * INV32, rz = _h[ 2 ] * INV32;
	pcg3d( _h[ 0 ], _h[ 1 ], _h[ 2 ], _h2 );
	const r2x = _h2[ 0 ] * INV32, r2y = _h2[ 1 ] * INV32, r2z = _h2[ 2 ] * INV32;
	const D = ( DUR[ 0 ] + ( DUR[ 1 ] - DUR[ 0 ] ) * rz ) * T * size;
	const tb = ( e - ho ) * E + ry * ( E - D );
	const ph = ( tau - tb ) / D;
	if ( ph < 0 || ph > 1 ) return _ev;
	const c0 = 0.3 + 0.4 * r2y;
	const reach = Math.min( ( REACH[ 0 ] + ( REACH[ 1 ] - REACH[ 0 ] ) * r2x ) * size, Math.min( c0, 1 - c0 ) / FIT );
	// (its shape, its own: opening from a point as it starts (never blunt: a straight front), widest early or
	// late, full or pointed, its
	// middle wandering and bending along the crest as it goes, a lens, a crescent or a blunt head, its edge
	// ragged)
	const k = 0.75 + 0.9 * fract( r2z * 13.7 ), full = 0.7 + 0.6 * fract( r2y * 9.1 ), bend = ( fract( r2x * 5.3 ) - 0.5 ) * 0.8;
	const c = c0 + ( r2z - 0.5 ) * 0.3 * reach * ( ph - 0.5 ) + bend * reach * ( 4 * ( ph - 0.5 ) ** 2 - 0.33 );
	const rag = 0.18 * Math.sin( f * 37 + r2z * 61 + ph * 7 ) + 0.12 * Math.sin( f * 83 - ph * 13 + ry * 29 );
	const open = Math.pow( Math.sin( Math.PI * Math.pow( ph, k ) ), full ), edge = open * ( 1 + rag );
	const soft = 0.45 + fw / reach;
	const x = Math.abs( f - c ) / reach;
	const I = smooth( 0, 0.1, ph ) * ( 1 - 0.6 * ph );
	_ev.on = ( 1 - smooth( edge - soft, edge, x ) ) * I;
	// (how far in from its ends: 1 at its middle, 0 at its edge)
	_ev.prof = edge > 0 ? Math.max( 0, 1 - ( x / edge ) ** 2 ) : 0;
	_ev.lip = ( 1 - smooth( edge * LIP - soft, edge * LIP, x ) ) * I * LIP_WHITE;
	_ev.ph = ph;
	_ev.c = c;
	_ev.reach = reach;
	_ev.open = open;
	return _ev;

}

// (step 5) the roller's width (wavelengths) at s along crest n, `prof` in from its stretch's ends: thinning
// to them, its front ragged
const rollerWidth = ( prof, s, n ) => ROLLER * Math.sqrt( prof ) * ( 1 + ROLLER_RAG[ 0 ] * Math.sin( s * 41 + n * 7.3 ) + ROLLER_RAG[ 1 ] * Math.sin( s * 97 - n * 3.1 ) );

export class Whitecaps {

	constructor( { waves, tier = 'high' } ) {

		this.waves = waves;
		const ages = tier === 'low' ? AGES - 1 : AGES;
		this.cover = { value: 0 };
		this.size = 1;
		this.chance = [ 0, 0 ];
		// ( chance a cell breaks: the 11 m wave's, the 23 m's; their white seen from afar, as a share )
		this.uniforms = {
			whitecapCover: this.cover,
			whitecapChance: { value: new Vector4() },
			whitecapSize: { value: 1 },
		};
		const f = ( x ) => x.toFixed( 6 );
		this.glsl = /* glsl */`
uniform float whitecapCover;
uniform vec4 whitecapChance;
uniform float whitecapSize;
uvec3 wcHash( uvec3 v ) {
	v = v * 1664525u + 1013904223u;
	v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
	v ^= v >> 16u;
	v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
	return v;
}
uint wcU( float f ) { return uint( int( f ) ); }
// a crest's break (crest n, s along it in cells, at time tau, period T): how strong it is there, its lip
// (0..1), and how far in from its ends (1 at its middle)
vec3 wcEvent( float n, float s, float tau, float T, float chance, uint salt, float fw ) {
	uint un = wcU( n );
	float q = s + float( wcHash( uvec3( un, salt, 0x51ed27u ) ).x ) * ${ INV32.toExponential( 10 ) };
	float m = floor( q ), f = q - m;
	uint um = wcU( m );
	float ho = float( wcHash( uvec3( un, um, salt ) ).y ) * ${ INV32.toExponential( 10 ) };
	float E = ${ f( EPOCH ) } * T;
	float e = floor( tau / E + ho );
	uvec3 h = wcHash( uvec3( un, um, wcU( e ) ^ salt ) );
	vec3 r = vec3( h ) * ${ INV32.toExponential( 10 ) };
	if ( r.x >= chance ) return vec3( 0.0 );
	vec3 r2 = vec3( wcHash( h ) ) * ${ INV32.toExponential( 10 ) };
	float D = mix( ${ f( DUR[ 0 ] ) }, ${ f( DUR[ 1 ] ) }, r.z ) * T * whitecapSize;
	float tb = ( e - ho ) * E + r.y * ( E - D );
	float ph = ( tau - tb ) / D;
	if ( ph < 0.0 || ph > 1.0 ) return vec3( 0.0 );
	float c0 = 0.3 + 0.4 * r2.y;
	float reach = min( mix( ${ f( REACH[ 0 ] ) }, ${ f( REACH[ 1 ] ) }, r2.x ) * whitecapSize, min( c0, 1.0 - c0 ) / ${ f( FIT ) } );
	float k = 0.75 + 0.9 * fract( r2.z * 13.7 ), full = 0.7 + 0.6 * fract( r2.y * 9.1 ), bend = ( fract( r2.x * 5.3 ) - 0.5 ) * 0.8;
	float c = c0 + ( r2.z - 0.5 ) * 0.3 * reach * ( ph - 0.5 ) + bend * reach * ( 4.0 * ( ph - 0.5 ) * ( ph - 0.5 ) - 0.33 );
	float rag = 0.18 * sin( f * 37.0 + r2.z * 61.0 + ph * 7.0 ) + 0.12 * sin( f * 83.0 - ph * 13.0 + r.y * 29.0 );
	float edge = pow( sin( 3.14159265 * pow( ph, k ) ), full ) * ( 1.0 + rag );
	float soft = 0.45 + fw / reach;
	float x = abs( f - c ) / reach, I = smoothstep( 0.0, 0.1, ph ) * ( 1.0 - 0.6 * ph );
	return vec3( vec2( 1.0 - smoothstep( edge - soft, edge, x ), ( 1.0 - smoothstep( edge * ${ f( LIP ) } - soft, edge * ${ f( LIP ) }, x ) ) * ${ f( LIP_WHITE ) } ) * I,
		edge > 0.0 ? max( 0.0, 1.0 - ( x / edge ) * ( x / edge ) ) : 0.0 );
}
// where x0 is among a wave's crests: u falls through n as crest n goes by; s along them, in cells
float wcCrest( vec2 x0, vec4 A, vec4 B ) { return ( A.z * dot( A.xy, x0 ) - A.w * waveTime + B.z - 1.5707963 ) * 0.15915494; }
float wcAlong( vec2 x0, vec4 A ) { return dot( vec2( - A.y, A.x ), x0 ) * A.z * ${ f( 1 / ( 2 * Math.PI * CELL ) ) }; }
// one wave's whitecaps at u, s (wcCrest, wcAlong; du, ds: their change across the pixel): ( its roller, its
// white: the roller or the foam left )
vec2 wcCarrier( vec4 A, float u, float s, float du, float ds, float chance, float far, uint salt ) {
	float T = 6.2831853 / A.w;
	// (seen from afar, a crest or more a pixel: its share of white, spread)
	float away = smoothstep( 0.45, 0.9, du );
	if ( away >= 1.0 || chance <= 0.0 ) return vec2( 0.0, far );
	float fu = floor( u ), a = u - fu;
	// the roller: ahead of the crest coming, breaking now, (step 5) thinning to its ends, its front ragged;
	// and its lip along the crest. Then the foam behind the crests gone by while they broke, laid as each
	// passed here, spreading and thinning at its edges as it ages. (A crest a time round a loop: wcEvent is
	// in the program once, not once for each)
	float roller = 0.0, white = 0.0;
	for ( int j = 0; j <= ${ ages }; j ++ ) {
		if ( j == 0 && a >= ${ f( ROLLER * ( 1 + ROLLER_RAG[ 0 ] + ROLLER_RAG[ 1 ] ) ) } + du ) continue;
		float age = j == 0 ? 0.0 : ( fu + float( j ) - u ) * T;
		vec3 e = wcEvent( fu + float( j ), s, waveTime - age, T, chance, salt, ds + ${ f( SPREAD ) } * age / T );
		if ( j == 0 ) {
			float wd = ${ f( ROLLER ) } * sqrt( e.z ) * ( 1.0 + ${ f( ROLLER_RAG[ 0 ] ) } * sin( s * 41.0 + fu * 7.3 ) + ${ f( ROLLER_RAG[ 1 ] ) } * sin( s * 97.0 - fu * 3.1 ) );
			float band = 1.0 - smoothstep( wd * 0.55 - du, wd + du, a );
			float lipBand = 1.0 - smoothstep( ${ f( LIP_W * 0.4 ) } - du, ${ f( LIP_W ) } + du, a );
			roller = max( band * e.x, lipBand * e.y );
			white = roller;
		} else {
			float left = exp( - age / ( ${ f( DECAY ) } * T ) ) * ( 1.0 - smoothstep( ${ f( ages - 0.8 ) } * T, ${ f( ages ) } * T, age ) );
			white = max( white, left * ${ f( LEFT ) } * e.x );
		}
	}
	return mix( vec2( roller, white ), vec2( 0.0, far ), away );
}
// all of them: ( roller, white ). (Both waves' crests here and their change across the pixel first, where
// every pixel's at: derivatives. Then a wave a time round a loop, as the crests: wcCarrier once in the program)
vec2 whitecapsAt( vec2 x0 ) {
	vec2 u = vec2( wcCrest( x0, waveA[ ${ CARRIERS[ 0 ].wave } ], waveB[ ${ CARRIERS[ 0 ].wave } ] ), wcCrest( x0, waveA[ ${ CARRIERS[ 1 ].wave } ], waveB[ ${ CARRIERS[ 1 ].wave } ] ) );
	vec2 s = vec2( wcAlong( x0, waveA[ ${ CARRIERS[ 0 ].wave } ] ), wcAlong( x0, waveA[ ${ CARRIERS[ 1 ].wave } ] ) );
	vec2 du = fwidth( u ), ds = fwidth( s );
	vec2 r = vec2( 0.0 );
	for ( int k = 0; k < 2; k ++ ) {
		bool first = k == 0;
		vec2 c = wcCarrier( waveA[ first ? ${ CARRIERS[ 0 ].wave } : ${ CARRIERS[ 1 ].wave } ], first ? u.x : u.y, first ? s.x : s.y, first ? du.x : du.y, first ? ds.x : ds.y,
			first ? whitecapChance.x : whitecapChance.y, first ? whitecapChance.z : whitecapChance.w, first ? ${ CARRIERS[ 0 ].salt }u : ${ CARRIERS[ 1 ].salt }u );
		r = first ? c : max( r, c );
	}
	return r;
}
`;

	}

	// the wind's whitecaps (m/s)
	set( windSpeed ) {

		const W = whitecapCover( windSpeed );
		this.cover.value = W;
		this.size = SIZE[ 0 ] + ( SIZE[ 1 ] - SIZE[ 0 ] ) * smooth( 5, 18, windSpeed );
		const v = this.uniforms.whitecapChance.value;
		CARRIERS.forEach( ( c, i ) => {

			const per = COVER * Math.pow( this.size, SIZE_COVER );
			this.chance[ i ] = Math.min( 0.95, c.share * W / per );
			v.setComponent( i, this.chance[ i ] );
			v.setComponent( i + 2, this.chance[ i ] * per );

		} );
		this.uniforms.whitecapSize.value = this.size;

	}

	// a carrier's crest coordinates at ( x0, z0 ): u (falls through n as crest n goes by), s (along, cells)
	_crest( w, x0, z0, t ) {

		return {
			u: ( w.k * ( w.dx * x0 + w.dz * z0 ) - w.omega * t + w.phase - Math.PI / 2 ) / ( 2 * Math.PI ),
			s: ( - w.dz * x0 + w.dx * z0 ) * w.k / ( 2 * Math.PI * CELL ),
		};

	}

	// the whitecaps at Lagrangian point ( x0, z0 ) at time t, as the GPU draws them near by (no far fade)
	foamAt( x0, z0, t = G.time.value, out = { roller: 0, foam: 0 } ) {

		out.roller = 0;
		out.foam = 0;
		if ( this.cover.value <= 0 ) return out;
		CARRIERS.forEach( ( c, i ) => {

			const chance = this.chance[ i ];
			if ( chance <= 0 ) return;
			const w = this.waves.waves[ c.wave ], T = 2 * Math.PI / w.omega;
			const { u, s } = this._crest( w, x0, z0, t ), fu = Math.floor( u ), a = u - fu;
			let roller = 0;
			if ( a < ROLLER * ( 1 + ROLLER_RAG[ 0 ] + ROLLER_RAG[ 1 ] ) ) {

				const ev = event( fu, s, t, T, chance, c.salt, this.size );
				const wd = rollerWidth( ev.prof, s, fu );
				const band = wd > 0 ? 1 - smooth( wd * 0.55, wd, a ) : 0, lipBand = 1 - smooth( LIP_W * 0.4, LIP_W, a );
				roller = Math.max( band * ev.on, lipBand * ev.lip );

			}

			let white = roller;
			for ( let j = 1; j <= AGES; j ++ ) {

				const age = ( fu + j - u ) * T;
				const left = Math.exp( - age / ( DECAY * T ) ) * ( 1 - smooth( ( AGES - 0.8 ) * T, AGES * T, age ) );
				white = Math.max( white, left * LEFT * event( fu + j, s, t - age, T, chance, c.salt, this.size, SPREAD * age / T ).on );

			}

			out.roller = Math.max( out.roller, roller );
			out.foam = Math.max( out.foam, white );

		} );
		return out;

	}

	// the crests breaking now within R m of ( x, z ) (Lagrangian: near enough for spray): cb( x0, z0, along,
	// half, strength, wave ) for each, at its roller's middle, (along: the crest's direction, a unit
	// [ x, z ]; half: its half-length, m; wave: Waves' wave carrying it)
	rollers( x, z, R, t, cb ) {

		if ( this.cover.value <= 0 ) return;
		CARRIERS.forEach( ( c, i ) => {

			const chance = this.chance[ i ];
			if ( chance <= 0 ) return;
			const w = this.waves.waves[ c.wave ], T = 2 * Math.PI / w.omega, L = 2 * Math.PI / w.k;
			const { u, s } = this._crest( w, x, z, t );
			const cells = R / ( L * CELL ) + 1, crests = R / L + 1;
			for ( let n = Math.floor( u - crests ); n <= Math.ceil( u + crests ); n ++ ) {

				// (crest n's line: where u = n; the roller just ahead of it)
				const along = ( n - u ) * L + ROLLER * 0.5 * L;
				pcg3d( u32( n ), c.salt, 0x51ed27, _h );
				const off = _h[ 0 ] * INV32;
				for ( let m = Math.floor( s - cells ) - 1; m <= Math.ceil( s + cells ) + 1; m ++ ) {

					// (the cell's middle, s = m - its crest's offset + 0.5: is it breaking, and where along it)
					const ev = event( n, m - off + 0.5, t, T, chance, c.salt, this.size );
					if ( ev.reach === 0 ) continue;
					const sc = m + ev.c - off, reach = ev.reach, open = ev.open;
					// (its strength at its middle: where it's widest)
					const on = event( n, sc, t, T, chance, c.salt, this.size ).on;
					// (one only beginning to spill throws no spray)
					if ( on <= 0.2 ) continue;
					const half = reach * open * L * CELL;
					const ds = ( sc - s ) * L * CELL;
					const px = x + w.dx * along - w.dz * ds, pz = z + w.dz * along + w.dx * ds;
					if ( ( px - x ) ** 2 + ( pz - z ) ** 2 > R * R ) continue;
					cb( px, pz, [ - w.dz, w.dx ], half, on, w );

				}

			}

		} );

	}

}
