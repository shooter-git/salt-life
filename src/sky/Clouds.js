import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';
import { Pass, floatTarget, f } from './Atmosphere.js';

// Tidewater's earlier clouds (trade-wind cumulus under a thin cirrus veil; `?oldClouds`). sky-pro's
// cumulus (SkyProClouds.js) replaced the cumulus; the cirrus veil is ported here and composited
// behind them (in the view trace and the panorama), as Tidewater's screenshots show it: faint,
// fibrous high cloud along the upper wind.
//
// Port notes: the three procedural textures (synoptic coverage, the fibres' flow, the fibres by line
// integral convolution) were compute kernels; they are fragment passes here, made a strip per frame
// on first use (the fibres are mipmapped once complete), and the flow texture is freed afterwards.
//
// GLSL (`CIRRUS_GLSL`, prefix `clouds`; its uniforms are `cirrus.uniforms`):
//   vec4 cloudsHigh( vec3 rd, float pxAngle )   ( radiance, transmittance ) of the veil along rd
// (it uses ATMOSPHERE_GLSL and the key light uniforms of SkyProClouds' UNIFORMS_GLSL)

const PI = Math.PI;
const EARTH_R = 6360000;
// cirrus veil: coverage varying over hundreds of km, fibres (flow line streaks, mipmapped)
const SYN_RES = 256, SYN_SIZE = 409600; // m
const FIB_TILE = 40000; // m
const AP_DIST = 30000; // m, aerial perspective scale toward the horizon
// the flow and fibre textures are made a strip of rows per frame (the fibres' line integrals are the
// costly part: ~0.3 s a strip on a CPU WebGL device)
const ROWS = { aux: 32, fib: 16 };

// ------------------------------------------------------------ GLSL: noise generation helpers

const NOISE_GLSL = /* glsl */`
#ifndef PI
#define PI 3.141592653589793
#endif
float clHash2( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
vec2 clMod2( vec2 x, vec2 y ) { return x - y * floor( x / y ); }
float clGh( vec2 i, vec2 f, vec2 o, vec2 cells ) {
	vec2 c = clMod2( i + o, cells );
	float a = clHash2( c ) * ${ f( 2 * PI ) };
	return dot( vec2( cos( a ), sin( a ) ), f - o );
}
float clGnoise2( vec2 p, vec2 cells ) {
	vec2 q = p * cells;
	vec2 i = floor( q );
	vec2 f = fract( q );
	vec2 u = f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 ); // (sic: the original's fade, f^2 not f^3)
	return mix( mix( clGh( i, f, vec2( 0.0, 0.0 ), cells ), clGh( i, f, vec2( 1.0, 0.0 ), cells ), u.x ),
		mix( clGh( i, f, vec2( 0.0, 1.0 ), cells ), clGh( i, f, vec2( 1.0, 1.0 ), cells ), u.x ), u.y );
}
// gradient noise fbm remapped to about 0..1 (smoother than value noise, no grid artefacts)
float clGfbm( vec2 p, vec2 cells, float seed ) {
	return ( clGnoise2( p + seed, cells ) * 0.55 + clGnoise2( p + seed * 1.7, cells * 2.0 ) * 0.3 + clGnoise2( p + seed * 2.3, cells * 4.0 ) * 0.15 ) * 1.6 + 0.5;
}
`;

// ---- cirrus coverage: smooth fields of hundreds of km (u = x along the upper wind)
const SYN_PASS = NOISE_GLSL + /* glsl */`
void main() {
	vec2 p = gl_FragCoord.xy / ${ f( SYN_RES ) };
	float cov = clGfbm( p, vec2( 2.0, 3.0 ), 0.31 );
	float streets = clGfbm( p, vec2( 4.0, 14.0 ), 0.59 );
	float patches = clGfbm( p, vec2( 10.0, 14.0 ), 0.83 ) * 0.7 + clGfbm( p, vec2( 28.0, 40.0 ), 0.21 ) * 0.3;
	gl_FragColor = clamp( vec4( cov, streets, patches, 1.0 ), vec4( 0.0 ), vec4( 1.0 ) );
}
`;

