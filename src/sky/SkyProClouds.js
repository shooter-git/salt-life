import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';
import { ATMOSPHERE_GLSL, Pass, floatTarget, f } from './Atmosphere.js';
import { Cirrus, NoCirrus } from './Clouds.js';

// Volumetric cumulus from sky-pro-webgpu (../sky-pro-webgpu, "Partly cloudy" preset): procedural
// weather map, a 64³ Perlin-Worley shape noise with a height-dependent erosion, a cone-traced
// light march with three multiple-scattering octaves, powder and base darkening, a quarter-rate
// lattice trace reconstructed temporally at half resolution. Lit by Tidewater's atmosphere (sun
// or moon key light, sky view LUT) instead of sky-pro's own.
//
// Port notes (WebGPU compute -> WebGL 2 fragment passes):
//   - the noise volume was a downloaded blob (public/clouds/baseShape64.bin); it is generated here
//     instead, on the GPU, a few layers per frame into a 3D render target (tileable Perlin-Worley and
//     worley fbm octaves with the blob's channel statistics), so nothing is downloaded. The weather map
//     is made the same way, a strip per frame; the clouds fade in once the first panorama is made.
//   - the blue noise dither (blueNoise.bin) is interleaved gradient noise.
//   - the trace writes colour and depth to two targets (MRT); the resolve reads the trace with texel
//     fetches instead of a workgroup tile. After a camera cut the history is rebuilt at 4 slots a
//     frame (as Tidewater's earlier clouds did), and far clouds keep more of their history (there is
//     no TAA after them here).
//   - the panorama's slot is marched densely into a small target, then scattered into it (a discarding
//     pass over the whole panorama would keep most of every GPU wave idle); a whole new panorama (the
//     first one, a jump of the light) is made in a back buffer over 16 frames and swapped in.
//   - Tidewater's cirrus veil (Clouds.js) is composited behind the cumulus in the trace and panorama.
//   - tiers: `high` is Tidewater's (half resolution history, 1/16 of it traced per frame, 256 steps,
//     6 light taps); `mid` the same with fewer steps and light taps; both cap the history's size
//     (high: 1280 x 720, mid: 960 x 540 pixels). `low` has no per-pixel march at all: the panorama
//     (1/64 of it marched per frame, sampled bicubically) is the view's clouds; its first panorama is
//     made at that pace too (64 frames, none of them heavier than the rest), and it has no cirrus.
//   - the cloud shadow map on the ground (high only): as Tidewater's, 256² over 12 km around the camera,
//     a quarter of its rows marched a frame (all of them when it moves on); the lit materials read it
//     through materials/CloudShadows.js.
//
//   clouds.sampleUniforms     what a material samples the clouds with (CLOUDS_GLSL):
//     vec4 cloudsSampleView( vec3 dir )   ( rgb in-scattered radiance, a transmittance ), main view
//     vec4 cloudsSample( vec3 dir )       panorama (reflections, environment)
//     float cloudsSunTransmittance( float T )
//   clouds.coverage, clouds.cirrusAmount   { value } 0..1
//   clouds.overcast   { value } 0..1 (Salt Life: the weather's grey sky: denser, darker cloud, bases
//     everywhere). Slow changes of these are followed by the progressive refresh and the history; a
//     step (more than 0.05 in a frame) makes a new panorama
//   clouds.update( dt, camera, keyColor, nightSky, night, skyIrradiance ) (Tidewater's frame values;
//     keyColor: the moon's light at night)
//   clouds.resolutionScale, clouds.resetHistory(), clouds.invalidate()
//   clouds.shadowMap (high: a render target, else null), clouds.shadowArea { value } ( centre x, z, size m,
//     strength ): the ground's shadow along the key light (1 = clear)

const DEG = Math.PI / 180;

// "Partly cloudy": scattered fair-weather cumulus
const PRESET = {
	atmosphere: { multipleScattering: 0.99 },
	shape: {
		altitude: 4000, thickness: 5200, density: 0.019, coverage: 0.49,
		horizonCoverageStart: 20000, horizonCoverageRamp: 45000, horizonCoverageAmount: 0.12,
		edgeSoftness: 0.095, edgeSoftnessFalloff: 1, weatherScale: 29000, baseScale: 7500, baseStrength: 0.69,
		erosionScaleBaseMultiplier: 0.13, erosionStrengthBase: 0.24, erosionStrengthPeak: 2.15, erosionShape: 1,
		baseWeatherStrength: 0.54, baseWeatherHeightStart: 0, baseWeatherHeightEnd: 0.13,
	},
	lighting: {
		scatteringAlbedo: 1, powderStrength: 0.7, ambientIntensity: 0.7,
		groundBounceAlbedo: [ 0.009134058699157796, 0.015208514418949472, 0.018500220124016652 ],
		baseShadowStrength: 0.88, baseShadowHeight: 0.13, moonGain: 0.65,
	},
	// the preset's 89 m/s drift is a time-lapse; the clouds here drift with Tidewater's wind at a
	// trade-wind speed (evolution scaled by the same factor)
	wind: { speed: 12, evolutionSpeed: 60.8 * 12 / 89, skew: 1750 },
	fade: { hazeDensityScale: 0.62, horizonMeltStart: 25000, horizonMeltEnd: 45000 },
	weather: { mainMass: [ 4, 5, 0, 1.32 ], detail: [ 6, 6, 1, 0.13 ], coverage: 0.26 },
};

// per tier: the view trace (sky-pro "high" quality on high; the history at most historyBudget pixels),
// the panorama and the weather map
const QUALITY = {
	high: {
		view: true, historyDivisor: 2, historyBudget: 1280 * 720, lattice: 4, maxSteps: 256, lightTaps: 6, stepMeters: 25, fullLightingAlpha: 0.5, lightReuseSteps: 3, historyWeight: 0.9,
		pano: [ 512, 160 ], panoLattice: 4, panoSteps: 128, panoLightTaps: 6, weather: 1024, fibres: 1024, shadow: true,
	},
	mid: {
		view: true, historyDivisor: 2, historyBudget: 960 * 540, lattice: 4, maxSteps: 160, lightTaps: 4, stepMeters: 30, fullLightingAlpha: 0.45, lightReuseSteps: 3, historyWeight: 0.9,
		pano: [ 512, 160 ], panoLattice: 4, panoSteps: 96, panoLightTaps: 4, weather: 1024, fibres: 1024,
	},
	low: {
		view: false, stepMeters: 40, fullLightingAlpha: 0.4, lightReuseSteps: 4,
		pano: [ 1024, 256 ], panoLattice: 8, panoSteps: 96, panoLightTaps: 3, weather: 512, fibres: 0, warmLattice: 8,
	},
};

const NOISE_RES = 64;
const NOISE_LAYERS_PER_FRAME = 8;
const WEATHER_STRIPS = 8;
const BOUNDS_RES = 64;
const WARM_LATTICE = 4; // a whole new panorama: a 4x4 lattice, 16 frames (per tier: quality.warmLattice)
const REBUILD_SLOTS = 4; // view slots traced per frame while the history is rebuilt after a cut
const AP_DIST = 30000; // m: aerial perspective toward the horizon
const PANO_MIN = - 4 * DEG, PANO_RANGE = 94 * DEG; // panorama elevations (v = sqrt of the fraction)

const v4 = () => [ 0, 0, 0, 0 ];

// ------------------------------------------------------------------ GLSL: noise volume and weather map

// sky-pro weather.wgsl: hashed gradients (tileable Perlin), fbm
const HASH_GLSL = /* glsl */`
uvec3 scHash33( uvec3 p ) {
	p = p * 1664525u + 1013904223u;
	p.x += p.y * p.z; p.y += p.z * p.x; p.z += p.x * p.y;
	p = p ^ ( p >> uvec3( 16u ) );
	p.x += p.y * p.z; p.y += p.z * p.x; p.z += p.x * p.y;
	return p;
}
ivec3 scWrap( ivec3 c, int n ) { return c - n * ivec3( floor( vec3( c ) / float( n ) ) ); }
float scGradient( ivec3 cell, int period, vec3 offset ) {
	uint h = ( scHash33( uvec3( scWrap( cell, period ) ) ).x >> 24u ) & 15u;
	float u = h < 8u ? offset.x : offset.y;
	float v = h < 4u ? offset.y : ( ( h == 12u || h == 14u ) ? offset.x : offset.z );
	return ( ( h & 1u ) == 0u ? u : - u ) + ( ( h & 2u ) == 0u ? v : - v );
}
float scPerlin( vec3 p, int period ) {
	ivec3 cell = ivec3( floor( p ) ); vec3 fr = fract( p ); vec3 w = fr * fr * fr * ( fr * ( fr * 6.0 - 15.0 ) + 10.0 );
	return mix( mix( mix( scGradient( cell, period, fr ), scGradient( cell + ivec3( 1, 0, 0 ), period, fr - vec3( 1, 0, 0 ) ), w.x ),
		mix( scGradient( cell + ivec3( 0, 1, 0 ), period, fr - vec3( 0, 1, 0 ) ), scGradient( cell + ivec3( 1, 1, 0 ), period, fr - vec3( 1, 1, 0 ) ), w.x ), w.y ),
		mix( mix( scGradient( cell + ivec3( 0, 0, 1 ), period, fr - vec3( 0, 0, 1 ) ), scGradient( cell + ivec3( 1, 0, 1 ), period, fr - vec3( 1, 0, 1 ) ), w.x ),
		mix( scGradient( cell + ivec3( 0, 1, 1 ), period, fr - vec3( 0, 1, 1 ) ), scGradient( cell + ivec3( 1, 1, 1 ), period, fr - vec3( 1, 1, 1 ) ), w.x ), w.y ), w.z );
}
`;

