import * as THREE from 'three';
import { G } from '../core/Globals.js';
import { mulberry32 } from '../util/Noise.js';

// Large-scale variation of the sea surface in world space (never repeats with the wave tiles):
//  - gusts ("cat's paws"): patches of rougher water drifting downwind. Rough water reflects less
//    of the bright horizon sky, so from a low viewpoint gusts read as irregular dark patches.
//  - slicks: long calm bands along the wind (surfactant films) where capillary waves are damped;
//    mirror-like and bright, mostly in light to moderate wind.
//  - windrows: lines along the wind in a fresh wind (Langmuir circulation), where the surface water
//    converges and gathers the whitecaps' foam. (M14) As photographs of a sea in a blow show them (a
//    fjord in a gale, a line of sargassum): thin, nearly straight and parallel, unevenly spaced, each a
//    chain of foam in dashes and gaps that starts and stops over tens of metres.
//
// GLSL (this.glsl, with this.uniforms):
//   vec4 seaDetailSample( vec2 xz )   ( rough: short-wave slope multiplier, gust 0..1, slick 0..1,
//                                       streak 0..1: (M14) the windrows' foam, as a cover; in the
//                                       fragment only: their lines are drawn by the pixel's width )
// (Salt Life) On three's WebGL 2, read by WaterSurface. Low-powered devices (lite) take the gusts
// and slicks only: two texture taps instead of four.
export class SeaDetail {