// ---- cirrus fibres: sparse seeds integrated along a smooth, gently meandering flow (line
// integral convolution): long filaments of varied width, brightness and length
const AUX_PASS = NOISE_GLSL + /* glsl */`
uniform float fibRes;
float psi( vec2 q ) { return clGnoise2( q, vec2( 3.0 ) ) * 0.5 + clGnoise2( q + 0.37, vec2( 7.0 ) ) * 0.25 + clGnoise2( q + 0.71, vec2( 15.0 ) ) * 0.1; }
// sparse jittered points: n cells per texture, probability, radius (cells), seed
float points( vec2 p, float cluster, float n, float prob, float sigma, float seed ) {
	vec2 q = p * n;
	vec2 ip = floor( q );
	vec2 fp = fract( q );
	float v = 0.0;
	for ( int y = -1; y <= 1; y ++ ) { for ( int x = -1; x <= 1; x ++ ) {
		vec2 o = vec2( float( x ), float( y ) );
		vec2 c = clMod2( ip + o, vec2( n ) ) + seed;
		vec2 pos = o + vec2( clHash2( c ), clHash2( c + 19.7 ) ) * 0.8 + 0.1;
		float on = clHash2( c + 41.3 ) < cluster * prob ? 1.0 : 0.0;
		vec2 d = pos - fp;
		v = max( v, exp( dot( d, d ) * ( -0.5 / ( sigma * sigma ) ) ) * on * ( clHash2( c + 7.1 ) * 0.7 + 0.3 ) );
	} }
	return v;
}
void main() {
	vec2 p = gl_FragCoord.xy / fibRes;
	float e = 1.0 / fibRes;
	vec2 curl = vec2( psi( p + vec2( 0.0, e ) ) - psi( p - vec2( 0.0, e ) ), psi( p - vec2( e, 0.0 ) ) - psi( p + vec2( e, 0.0 ) ) ) / ( 2.0 * e );
	vec2 dir = normalize( vec2( 1.0, 0.0 ) + vec2( 0.0, clGnoise2( p + 0.13, vec2( 3.0 ) ) * 0.5 ) + curl * 0.05 );
	float cluster = clamp( clGfbm( p, vec2( 5.0 ), 0.9 ) * 1.6 - 0.3, 0.0, 1.0 );
	float seeds = max( points( p, cluster, 110.0, 0.3, 0.18, 0.0 ), points( p, cluster, 44.0, 0.3, 0.18, 3.3 ) * 0.8 );
	// tufts (heads of hooked filaments) and, just downwind of them, a sideways sag of the flow
	float tuft = points( p, cluster, 40.0, 0.4, 0.1, 6.1 );
	float droop = points( p, cluster, 40.0, 0.4, 0.3, 6.1 );
	gl_FragColor = vec4( seeds, atan( dir.y, dir.x ), tuft, droop );
}
`;

// short strands: each wisp fades in and out along its length and is broken up by fine noise
const FIB_PASS = NOISE_GLSL + /* glsl */`
uniform float fibRes;
uniform sampler2D auxTex;
void main() {
	const int LIC_STEPS = 44;
	float LIC_STEP = 1.0 / fibRes;
	vec2 p = gl_FragCoord.xy / fibRes;
	vec2 x1 = p; vec2 x2 = p;
	float fib = 0.0;
	float head = 0.0;
	for ( int i = 0; i < LIC_STEPS; i ++ ) {
		float k = float( i );
		vec4 a = textureLod( auxTex, x1, 0.0 );
		fib += a.x * sin( ( k + 0.5 ) * ${ f( PI / 44 ) } );
		x1 -= vec2( cos( a.y ), sin( a.y ) ) * LIC_STEP;
		// hooked tails: from the tuft downwind, sagging sideways
		vec4 b = textureLod( auxTex, x2, 0.0 );
		head += b.z * exp( k * ${ f( - 1 / 12 ) } );
		x2 -= normalize( vec2( cos( b.y ), sin( b.y ) + b.w * 1.2 ) ) * LIC_STEP;
	}
	float breakup = clamp( clGfbm( p, vec2( 24.0 ), 0.71 ) * 1.6 - 0.25, 0.0, 1.0 );
	float wisps = ( 1.0 - exp( fib * -0.8 ) ) * breakup;
	float hooks = 1.0 - exp( head * -0.5 );
	float veil = clGfbm( p, vec2( 4.0 ), 0.33 );
	gl_FragColor = vec4( clamp( max( wisps, hooks ), 0.0, 1.0 ), clamp( veil, 0.0, 1.0 ), 0.0, 1.0 );
}
`;