// The shape noise volume (replaces sky-pro's baked baseShape64.bin): r = Perlin-Worley (a Perlin fbm
// remapped by a worley fbm, 3 cells per period), g / b = billowy worley fbm (1 - F1) of 6 and 12 cells,
// each normalized to the blob's statistics (mean 0.48, deviation 0.12). Tileable; one layer per pass.
const NOISE_PASS = HASH_GLSL + /* glsl */`
uniform float nzLayer;
// tileable worley F1 (cell units), cells per unit
float nzWorley( vec3 p, int cells, uint seed ) {
	vec3 q = p * float( cells );
	ivec3 ip = ivec3( floor( q ) );
	vec3 fp = q - vec3( ip );
	float d = 9.0;
	for ( int z = -1; z <= 1; z ++ ) for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
		ivec3 o = ivec3( x, y, z );
		uvec3 h = scHash33( uvec3( scWrap( ip + o, cells ) ) + seed );
		vec3 v = vec3( o ) + vec3( h >> 8u ) * ( 1.0 / 16777216.0 ) - fp;
		d = min( d, dot( v, v ) );
	}
	return min( sqrt( d ), 1.0 );
}
float nzBillows( vec3 p, int c, uint seed ) {
	return 1.0 - ( nzWorley( p, c, seed ) * 0.625 + nzWorley( p, c * 2, seed + 1u ) * 0.25 + nzWorley( p, c * 4, seed + 2u ) * 0.125 );
}
float nzPerlinFbm( vec3 p, int c ) {
	float s = 0.0, w = 0.5, ws = 0.0;
	for ( int i = 0; i < 4; i ++ ) {
		int fq = c << i;
		s += scPerlin( p * float( fq ), fq ) * w; ws += w; w *= 0.5;
	}
	return s / ws * 0.5 + 0.5;
}
void main() {
	vec3 p = vec3( gl_FragCoord.xy, nzLayer + 0.5 ) / ${ f( NOISE_RES ) };
	float pn = nzPerlinFbm( p, 3 );
	float wf = nzBillows( p, 3, 0u );
	// Perlin-Worley: remap( perlin, worley - 1, 1, 0, 1 )
	float r = ( pn - ( wf - 1.0 ) ) / ( 2.0 - wf );
	vec3 n = ( vec3( r, nzBillows( p, 6, 10u ), nzBillows( p, 12, 20u ) ) - vec3( 0.6696, 0.4808, 0.4799 ) ) / vec3( 0.0605, 0.1165, 0.1178 );
	gl_FragColor = vec4( clamp( n * 0.12 + 0.48, 0.0, 1.0 ), 1.0 );
}
`;

// sky-pro weather.wgsl (procedural fbm coverage)
const WEATHER_PASS = HASH_GLSL + /* glsl */`
uniform vec4 scsWeatherMass;
uniform vec4 scsWeatherDetail;
uniform vec4 scsWeather;
uniform float scWeatherSize;
float scFbm( vec2 uv, vec4 profile ) {
	float frequency = max( 1.0, floor( profile.x + 0.5 ) ); float weight = 0.5;
	float sum = 0.0; float weights = 0.0;
	for ( int i = 0; i < 8; i ++ ) {
		if ( i >= int( profile.y ) ) break;
		sum += scPerlin( vec3( uv, profile.z * 13.37 + 0.5 ) * frequency, int( frequency ) ) * weight;
		weights += weight; weight *= 0.5; frequency *= 2.0;
	}
	return sum / max( weights, 0.001 ) * 0.5 + 0.5;
}
void main() {
	vec2 uv = floor( gl_FragCoord.xy ) / scWeatherSize;
	float mass = clamp( ( scFbm( uv, scsWeatherMass ) - 0.5 ) * scsWeatherMass.w + 0.5, 0.0, 1.0 );
	float detail = ( scFbm( uv, scsWeatherDetail ) * 2.0 - 1.0 ) * scsWeatherDetail.w;
	gl_FragColor = vec4( clamp( mass + detail + scsWeather.x - 0.5, 0.0, 1.0 ), 0.0, 0.0, 1.0 );
}
`;

// sky-pro weather-bounds.wgsl: the maximum of the weather under each coarse cell
const BOUNDS_PASS = /* glsl */`
uniform sampler2D scWeatherMap;
void main() {
	ivec2 id = ivec2( gl_FragCoord.xy );
	ivec2 sourceSize = textureSize( scWeatherMap, 0 );
	vec2 scale = vec2( sourceSize ) / ${ f( BOUNDS_RES ) };
	// both bilinear neighbours at cell boundaries, including the repeat seam
	ivec2 lo = ivec2( floor( vec2( id ) * scale - 0.5 ) );
	ivec2 hi = ivec2( ceil( vec2( id + 1 ) * scale - 0.5 ) );
	float maximum = 0.0;
	for ( int y = lo.y; y <= hi.y; y ++ ) {
		for ( int x = lo.x; x <= hi.x; x ++ ) {
			ivec2 p = ivec2( x, y ) - sourceSize * ivec2( floor( vec2( x, y ) / vec2( sourceSize ) ) );
			maximum = max( maximum, texelFetch( scWeatherMap, p, 0 ).r );
		}
	}
	gl_FragColor = vec4( min( 1.0, maximum + 1.0 / 255.0 ), 0.0, 0.0, 1.0 );
}
`;

// ------------------------------------------------------------------ GLSL: shared core (renamed from sky-pro)

const UNIFORMS_GLSL = /* glsl */`
uniform vec4 scfPosition; // xyz camera, w tan( fov / 2 )
uniform vec4 scfRight; // w aspect
uniform vec4 scfUp;
uniform vec4 scfForward;
uniform vec4 scfPreviousPosition;
uniform vec4 scfPreviousRight;
uniform vec4 scfPreviousUp;
uniform vec4 scfPreviousForward;
uniform vec4 scfViewport; // xy render size, zw history size
uniform vec4 scfSampling; // xy lattice slot, z lattice, w history valid
uniform vec4 scfClock;
uniform vec4 scfWind; // xy drift (m), z evolution
uniform vec4 scfWindDelta;
uniform vec4 scfMarch; // x step (m), y max steps, z light taps, w full lighting alpha
uniform vec4 scfTemporal;
uniform vec4 scfDisplay; // y light reuse steps
uniform vec4 scfPano; // xy slot, z lattice
uniform vec4 scfLightOffsets[ 8 ];
uniform vec4 scfLightLods[ 8 ];
uniform vec4 scsShell; // altitude, thickness, density, coverage
uniform vec4 scsShape; // weather scale, base scale, base strength, erosion scale multiplier
uniform vec4 scsErosion;
uniform vec4 scsBase;
uniform vec4 scsHorizon;
uniform vec4 scsCloudLight;
uniform vec4 scsShadow;
uniform vec4 scsBounce;
uniform vec4 scsWind;
uniform vec4 scsFade;
// Tidewater's frame: the key light (the sun, or the moon at night: its colour), the night sky
uniform vec3 scKeyDir;
uniform vec3 scKeyColor;
uniform vec3 scNightSky;
uniform float scNight;
`;

const CORE_GLSL = /* glsl */`
#define SC_EARTH 6371.0
#define SC_FAR 250000.0
#define SC_AP_DIST ${ f( AP_DIST ) }
uniform highp sampler3D scNoise;
uniform sampler2D scWeatherMap;

vec3 scRay( vec2 uv ) {
	vec2 ndc = vec2( uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0 );
	return normalize( scfForward.xyz + scfRight.xyz * ( ndc.x * scfRight.w * scfPosition.w )
		+ scfUp.xyz * ( ndc.y * scfPosition.w ) );
}
vec2 scSourceUV( vec2 pixel ) {
	return ( pixel * scfSampling.z + scfSampling.xy + 0.5 ) / scfViewport.zw;
}
vec3 scProjectPrevious( vec3 p ) {
	vec3 v = p - scfPreviousPosition.xyz;
	float z = dot( v, scfPreviousForward.xyz );
	float denom = max( z, 0.001 ) * scfPreviousPosition.w;
	return vec3( vec2( dot( v, scfPreviousRight.xyz ) / ( denom * scfPreviousRight.w ),
		- dot( v, scfPreviousUp.xyz ) / denom ) * 0.5 + 0.5, z );
}
float scHG( float mu, float g ) {
	float d = max( 1.0 + g * g - 2.0 * g * mu, 0.001 );
	return ( 1.0 - g * g ) / ( 4.0 * PI * d * sqrt( d ) );
}
// normalized droplet phase: 80% forward / 20% backscatter; each higher order halves the asymmetry
vec3 scPhases( float mu ) {
	return vec3( scHG( mu, 0.8 ), scHG( mu, 0.4 ), scHG( mu, 0.2 ) ) * 0.8
		+ vec3( scHG( mu, -0.2 ), scHG( mu, -0.1 ), scHG( mu, -0.05 ) ) * 0.2;
}

// ---- density (sky-pro density.wgsl)
struct ScCandidate {
	float conservative; float edge; float top; float floorMask;
	float shellHeight; float localHeight; float coverage; vec3 position;
};
float scShellHeight( vec3 p ) {
	vec2 horizontal = p.xz - scfPosition.xz;
	// parabolic radial height avoids subtracting two ~6,371,000 m floats
	float altitude = p.y + dot( horizontal, horizontal ) / ( 2.0 * SC_EARTH * 1000.0 );
	return ( altitude - scsShell.x ) / scsShell.y;
}
float scConeLod( float footprint, float scale ) { return max( 0.0, log2( max( footprint * 64.0 / scale, 1.0 ) ) ); }
ScCandidate scCandidate( vec3 p, float coverage, float lod ) {
	float h = scShellHeight( p );
	ScCandidate result = ScCandidate( 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, vec3( 0.0 ) );
	if ( h < -0.1 || h > 1.3 || coverage <= 0.0 ) { return result; }
	vec2 windDirection = scsWind.xy;
	vec3 shapePosition = p - vec3( scfWind.x, 0.0, scfWind.y )
		- vec3( windDirection.x, 0.0, windDirection.y ) * ( scsWind.z * max( h, 0.0 ) - scfWind.z );
	float weather = textureLod( scWeatherMap, ( p.xz - scfWind.xy ) / scsShape.x, 0.0 ).r;
	float edge = max( scsBase.y * exp2( - max( h, 0.0 ) * scsBase.z ), 0.0001 );
	// an all-one noise sample bounds top dilation; a failed bound avoids the volume fetch
	float maximumTop = weather + coverage - 1.0 + 1.34 * scsShape.z * coverage;
	if ( maximumTop < h - edge ) { return result; }
	float required = ( 1.0 - smoothstep( scsBase.w, max( scsErosion.w, scsBase.w + 0.001 ), h ) ) * scsBase.x;
	float floorMask = smoothstep( required - 0.1, required, weather );
	if ( floorMask <= 0.0 ) { return result; }
	vec3 baseSample = textureLod( scNoise, shapePosition / scsShape.y, lod ).rgb;
	float dilation = dot( baseSample, vec3( 0.7, 0.41, 0.23 ) ) * scsShape.z;
	float top = weather + coverage - 1.0 + dilation * coverage;
	result.conservative = smoothstep( - edge, edge, top - h ) * smoothstep( - edge, edge, h ) * floorMask;
	result.edge = edge; result.top = top; result.floorMask = floorMask;
	result.shellHeight = h; result.localHeight = clamp( h / max( top, 0.001 ), 0.0, 1.0 );
	result.coverage = coverage; result.position = shapePosition;
	return result;
}
float scErodedDensity( ScCandidate c, float lod ) {
	if ( c.conservative <= 0.0 ) { return 0.0; }
	float strength = mix( scsErosion.x, scsErosion.y, c.localHeight );
	float maximumErosion = 0.173 * strength * c.coverage;
	if ( min( c.top - c.shellHeight, c.shellHeight ) >= maximumErosion + c.edge ) { return c.floorMask; }
	vec3 s = textureLod( scNoise, c.position / ( scsShape.y * scsShape.w ), lod ).rgb;
	vec3 field = mix( 1.0 - s, s, scsErosion.z );
	float erosion = dot( field, vec3( 0.113, 0.04, 0.02 ) ) * strength * c.coverage;
	return smoothstep( - c.edge, c.edge, c.top - erosion - c.shellHeight )
		* smoothstep( - c.edge, c.edge, c.shellHeight - erosion ) * c.floorMask;
}
float scLightDensity( vec3 p, float coverage, vec2 lods, bool cheap ) {
	ScCandidate c = scCandidate( p, coverage, lods.x );
	if ( cheap ) { return c.conservative; }
	return scErodedDensity( c, lods.y );
}
vec2 scShellRoots( vec3 direction, float altitude, float originHeight ) {
	float radius = SC_EARTH * 1000.0;
	float b = ( radius + originHeight ) * direction.y;
	float c = ( originHeight - altitude ) * ( 2.0 * radius + originHeight + altitude );
	float h = b * b - c;
	if ( h < 0.0 ) { return vec2( -1.0 ); }
	float q = - b - ( b >= 0.0 ? sqrt( h ) : - sqrt( h ) );
	float other = c / ( abs( q ) > 0.0001 ? q : -0.0001 );
	return vec2( min( q, other ), max( q, other ) );
}
vec2 scCloudInterval( vec3 dir, float originHeight ) {
	vec2 inner = scShellRoots( dir, scsShell.x, originHeight );
	vec2 outer = scShellRoots( dir, scsShell.x + scsShell.y, originHeight );
	float start = 0.0; float end = min( outer.y, SC_FAR );
	if ( outer.y <= 0.0 ) { return vec2( 0.0 ); }
	if ( originHeight < scsShell.x ) { start = max( inner.y, 0.0 ); }
	else {
		if ( originHeight > scsShell.x + scsShell.y ) { start = max( outer.x, 0.0 ); }
		if ( inner.x >= 0.0 ) { end = min( end, inner.x ); }
	}
	vec2 ground = scShellRoots( dir, 0.0, originHeight );
	if ( ground.x > 0.0 ) { end = min( end, ground.x ); }
	return vec2( start, end );
}
`;

