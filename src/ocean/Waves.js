import { Vector4, MathUtils } from '../engine/index.js';
import { G, GRAVITY } from '../core/Globals.js';
import { WORLD } from '../world/WorldLayout.js';

// The open sea: a sum of Gerstner (trochoidal) waves, evaluated the same way on the GPU (the water
// surface) and on the CPU (WaterQuery: the boat, the swimmer, the bobber). It stands in for Tidewater's
// four-cascade FFT ocean, which needs compute shaders. Longer swell rolls in toward the island along
// WORLD.swellDir; shorter wind sea runs with G.windDir. Phones draw fewer waves than laptops; the CPU
// always evaluates exactly the set the GPU draws, so what floats sits on what is seen. (Salt Life) The
// weather sets the sea state (setSea: the swell's and the wind sea's heights) and turns the wind sea
// with the wind (setWindDir: about the camera, so the sea you're on doesn't sweep past). (M12) A
// westerly's swell (setSwell): the swell's shorter waves turn to come from the west, as far as the
// swell's from there, while the longest stays the south's groundswell, so the two cross. (M14) Each swell
// wave's period is its share of its train's (setSwell): the groundswell's the south's, the rest the
// south's or, as far as they've turned, the westerly's, so the two trains cross each at its own period,
// as on the shore (ShoreWaves' trains). Their lengths are the deep water's for it (L = g T^2 / 2 pi: on a
// fair day the shore's 9 s is a 126 m swell; before M14 it was 72 m, 6.8 s, whatever the surf's).
//
// (M15) And each wave's height by where it is: in the island's lee (LEE), the wind sea's only as grown as
// the open water upwind lets it (its fetch: JONSWAP's growth, a wave's length reached once the wind's blown
// far enough over the water, setWind), and the swell's shadowed. The island as a disc; each wave's spread of
// directions about its own (the wind sea's broad, the swell's narrow) partly blocked by it, so the lee
// fills in from either side further off, as it does at sea. Everywhere else the sea's the open ocean's.
//
// A wave i at Lagrangian point x0 (the undisplaced grid point):
//   theta = k (d . x0) - omega t + phase,  omega = sqrt( g k ) (deep water)
//   x = x0 + qa d cos( theta ),  y = a sin( theta )
// and every wave fades out over shallow water (the shore waves take over there).

// wavelength (m) or, (M14) for the swell's, period (its share of its train's, T), amplitude (m), direction:
// rotation (rad) from the swell (s) or the wind (w). (The swell's shares are as their lengths were before
// M14: 72, 44, 31 and 16 m)
const SPECTRUM = [
	{ T: 1, a: 0.32, from: 's', rot: 0 },
	{ T: 0.782, a: 0.18, from: 's', rot: 0.35 },
	{ L: 23, a: 0.09, from: 'w', rot: 0.25 },
	{ L: 11, a: 0.045, from: 'w', rot: - 0.4 },
	// mid and up
	{ T: 0.656, a: 0.12, from: 's', rot: - 0.5 },
	{ L: 7, a: 0.025, from: 'w', rot: 0.6 },
	// high
	{ T: 0.471, a: 0.06, from: 's', rot: 0.9 },
	{ L: 4.2, a: 0.012, from: 'w', rot: - 0.15 },
];
// (M14) the swell's period on a fair day (s: the shore's, ShoreWaves' FAIR_PERIOD), and a wave's k for a
// period (deep water: omega^2 = g k)
export const SWELL_PERIOD = 9;
const kOf = ( T ) => ( 2 * Math.PI / T ) ** 2 / GRAVITY;
const COUNT = { low: 4, mid: 6, high: 8 };
const TAU = Math.PI * 2;
const STEEPNESS = 0.55; // sum of the waves' crest sharpening (< 1: no loops)
// a wave's crest sharpening (its horizontal travel), at most its share of STEEPNESS
const crest = ( a, k, n ) => Math.min( a * 1.4, STEEPNESS / ( k * n ) );

// (M12) a westerly blow's swell (unit, travel direction: it wraps round the bay's western arm); the
// island's own comes in along WORLD.swellDir
export const SWELL_WEST = { x: 1, y: 0 };