// ------------------------------------------------------------ GLSL: the veil

function cirrusGLSL( rot ) {

	const ha = rot + 0.6; // frame of the upper wind (veered from the trades)
	return /* glsl */`
uniform sampler2D cloudsSynTex;
uniform sampler2D cloudsFibTex;
uniform float cloudsFibRes;
uniform float cloudsCirrus; // amount 0..1 (0.5: faint, opacity mostly 0.05 - 0.2)
uniform float cloudsCirrusFade; // 0 until its textures are made
uniform float cloudsCirrusAlt; // m
uniform float cloudsCamY;
uniform vec2 cloudsCamXZ;
uniform vec2 cloudsHOffset; // drift (faster upper wind)
uniform vec3 cloudsSkyIrradiance; // Tidewater's frame.skyIrradiance (E / PI)
#define CL_EARTH_R ${ f( EARTH_R ) }

// distance along rd from a point at height camY (on the planet axis) to the sphere at altitude H
// (camera below it). Stable form: |oc|^2 - R^2 = (camY - H)(2Re + camY + H)
float cloudsShell( float camY, vec3 rd, float H ) {
	float b = rd.y * ( camY + CL_EARTH_R );
	float cc = ( camY - H ) * ( camY + H + 2.0 * CL_EARTH_R );
	float disc = b * b - cc;
	return - b + sqrt( max( disc, 0.0 ) );
}
// Henyey-Greenstein phase
float clPhaseHG( float c, float g ) { return ( ( 1.0 - g * g ) / ( 4.0 * PI ) ) / pow( max( 1.0 + g * g - c * 2.0 * g, 1e-4 ), 1.5 ); }

// cubic B-spline filtered texture lookup in 4 bilinear taps (GPU Gems 2, ch. 20): magnified cirrus fibres
// stay smooth instead of showing the bilinear texel grid
vec4 cloudsBspline( vec2 uv, float lod ) {
	float size = cloudsFibRes / exp2( lod );
	vec2 st = uv * size - 0.5;
	vec2 i = floor( st );
	vec2 fr = st - i;
	vec2 f2 = fr * fr; vec2 f3 = f2 * fr;
	vec2 w0 = ( - f3 + f2 * 3.0 - fr * 3.0 + 1.0 ) / 6.0;
	vec2 w1 = ( f3 * 3.0 - f2 * 6.0 + 4.0 ) / 6.0;
	vec2 w3 = f3 / 6.0;
	vec2 w2 = 1.0 - w0 - w1 - w3;
	vec2 g0 = w0 + w1; vec2 g1 = w2 + w3;
	vec2 p0 = ( i - 0.5 + w1 / g0 ) / size; vec2 p1 = ( i + 1.5 + w3 / g1 ) / size;
	return textureLod( cloudsFibTex, vec2( p0.x, p0.y ), lod ) * ( g0.x * g0.y )
		+ textureLod( cloudsFibTex, vec2( p1.x, p0.y ), lod ) * ( g1.x * g0.y )
		+ textureLod( cloudsFibTex, vec2( p0.x, p1.y ), lod ) * ( g0.x * g1.y )
		+ textureLod( cloudsFibTex, vec2( p1.x, p1.y ), lod ) * ( g1.x * g1.y );
}

vec2 cloudsToWind( vec2 v ) { return vec2( v.x * ${ f( Math.cos( ha ) ) } + v.y * ${ f( Math.sin( ha ) ) }, v.y * ${ f( Math.cos( ha ) ) } - v.x * ${ f( Math.sin( ha ) ) } ); }

// anisotropic filtering: n taps along the long axis of the footprint at the mip of its short axis
vec4 cloudsFibres( vec2 q, vec2 fA, vec2 fB, float tile, float rot ) {
	float cr = cos( rot ); float sr = sin( rot );
	vec2 wq = cloudsToWind( q ); vec2 wa = cloudsToWind( fA ); vec2 wb = cloudsToWind( fB );
	vec2 uv = vec2( wq.x * cr + wq.y * sr, wq.y * cr - wq.x * sr ) / tile;
	vec2 a = vec2( wa.x * cr + wa.y * sr, wa.y * cr - wa.x * sr ) / tile;
	vec2 b = vec2( wb.x * cr + wb.y * sr, wb.y * cr - wb.x * sr ) / tile;
	float la = length( a ) * cloudsFibRes; float lb = length( b ) * cloudsFibRes;
	vec2 major = la > lb ? a : b;
	const int n = 3;
	float lod = max( log2( max( min( la, lb ), max( la, lb ) / float( n ) ) ), 0.0 );
	vec4 sum = vec4( 0.0 );
	for ( int i = 0; i < n; i ++ ) {
		sum += cloudsBspline( uv + major * ( ( float( i ) + 0.5 ) / float( n ) - 0.5 ), lod );
	}
	return sum / float( n );
}

// Cirrus veil seen along rd: vec4( radiance, transmittance ). A thin sheet on a curved-earth
// shell, so its fibres converge toward the horizon in true perspective. Its coverage varies
// only over hundreds of km (clearer and thicker parts of the sky, no outlines); long, gently
// curved fibres follow the upper wind and give a low contrast texture. The fibre texture is
// filtered anisotropically with the footprint of one pixel (pxAngle, radians), which turns
// distant fibres into a smooth veil. Lighting: single scattering by ice crystals (strong
// forward peak: bright near the sun, a faint 22 degree halo) plus multiple scattering and sky
// light; lit by the sun from below its horizon for a while after sunset.
vec4 cloudsHigh( vec3 rd, float pxAngle ) {
	if ( rd.y < -0.01 || cloudsCirrus * cloudsCirrusFade <= 0.0 ) return vec4( 0.0, 0.0, 0.0, 1.0 );
	float H = cloudsCirrusAlt;
	// key light: the sun while it is the app's key light, else the moon
	bool isMoon = dot( scKeyDir, atmoSunDir ) < 0.9999;
	vec3 sunDir = scKeyDir;
	float cosT = dot( rd, sunDir );

	// geometry: hit point, local incidence, pixel footprint on the sheet (across the view and
	// along it, stretched by 1 / mu)
	float t = cloudsShell( cloudsCamY, rd, H );
	vec2 pxz = rd.xz * t;
	vec3 up = normalize( vec3( pxz.x / CL_EARTH_R, 1.0, pxz.y / CL_EARTH_R ) );
	float mu = max( dot( rd, up ), 0.02 );
	vec2 radial = normalize( rd.xz + vec2( 1e-6, 0.0 ) );
	vec2 fA = vec2( - radial.y, radial.x ) * ( t * pxAngle );
	vec2 fB = radial * ( t * pxAngle / mu );
	vec2 q = pxz + cloudsCamXZ - cloudsHOffset;

	// coverage: patches of 5 - 50 km with clear gaps, modulated over hundreds of km, broad bands
	vec4 syn = textureLod( cloudsSynTex, cloudsToWind( q ) * ${ f( 1 / SYN_SIZE ) }, 0.0 );
	float cov = smoothstep( 0.15, 0.85, syn.x ) * smoothstep( 0.4, 0.72, syn.z ) * ( syn.y * 0.4 + 0.6 );
	// fibres at two scales (hides the tiling of the texture)
	vec4 f1 = cloudsFibres( q, fA, fB, ${ f( FIB_TILE ) }, 0.0 );
	vec4 f2 = cloudsFibres( q, fA, fB, ${ f( FIB_TILE * 2.3 ) }, 0.5 );
	float fib = f1.x * 0.6 + f2.x * 0.4;
	float veil = f1.y * 0.5 + f2.y * 0.5;
	// vertical optical depth: faint wisps (opacity mostly 0.05 - 0.2 at the default amount) over
	// a thinner veil
	float amount = cloudsCirrus * ( scsShell.w * 0.5 + 0.78 );
	float tau = amount * 0.4 * cov * ( fib * 0.75 + 0.25 ) * ( veil * 0.4 + 0.8 );
	// slant path, bounded so the veil doesn't turn into a white band at the horizon
	float alpha = ( 1.0 - exp( - tau / max( mu, 0.25 ) ) ) * cloudsCirrusFade;

	// lighting: the key light at the sheet (sunset colours depend on the altitude), the earth's
	// shadow: the light is below its horizon once mu < -sqrt( 2 alt / R ) (the vertical tilts with distance)
	float muS = dot( sunDir, up );
	float muE = sunDir.y + dot( sunDir.xz, pxz ) / CL_EARTH_R;
	float lit = isMoon ? 1.0 : smoothstep( -0.006, 0.006, muE + sqrt( H * ${ f( 2 / EARTH_R ) } ) );
	vec3 E = ( isMoon ? scKeyColor : atmosphereSampleTransmittance( 6360.0 + H / 1000.0, muS ) * atmoSunIlluminance ) * lit;
	// ice: strong forward peak, a faint 22 degree halo, some backscatter; thin: mostly single
	// scattering, a little multiply scattered light
	float hd = ( acos( clamp( cosT, -1.0, 1.0 ) ) - 0.384 ) / 0.02;
	float halo = exp( - hd * hd ) * 0.04;
	float phase = clPhaseHG( cosT, 0.85 ) * 0.4 + clPhaseHG( cosT, 0.3 ) * 0.35 + clPhaseHG( cosT, -0.15 ) * 0.25 + halo;
	float Ts = exp( tau * -0.5 / max( muS, 0.1 ) );
	vec3 L = ( E * ( phase * Ts + ( 1.0 - Ts ) * 0.06 ) + cloudsSkyIrradiance * 0.9 ) * alpha;
	// aerial perspective: haze in front of the sheet shows sky light where the sheet hides it
	float tr = exp( t * ${ f( - 0.25 / AP_DIST ) } );
	vec3 skyL = atmosphereSkyLuminance( rd );
	float fade = smoothstep( -0.01, 0.02, rd.y );
	return vec4( ( L * tr + skyL * alpha * ( 1.0 - tr ) ) * fade, 1.0 - alpha * fade );
}
`;

}