// the ray march (sky-pro clouds.wgsl main(), as a function of the ray)
const MARCH_GLSL = /* glsl */`
uniform sampler2D scWeatherBounds;
float scCoverageAt( float t ) {
	return scsShell.w + scsHorizon.z * smoothstep( scsHorizon.x, scsHorizon.x + max( scsHorizon.y, 1.0 ), t );
}
float scHeightAlongRay( float t, vec3 dir, float originHeight ) {
	float altitude = originHeight + dir.y * t + dot( dir.xz, dir.xz ) * t * t / ( 2.0 * SC_EARTH * 1000.0 );
	return ( altitude - scsShell.x ) / scsShell.y;
}
bool scCellIsEmpty( float t, float end, vec3 dir, float originHeight, float maximumWeather ) {
	float turningPoint = - dir.y * SC_EARTH * 1000.0 / max( dot( dir.xz, dir.xz ), 0.000001 );
	float minHeight = scHeightAlongRay( clamp( turningPoint, t, end ), dir, originHeight );
	float maxHeight = max( scHeightAlongRay( t, dir, originHeight ), scHeightAlongRay( end, dir, originHeight ) );
	float coverage = scCoverageAt( end );
	float maximumTop = maximumWeather + coverage - 1.0 + 1.34 * scsShape.z * coverage;
	float edgeHeight = scsBase.z >= 0.0 ? minHeight : maxHeight;
	float edge = max( scsBase.y * exp2( - max( edgeHeight, 0.0 ) * scsBase.z ), 0.0001 );
	float required = ( 1.0 - smoothstep( scsBase.w, max( scsErosion.w, scsBase.w + 0.001 ), maxHeight ) ) * scsBase.x;
	return maximumTop < minHeight - edge || maximumWeather <= required - 0.1;
}
float scLightOpticalDepth( vec3 p, float coverage, vec2 lods, bool cheap ) {
	float opticalDepth = 0.0;
	for ( int i = 1; i < 8; i ++ ) {
		if ( i >= int( scfMarch.z ) ) { break; }
		vec4 tap = scfLightOffsets[ i ];
		opticalDepth += scLightDensity( p + tap.xyz, coverage, max( lods, scfLightLods[ i ].xy ), cheap ) * tap.w * scsShell.z;
		if ( opticalDepth >= 32.0 ) { break; }
	}
	return opticalDepth;
}
float scLightEnergy( float opticalDepth, vec3 phase ) {
	float quarter = exp( - opticalDepth * 0.25 );
	float halfT = quarter * quarter;
	return dot( vec3( halfT * halfT, halfT * 0.5, quarter * 0.25 ), phase );
}

// Tidewater's sky (the atmosphere's sky view LUT; the night sky's ambient)
vec3 scSky( vec3 dir ) {
	return atmosphereSkyLuminance( dir ) + scNightSky * scNight;
}
// key light: the sun while it is the app's key light, seen from cloud altitude, else the moon
vec3 scDirect() {
	bool isMoon = dot( scKeyDir, atmoSunDir ) < 0.9999;
	vec3 sunE = atmosphereSampleTransmittance( 6360.0 + scsShell.x * 0.001, scKeyDir.y ) * atmoSunIlluminance;
	return isMoon ? scKeyColor : sunE;
}

struct ScMarch { vec3 color; float alpha; float depth; float steps; };

ScMarch scMarch( vec3 origin, vec3 dir, float dither, float pixelConeAngle, float stepConeAngle, int maxSteps, bool useBounds ) {
	ScMarch outM = ScMarch( vec3( 0.0 ), 0.0, SC_FAR, 0.0 );
	vec2 interval = scCloudInterval( dir, origin.y );
	vec3 color = vec3( 0.0 ); float transmission = 1.0; float weightedDepth = 0.0;
	int steps = 0;
	if ( interval.y > interval.x && scsShell.w > 0.0 && scsShell.z > 0.0 ) {
		vec3 L = scKeyDir;
		float lightCosine = dot( dir, L );
		vec3 phase = scPhases( lightCosine );
		vec3 direct = scDirect();
		vec3 zenith = scSky( vec3( 0.0, 1.0, 0.0 ) );
		vec3 horizon = scSky( normalize( vec3( L.x, 0.03, L.z ) + vec3( 1e-5, 0.0, 0.0 ) ) );
		vec3 bounce = scsBounce.rgb * direct * max( L.y, 0.0 );
		float t = interval.x + dither * scfMarch.x;
		bool coarse = true; int emptyRun = 0; float accumulatedDepth = 0.0;
		float refineEnd = -1.0;
		float cellEnd = -1.0; float cellStart = -1.0; float maximumWeather = 1.0;
		float shadowAt = - SC_FAR; float shadowDensity = -1.0; float shadowTau = 0.0; float skyTau = 0.0; bool shadowCheap = false;
		bool hasDirectLight = max( direct.x, max( direct.y, direct.z ) ) > 0.00001;
		for ( int i = 0; i < 512; i ++ ) {
			if ( i >= maxSteps || t >= interval.y || transmission < 0.003 ) { break; }
			steps ++;
			if ( coarse && useBounds ) {
				if ( t >= cellEnd || t < cellStart ) {
					vec2 size = vec2( textureSize( scWeatherBounds, 0 ) );
					vec2 grid = ( origin.xz + dir.xz * t - scfWind.xy ) / scsShape.x * size;
					vec2 cell = floor( grid );
					vec2 wrapped = cell - size * floor( cell / size );
					maximumWeather = texelFetch( scWeatherBounds, ivec2( wrapped ), 0 ).r;
					vec2 fg = fract( grid );
					vec2 distance = vec2( dir.x >= 0.0 ? 1.0 - fg.x : fg.x, dir.z >= 0.0 ? 1.0 - fg.y : fg.y )
						/ max( abs( dir.xz ) * size / scsShape.x, vec2( 0.0000001 ) );
					cellStart = t; cellEnd = min( interval.y, t + max( min( distance.x, distance.y ), 0.05 ) );
				}
				if ( scCellIsEmpty( t, cellEnd, dir, origin.y, maximumWeather ) ) { t = cellEnd + 0.05; continue; }
			}
			float footprint = t * pixelConeAngle;
			float fineStep = max( scfMarch.x, t * stepConeAngle * 1.5 );
			vec3 p = origin + dir * t;
			float coverage = scCoverageAt( t );
			float baseLod = scConeLod( footprint, scsShape.y );
			ScCandidate c = scCandidate( p, coverage, baseLod );
			float erosionLod = scConeLod( footprint, scsShape.y * scsShape.w );
			if ( coarse ) {
				if ( c.conservative > 0.0 ) {
					if ( scErodedDensity( c, erosionLod ) > 0.0 ) {
						refineEnd = t;
						t = max( interval.x, t - fineStep * 4.0 ) + fineStep;
						t = min( t, refineEnd );
						coarse = false; emptyRun = 0;
						continue;
					}
				}
				t += fineStep * 4.0;
				continue;
			}
			float density = scErodedDensity( c, erosionLod );
			if ( density <= 0.0 ) {
				shadowAt = - SC_FAR;
				emptyRun ++;
				if ( t < refineEnd ) { t = min( t + fineStep, refineEnd ); continue; }
				if ( emptyRun >= 4 ) { coarse = true; }
				t += coarse ? fineStep * 4.0 : fineStep; continue;
			}
			emptyRun = 0; refineEnd = -1.0;
			float sigmaT = density * scsShell.z;
			float surfaceStep = clamp( 0.5 / max( sigmaT, 0.000001 ), fineStep * 0.15, fineStep );
			float stepLength = min( mix( surfaceStep, fineStep * 3.0, smoothstep( 1.0, 3.0, accumulatedDepth ) ), interval.y - t );
			float height = clamp( c.shellHeight, 0.0, 1.0 );
			float baseShadow = mix( 1.0, mix( 0.15, 1.0, smoothstep( 0.0, max( scsShadow.y, 0.001 ), height ) ), scsShadow.x );
			// darken thin margins away from the sun; keep the forward scattered silver linings
			float powderWeight = scsCloudLight.y * ( 1.0 - smoothstep( 0.2, 0.95, lightCosine ) );
			float powder = mix( 1.0, 1.0 - exp( - density * 2.0 ), powderWeight );
			float energy = 0.0;
			bool cheap = ( 1.0 - transmission ) >= scfMarch.w;
			float reuseDistance = min( fineStep * scfDisplay.y, max( 20.0, scsShape.y * scsShape.w * 0.03 ) );
			if ( abs( t - shadowAt ) >= reuseDistance || abs( density - shadowDensity ) > 0.08 || cheap != shadowCheap ) {
				vec2 lods = vec2( baseLod, erosionLod );
				if ( hasDirectLight ) { shadowTau = scLightOpticalDepth( p, coverage, lods, cheap ); }
				vec2 skyLods = lods + vec2( 1.0 );
				skyTau = ( scLightDensity( p + vec3( 0.0, 125.0, 0.0 ), coverage, skyLods, true ) * 250.0
					+ scLightDensity( p + vec3( 0.0, 600.0, 0.0 ), coverage, skyLods, true ) * 700.0 ) * scsShell.z;
				shadowAt = t; shadowDensity = density; shadowCheap = cheap;
			}
			if ( hasDirectLight ) {
				energy = scLightEnergy( shadowTau + sigmaT * scfLightOffsets[ 0 ].w, phase );
			}
			float skyVisibility = 0.2 + 0.8 / ( 1.0 + ( skyTau + sigmaT * 25.0 ) * 0.35 );
			vec3 ambient = ( mix( mix( zenith, horizon, 0.55 ), zenith, sqrt( height ) ) * skyVisibility + bounce * ( 1.0 - height ) )
				* scsCloudLight.z * ( 1.0 + scsCloudLight.w );
			vec3 light = ( direct * energy * powder * baseShadow + ambient ) * scsCloudLight.x;
			float stepT = exp( - sigmaT * stepLength );
			float alpha = transmission * ( 1.0 - stepT );
			color += alpha * light; weightedDepth += alpha * t;
			transmission *= stepT; accumulatedDepth += sigmaT * stepLength; t += stepLength;
		}
	}
	float alpha = 1.0 - transmission;
	float depth = SC_FAR;
	if ( alpha > 0.0 ) {
		depth = weightedDepth / alpha;
		// aerial perspective (distance toward the sky behind), then the far melt into the sky
		vec3 sky = scSky( dir );
		float ap = exp( - depth / SC_AP_DIST );
		color = color * ap + sky * alpha * ( 1.0 - ap );
		float melt = smoothstep( scsFade.y, max( scsFade.z, scsFade.y + 1.0 ), depth );
		color = mix( color, sky * alpha, melt );
	}
	outM.color = color; outM.alpha = alpha; outM.depth = depth; outM.steps = float( steps );
	return outM;
}
`;

