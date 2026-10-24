import { Vector4, MathUtils } from '../engine/index.js';
import { G, GRAVITY } from '../core/Globals.js';
import { WORLD } from '../world/WorldLayout.js';

// The open sea: a sum of Gerstner (trochoidal) waves, evaluated the same way on the GPU (the water
// surface) and on the CPU (WaterQuery: the boat, the swimmer, the bobber). It stands in for Tidewater's
// four-cascade FFT ocean, which needs compute shaders. Longer swell rolls in toward the island along
// WORLD.swellDir; shorter wind sea runs with G.windDir. Phones draw fewer waves than laptops; the CPU
// always evaluates exactly the set the GPU draws, so what floats sits on what is seen. (Salt Life) The
// weather sets the sea state (setSea: the swell's and the wind sea's heights) and turns the wind sea
// with the wind (setWindDir: about the camera, so the sea you're on doesn't sweep past).
//
// A wave i at Lagrangian point x0 (the undisplaced grid point):
//   theta = k (d . x0) - omega t + phase,  omega = sqrt( g k ) (deep water)
//   x = x0 + qa d cos( theta ),  y = a sin( theta )
// and every wave fades out over shallow water (the shore waves take over there).

// wavelength (m), amplitude (m), direction: rotation (rad) from the swell (s) or the wind (w)
const SPECTRUM = [
	{ L: 72, a: 0.32, from: 's', rot: 0 },
	{ L: 44, a: 0.18, from: 's', rot: 0.35 },
	{ L: 23, a: 0.09, from: 'w', rot: 0.25 },
	{ L: 11, a: 0.045, from: 'w', rot: - 0.4 },
	// mid and up
	{ L: 31, a: 0.12, from: 's', rot: - 0.5 },
	{ L: 7, a: 0.025, from: 'w', rot: 0.6 },
	// high
	{ L: 16, a: 0.06, from: 's', rot: 0.9 },
	{ L: 4.2, a: 0.012, from: 'w', rot: - 0.15 },
];
const COUNT = { low: 4, mid: 6, high: 8 };
const TAU = Math.PI * 2;
const STEEPNESS = 0.55; // sum of the waves' crest sharpening (< 1: no loops)
// a wave's crest sharpening (its horizontal travel), at most its share of STEEPNESS
const crest = ( a, k, n ) => Math.min( a * 1.4, STEEPNESS / ( k * n ) );

// depth (m) over which the open-sea waves fade out toward the beach
export const SHALLOW_FADE = [ 1.5, 12.0 ]; // (the shore waves take over from ~13 m of depth in)

export class Waves {