// ------------------------------------------------------------ the veil

// the low tier's sky has no veil: its textures take ~50 frames of line integrals to make, which the
// weakest devices feel. The same interface as Cirrus, with a clear sky behind the cumulus.
export class NoCirrus {

	constructor() {

		this.glsl = /* glsl */`
vec4 cloudsHigh( vec3 rd, float pxAngle ) { return vec4( 0.0, 0.0, 0.0, 1.0 ); }
`;
		this.uniforms = { cloudsCirrus: { value: 0 }, cloudsCirrusFade: { value: 0 } };
		this.amount = this.uniforms.cloudsCirrus;
		this.passList = [];
		this.ready = true;
		this.memory = 0;

	}

	generate() {

		return true;

	}

	update() {}

	dispose() {}

}

export class Cirrus {

	constructor( renderer, { fibRes = 1024 } = {} ) {

		this.renderer = renderer;
		this.fibRes = fibRes;
		// cloud streets and the cirrus follow the upper wind: (Salt Life) the trades', whichever way the
		// weather turns the wind at the surface
		const w = G.windPrevailing.value;
		this._rot = Math.atan2( w.y, w.x );
		this.glsl = cirrusGLSL( this._rot );

		const rgba8 = { type: THREE.UnsignedByteType, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping };
		// r = cirrus coverage (hundreds of km), g = broad streets along the upper wind, b = patches (5 - 50 km)
		this.synTex = floatTarget( SYN_RES, SYN_RES, rgba8 );
		// r = fibres, g = veil noise (mipmapped: the fibres are filtered by the pixel footprint)
		this.fibTex = floatTarget( fibRes, fibRes, { ...rgba8, minFilter: THREE.LinearMipmapLinearFilter } );
		// fibre seeds and flow direction (r = seeds, g = flow angle): freed once the fibres are made
		this.auxTex = floatTarget( fibRes, fibRes, { wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping } );

		this.uniforms = {
			cloudsSynTex: { value: this.synTex.texture },
			cloudsFibTex: { value: this.fibTex.texture },
			cloudsFibRes: { value: fibRes },
			cloudsCirrus: { value: 0.5 },
			cloudsCirrusFade: { value: 0 },
			cloudsCirrusAlt: { value: 9000 },
			cloudsCamY: { value: 2 },
			cloudsCamXZ: { value: new THREE.Vector2() },
			cloudsHOffset: { value: new THREE.Vector2() },
			cloudsSkyIrradiance: { value: new THREE.Color() },
		};
		this.amount = this.uniforms.cloudsCirrus;

		this.synPass = new Pass( SYN_PASS );
		this.auxPass = new Pass( AUX_PASS, { fibRes: { value: fibRes } } );
		this.fibPass = new Pass( FIB_PASS, { fibRes: { value: fibRes }, auxTex: { value: this.auxTex.texture } } );
		this.passList = [ this.synPass, this.auxPass, this.fibPass ];
		this.step = 0; // generation steps done (synoptic, flow strips, fibre strips)
		this.ready = false;
		this._offset = new THREE.Vector2();

	}