// the view: one lattice slot of every block per frame (colour + depth, MRT)
const TRACE_PASS = ( cirrus ) => ATMOSPHERE_GLSL + UNIFORMS_GLSL + CORE_GLSL + MARCH_GLSL + cirrus + /* glsl */`
layout( location = 1 ) out highp vec4 scOutMeta;
void main() {
	vec2 id = floor( gl_FragCoord.xy );
	vec2 uv = scSourceUV( id );
	// the history is stored y up (WebGL), the camera rays y down
	vec3 dir = scRay( vec2( uv.x, 1.0 - uv.y ) );
	// interleaved gradient noise (Jimenez 2014) instead of the blue noise texture, advanced per frame
	float noise = fract( 52.9829189 * fract( dot( id, vec2( 0.06711056, 0.00583715 ) ) ) );
	float dither = scfTemporal.x > 0.0 ? fract( noise + scfClock.x * 0.61803398875 ) : 0.5;
	float pixelConeAngle = 2.0 * scfPosition.w / scfViewport.y;
	float stepConeAngle = 2.0 * scfPosition.w / scfViewport.w;
	ScMarch m = scMarch( scfPosition.xyz, dir, dither, pixelConeAngle, stepConeAngle, int( scfMarch.y ), scfDisplay.y > 0.0 );
	// Tidewater's cirrus veil behind the cumulus
	vec4 hi = cloudsHigh( dir, pixelConeAngle );
	gl_FragColor = vec4( m.color + hi.rgb * ( 1.0 - m.alpha ), 1.0 - ( 1.0 - m.alpha ) * hi.a );
	// km depth fits half float
	scOutMeta = vec4( m.depth * 0.001, 1.0, 0.0, 0.0 );
}
`;

// temporal reconstruction (sky-pro temporal.wgsl), ping-pong history: colour, ( depth, carried depth )
const RESOLVE_PASS = UNIFORMS_GLSL + /* glsl */`
#define SC_FAR 250000.0
uniform sampler2D scCurrentColor;
uniform sampler2D scCurrentMeta;
uniform sampler2D scPreviousColor;
uniform sampler2D scPreviousMeta;
layout( location = 1 ) out highp vec4 scOutMeta;
vec3 scRay( vec2 uv ) {
	vec2 ndc = vec2( uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0 );
	return normalize( scfForward.xyz + scfRight.xyz * ( ndc.x * scfRight.w * scfPosition.w )
		+ scfUp.xyz * ( ndc.y * scfPosition.w ) );
}
// previous camera projection, uv y up like the textures
vec3 scProjectPrevious( vec3 p ) {
	vec3 v = p - scfPreviousPosition.xyz;
	float z = dot( v, scfPreviousForward.xyz );
	float denom = max( z, 0.001 ) * scfPreviousPosition.w;
	return vec3( vec2( dot( v, scfPreviousRight.xyz ) / ( denom * scfPreviousRight.w ),
		dot( v, scfPreviousUp.xyz ) / denom ) * 0.5 + 0.5, z );
}
ivec2 scSourceClamp( ivec2 p ) { return clamp( p, ivec2( 0 ), textureSize( scCurrentColor, 0 ) - 1 ); }
vec4 scHistoryAt( vec2 uv, vec2 size ) {
	// five tap Catmull-Rom: detail survives repeated history warps
	vec2 position = uv * size;
	vec2 center = floor( position - 0.5 ) + 0.5;
	vec2 fr = position - center;
	vec2 w0 = fr * ( fr * ( -0.5 * fr + 1.0 ) - 0.5 );
	vec2 w1 = fr * fr * ( 1.5 * fr - 2.5 ) + 1.0;
	vec2 w2 = fr * ( fr * ( -1.5 * fr + 2.0 ) + 0.5 );
	vec2 w3 = fr * fr * ( 0.5 * fr - 0.5 );
	vec2 w12 = w1 + w2;
	vec2 uv0 = ( center - 1.0 ) / size;
	vec2 uv3 = ( center + 2.0 ) / size;
	vec2 uv12 = ( center + w2 / w12 ) / size;
	vec4 weights = vec4( w12.x * w0.y, w0.x * w12.y, w12.x * w12.y, w3.x * w12.y );
	float bottomWeight = w12.x * w3.y;
	vec4 value = textureLod( scPreviousColor, vec2( uv12.x, uv0.y ), 0.0 ) * weights.x
		+ textureLod( scPreviousColor, vec2( uv0.x, uv12.y ), 0.0 ) * weights.y
		+ textureLod( scPreviousColor, uv12, 0.0 ) * weights.z
		+ textureLod( scPreviousColor, vec2( uv3.x, uv12.y ), 0.0 ) * weights.w
		+ textureLod( scPreviousColor, vec2( uv12.x, uv3.y ), 0.0 ) * bottomWeight;
	return value / ( dot( weights, vec4( 1.0 ) ) + bottomWeight );
}
float scFreshHistoryWeight( vec4 color, float depth ) {
	// rebuilding after a cut: the fresh sample replaces the upsampled history
	if ( scfTemporal.z > 0.5 ) return 0.0;
	// (far clouds keep more of their history than sky-pro's 0.65: Tidewater's TAA smoothed the rest of
	// their sampling noise, and there is no TAA here)
	float retain = color.a < 0.0001 ? 0.25 : mix( 0.25, 0.8, smoothstep( 8.0, 30.0, depth ) );
	return min( scfTemporal.x, retain ) * ( 1.0 - scfTemporal.y );
}
void main() {
	ivec2 size = ivec2( scfViewport.zw );
	ivec2 id = ivec2( gl_FragCoord.xy );
	vec2 uv = ( vec2( id ) + 0.5 ) / vec2( size );
	int lattice = int( scfSampling.z );
	bool fresh = id.x % lattice == int( scfSampling.x ) && id.y % lattice == int( scfSampling.y );
	vec2 source = ( vec2( id ) - scfSampling.xy ) / scfSampling.z;
	ivec2 center = scSourceClamp( ivec2( floor( source + 0.5 ) ) );
	vec4 metadata = texelFetch( scCurrentMeta, center, 0 );
	vec4 central = texelFetch( scCurrentColor, center, 0 );
	float currentDepth = max( metadata.x, 0.001 );
	vec4 stored = texelFetch( scPreviousMeta, id, 0 );
	bool historyValid = scfSampling.w > 0.5 && scfTemporal.x > 0.0;

	vec4 color = vec4( 0.0 ); float weightSum = 0.0;
	ivec2 base = ivec2( floor( source ) ); vec2 fraction = fract( source );
	for ( int y = 0; y < 2; y ++ ) {
		for ( int x = 0; x < 2; x ++ ) {
			ivec2 pos = scSourceClamp( base + ivec2( x, y ) );
			vec4 tap = texelFetch( scCurrentColor, pos, 0 ); float depth = texelFetch( scCurrentMeta, pos, 0 ).x;
			float bilinear = ( x == 1 ? fraction.x : 1.0 - fraction.x ) * ( y == 1 ? fraction.y : 1.0 - fraction.y );
			float weight = bilinear * exp( - abs( depth - metadata.x ) / max( 0.1, metadata.x * 0.1 ) - abs( tap.a - central.a ) * 4.0 );
			color += tap * weight; weightSum += weight;
		}
	}
	color = weightSum > 0.00001 ? color / max( weightSum, 0.00001 ) : central;
	if ( fresh ) { color = central; }
	float carriedDepth = currentDepth;
	if ( historyValid ) {
		vec4 low = color; vec4 high = color;
		float reprojectionDepth = stored.y >= 0.001 ? stored.y : SC_FAR * 0.001;
		for ( int y = -1; y <= 1; y ++ ) {
			for ( int x = -1; x <= 1; x ++ ) {
				vec4 tap = texelFetch( scCurrentColor, scSourceClamp( center + ivec2( x, y ) ), 0 );
				low = min( low, tap ); high = max( high, tap );
				ivec2 neighbor = clamp( id + ivec2( x, y ), ivec2( 0 ), size - 1 );
				float depth = texelFetch( scPreviousMeta, neighbor, 0 ).y;
				if ( depth >= 0.001 ) { reprojectionDepth = min( reprojectionDepth, depth ); }
			}
		}
		if ( stored.y < 0.001 ) { reprojectionDepth = min( reprojectionDepth, currentDepth ); }
		vec3 world = scfPosition.xyz + scRay( vec2( uv.x, 1.0 - uv.y ) ) * ( reprojectionDepth * 1000.0 );
		world -= vec3( scfWindDelta.x, 0.0, scfWindDelta.y );
		vec3 previous = scProjectPrevious( world );
		ivec2 previousPixel = clamp( ivec2( previous.xy * vec2( size ) ), ivec2( 0 ), size - 1 );
		vec4 oldMeta = texelFetch( scPreviousMeta, previousPixel, 0 );
		bool valid = previous.z > 0.0 && all( greaterThanEqual( previous.xy, vec2( 0.0 ) ) ) && all( lessThanEqual( previous.xy, vec2( 1.0 ) ) ) && oldMeta.y >= 0.001;
		if ( valid ) {
			vec4 history = clamp( scHistoryAt( previous.xy, vec2( size ) ), low, high );
			float motionPixels = length( ( previous.xy - uv ) * vec2( size ) );
			float historyFraction = fresh ? scFreshHistoryWeight( central, currentDepth ) : 1.0;
			color = mix( color, history, historyFraction );
			float expectedDepth = length( world - scfPreviousPosition.xyz ) * 0.001;
			if ( ! fresh && ( motionPixels <= 0.5 || abs( oldMeta.y - expectedDepth ) < max( 0.001, expectedDepth * 0.15 ) ) ) {
				carriedDepth = oldMeta.y;
			}
		}
	}
	gl_FragColor = vec4( max( color.rgb, vec3( 0.0 ) ), clamp( color.a, 0.0, 1.0 ) );
	scOutMeta = vec4( currentDepth, carriedDepth, 0.0, 0.0 );
}
`;