	constructor( { size = 256, lite = false } = {} ) {

		this.texture = makeNoiseTexture( size );
		// (M9) its texels, for the gusts on the CPU (gustAt: the boat, the wind's sound)
		this._noise = this.texture.image.data;
		this._size = size;
		this.uniforms = {
			seaDetailNoise: { value: this.texture },
			seaDetailOffset: { value: new THREE.Vector2() }, // accumulated wind drift (m)
			seaDetailAmounts: { value: new THREE.Vector3( 1, 1, 1 ) }, // gust, slick, streak
			seaDetailTime: G.time,
			seaDetailWindDir: G.windDir,
			seaDetailWindSpeed: G.windSpeed,
			// (Salt Life) the slicks' and windrows' frame along the wind: ( a point, the along- and across-
			// wind distances there ). As the wind turns it's moved to the camera, so they turn about you
			seaDetailFrame: { value: new THREE.Vector4() },
		};
		this._wind = G.windDir.value.clone();
		this.offset = this.uniforms.seaDetailOffset;
		this.glsl = /* glsl */`
uniform sampler2D seaDetailNoise;
uniform vec2 seaDetailOffset;
uniform vec3 seaDetailAmounts;
uniform float seaDetailTime;
uniform vec2 seaDetailWindDir;
uniform float seaDetailWindSpeed;
uniform vec4 seaDetailFrame;
float seaDetailSs( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
// hardware bilinear, repeat-wrapped, level 0 (smooth, low-frequency noise: no mipmaps needed)
vec4 seaDetailLoad( vec2 uv ) { return textureLod( seaDetailNoise, uv, 0.0 ); }
// (M14) one set of windrows: cells (cell) m wide across the wind, three in four with a line in them,
// somewhere in the middle, each bending a metre or two its own way over a hundred or so, wiggling a little
// over a few; a chain of foam clumps of uneven size, threadlike in places and wide in others, on and off
// along it over tens of metres. Its cover at ( ac, along ) (m), with fw the pixel's width across (a line
// thinner than a pixel is spread over it, fainter)
float seaDetailRow( float ac, float along, float cell, float salt, float fw ) {
	float c = floor( ac / cell );
	vec3 h = fract( sin( vec3( c * 12.9898 + salt, c * 78.233 + salt * 1.7, c * 37.719 + salt * 2.3 ) ) * 43758.5453 );
	if ( h.x > 0.75 ) return 0.0;
	vec4 n = seaDetailLoad( vec2( along / 150.0 + h.z * 9.0, h.y * 5.0 + salt ) );
	vec4 b = seaDetailLoad( vec2( along / 31.0 + h.z * 5.0, h.x * 3.0 + salt * 0.3 ) );
	// (and its clumps a few metres apart, ragged from side to side)
	vec4 g = seaDetailLoad( vec2( along / 6.5 + h.y * 11.0, h.z * 7.0 + salt * 0.7 ) );
	float at = ( 0.25 + 0.5 * h.y ) * cell + ( n.x - 0.5 ) * 3.0 + ( b.z - 0.5 ) * 0.8 + ( g.x - 0.5 ) * 0.5;
	float hw = ( 0.12 + 0.25 * h.z ) * ( 0.4 + 1.2 * b.w ) * ( 0.5 + g.w ), wide = max( hw, fw );
	float line = ( 1.0 - seaDetailSs( wide * 0.3, wide, abs( ac - c * cell - at ) ) ) * hw / wide;
	float on = seaDetailSs( 0.42, 0.6, n.w );
	float clumps = seaDetailSs( 0.32, 0.62, b.y ) * ( 0.5 + 0.5 * b.x ) * mix( mix( 0.35, 1.0, seaDetailSs( 0.25, 0.55, g.y ) ), 1.0, seaDetailSs( 0.5, 2.0, fw ) );
	return line * on * mix( clumps, 1.0, 0.1 ) * ( 0.6 + 0.55 * h.x );
}
vec4 seaDetailSample( vec2 xz ) {
	vec2 p = xz - seaDetailOffset;
	// gusts: two octaves (~600 m and ~230 m features), the second slowly morphing
	float g1 = seaDetailLoad( p / 620.0 ).x;
	float g2 = seaDetailLoad( p / 230.0 + vec2( seaDetailTime * 0.0009, 0.37 ) ).y;
	float gustRaw = g1 * 0.62 + g2 * 0.38;
	float gust = clamp( ( gustRaw - 0.5 ) * 2.4 * seaDetailAmounts.x + 0.5, 0.0, 1.0 );
	// wind-aligned frame, lightly domain-warped so bands meander
	vec2 w = seaDetailWindDir, rel = xz - seaDetailFrame.xy;
	float along = dot( rel, w ) + seaDetailFrame.z;
	float across = dot( rel, vec2( - w.y, w.x ) ) + seaDetailFrame.w + ( g2 - 0.5 ) * 26.0;
	// slicks: long bands, strongest in light wind, torn apart by gusts
	float sl = seaDetailLoad( vec2( along / 1100.0, across / 70.0 ) ).z;
	float calmWind = 1.0 - seaDetailSs( 4.0, 13.0, seaDetailWindSpeed );
	float slick = seaDetailSs( 0.64, 0.76, sl ) * ( 1.0 - gust * 0.8 ) * calmWind * seaDetailAmounts.y;
	float streak = 0.0;
${ lite ? '' : /* glsl */`
	// windrows ((M14) as the whitecaps bring them foam: faint on a fair day, clear from a fresh breeze up): a strong line every 26 m or so, fainter ones between every 11, their
	// meander a metre or two over hundreds (not the slicks' warp)
	float freshWind = seaDetailSs( 5.0, 13.0, seaDetailWindSpeed );
	if ( freshWind > 0.0 ) {
		float ac = dot( rel, vec2( - w.y, w.x ) ) + seaDetailFrame.w + ( seaDetailLoad( vec2( along / 900.0, 0.37 ) ).x - 0.5 ) * 4.0;
		float fwA = fwidth( ac );
		streak = max( seaDetailRow( ac, along, 26.0, 0.0, fwA ), 0.6 * seaDetailRow( ac + 7.3, along, 11.0, 3.1, fwA ) ) * freshWind * seaDetailAmounts.z;
	}` }
	// windrows show mostly as smooth lanes (surfactant and debris collect in the convergence lines
	// and damp the ripples), with only a trace of foam
	float rough = mix( 0.5, 1.5, gust ) * ( 1.0 - slick * 0.8 ) * ( 1.0 - streak / max( seaDetailAmounts.z, 1e-3 ) * 0.45 );
	return vec4( rough, gust, slick, streak );
}
`;

	}

	// (M9) the gusts at ( x, z ) as the sea shows them (0..1, a lull to a gust: seaDetailSample's), from
	// the same texels and drift, so the boat feels the cat's paws you see coming across the water
	gustAt( x, z ) {

		const o = this.offset.value, px = x - o.x, pz = z - o.y;
		const g1 = this._texel( px / 620, pz / 620, 0 );
		const g2 = this._texel( px / 230 + G.time.value * 0.0009, pz / 230 + 0.37, 1 );
		const raw = g1 * 0.62 + g2 * 0.38;
		return Math.min( 1, Math.max( 0, ( raw - 0.5 ) * 2.4 * this.uniforms.seaDetailAmounts.value.x + 0.5 ) );

	}