	// one step of the generation per call (true once everything is made)
	generate() {

		if ( this.ready ) return true;
		const r = this.renderer, s = this.step ++;
		const nAux = this.fibRes / ROWS.aux, nFib = this.fibRes / ROWS.fib;
		const strip = ( target, pass, k, rows, last ) => {

			target.scissor.set( 0, k * rows, this.fibRes, rows );
			target.scissorTest = true;
			// the last strip of the fibres also builds their mip chain
			target.texture.generateMipmaps = last;
			pass.render( r, target, false );
			target.scissorTest = false;

		};

		if ( s === 0 ) this.synPass.render( r, this.synTex );
		else if ( s <= nAux ) strip( this.auxTex, this.auxPass, s - 1, ROWS.aux, false );
		else strip( this.fibTex, this.fibPass, s - 1 - nAux, ROWS.fib, s === nAux + nFib );
		if ( this.step === 1 + nAux + nFib ) {

			this.ready = true;
			this.auxTex.dispose();
			this.auxTex = null;

		}

		return this.ready;

	}

	update( dt, camera, skyIrradiance ) {

		// made a step per frame once the cumulus are ready, then shown (SkyProClouds makes a new panorama)
		this.uniforms.cloudsCirrusFade.value = this.ready ? 1 : 0;

		// the veil drifts with the upper wind (1.6 x the surface wind's speed, 12 m/s)
		const w = G.windPrevailing.value, l = Math.hypot( w.x, w.y ) || 1;
		const o = this._offset;
		o.x += w.x / l * 12 * 1.6 * dt;
		o.y += w.y / l * 12 * 1.6 * dt;
		const U = this.uniforms;
		U.cloudsHOffset.value.copy( o );
		U.cloudsCamY.value = THREE.MathUtils.clamp( camera.position.y, 1, 3000 );
		U.cloudsCamXZ.value.set( camera.position.x, camera.position.z );
		U.cloudsSkyIrradiance.value.copy( skyIrradiance );

	}

	get memory() {

		return Math.round( SYN_RES * SYN_RES * 4 + this.fibRes * this.fibRes * 4 * 4 / 3 + ( this.auxTex ? this.fibRes * this.fibRes * 8 : 0 ) );

	}

	dispose() {

		for ( const t of [ this.synTex, this.fibTex, this.auxTex ] ) if ( t ) t.dispose();
		for ( const p of this.passList ) p.dispose();

	}

}