// panorama (reflections, environment, the low tier's view): one lattice slot per frame, marched densely
// into a small target (a discarding pass over the whole panorama would leave most of every GPU wave
// idle), then scattered into the panorama by PANO_SCATTER_PASS
const PANO_PASS = ( cirrus ) => ATMOSPHERE_GLSL + UNIFORMS_GLSL + CORE_GLSL + MARCH_GLSL + cirrus + /* glsl */`
uniform vec2 scPanoSize;
uniform float scPanoSteps;
void main() {
	vec2 texel = floor( gl_FragCoord.xy ) * scfPano.z + scfPano.xy;
	vec2 uv = ( texel + 0.5 ) / scPanoSize;
	float elev = uv.y * uv.y * ${ f( PANO_RANGE ) } + ${ f( PANO_MIN ) };
	float az = uv.x * ${ f( 2 * Math.PI ) };
	vec3 dir = vec3( cos( elev ) * cos( az ), sin( elev ), cos( elev ) * sin( az ) );
	float cone = ${ f( 2 * Math.PI ) } / scPanoSize.x;
	ScMarch m = scMarch( scfPosition.xyz, dir, 0.5, cone, cone, int( scPanoSteps ), true );
	vec4 hi = cloudsHigh( dir, cone );
	gl_FragColor = vec4( m.color + hi.rgb * ( 1.0 - m.alpha ), ( 1.0 - m.alpha ) * hi.a );
}
`;

const PANO_SCATTER_PASS = /* glsl */`
uniform vec4 scfPano;
uniform sampler2D scPanoSlot;
void main() {
	ivec2 texel = ivec2( gl_FragCoord.xy );
	int lattice = int( scfPano.z );
	if ( texel.x % lattice != int( scfPano.x ) || texel.y % lattice != int( scfPano.y ) ) discard;
	gl_FragColor = texelFetch( scPanoSlot, texel / lattice, 0 );
}
`;

// ------------------------------------------------------------------ GLSL: sampling (the sky and its environment)

export const CLOUDS_GLSL = /* glsl */`
uniform sampler2D cloudsPanorama;
uniform sampler2D cloudsView;
uniform vec3 cloudsViewRight;
uniform vec3 cloudsViewUp;
uniform vec3 cloudsViewFwd;
uniform vec2 cloudsViewTan;
uniform float cloudsViewValid;
uniform float cloudsFade; // 0 until the noise and the first panorama are ready

vec2 cloudsPanoramaUV( vec3 dir ) {
	float az = atan( dir.z, dir.x );
	float u = fract( az / ${ f( 2 * Math.PI ) } );
	float elev = - acos( clamp( dir.y, -1.0, 1.0 ) ) + ${ f( Math.PI / 2 ) };
	float t = clamp( ( elev - ${ f( PANO_MIN ) } ) / ${ f( PANO_RANGE ) }, 0.0, 1.0 );
	return vec2( u, sqrt( t ) );
}
vec4 cloudsPanoramaFaded( vec4 s, vec3 dir ) {
	float below = smoothstep( -0.07, -0.03, dir.y ) * cloudsFade;
	return vec4( s.rgb * below, mix( 1.0, s.a, below ) );
}
// vec4( rgb in-scattered radiance, a transmittance ) for a view direction (panorama)
vec4 cloudsSample( vec3 dir ) {
	return cloudsPanoramaFaded( textureLod( cloudsPanorama, cloudsPanoramaUV( dir ), 0.0 ), dir );
}
// the same, bicubic (Catmull-Rom in 5 bilinear taps): the main view's clouds where there is no view
// trace (the low tier) keep crisper edges magnified
vec4 cloudsSampleSharp( vec3 dir ) {
	vec2 size = vec2( textureSize( cloudsPanorama, 0 ) );
	vec2 position = cloudsPanoramaUV( dir ) * size;
	vec2 center = floor( position - 0.5 ) + 0.5;
	vec2 fr = position - center;
	vec2 w0 = fr * ( fr * ( -0.5 * fr + 1.0 ) - 0.5 );
	vec2 w1 = fr * fr * ( 1.5 * fr - 2.5 ) + 1.0;
	vec2 w2 = fr * ( fr * ( -1.5 * fr + 2.0 ) + 0.5 );
	vec2 w3 = fr * fr * ( 0.5 * fr - 0.5 );
	vec2 w12 = w1 + w2;
	vec2 uv0 = ( center - 1.0 ) / size;
	vec2 uv3 = ( center + 2.0 ) / size;
	vec2 uv12 = ( center + w2 / w12 ) / size;
	vec4 weights = vec4( w12.x * w0.y, w0.x * w12.y, w12.x * w12.y, w3.x * w12.y );
	float bottomWeight = w12.x * w3.y;
	vec4 value = textureLod( cloudsPanorama, vec2( uv12.x, uv0.y ), 0.0 ) * weights.x
		+ textureLod( cloudsPanorama, vec2( uv0.x, uv12.y ), 0.0 ) * weights.y
		+ textureLod( cloudsPanorama, uv12, 0.0 ) * weights.z
		+ textureLod( cloudsPanorama, vec2( uv3.x, uv12.y ), 0.0 ) * weights.w
		+ textureLod( cloudsPanorama, vec2( uv12.x, uv3.y ), 0.0 ) * bottomWeight;
	value /= dot( weights, vec4( 1.0 ) ) + bottomWeight;
	return cloudsPanoramaFaded( clamp( value, vec4( 0.0 ), vec4( 64.0, 64.0, 64.0, 1.0 ) ), dir );
}

// Transmittance for the sun's disc behind the clouds. The cloud march stops once less than 0.3 % of
// the light gets through and reports that remainder, which (noisy from frame to frame) let a
// clamped sun disc of 2500x the sky shine and sparkle through thick cloud: below ~0.4 % it is dark.
float cloudsSunTransmittance( float T ) { return T * smoothstep( 0.004, 0.04, T ); }

// The main view's clouds: the temporally reconstructed history, looked up with the camera it was
// resolved for; outside it (or before any trace, or on the low tier) the panorama
vec4 cloudsSampleView( vec3 dir ) {
	float x = dot( dir, cloudsViewRight );
	float y = dot( dir, cloudsViewUp );
	float z = dot( dir, cloudsViewFwd );
	vec2 uv = vec2( x / max( z, 1e-4 ) / cloudsViewTan.x * 0.5 + 0.5, y / max( z, 1e-4 ) / cloudsViewTan.y * 0.5 + 0.5 );
	bool inside = cloudsViewValid > 0.5 && z > 0.01 && all( greaterThanEqual( uv, vec2( 0.0 ) ) ) && all( lessThanEqual( uv, vec2( 1.0 ) ) );
	if ( inside ) {
		vec4 v = max( textureLod( cloudsView, uv, 0.0 ), vec4( 0.0 ) );
		float above = smoothstep( -0.05, -0.03, dir.y ) * cloudsFade;
		return vec4( v.rgb * above, 1.0 - min( v.a, 1.0 ) * above );
	}
	return cloudsSampleSharp( dir );
}
`;