// depth (m) over which the open-sea waves fade out toward the beach
export const SHALLOW_FADE = [ 1.5, 12.0 ]; // (the shore waves take over from ~13 m of depth in)

// (M15) the island's lee: the island as a disc (its middle and radius, m: the body and the headlands); the
// half-width of the wind sea's and the swell's spreads of direction (rad: a wind sea's is broad, about
// cos^2 to 40 degrees, a swell's narrow); how much of the swell the island's shadow takes (what's left
// bends round into it)
export const LEE = { x: 0, z: - 400, r: 620, wind: 40 * Math.PI / 180, swell: 18 * Math.PI / 180, shadow: 0.85 };
// the fetch (m) the wind must blow over for a wave of period T to be the sea's peak, at wind U (m/s, at 10 m):
// JONSWAP's fetch-limited growth, f_p = 3.5 g / U ( g X / U^2 )^-0.33
export const fetchFor = ( T, U ) => ( U * U / GRAVITY ) * Math.pow( 3.5 * GRAVITY * T / U, 1 / 0.33 );
// how grown a wave is over fetch X (m) that needs `need`: 1 once it's the peak or longer, then down the
// spectrum's steep forward face (E ~ exp( -1.25 ( f_p / f )^4 ), as its height)
export const grownOver = ( X, need ) => Math.exp( - 0.625 * Math.max( 0, Math.pow( need / Math.max( X, 1 ), 1.32 ) - 1 ) );

export class Waves {