	// a channel of the noise at ( u, v ), bilinear and repeat-wrapped as the GPU samples it
	_texel( u, v, c ) {

		const n = this._size, d = this._noise;
		const x = u * n - 0.5, y = v * n - 0.5, x0 = Math.floor( x ), y0 = Math.floor( y ), fx = x - x0, fy = y - y0;
		const i0 = ( ( x0 % n ) + n ) % n, j0 = ( ( y0 % n ) + n ) % n, i1 = ( i0 + 1 ) % n, j1 = ( j0 + 1 ) % n;
		const at = ( i, j ) => d[ ( j * n + i ) * 4 + c ];
		const a = at( i0, j0 ) + ( at( i1, j0 ) - at( i0, j0 ) ) * fx, b = at( i0, j1 ) + ( at( i1, j1 ) - at( i0, j1 ) ) * fx;
		return ( a + ( b - a ) * fy ) / 255;

	}

	update( dt, camera = null ) {

		// gust patterns travel with the wind at roughly its speed near the surface
		const w = G.windDir.value, s = G.windSpeed.value * 0.7 * dt;
		this.offset.value.x += w.x * s;
		this.offset.value.y += w.y * s;
		// (Salt Life) the wind turned: the slicks' and windrows' frame moves to the camera, keeping their
		// along and across distances there
		const o = this._wind;
		if ( camera && ( w.x !== o.x || w.y !== o.y ) ) {

			const F = this.uniforms.seaDetailFrame.value, x = camera.position.x - F.x, z = camera.position.z - F.y;
			F.set( camera.position.x, camera.position.z, x * o.x + z * o.y + F.z, - x * o.y + z * o.x + F.w );
			o.copy( w );

		}

	}

}

// Tileable smooth fbm in 4 channels (different seeds / base frequencies), RGBA8.
function makeNoiseTexture( size ) {

	const data = new Uint8Array( size * size * 4 );
	const channels = [
		{ seed: 11, freq: 4, oct: 4 },
		{ seed: 23, freq: 5, oct: 4 },
		{ seed: 37, freq: 4, oct: 3 },
		{ seed: 53, freq: 6, oct: 3 },
	];
	const vals = new Float32Array( size * size );

	for ( let c = 0; c < 4; c ++ ) {

		const { seed, freq, oct } = channels[ c ];
		const rand = mulberry32( seed );
		// gradient tables per octave (periodic lattice)
		const tables = [];
		for ( let o = 0; o < oct; o ++ ) {

			const n = freq << o;
			const g = new Float32Array( n * n * 2 );
			for ( let i = 0; i < n * n; i ++ ) {

				const a = rand() * Math.PI * 2;
				g[ i * 2 ] = Math.cos( a );
				g[ i * 2 + 1 ] = Math.sin( a );

			}

			tables.push( { n, g } );

		}

		let mn = Infinity, mx = - Infinity;
		for ( let y = 0; y < size; y ++ ) for ( let x = 0; x < size; x ++ ) {

			let v = 0, amp = 1, norm = 0;
			for ( let o = 0; o < oct; o ++ ) {

				const { n, g } = tables[ o ];
				const fx = x / size * n, fy = y / size * n;
				const xi = Math.floor( fx ), yi = Math.floor( fy );
				const xf = fx - xi, yf = fy - yi;
				const k00 = ( yi % n ) * n + ( xi % n ), k10 = ( yi % n ) * n + ( ( xi + 1 ) % n );
				const k01 = ( ( yi + 1 ) % n ) * n + ( xi % n ), k11 = ( ( yi + 1 ) % n ) * n + ( ( xi + 1 ) % n );
				const u = xf * xf * xf * ( xf * ( xf * 6 - 15 ) + 10 );
				const w = yf * yf * yf * ( yf * ( yf * 6 - 15 ) + 10 );
				const a0 = g[ k00 * 2 ] * xf + g[ k00 * 2 + 1 ] * yf, a1 = g[ k10 * 2 ] * ( xf - 1 ) + g[ k10 * 2 + 1 ] * yf;
				const b0 = g[ k01 * 2 ] * xf + g[ k01 * 2 + 1 ] * ( yf - 1 ), b1 = g[ k11 * 2 ] * ( xf - 1 ) + g[ k11 * 2 + 1 ] * ( yf - 1 );
				const a = a0 + ( a1 - a0 ) * u;
				v += ( a + ( b0 + ( b1 - b0 ) * u - a ) * w ) * amp;
				norm += amp;
				amp *= 0.5;

			}

			v /= norm;
			vals[ y * size + x ] = v;
			if ( v < mn ) mn = v;
			if ( v > mx ) mx = v;

		}

		for ( let i = 0; i < size * size; i ++ ) data[ i * 4 + c ] = Math.round( ( vals[ i ] - mn ) / ( mx - mn ) * 255 );

	}

	const t = new THREE.DataTexture( data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType );
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.minFilter = t.magFilter = THREE.LinearFilter;
	t.generateMipmaps = false;
	t.needsUpdate = true;
	return t;

}