// ------------------------------------------------------------------ the clouds

// the clouds' shadow on the ground (sea level) under each texel: the optical depth up the key light
// through the cloud layer (Tidewater's shadow kernel)
const SHADOW_RES = 256;
const SHADOW_SIZE = 12000; // m
const SHADOW_PASS = '#ifndef PI\n#define PI 3.141592653589793\n#endif\n' + UNIFORMS_GLSL + CORE_GLSL + /* glsl */`
uniform vec4 scShadowArea; // xy centre (world xz), z size (m)
void main() {
	vec2 xz = scShadowArea.xy + ( gl_FragCoord.xy / ${ f( SHADOW_RES ) } - 0.5 ) * scShadowArea.z;
	vec3 L = scKeyDir;
	float ly = max( L.y, 0.08 );
	float t0 = scsShell.x / ly, t1 = ( scsShell.x + scsShell.y ) / ly;
	float dt = ( t1 - t0 ) / 16.0;
	float tau = 0.0;
	for ( int i = 0; i < 16; i ++ ) {
		float t = t0 + ( float( i ) + 0.5 ) * dt;
		vec3 p = vec3( xz.x, 0.0, xz.y ) + vec3( L.x, ly, L.z ) * t;
		tau += scLightDensity( p, scsShell.w, vec2( 2.0 ), false ) * scsShell.z * dt;
		if ( tau > 12.0 ) break;
	}
	// multiple scattering lets some light through even thick cloud (as the view's octaves do)
	float T = exp( - tau ) * 0.8 + exp( - tau * 0.25 ) * 0.2;
	gl_FragColor = vec4( T, 0.0, 0.0, 1.0 );
}`;

export class SkyProClouds {

	constructor( renderer, atmosphere, tier = 'high' ) {

		this.renderer = renderer;
		this.atmosphere = atmosphere;
		this.tier = QUALITY[ tier ] ? tier : 'low';
		const q = this.quality = QUALITY[ this.tier ];
		const P = PRESET, s = P.shape, l = P.lighting;

		// ---- per-frame state (sky-pro Frame) and settings (sky-pro Settings), one { value } per field
		const U = this.uniforms = {
			scfPosition: { value: v4() }, scfRight: { value: v4() }, scfUp: { value: v4() }, scfForward: { value: v4() },
			scfPreviousPosition: { value: v4() }, scfPreviousRight: { value: v4() }, scfPreviousUp: { value: v4() }, scfPreviousForward: { value: v4() },
			scfViewport: { value: v4() }, scfSampling: { value: v4() }, scfClock: { value: v4() }, scfWind: { value: v4() }, scfWindDelta: { value: v4() },
			scfMarch: { value: v4() }, scfTemporal: { value: v4() }, scfDisplay: { value: v4() }, scfPano: { value: v4() },
			scfLightOffsets: { value: new Float32Array( 32 ) },
			scfLightLods: { value: new Float32Array( 32 ) },
			scsShell: { value: [ s.altitude, s.thickness, s.density, s.coverage ] },
			scsShape: { value: [ s.weatherScale, s.baseScale, s.baseStrength, s.erosionScaleBaseMultiplier ] },
			scsErosion: { value: [ s.erosionStrengthBase, s.erosionStrengthPeak, s.erosionShape, s.baseWeatherHeightEnd ] },
			// exponential softness falloff per shell height fraction
			scsBase: { value: [ s.baseWeatherStrength, s.edgeSoftness, Math.log2( Math.max( s.edgeSoftnessFalloff, 0.001 ) ) * s.thickness * 0.001, s.baseWeatherHeightStart ] },
			scsHorizon: { value: [ s.horizonCoverageStart, s.horizonCoverageRamp, s.horizonCoverageAmount, 0 ] },
			// w: the atmosphere's multiple scattering term of the ambient
			scsCloudLight: { value: [ l.scatteringAlbedo, l.powderStrength, l.ambientIntensity, P.atmosphere.multipleScattering ] },
			scsShadow: { value: [ l.baseShadowStrength, l.baseShadowHeight, l.moonGain, 0 ] },
			scsBounce: { value: [ ...l.groundBounceAlbedo, 0 ] },
			scsWind: { value: [ 0, 1, P.wind.skew, 0 ] },
			scsFade: { value: [ P.fade.hazeDensityScale, P.fade.horizonMeltStart, P.fade.horizonMeltEnd, 0 ] },
			scsWeatherMass: { value: P.weather.mainMass.slice() },
			scsWeatherDetail: { value: P.weather.detail.slice() },
			scsWeather: { value: [ P.weather.coverage, 0, 0, 0 ] },
			scKeyDir: { value: new THREE.Vector3( 0, 1, 0 ) },
			scKeyColor: { value: new THREE.Color() },
			scNightSky: { value: new THREE.Color() },
			scNight: { value: 0 },
			scNoise: { value: null },
			scWeatherMap: { value: null },
			scWeatherBounds: { value: null },
		};

		// ---- public handles
		this.coverage = { value: s.coverage };
		this.overcast = { value: 0 };
		this.resolutionScale = 1;
		this.outputSize = null;

		// ---- textures
		// the shape noise: generated a few layers per frame (mipmapped once complete: the cone LOD)
		const noise = this.noise = new THREE.WebGL3DRenderTarget( NOISE_RES, NOISE_RES, NOISE_RES, {
			type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false,
			minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
		} );
		noise.texture.wrapS = noise.texture.wrapT = noise.texture.wrapR = THREE.RepeatWrapping;
		const W = q.weather;
		const r8 = { type: THREE.UnsignedByteType, format: THREE.RedFormat, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping };
		this.weatherMap = floatTarget( W, W, r8 );
		this.weatherBounds = floatTarget( BOUNDS_RES, BOUNDS_RES, { ...r8, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter } );
		U.scNoise.value = noise.texture;
		U.scWeatherMap.value = this.weatherMap.texture;
		U.scWeatherBounds.value = this.weatherBounds.texture;

		const [ PW, PH ] = q.pano;
		// the panorama and its back buffer (a whole new one is made there over warmFrames frames, then swapped in)
		this.panoramas = [ floatTarget( PW, PH, { wrapS: THREE.RepeatWrapping } ), floatTarget( PW, PH, { wrapS: THREE.RepeatWrapping } ) ];
		this.panorama = this.panoramas[ 0 ];
		// one slot of the panorama's lattice (the largest marched in a frame: the warm-up's)
		this.warmLattice = q.warmLattice || WARM_LATTICE;
		this.warmFrames = this.warmLattice ** 2;
		const slot = Math.min( this.warmLattice, q.panoLattice );
		this.panoSlot = floatTarget( Math.ceil( PW / slot ), Math.ceil( PH / slot ), { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter } );
		if ( q.view ) {

			// the trace (1/lattice² of the history) and the history ping-pong: colour + ( depth, carried depth )
			const mrt = ( w, h ) => {

				const t = floatTarget( w, h, { count: 2 } );
				t.textures[ 1 ].format = THREE.RGFormat;
				t.textures[ 1 ].minFilter = t.textures[ 1 ].magFilter = THREE.NearestFilter;
				return t;

			};

			this.source = mrt( 1, 1 );
			this.history = [ mrt( 1, 1 ), mrt( 1, 1 ) ];

		}

		this._pp = 0;

		// (high) the clouds' shadow on the ground
		this.shadowMap = q.shadow ? floatTarget( SHADOW_RES, SHADOW_RES, { format: THREE.RedFormat } ) : null;
		this.shadowArea = { value: new THREE.Vector4( 0, 0, SHADOW_SIZE, 0 ) };
		this._shadowRow = 0;
		this._shadowMade = false;

		// ---- sampling (every consumer: the sky, its environment)
		this.sampleUniforms = {
			cloudsPanorama: { value: this.panorama.texture },
			cloudsView: { value: this.panorama.texture },
			cloudsViewRight: { value: new THREE.Vector3( 1, 0, 0 ) },
			cloudsViewUp: { value: new THREE.Vector3( 0, 1, 0 ) },
			cloudsViewFwd: { value: new THREE.Vector3( 0, 0, - 1 ) },
			cloudsViewTan: { value: new THREE.Vector2( 1, 1 ) },
			cloudsViewValid: { value: 0 },
			cloudsFade: { value: 0 },
		};
		const S = this.sampleUniforms;
		this.viewCam = { right: S.cloudsViewRight, up: S.cloudsViewUp, fwd: S.cloudsViewFwd, tan: S.cloudsViewTan };
		this.viewValid = S.cloudsViewValid;
		this.fade = S.cloudsFade;

		// Tidewater's cirrus veil (composited behind the cumulus by the trace and the panorama)
		this.cirrus = q.fibres ? new Cirrus( renderer, { fibRes: q.fibres } ) : new NoCirrus();
		this.cirrusAmount = this.cirrus.amount;

		this._buildPasses();

		// ---- CPU state
		this._w = 0; this._h = 0; this._scale = 1;
		this.sourceWidth = 1; this.sourceHeight = 1; this.historyWidth = 1; this.historyHeight = 1;
		this.frameIndex = 0;
		this.historyValid = false;
		this.noiseLayer = 0; // layers of the noise volume made so far
		this.weatherStrip = 0; // strips of the weather map made so far
		this.panoWarm = 0; // > 0: slots of a new panorama still to march (a warmLattice x warmLattice lattice)
		this.panoVersion = 0; // new panoramas made (the environment follows)
		this._slotIndex = 0; // view traces so far (the lattice order)
		this._rebuild = 0; // view slots traced since the last cut
		this._waited = false; // the generation starts on the second update (the first one is the sky's)
		this.ready = false;
		this._windX = 0; this._windZ = 0; this._evolution = 0; this._elapsed = 0;
		this._prevCam = null;
		this._prevLight = new THREE.Vector3();
		this._lastCoverage = - 1;
		this._lastOvercast = 0;
		this.passes = 0; // passes drawn by the last update (stats)

	}