	constructor( { tier = 'low', terrain = null } = {} ) {

		this.terrain = terrain;
		const n = COUNT[ tier ] ?? COUNT.low;
		const swell = Math.atan2( WORLD.swellDir.y, WORLD.swellDir.x );
		const wind = Math.atan2( G.windDir.value.y, G.windDir.value.x );
		this.waves = SPECTRUM.slice( 0, n ).map( ( w, i ) => {

			const angle = ( w.from === 's' ? swell : wind ) + w.rot;
			const k = w.from === 's' ? kOf( w.T * SWELL_PERIOD ) : 2 * Math.PI / w.L;
			return {
				dx: Math.cos( angle ), dz: Math.sin( angle ), k, omega: Math.sqrt( GRAVITY * k ), a: w.a,
				qa: crest( w.a, k, n ),
				phase: ( ( i * 2.3999632 ) % 1 ) * Math.PI * 2, // golden-angle spread: no two crests line up
				a0: w.a, from: w.from, // (the height in today's sea, and whether it's swell or wind sea)
				fetch: 0, // ((M15) the wind sea's: the fetch it needs to be grown, setWind)
			};

		} );
		this.sea = [ 1, 1 ]; // swell, wind sea: x today's heights (setSea)
		this.wind = 0; // (M15) the wind the wind sea's grown in (setWind)
		this._lee = new Float64Array( n );
		this.windAngle = wind; // the wind sea's direction (setWindDir)
		// (M12) how far the swell's turned to the west's (setSwell), and the turn all the way; (M14) the
		// south's period and the westerly's (setSwell)
		this.west = 0;
		this.periods = [ SWELL_PERIOD, SWELL_PERIOD ];
		const turn = Math.atan2( SWELL_WEST.y, SWELL_WEST.x ) - swell;
		this._westTurn = Math.atan2( Math.sin( turn ), Math.cos( turn ) );
		this.iterations = 2; // the CPU height's fixed-point steps (more on steep seas: setSea)

		// GLSL: uniforms waveA[ i ] = ( d.x, d.z, k, omega ), waveB[ i ] = ( a, qa, phase, 0 )
		this.uniforms = {
			waveA: { value: this.waves.map( ( w ) => new Vector4( w.dx, w.dz, w.k, w.omega ) ) },
			// ((M15) w: a wind wave's fetch to be grown, setWind; -1, the swell's)
			waveB: { value: this.waves.map( ( w ) => new Vector4( w.a, w.qa, w.phase, w.from === 's' ? - 1 : 0 ) ) },
			waveTime: G.time,
			// (M15) the island's disc for its lee ( x, z, r ), and the swell's shadow
			waveLee: { value: new Vector4( LEE.x, LEE.z, LEE.r, LEE.shadow ) },
		};
		this.glsl = /* glsl */`
#define WAVE_COUNT ${ n }
uniform vec4 waveA[ WAVE_COUNT ];
uniform vec4 waveB[ WAVE_COUNT ];
uniform float waveTime;
uniform vec4 waveLee;

float waveFade( float depth ) { return smoothstep( ${ SHALLOW_FADE[ 0 ].toFixed( 2 ) }, ${ SHALLOW_FADE[ 1 ].toFixed( 2 ) }, depth ); }

// displacement of the surface at Lagrangian point x0; normal (unnormalized) out. (For a grid spacing m
// between its vertices: the waves too short for it to draw faded out, from 5 vertices a wavelength to 2.5,
// so where a coarser grid takes over both draw the same waves: on the low tier's sea the 11 m wave stopped
// at a straight edge 10-35 m off, a seam in the water.)
// ((M15) how much of a wave (A, B) reaches x0 in the island's lee: the share of its spread of directions the
// island blocks, seen from there (the disc's half-angle about its bearing), gone (the swell's: its shadow) or
// grown only over the fetch between (the wind sea's). The wind sea's grown share, its heights' (for its
// whitecaps): waveWindGrown, after waveDisplacementLod)
float waveWindGrown = 1.0;
float waveLeeOf( vec4 A, vec4 B, vec2 toIsland, float D ) {
	float phi = acos( clamp( - dot( toIsland, A.xy ), - 1.0, 1.0 ) );
	float alpha = D > waveLee.z ? asin( waveLee.z / D ) : 1.5708;
	float s = B.w < 0.0 ? ${ LEE.swell.toFixed( 5 ) } : ${ LEE.wind.toFixed( 5 ) };
	float blocked = clamp( ( min( phi + alpha, s ) - max( phi - alpha, - s ) ) / ( 2.0 * s ), 0.0, 1.0 );
	if ( B.w < 0.0 ) return 1.0 - blocked * waveLee.w;
	float grown = exp( - 0.625 * max( 0.0, pow( B.w / max( D - waveLee.z, 30.0 ), 1.32 ) - 1.0 ) );
	return 1.0 - blocked * ( 1.0 - grown );
}
vec3 waveDisplacementLod( vec2 x0, float fade, float spacing, out vec3 normal ) {
	vec3 d = vec3( 0.0 );
	vec3 n = vec3( 0.0, 1.0, 0.0 );
	vec2 toI = waveLee.xy - x0;
	float D = max( length( toI ), 1.0 );
	toI /= D;
	float windAll = 0.0, windGrown = 0.0;
	for ( int i = 0; i < WAVE_COUNT; i ++ ) {
		vec4 A = waveA[ i ];
		vec4 B = waveB[ i ];
		float theta = A.z * dot( A.xy, x0 ) - A.w * waveTime + B.z;
		float c = cos( theta ), s = sin( theta );
		float drawn = 1.0 - smoothstep( 0.2, 0.4, spacing * A.z * ${ ( 1 / ( 2 * Math.PI ) ).toFixed( 6 ) } );
		float lee = waveLeeOf( A, B, toI, D );
		if ( B.w >= 0.0 ) { windAll += B.x; windGrown += B.x * lee; }
		float a = B.x * fade * drawn * lee, qa = B.y * fade * drawn * lee;
		d.xz += A.xy * ( qa * c );
		d.y += a * s;
		n.xz -= A.xy * ( A.z * a * c );
		n.y -= A.z * qa * s;
	}
	normal = n;
	waveWindGrown = windAll > 0.0 ? windGrown / windAll : 1.0;
	return d;
}
vec3 waveDisplacement( vec2 x0, float fade, out vec3 normal ) { return waveDisplacementLod( x0, fade, 0.0, normal ); }
`;

	}

	// (M14) the highest the open sea's crests could rise over its still water (and its troughs fall under
	// it), with the swell's and the wind sea's heights x today's: its waves' amplitudes all in step
	reachOf( swell = 1, windSea = 1 ) {

		return this.waves.reduce( ( r, w ) => r + w.a0 * ( w.from === 's' ? swell : windSea ), 0 );

	}