	constructor( { tier = 'low', terrain = null } = {} ) {

		this.terrain = terrain;
		const n = COUNT[ tier ] ?? COUNT.low;
		const swell = Math.atan2( WORLD.swellDir.y, WORLD.swellDir.x );
		const wind = Math.atan2( G.windDir.value.y, G.windDir.value.x );
		this.waves = SPECTRUM.slice( 0, n ).map( ( w, i ) => {

			const angle = ( w.from === 's' ? swell : wind ) + w.rot;
			const k = 2 * Math.PI / w.L;
			return {
				dx: Math.cos( angle ), dz: Math.sin( angle ), k, omega: Math.sqrt( GRAVITY * k ), a: w.a,
				qa: crest( w.a, k, n ),
				phase: ( ( i * 2.3999632 ) % 1 ) * Math.PI * 2, // golden-angle spread: no two crests line up
				a0: w.a, from: w.from, // (the height in today's sea, and whether it's swell or wind sea)
			};

		} );
		this.sea = [ 1, 1 ]; // swell, wind sea: x today's heights (setSea)
		this.windAngle = wind; // the wind sea's direction (setWindDir)
		this.iterations = 2; // the CPU height's fixed-point steps (more on steep seas: setSea)
		// 1 / the waves' summed height: a point's height over the sea, as a share of the highest crest
		this.crest = { value: 1 / this.waves.reduce( ( s, w ) => s + w.a, 0 ) };

		// GLSL: uniforms waveA[ i ] = ( d.x, d.z, k, omega ), waveB[ i ] = ( a, qa, phase, 0 )
		this.uniforms = {
			waveA: { value: this.waves.map( ( w ) => new Vector4( w.dx, w.dz, w.k, w.omega ) ) },
			waveB: { value: this.waves.map( ( w ) => new Vector4( w.a, w.qa, w.phase, 0 ) ) },
			waveTime: G.time,
			waveCrest: this.crest,
		};
		this.glsl = /* glsl */`
#define WAVE_COUNT ${ n }
uniform vec4 waveA[ WAVE_COUNT ];
uniform vec4 waveB[ WAVE_COUNT ];
uniform float waveTime;

float waveFade( float depth ) { return smoothstep( ${ SHALLOW_FADE[ 0 ].toFixed( 2 ) }, ${ SHALLOW_FADE[ 1 ].toFixed( 2 ) }, depth ); }

// displacement of the surface at Lagrangian point x0; normal (unnormalized) out
vec3 waveDisplacement( vec2 x0, float fade, out vec3 normal ) {
	vec3 d = vec3( 0.0 );
	vec3 n = vec3( 0.0, 1.0, 0.0 );
	for ( int i = 0; i < WAVE_COUNT; i ++ ) {
		vec4 A = waveA[ i ];
		vec4 B = waveB[ i ];
		float theta = A.z * dot( A.xy, x0 ) - A.w * waveTime + B.z;
		float c = cos( theta ), s = sin( theta );
		float a = B.x * fade, qa = B.y * fade;
		d.xz += A.xy * ( qa * c );
		d.y += a * s;
		n.xz -= A.xy * ( A.z * a * c );
		n.y -= A.z * qa * s;
	}
	normal = n;
	return d;
}
`;

	}

	// (Salt Life) the sea state (Weather): the swell's and the wind sea's heights, x today's. Only the
	// heights change, in place (the CPU's waves and the GPU's waveB), never the phases, so the sea
	// builds and calms where it is; setSea( 1, 1 ) is today's sea exactly
	setSea( swell = 1, windSea = 1 ) {

		if ( swell === this.sea[ 0 ] && windSea === this.sea[ 1 ] ) return;
		this.sea[ 0 ] = swell;
		this.sea[ 1 ] = windSea;
		const n = this.waves.length;
		let steep = 0, sum = 0;
		this.waves.forEach( ( w, i ) => {

			w.a = w.a0 * ( w.from === 's' ? swell : windSea );
			w.qa = crest( w.a, w.k, n );
			const B = this.uniforms.waveB.value[ i ];
			B.x = w.a;
			B.y = w.qa;
			steep += w.k * w.qa;
			sum += w.a;

		} );
		// a steeper sea moves its points further: the CPU's inversion (heightAt) takes more steps to
		// land on the drawn surface (today's seas take 2 on every tier)
		this.iterations = steep > 0.34 ? 4 : steep > 0.28 ? 3 : 2;
		this.crest.value = 1 / sum;

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

	fadeAt( x, z ) {

		if ( ! this.terrain ) return 1;
		const depth = G.seaLevel.value - this.terrain.heightAt( x, z );
		return MathUtils.smoothstep( depth, SHALLOW_FADE[ 0 ], SHALLOW_FADE[ 1 ] );

	}

	// displacement at Lagrangian point (x0, z0) at time t -> out [ dx, dy, dz ]
	displacement( x0, z0, t, out, fade = this.fadeAt( x0, z0 ) ) {

		let dx = 0, dy = 0, dz = 0;
		for ( const w of this.waves ) {

			const theta = w.k * ( w.dx * x0 + w.dz * z0 ) - w.omega * t + w.phase;
			const c = Math.cos( theta );
			dx += w.dx * w.qa * c * fade;
			dz += w.dz * w.qa * c * fade;
			dy += w.a * Math.sin( theta ) * fade;

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
		const fade = this.fadeAt( x, z );
		let x0 = x, z0 = z;
		for ( let i = 0; i < this.iterations; i ++ ) {

			this.displacement( x0, z0, t, d, fade );
			x0 = x - d[ 0 ];
			z0 = z - d[ 2 ];

		}

		this.displacement( x0, z0, t, d, fade );
		return G.seaLevel.value + d[ 1 ];

	}

}