	// ------------------------------------------------------------ passes

	_buildPasses() {

		const U = this.uniforms, A = this.atmosphere.uniforms;
		const marchUniforms = { ...A, ...U, ...this.cirrus.uniforms };
		const cirrus = this.cirrus.glsl;
		this.noisePass = new Pass( NOISE_PASS, { nzLayer: { value: 0 } } );
		this.weatherPass = new Pass( WEATHER_PASS, { scsWeatherMass: U.scsWeatherMass, scsWeatherDetail: U.scsWeatherDetail, scsWeather: U.scsWeather, scWeatherSize: { value: this.quality.weather } } );
		this.boundsPass = new Pass( BOUNDS_PASS, { scWeatherMap: U.scWeatherMap } );
		this.panoPass = new Pass( PANO_PASS( cirrus ), { ...marchUniforms, scPanoSize: { value: new THREE.Vector2( ...this.quality.pano ) }, scPanoSteps: { value: this.quality.panoSteps } } );
		this.panoScatterPass = new Pass( PANO_SCATTER_PASS, { scfPano: U.scfPano, scPanoSlot: { value: this.panoSlot.texture } } );
		this.passList = [ this.noisePass, this.weatherPass, this.boundsPass, this.panoPass, this.panoScatterPass, ...this.cirrus.passList ];
		if ( this.quality.view ) {

			this.tracePass = new Pass( TRACE_PASS( cirrus ), marchUniforms );
			this.resolvePass = new Pass( RESOLVE_PASS, {
				...U,
				scCurrentColor: { value: this.source.textures[ 0 ] }, scCurrentMeta: { value: this.source.textures[ 1 ] },
				scPreviousColor: { value: null }, scPreviousMeta: { value: null },
			} );
			this.passList.push( this.tracePass, this.resolvePass );

		}

		if ( this.shadowMap ) {

			this.shadowPass = new Pass( SHADOW_PASS, { ...U, scShadowArea: this.shadowArea } );
			this.passList.push( this.shadowPass );

		}

	}

	// the passes' programs, for an asynchronous compile ahead of their first use
	get meshes() {

		return this.passList.map( ( p ) => p.mesh );

	}

	// ------------------------------------------------------------ frame

	_drawingBufferSize() {

		if ( this.outputSize ) return this.outputSize;
		return this.renderer.getDrawingBufferSize( this._size || ( this._size = new THREE.Vector2() ) );

	}

	_allocate( w, h ) {

		const q = this.quality;
		const scale = this.resolutionScale;
		const div = Math.max( q.historyDivisor, Math.sqrt( w * scale * h * scale / q.historyBudget ) );
		this.sourceWidth = Math.max( 1, Math.ceil( w * scale / div / q.lattice ) );
		this.sourceHeight = Math.max( 1, Math.ceil( h * scale / div / q.lattice ) );
		this.historyWidth = this.sourceWidth * q.lattice;
		this.historyHeight = this.sourceHeight * q.lattice;
		this.source.setSize( this.sourceWidth, this.sourceHeight );
		for ( const t of this.history ) t.setSize( this.historyWidth, this.historyHeight );
		this.historyValid = false;

	}

	// generation of the noise volume and the weather map, spread over the first frames
	_generate() {

		const r = this.renderer;
		if ( this.noiseLayer < NOISE_RES ) {

			const end = Math.min( NOISE_RES, this.noiseLayer + NOISE_LAYERS_PER_FRAME );
			for ( ; this.noiseLayer < end; this.noiseLayer ++ ) {

				// the last layer also builds the mip chain (the cone LOD)
				if ( this.noiseLayer === NOISE_RES - 1 ) this.noise.texture.generateMipmaps = true;
				this.noisePass.uniforms.nzLayer.value = this.noiseLayer;
				this.noisePass.render( r, this.noise, false, this.noiseLayer );
				this.passes ++;

			}

			return false;

		}

		if ( this.weatherStrip < WEATHER_STRIPS ) {

			const W = this.quality.weather, h = W / WEATHER_STRIPS, t = this.weatherMap;
			t.scissor.set( 0, this.weatherStrip * h, W, h );
			t.scissorTest = true;
			this.weatherPass.render( r, t, false );
			t.scissorTest = false;
			this.passes ++;
			if ( ++ this.weatherStrip === WEATHER_STRIPS ) {

				this.boundsPass.render( r, this.weatherBounds );
				this.passes ++;

			}

			return false;

		}

		this.panoWarm = this.warmFrames;
		return true;

	}