	// (Salt Life) the sea state (Weather): the swell's and the wind sea's heights, x today's. Only the
	// heights change, in place (the CPU's waves and the GPU's waveB), never the phases, so the sea
	// builds and calms where it is; setSea( 1, 1 ) is today's sea exactly
	setSea( swell = 1, windSea = 1 ) {

		if ( swell === this.sea[ 0 ] && windSea === this.sea[ 1 ] ) return;
		this.sea[ 0 ] = swell;
		this.sea[ 1 ] = windSea;
		const n = this.waves.length;
		this.waves.forEach( ( w, i ) => {

			w.a = w.a0 * ( w.from === 's' ? swell : windSea );
			w.qa = crest( w.a, w.k, n );
			const B = this.uniforms.waveB.value[ i ];
			B.x = w.a;
			B.y = w.qa;

		} );
		this._steps();

	}

	// (M15) the wind (m/s) the wind sea's grown in: the fetch each of its waves needs to be grown (JONSWAP's),
	// shorter in a stronger wind. CPU and GPU together
	setWind( U ) {

		U = Math.max( 2, U );
		if ( Math.abs( U - this.wind ) < 0.05 ) return;
		this.wind = U;
		const B = this.uniforms.waveB.value;
		this.waves.forEach( ( w, i ) => {

			if ( w.from !== 'w' ) return;
			w.fetch = fetchFor( 2 * Math.PI / w.omega, U ); // (its period: deep water's)
			B[ i ].w = w.fetch;

		} );

	}

	// (M15) each wave's share of its height that reaches (x, z), into out (as waveLeeOf on the GPU)
	leeAt( x, z, out = this._lee ) {

		const vx = LEE.x - x, vz = LEE.z - z, D = Math.max( Math.hypot( vx, vz ), 1 );
		const alpha = D > LEE.r ? Math.asin( LEE.r / D ) : Math.PI / 2;
		this.waves.forEach( ( w, i ) => {

			const phi = Math.acos( Math.min( 1, Math.max( - 1, - ( vx * w.dx + vz * w.dz ) / D ) ) );
			const s = w.from === 's' ? LEE.swell : LEE.wind;
			const blocked = Math.min( 1, Math.max( 0, ( Math.min( phi + alpha, s ) - Math.max( phi - alpha, - s ) ) / ( 2 * s ) ) );
			out[ i ] = w.from === 's' ? 1 - blocked * LEE.shadow : 1 - blocked * ( 1 - grownOver( Math.max( D - LEE.r, 30 ), w.fetch ) );

		} );
		return out;

	}

	// (M15) how grown the wind sea is at (x, z): its waves' heights' share, as the GPU's waveWindGrown (its
	// whitecaps go with it)
	windGrownAt( x, z ) {

		const lee = this.leeAt( x, z );
		let all = 0, grown = 0;
		this.waves.forEach( ( w, i ) => {

			if ( w.from !== 'w' ) return;
			all += w.a;
			grown += w.a * lee[ i ];

		} );
		return all > 0 ? grown / all : 1;

	}

	// (Salt Life) the wind sea turns with the wind, `dir` (where it blows toward). Turned about the world's
	// origin, a wave's crests would sweep across everything far from it; so each wave's phase is moved to
	// keep it where it was at `at` (the camera): the sea turns about you. CPU and GPU together, as setSea
	setWindDir( dir, at ) {

		const a = Math.atan2( dir.y, dir.x );
		if ( a === this.windAngle ) return;
		this.windAngle = a;
		const A = this.uniforms.waveA.value, B = this.uniforms.waveB.value;
		this.waves.forEach( ( w, i ) => {

			if ( w.from !== 'w' ) return;
			const angle = a + SPECTRUM[ i ].rot, dx = Math.cos( angle ), dz = Math.sin( angle );
			// k ( d_old . p ) + phase_old = k ( d_new . p ) + phase_new, at p = at
			w.phase = ( w.phase + w.k * ( ( w.dx - dx ) * at.x + ( w.dz - dz ) * at.z ) ) % TAU;
			w.dx = dx;
			w.dz = dz;
			A[ i ].x = dx;
			A[ i ].y = dz;
			B[ i ].z = w.phase;

		} );

	}

	// (M12) a westerly's swell: west (0..1), how much of the swell comes from the west. Every swell wave
	// but the longest (the south's groundswell) turns that far to the west's direction, about `at` (the
	// camera) as the wind sea does; west 0 is today's sea exactly. (M14) And each its train's period (s):
	// the groundswell the south's (`south`), the rest between the south's and the westerly's (`westPeriod`)
	// as far as they've turned, their lengths with it, about `at` at time t as well: a wave carries on
	// where it is, only the crests' spacing and speed change, as the shore's clock does
	setSwell( west, south = SWELL_PERIOD, westPeriod = south, at = { x: 0, z: 0 }, t = G.time.value ) {

		if ( west === this.west && south === this.periods[ 0 ] && westPeriod === this.periods[ 1 ] ) return;
		this.west = west;
		this.periods[ 0 ] = south;
		this.periods[ 1 ] = westPeriod;
		const A = this.uniforms.waveA.value, B = this.uniforms.waveB.value, n = this.waves.length;
		const swell = Math.atan2( WORLD.swellDir.y, WORLD.swellDir.x );
		let first = true;
		this.waves.forEach( ( w, i ) => {

			if ( w.from !== 's' ) return;
			const turn = first ? 0 : west;
			first = false;
			const angle = swell + SPECTRUM[ i ].rot + turn * this._westTurn, dx = Math.cos( angle ), dz = Math.sin( angle );
			const k = kOf( SPECTRUM[ i ].T * ( south + ( westPeriod - south ) * turn ) ), omega = Math.sqrt( GRAVITY * k );
			// (k ( d . at ) - omega t + phase, the same before and after)
			w.phase = ( w.phase + w.k * ( w.dx * at.x + w.dz * at.z ) - k * ( dx * at.x + dz * at.z ) - ( w.omega - omega ) * t ) % TAU;
			w.dx = dx;
			w.dz = dz;
			w.k = k;
			w.omega = omega;
			w.qa = crest( w.a, k, n );
			A[ i ].set( dx, dz, k, omega );
			B[ i ].y = w.qa;
			B[ i ].z = w.phase;

		} );
		this._steps();

	}

	// a steeper sea moves its points further: the CPU's inversion (heightAt) takes more steps to land on
	// the drawn surface (today's seas take 2 on every tier)
	_steps() {

		const steep = this.waves.reduce( ( s, w ) => s + w.k * w.qa, 0 );
		this.iterations = steep > 0.34 ? 4 : steep > 0.28 ? 3 : 2;

	}

	fadeAt( x, z ) {

		if ( ! this.terrain ) return 1;
		const depth = G.seaLevel.value - this.terrain.heightAt( x, z );
		return MathUtils.smoothstep( depth, SHALLOW_FADE[ 0 ], SHALLOW_FADE[ 1 ] );

	}

	// displacement at Lagrangian point (x0, z0) at time t -> out [ dx, dy, dz ] ((M15) lee: each wave's share
	// there, leeAt's)
	displacement( x0, z0, t, out, fade = this.fadeAt( x0, z0 ), lee = this.leeAt( x0, z0 ) ) {

		let dx = 0, dy = 0, dz = 0;
		for ( let i = 0; i < this.waves.length; i ++ ) {

			const w = this.waves[ i ], f = fade * lee[ i ];
			const theta = w.k * ( w.dx * x0 + w.dz * z0 ) - w.omega * t + w.phase;
			const c = Math.cos( theta );
			dx += w.dx * w.qa * c * f;
			dz += w.dz * w.qa * c * f;
			dy += w.a * Math.sin( theta ) * f;

		}

		out[ 0 ] = dx;
		out[ 1 ] = dy;
		out[ 2 ] = dz;
		return out;

	}

	// Eulerian water height at (x, z): find the grid point x0 whose displaced position is (x, z)
	// (fixed-point iterations, as Tidewater's query kernel did), then its height
	heightAt( x, z, t = G.time.value ) {

		const d = this._d || ( this._d = [ 0, 0, 0 ] );
		const fade = this.fadeAt( x, z ), lee = this.leeAt( x, z );
		let x0 = x, z0 = z;
		for ( let i = 0; i < this.iterations; i ++ ) {

			this.displacement( x0, z0, t, d, fade, lee );
			x0 = x - d[ 0 ];
			z0 = z - d[ 2 ];

		}

		this.displacement( x0, z0, t, d, fade, lee );
		return G.seaLevel.value + d[ 1 ];

	}

}