	update( dt, camera, keyColor, nightSky, night, skyIrradiance ) {

		const q = this.quality, P = PRESET, U = this.uniforms;
		dt = Math.min( 0.1, Math.max( 0, dt ) );
		this.passes = 0;

		// ---- noise volume and weather map (first frames)
		if ( ! this.ready && this._compiling ) return;
		if ( ! this.ready && this._waited ) this.ready = this._generate();
		this._waited = true;

		// ---- output size
		if ( q.view ) {

			const size = this._drawingBufferSize();
			if ( size.x !== this._w || size.y !== this._h || this.resolutionScale !== this._scale ) {

				this._w = size.x; this._h = size.y; this._scale = this.resolutionScale;
				this._allocate( size.x, size.y );

			}

		}

		// ---- settings: coverage, overcast, wind direction. (Salt Life) The weather moves the first two
		// a little every frame: the panorama's progressive refresh and the view's history follow on their
		// own. Only a step (a pick, the clock jumping) makes a whole new panorama, and never restarts one
		// already being made (the first one fades the clouds in, and brings the cirrus)
		const cov = this.coverage.value, oc = this.overcast.value;
		if ( cov !== this._lastCoverage || oc !== this._lastOvercast ) {

			const step = Math.abs( cov - this._lastCoverage ) > 0.05 || Math.abs( oc - this._lastOvercast ) > 0.05;
			U.scsShell.value[ 3 ] = cov;
			this._setOvercast( oc );
			this._lastCoverage = cov;
			this._lastOvercast = oc;
			if ( step ) {

				this.historyValid = false;
				if ( this.ready && this.panoWarm === 0 ) this.panoWarm = this.warmFrames;

			}

		}

		const wd = G.windDir.value;
		const wl = Math.hypot( wd.x, wd.y ) || 1;
		const wx = wd.x / wl, wz = wd.y / wl;
		U.scsWind.value[ 0 ] = wx; U.scsWind.value[ 1 ] = wz;

		// ---- key light (Tidewater's frame.sunDir / sunColor / skyIrradiance)
		const L = U.scKeyDir.value.copy( G.sunDir.value );
		U.scKeyColor.value.copy( keyColor );
		U.scNightSky.value.copy( nightSky );
		U.scNight.value = night;

		// ---- camera
		camera.updateMatrixWorld();
		const e = camera.matrixWorld.elements;
		const cp = camera.position;
		const tanY = Math.tan( THREE.MathUtils.degToRad( camera.fov * 0.5 ) ) / ( camera.zoom || 1 );
		const aspect = camera.aspect;
		const nrm = ( x, y, z ) => {

			const l = Math.hypot( x, y, z ) || 1;
			return [ x / l, y / l, z / l ];

		};

		const R = nrm( e[ 0 ], e[ 1 ], e[ 2 ] ), Up = nrm( e[ 4 ], e[ 5 ], e[ 6 ] ), Fw = nrm( - e[ 8 ], - e[ 9 ], - e[ 10 ] );
		const cur = { position: [ cp.x, cp.y, cp.z, tanY ], right: [ ...R, aspect ], up: [ ...Up, 0 ], forward: [ ...Fw, 0 ] };
		const prev = this._prevCam;
		// camera cuts: teleports, big turns, zoom
		if ( ! prev
			|| Math.hypot( cp.x - prev.position[ 0 ], cp.y - prev.position[ 1 ], cp.z - prev.position[ 2 ] ) > 1000
			|| Fw[ 0 ] * prev.forward[ 0 ] + Fw[ 1 ] * prev.forward[ 1 ] + Fw[ 2 ] * prev.forward[ 2 ] < 0.7
			|| Math.abs( tanY - prev.position[ 3 ] ) > 0.01 ) this.historyValid = false;
		if ( L.dot( this._prevLight ) < 0.999 ) {

			this.historyValid = false;
			// a new light (the moon takes over, a jump of the time of day): a whole new panorama (as the
			// time of day runs the progressive refresh follows the sun)
			if ( this.ready && L.dot( this._prevLight ) < 0.9997 ) this.panoWarm = this.warmFrames;

		}

		this._prevLight.copy( L );
		const src = this.historyValid && prev ? prev : cur;
		U.scfPosition.value = cur.position; U.scfRight.value = cur.right; U.scfUp.value = cur.up; U.scfForward.value = cur.forward;
		U.scfPreviousPosition.value = src.position; U.scfPreviousRight.value = src.right; U.scfPreviousUp.value = src.up; U.scfPreviousForward.value = src.forward;
		this._prevCam = cur;

		// ---- clock and wind
		this._elapsed += dt;
		const speed = P.wind.speed;
		const dx = wx * speed * dt, dz = wz * speed * dt;
		this._windX += dx; this._windZ += dz; this._evolution += P.wind.evolutionSpeed * dt;
		U.scfClock.value = [ this.frameIndex % 4096, this._elapsed, dt, 0 ];
		U.scfWind.value = [ this._windX, this._windZ, this._evolution, 0 ];
		U.scfWindDelta.value = [ dx, dz, 0, 0 ];
		U.scfDisplay.value = [ 0, q.lightReuseSteps, 0, 0 ];

		// ---- light march taps: a 25 m local segment, then geometric growth to ~2.5 km over a cone
		const lxd = L.x, lyd = L.y, lzd = L.z;
		let tx = lzd, ty = 0, tz = - lxd;
		if ( Math.abs( lyd ) > 0.99 ) {

			tx = 0; ty = - lzd; tz = lyd;

		}

		const inv = 1 / Math.hypot( tx, ty, tz );
		tx *= inv; ty *= inv; tz *= inv;
		const bx = lyd * tz - lzd * ty, by = lzd * tx - lxd * tz, bz = lxd * ty - lyd * tx;
		const off = U.scfLightOffsets.value, lods = U.scfLightLods.value;
		off[ 0 ] = 0; off[ 1 ] = 0; off[ 2 ] = 0; off[ 3 ] = 25;
		const sh = P.shape;
		const taps = q.view ? q.lightTaps : q.panoLightTaps;
		for ( let i = 1; i < 8; i ++ ) {

			const growth = 1.7 ** i, mid = 25 * ( ( growth - 1 ) / 0.7 + growth * 0.5 );
			const angle = i * 2.399963, radius = Math.sqrt( ( i + 0.5 ) / taps );
			const u = Math.cos( angle ) * radius * 0.05 * mid, v = Math.sin( angle ) * radius * 0.05 * mid;
			const o = i * 4;
			off[ o ] = lxd * mid + tx * u + bx * v; off[ o + 1 ] = lyd * mid + ty * u + by * v; off[ o + 2 ] = lzd * mid + tz * u + bz * v; off[ o + 3 ] = 25 * growth;
			const footprint = mid * 0.1;
			lods[ o ] = Math.max( 0, Math.log2( footprint * 64 / sh.baseScale ) );
			lods[ o + 1 ] = Math.max( 0, Math.log2( footprint * 64 / ( sh.baseScale * sh.erosionScaleBaseMultiplier ) ) );

		}

		this.cirrus.update( dt, camera, skyIrradiance );
		if ( ! this.ready ) return;
		const r = this.renderer;
		// the cirrus textures, a step per frame after the first panorama
		if ( this.panoWarm === 0 && ! this.cirrus.ready ) {

			// once they are made, a new panorama with the veil
			if ( this.cirrus.generate() ) {

				this.cirrus.uniforms.cloudsCirrusFade.value = 1;
				this.panoWarm = this.warmFrames;
				this.historyValid = false;

			}

			this.passes ++;

		}


		// ---- panorama: the first one over 16 frames (4x4 lattice), then one slot of the lattice per frame
		const PL = q.panoLattice;
		U.scfMarch.value = [ q.stepMeters, q.panoSteps, q.panoLightTaps, q.fullLightingAlpha ];
		const warming = this.panoWarm > 0;
		if ( warming ) {

			const k = this.warmFrames - this.panoWarm --, WL = this.warmLattice;
			U.scfPano.value = [ k % WL, Math.floor( k / WL ), WL, 0 ];

		} else {

			// a scrambled order over the lattice (no visible sweep)
			const k = ( this.frameIndex * 7 ) % ( PL * PL );
			U.scfPano.value = [ k % PL, Math.floor( k / PL ), PL, 0 ];

		}

		const [ PW, PH ] = q.pano, sl = this.panoSlot, lat = U.scfPano.value[ 2 ];
		sl.viewport.set( 0, 0, Math.ceil( PW / lat ), Math.ceil( PH / lat ) );
		sl.scissor.copy( sl.viewport );
		sl.scissorTest = true;
		this.panoPass.render( r, sl );
		this.panoScatterPass.render( r, warming ? this.panoramas[ 1 ] : this.panorama, false );
		this.passes += 2;
		if ( warming && this.panoWarm === 0 ) {

			// the new panorama is complete: it becomes the one the sky samples
			this.panoVersion ++;
			this.panoramas.reverse();
			this.panorama = this.panoramas[ 0 ];
			const S = this.sampleUniforms;
			if ( S.cloudsView.value === S.cloudsPanorama.value ) S.cloudsView.value = this.panorama.texture;
			S.cloudsPanorama.value = this.panorama.texture;

		}

		// fade in once the first panorama is complete
		if ( this.panoWarm === 0 ) this.fade.value = Math.min( 1, this.fade.value + dt * 2 );
		if ( this.shadowMap ) this._shadow( camera );

		const underwater = G.cameraUnderwater.value > 0.5;
		if ( ! q.view || underwater ) {

			// the sky is only seen through Snell's window (panorama), or the tier has no view trace
			this.viewValid.value = 0;
			this.historyValid = false;

		} else {

			// after a camera cut (or a new light) the history is rebuilt at REBUILD_SLOTS slots per frame,
			// each fresh sample replacing the upsampled one (Tidewater's earlier clouds did the same): no
			// blocky clouds for a whole lattice cycle
			const size = this._drawingBufferSize();
			const lat = q.lattice, cycle = lat * lat;
			if ( ! this.historyValid ) this._rebuild = 0;
			const slots = this._rebuild < cycle ? Math.min( REBUILD_SLOTS, cycle - this._rebuild ) : 1;
			U.scfViewport.value = [ size.x * this.resolutionScale, size.y * this.resolutionScale, this.historyWidth, this.historyHeight ];
			U.scfMarch.value = [ q.stepMeters, q.maxSteps, q.lightTaps, q.fullLightingAlpha ];
			for ( let k = 0; k < slots; k ++ ) {

				if ( k > 0 ) {

					// no camera motion or drift between the traces of one frame
					U.scfPreviousPosition.value = cur.position; U.scfPreviousRight.value = cur.right; U.scfPreviousUp.value = cur.up; U.scfPreviousForward.value = cur.forward;
					U.scfWindDelta.value = [ 0, 0, 0, 0 ];

				}

				// sampling lattice (Morton-style permutation over the cycle)
				const index = this._slotIndex ++ % cycle;
				let lx = 0, ly = 0;
				for ( let bit = 0; ( 1 << bit ) < lat; bit ++ ) {

					const pair = ( index >> ( bit * 2 ) ) & 3;
					lx |= ( ( pair >> 1 ) ^ ( pair & 1 ) ) << ( Math.log2( lat ) - bit - 1 );
					ly |= ( pair & 1 ) << ( Math.log2( lat ) - bit - 1 );

				}

				U.scfSampling.value = [ lx, ly, lat, this.historyValid ? 1 : 0 ];
				U.scfClock.value = [ this._slotIndex % 4096, this._elapsed, dt, 0 ];
				U.scfTemporal.value = [ q.historyWeight, Math.min( 1, P.wind.evolutionSpeed * dt / 100 ), this._rebuild < cycle ? 1 : 0, 0 ];

				this.tracePass.render( r, this.source );
				const out = this.history[ this._pp ], last = this.history[ 1 - this._pp ];
				const ru = this.resolvePass.uniforms;
				ru.scPreviousColor.value = last.textures[ 0 ];
				ru.scPreviousMeta.value = last.textures[ 1 ];
				this.resolvePass.render( r, out );
				this.passes += 2;
				this.sampleUniforms.cloudsView.value = out.textures[ 0 ];
				this._pp = 1 - this._pp;
				this.historyValid = true;
				this._rebuild ++;

			}

			const V = this.viewCam;
			V.right.value.set( R[ 0 ], R[ 1 ], R[ 2 ] );
			V.up.value.set( Up[ 0 ], Up[ 1 ], Up[ 2 ] );
			V.fwd.value.set( Fw[ 0 ], Fw[ 1 ], Fw[ 2 ] );
			V.tan.value.set( tanY * aspect, tanY );
			this.viewValid.value = 1;

		}

		this.frameIndex ++;

	}

	// (high) the shadow map: a quarter of its rows a frame around a centre snapped to 4 texels; all of
	// them when the centre moves on (or the first time). It fades in with the clouds.
	_shadow( camera ) {

		const A = this.shadowArea.value, t = this.shadowMap, cell = SHADOW_SIZE / SHADOW_RES * 4;
		const cx = Math.round( camera.position.x / cell ) * cell, cz = Math.round( camera.position.z / cell ) * cell;
		const all = ! this._shadowMade || cx !== A.x || cz !== A.y;
		A.set( cx, cz, SHADOW_SIZE, 0.85 * this.fade.value );
		if ( ! all ) {

			const rows = SHADOW_RES / 4;
			t.scissor.set( 0, this._shadowRow * rows, SHADOW_RES, rows );
			t.scissorTest = true;
			this._shadowRow = ( this._shadowRow + 1 ) % 4;

		}

		this.shadowPass.render( this.renderer, t, false );
		t.scissorTest = false;
		this._shadowMade = true;
		this.passes ++;

	}

	// (Salt Life) a grey sky (0: the preset's fair-weather cumulus): denser cloud, its bases forming
	// everywhere, darker below, less light through it
	_setOvercast( o ) {

		const S = PRESET.shape, L = PRESET.lighting, U = this.uniforms;
		U.scsShell.value[ 2 ] = S.density * ( 1 + 1.2 * o );
		U.scsBase.value[ 0 ] = S.baseWeatherStrength * ( 1 - 0.7 * o );
		U.scsCloudLight.value[ 0 ] = L.scatteringAlbedo * ( 1 - 0.25 * o );
		U.scsCloudLight.value[ 2 ] = L.ambientIntensity * ( 1 - 0.25 * o );
		U.scsShadow.value[ 0 ] = L.baseShadowStrength + ( 1 - L.baseShadowStrength ) * o;

	}

	resetHistory() {

		this.historyValid = false;

	}

	invalidate() {

		if ( this.ready ) this.panoWarm = this.warmFrames;
		this.resetHistory();

	}

	// GPU memory of the clouds' targets (bytes)
	get memory() {

		const q = this.quality;
		let b = NOISE_RES ** 3 * 4 * 8 / 7 + q.weather ** 2 + BOUNDS_RES ** 2 + q.pano[ 0 ] * q.pano[ 1 ] * 18 + this.cirrus.memory;
		if ( q.view ) b += this.sourceWidth * this.sourceHeight * 12 + this.historyWidth * this.historyHeight * 12 * 2;
		if ( this.shadowMap ) b += SHADOW_RES * SHADOW_RES * 2;
		return Math.round( b );

	}

	dispose() {

		for ( const t of [ this.noise, this.weatherMap, this.weatherBounds, ...this.panoramas, this.panoSlot, this.source, ...( this.history || [] ), this.shadowMap ] ) if ( t ) t.dispose();
		for ( const p of this.passList ) p.dispose();
		this.cirrus.dispose();

	}

}
