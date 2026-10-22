import * as THREE from '../../engine/index.js';
import { G } from '../../core/Globals.js';
import { WORLD } from '../WorldLayout.js';
import { NOISE_SCALE } from './ReefNoise.js';
import { SURFACE } from './ReefSurfaces.js';
import { LOD_FADE_GLSL } from '../../materials/LODFade.js';
import { UNDERWATER_GLSL, underwaterUniforms } from '../../materials/Underwater.js';

// Shading of the reef (Tidewater's WGSL, in GLSL on MeshStandardMaterial: Salt Life). Two
// programs: the hard batch (rocks, colonies, sponges, plants, small life: opaque) and the soft
// one (sea fans and plumes: double-sided, their net cut out). Each instance's record (KindBatch,
// 4 vec4: Reef.js) gives its place, orientation, two colours, seed, draw distance, surface type,
// stretch and flex. The colour is procedural per surface type from the two colours and a small 3D
// noise volume (ReefNoise), relief by bump mapping from the same patterns.
//
// lite (low-powered devices): no bump mapping, and the finest detail (grain, speckle, per-pixel
// noise, the fans' net) left out: the fragment cost on a software renderer.
//
// The engine's lighting hooks (caustics, the water column) are the shared underwater shading
// (materials/Underwater.js); translucency of thin tissue goes to the emissive term in the sun's
// colour. Without the FFT sway (Tidewater built its materials before the FFT existed: only the
// analytic swell ever ran).

export { SURFACE };

const SWELL = new THREE.Vector2( WORLD.swellDir.x, WORLD.swellDir.y ).normalize();
const TAU = Math.PI * 2;
const f = ( x ) => {

	const s = String( + x.toPrecision( 9 ) );
	return /[.e]/.test( s ) ? s : s + '.0';

};

const srgb = ( hex ) => {

	const c = new THREE.Color( hex );
	return `vec3( ${ f( c.r ) }, ${ f( c.g ) }, ${ f( c.b ) } )`;

};

// noise, hashes and helpers (MaterialX's names, as Tidewater's WGSL common module)
export const REEF_NOISE_GLSL = /* glsl */`
uint reefHash( uint x ) { x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16; return x; }
uint reefHash3( ivec3 i ) { return reefHash( uint( i.x ) * 1597334677u ^ reefHash( uint( i.y ) * 3812015801u ^ reefHash( uint( i.z ) * 2798796415u ) ) ); }
float reefUnit( uint h ) { return float( h ) / 4294967295.0; }
float mx_cell_noise_float3( vec3 p ) { return reefUnit( reefHash3( ivec3( floor( p ) ) ) ); }
vec3 reefGrad( ivec3 i ) { uint h = reefHash3( i ); return normalize( vec3( reefUnit( h ), reefUnit( reefHash( h ) ), reefUnit( reefHash( h + 1u ) ) ) - 0.5 ); }
// gradient (Perlin) noise, about -1..1
float mx_noise_float3( vec3 p ) {
	ivec3 i = ivec3( floor( p ) ); vec3 fr = fract( p );
	vec3 u = fr * fr * fr * ( fr * ( fr * 6.0 - 15.0 ) + 10.0 );
	float n000 = dot( reefGrad( i ), fr );
	float n100 = dot( reefGrad( i + ivec3( 1, 0, 0 ) ), fr - vec3( 1, 0, 0 ) );
	float n010 = dot( reefGrad( i + ivec3( 0, 1, 0 ) ), fr - vec3( 0, 1, 0 ) );
	float n110 = dot( reefGrad( i + ivec3( 1, 1, 0 ) ), fr - vec3( 1, 1, 0 ) );
	float n001 = dot( reefGrad( i + ivec3( 0, 0, 1 ) ), fr - vec3( 0, 0, 1 ) );
	float n101 = dot( reefGrad( i + ivec3( 1, 0, 1 ) ), fr - vec3( 1, 0, 1 ) );
	float n011 = dot( reefGrad( i + ivec3( 0, 1, 1 ) ), fr - vec3( 0, 1, 1 ) );
	float n111 = dot( reefGrad( i + ivec3( 1, 1, 1 ) ), fr - vec3( 1, 1, 1 ) );
	return mix( mix( mix( n000, n100, u.x ), mix( n010, n110, u.x ), u.y ), mix( mix( n001, n101, u.x ), mix( n011, n111, u.x ), u.y ), u.z ) * 1.6;
}
// distances to the nearest and second nearest feature points of a jittered grid
vec2 mx_worley_noise_vec2_2( vec2 p, float jitter ) {
	ivec2 i = ivec2( floor( p ) ); vec2 fr = fract( p );
	float d1 = 1e9, d2 = 1e9;
	for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
		ivec2 c = ivec2( x, y );
		uint h = reefHash3( ivec3( i + c, 0 ) );
		vec2 o = vec2( c ) + ( vec2( reefUnit( h ), reefUnit( reefHash( h ) ) ) - 0.5 ) * jitter + 0.5 - fr;
		float d = dot( o, o );
		if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) { d2 = d; }
	}
	return sqrt( vec2( d1, d2 ) );
}
vec3 rotateQ( vec4 q, vec3 v ) { return v + cross( q.xyz, cross( q.xyz, v ) + v * q.w ) * 2.0; }
vec3 reefUnpackColor( float fl ) {
	int u = int( fl + 0.5 );
	vec3 c = vec3( float( ( u >> 16 ) & 255 ), float( ( u >> 8 ) & 255 ), float( u & 255 ) ) / 255.0;
	return pow( c, vec3( 2.2 ) );
}
`;

// the swell's surge at xz (m of horizontal water displacement): sways the gorgonians and plants
const SURGE_GLSL = /* glsl */`
const vec2 REEF_SWELL_DIR = vec2( ${ f( SWELL.x ) }, ${ f( SWELL.y ) } );
const vec2 REEF_SWELL_SIDE = vec2( ${ f( - SWELL.y ) }, ${ f( SWELL.x ) } );
vec2 reefSwell( vec2 xz, float t ) {
	float along = dot( xz, REEF_SWELL_DIR ); float across = dot( xz, REEF_SWELL_SIDE );
	float a = sin( t * ${ f( TAU / 8.2 ) } - along * ${ f( TAU / 70 ) } + sin( across * 0.021 ) * 1.5 ) * 0.3;
	float b = sin( t * ${ f( TAU / 5.3 ) } - along * ${ f( TAU / 34 ) } + across * 0.09 ) * 0.1;
	float c = sin( t * ${ f( TAU / 11.7 ) } + across * ${ f( TAU / 45 ) } ) * 0.07;
	return REEF_SWELL_DIR * ( a + b ) + REEF_SWELL_SIDE * c;
}
`;

// Vertex stage: the instance's pose (KindBatch's aInst: record index, fade code). Instances shrink
// away over the last fifth of their draw distance (seen from the main camera: reefViewPos), so
// nothing pops when the culling adds or drops them.
const POSE_GLSL = /* glsl */`
attribute vec2 aInst;
attribute vec4 aData;
uniform vec3 reefViewPos;
uniform float reefRange;
uniform float reefTime;
flat varying vec2 vReefColors; // two packed sRGB colours
flat varying vec3 vReefInfo; // seed, surface type, scale
flat varying float vReefFade; // KindBatch's fade code
varying vec3 vReefLocal; // object-space position (m)
varying vec4 vReefData; // aData
varying vec3 vReefP; // world position
void reefPose( out vec3 world, out vec3 nrm ) {
	int index = int( aInst.x + 0.5 );
	vec4 r0 = reefRecordsAt( index, 0 ); vec4 q = reefRecordsAt( index, 1 ); vec4 r2 = reefRecordsAt( index, 2 ); vec4 r3 = reefRecordsAt( index, 3 );
	float seed = fract( r2.z ); // integer part: the instance's draw distance (m)
	float fadeEnd = min( floor( r2.z ), reefRange );
	float grow = 1.0 - smoothstep( fadeEnd * 0.75, fadeEnd * 0.95, length( r0.xyz - reefViewPos ) );
	vec3 scale = r3.xyz * r0.w;
	vec3 p = position * scale;
	vReefLocal = p;
	vReefData = aData;
	vReefColors = r2.xy;
	vReefInfo = vec3( seed, r2.w, r0.w );
	vReefFade = aInst.y;
	nrm = normalize( rotateQ( q, normal / scale ) );
	float flex = r3.w;
	if ( flex < 0.0 ) {
		// massive forms: a smooth per-colony warp so no two look cloned (the base stays put)
		vec3 w = position * 3.1 + seed * 17.0;
		vec3 off = vec3( sin( w.y * 1.7 + w.z ), sin( w.z * 1.3 + w.x * 1.1 ) * 0.6, sin( w.x * 1.9 + w.y * 0.7 ) );
		p += off * ( - flex * r0.w * ( aData.x * 0.8 + 0.2 ) );
	}
	world = rotateQ( q, p * grow ) + r0.xyz;
	if ( flex > 0.0 ) {
		// bend grows with the square of the position along the organism; tips lag behind
		float t = aData.x;
		float h = max( world.y - r0.y, 0.0 );
		vec2 sxz = r0.xz - REEF_SWELL_DIR * ( h * 4.0 );
		vec2 sNow = reefSwell( sxz, reefTime );
		float ph = reefTime * 1.7 + seed * 40.0 + aData.w * 12.0;
		float bend = flex * t * t * grow;
		vec2 dNow = ( sNow + vec2( sin( ph ), cos( ph * 0.77 ) ) * 0.06 ) * bend;
		world += vec3( dNow.x, - dot( dNow, dNow ) / ( max( h, 0.1 ) * 2.0 ), dNow.y );
	}
	vReefP = world;
}
`;

// Fragment helpers: the pixel footprint (m), pattern fades, polyps, cells, the noise volume
const FRAG_GLSL = /* glsl */`
uniform highp sampler3D reefNoise;
uniform vec3 reefSunDir;
uniform vec3 reefSunColor;
flat varying vec2 vReefColors;
flat varying vec3 vReefInfo;
flat varying float vReefFade;
varying vec3 vReefLocal;
varying vec4 vReefData;
varying vec3 vReefP;
float reefPixel( vec3 P ) { return length( fwidth( ( viewMatrix * vec4( P, 1.0 ) ).xyz ) ) * 0.7; }
float reefFade( float spacing, float px ) { return 1.0 - smoothstep( 0.25, 0.6, px / spacing ); }
vec3 reefHue( vec3 c, float n, float amount ) { return c * ( vec3( 1.0 ) + vec3( n, n * 0.5, n * -0.5 ) * amount ); }
// cheap packed polyp / corallite bumps (0..1) with about \`spacing\` meters between them
float reefPolyps( vec3 p, float spacing ) {
	vec3 q = p * ( PI / spacing );
	vec3 w = q + sin( q.yzx * 0.47 ) * 1.4 + sin( q.zxy * 0.29 + 1.7 ) * 1.1;
	return abs( sin( w.x ) * sin( w.y ) * sin( w.z ) );
}
// round features on a jittered 3D grid of \`size\` m: distance from the cell's feature point and a
// random value per cell
vec2 reefCells( vec3 p, float size ) {
	vec3 q = p / size;
	float h = mx_cell_noise_float3( floor( q ) );
	vec3 c = vec3( h, fract( h * 7.13 ), fract( h * 3.71 ) ) * 0.3 + 0.35;
	return vec2( length( fract( q ) - c ), h );
}
// four noise values per fetch; the tile holds 8 noise cells, so sampling at p * k gives features of
// 1 / ( 8 k ) m
vec4 reefVol( vec3 p ) { return ( texture( reefNoise, p ) - 0.5 ) * ${ f( NOISE_SCALE ) }; }
// bump mapping from a scalar height field (Mikkelsen's surface gradient, world space)
vec3 bumpNormal( vec3 P, vec3 N, float height ) {
	vec3 dpx = dFdx( P ); vec3 dpy = dFdy( P );
	float dhdx = dFdx( height ); float dhdy = dFdy( height );
	vec3 r1 = cross( dpy, N ); vec3 r2 = cross( N, dpx );
	float det = dot( dpx, r1 );
	vec3 grad = sign( det ) * ( dhdx * r1 + dhdy * r2 );
	// (Salt Life) a collapsed footprint: normalize() of a zero vector is NaN, which the high
	// tier's bloom spreads over the whole frame
	vec3 b = abs( det ) * N - grad;
	float b2 = dot( b, b );
	return b2 > 1e-30 ? b * inversesqrt( b2 ) : N;
}
// the level-of-detail cross-fade (KindBatch's fade code)
void reefFadeDiscard() {
	if ( vReefFade < 1.0 ) { if ( ! lodFadeVisible( gl_FragCoord.xy, vReefFade, false ) ) discard; }
	else if ( vReefFade >= 2.0 ) { if ( ! lodFadeVisible( gl_FragCoord.xy, vReefFade - 2.0, true ) ) discard; }
}
`;

const S = SURFACE;

// hard batch: sets reefAlbedo, reefN (world), reefRough, reefAO, reefTrans
const HARD_SURFACE = /* glsl */`
	reefFadeDiscard();
	vec3 rN = normalize( vReefN );
	// everything shared by the branches is computed up front
	vec3 c1 = reefUnpackColor( vReefColors.x );
	vec3 c2 = reefUnpackColor( vReefColors.y );
	vec3 L = vReefLocal; vec4 D = vReefData;
	float seed = vReefInfo.x; float stype = floor( vReefInfo.y + 0.5 );
	float t = D.x; float ao = D.y; float part = D.z; float rnd = D.w;
	float px = reefPixel( vReefP );
	vec3 P = L + seed * 17.0;
	vec4 A = reefVol( P * 0.4 ); // ~30 cm features
	vec4 B = reefVol( P * 1.25 + 0.37 ); // ~10 cm features
	float n1 = A.x; float n2 = B.x; // colony-scale mottling, blotches
	vec3 base = reefHue( c1, n1, 0.18 ) * ( 1.0 + n2 * 0.12 );
	vec3 albedo = base;
	float occl = ao;
	float height = 0.0;
	float rough = 0.8;
	// light passing through thin tissue (blades, fronds, rods)
	float thin = ( stype == ${ f( S.grass ) } || stype == ${ f( S.sargassum ) } ) ? 0.55 : ( ( stype == ${ f( S.gorgonian ) } || stype == ${ f( S.lettuce ) } || stype == ${ f( S.algae ) } ) ? 0.3 : 0.0 );

	// turf-covered dead base where a colony meets the seabed
	vec3 turf = mix( ${ srgb( 0x5e5234 ) }, ${ srgb( 0x725c46 ) }, smoothstep( -0.3, 0.4, n2 ) );
	float up = clamp( rN.y, 0.0, 1.0 );

	if ( stype == ${ f( S.rock ) } ) {

		// dead coral framework: algal turf with a sediment veneer on the tops, crustose coralline
		// algae (pink / lavender) spreading over sides and edges, small encrusting colonies and
		// sponges, bio-eroded pits and cracks
		float n3 = A.y; float n4 = B.y;
		// fine speckle and grain, fetched only where they are resolved
		float speck = 0.0; float grainF = 0.0;
#ifndef REEF_LITE
		float fs = reefFade( 0.04, px );
		if ( fs > 0.001 ) {
			speck = reefVol( P * 3.2 + 0.71 ).x * fs;
			float fg = reefFade( 0.012, px );
			if ( fg > 0.001 ) {
				vec4 gv = reefVol( P * 12.0 + 1.7 );
				grainF = ( gv.x + gv.y * 0.5 ) * fg;
			}
		}
#endif
		vec3 turfC = mix( ${ srgb( 0x6a5c44 ) }, ${ srgb( 0x86744e ) }, smoothstep( -0.4, 0.4, n2 + speck * 0.6 ) );
		vec3 c = mix( base, turfC, smoothstep( -0.3, 0.3, n1 + up * 0.3 ) * 0.7 );
		// sediment veneer on flat tops
		c = mix( c, ${ srgb( 0xa89e88 ) }, smoothstep( 0.82, 0.97, up ) * smoothstep( -0.1, 0.3, A.z ) * 0.55 );
		// coralline crusts
		float cca = smoothstep( 0.05, 0.3, n3 * 0.7 + n4 * 0.5 ) * ( 1.0 - up * 0.5 );
		c = mix( c, c2 * ( 0.88 + speck * 0.2 + grainF * 0.25 ), cca * 0.8 );
		// small encrusting colonies (mustard / brown / olive) with corallites
		float col = smoothstep( 0.18, 0.26, B.z + A.w * 0.25 );
		vec3 colC = mix( mix( ${ srgb( 0xa89048 ) }, ${ srgb( 0x8a6a48 ) }, smoothstep( -0.3, 0.3, A.w ) ), ${ srgb( 0x7a7c4a ) }, smoothstep( 0.2, 0.5, A.x ) );
		float colPol = reefPolyps( P, 0.006 ) * reefFade( 0.006, px ) * col;
		c = mix( c, colC * ( 0.8 + colPol * 0.35 + grainF * 0.2 ), col * 0.75 );
		// encrusting sponges on the sides
		float sp = smoothstep( 0.3, 0.38, B.w + A.z * 0.3 ) * ( 1.0 - up * 0.7 );
		vec3 spC = mix( mix( ${ srgb( 0xc0662c ) }, ${ srgb( 0xa83a30 ) }, smoothstep( -0.2, 0.2, A.y ) ), mix( ${ srgb( 0x7a3a82 ) }, ${ srgb( 0xc8a02c ) }, smoothstep( 0.1, 0.3, B.y ) ), smoothstep( 0.2, 0.4, A.w ) );
		c = mix( c, spC, sp * 0.9 );
		// bio-eroded pits of varied size, coral recruits here and there
		vec2 pc = reefCells( P, 0.03 );
		float pitR = pc.y * 0.16 + 0.06;
		float pit = ( 1.0 - smoothstep( pitR, pitR + 0.08, pc.x ) ) * step( 0.55, fract( pc.y * 5.3 ) ) * smoothstep( 0.0, 0.3, - A.w ) * reefFade( 0.045, px );
		vec2 rc = reefCells( P, 0.08 );
		float recruit = ( 1.0 - smoothstep( 0.2, 0.3, rc.x ) ) * step( 0.93, rc.y );
		c = mix( c, mix( ${ srgb( 0xa89648 ) }, ${ srgb( 0xb07a50 ) }, fract( rc.y * 11.3 ) ), recruit * 0.9 );
		// rugged relief: ridged creases at two scales, rough grain; crevices stay dark
		float r3 = ( 1.0 - abs( n3 ) ) * 2.0 - 1.0;
		float r4 = ( 1.0 - abs( n4 ) ) * 2.0 - 1.0;
		float grain = speck * 1.4;
		float cav = smoothstep( -0.9, 0.2, r4 + grain * 0.4 + grainF * 0.3 );
		c = c * ( 0.88 + speck * 0.25 + grainF * 0.3 ) * ( 1.0 - pit * mix( 0.35, 0.7, pc.y ) ) * mix( 0.72, 1.0, cav );
		albedo = c;
		height = n1 * 0.04 + r3 * 0.016 + r4 * 0.008 + grain * 0.003 + grainF * 0.0018 + col * 0.003
			+ colPol * 0.0008 + sp * 0.002 + recruit * 0.004 - pit * 0.008;
		occl = occl * ( 1.0 - pit * 0.5 ) * mix( 0.65, 1.0, cav );
		rough = 0.95;

	} else if ( stype == ${ f( S.star ) } ) {

		// star coral: packed corallite cups with raised walls, mottled colony tissue
		float fz = reefFade( 0.006, px );
		vec2 cup = reefCells( P, 0.0055 );
		float rim = smoothstep( 0.3, 0.55, cup.x ) * fz;
		float lump = B.z * reefFade( 0.05, px );
		vec3 tone = mix( base, c2, smoothstep( 0.0, 0.3, n1 + n2 * 0.4 ) * 0.7 ) * ( 0.9 + lump * 0.15 );
		albedo = mix( tone * 0.7, tone * 1.12, rim + ( 1.0 - fz ) * 0.5 );
		height = rim * 0.0018 + n2 * 0.004 + lump * 0.004 + n1 * 0.01;
		rough = 0.78;

	} else if ( stype == ${ f( S.brain ) } || stype == ${ f( S.brainWide ) } ) {

		// brain corals: meandering valleys (the zero set of warped noise); wide-valley species have a
		// pale groove along the ridge
		bool wide = stype == ${ f( S.brainWide ) };
		float freq = ( wide ? 28.0 : 52.0 ) * mix( 0.85, 1.15, fract( seed * 7.3 ) );
		vec3 q = P * freq;
		vec3 wq = q + reefVol( q * ${ f( 0.31 / 8 ) } + seed ).xyz * 0.9;
#ifdef REEF_LITE
		float mn = reefVol( wq * 0.125 ).w * 0.8;
#else
		float mn = mx_noise_float3( wq );
#endif
		float aa = max( px * freq * 2.2, 1e-4 ); // ~ fwidth( mn ): no derivatives in branches
		float width = wide ? 0.12 : 0.075;
		float ridge = mix( 0.55, smoothstep( width - aa, width + aa, abs( mn ) ), reefFade( 1.0 / freq, px ) );
		vec3 valley = mix( c2, base * 0.55, 0.35 );
		vec3 top = base * 1.15;
		float groove = smoothstep( 0.3, 0.34, abs( mn ) ) * ( 1.0 - smoothstep( 0.36, 0.4, abs( mn ) ) ) * reefFade( 0.5 / freq, px ) * ( wide ? 1.0 : 0.7 );
		albedo = mix( valley, top, ridge ) * ( 1.0 - groove * 0.25 );
		height = ridge * ( wide ? 0.006 : 0.0035 ) - groove * 0.001 + n1 * 0.006;
		rough = 0.7;

	} else if ( stype == ${ f( S.porites ) } ) {

		// mustard hill / starlet corals: fine pitted surface, knobby, mottled
		float pit = reefPolyps( P, 0.004 ) * reefFade( 0.004, px );
		float knob = reefPolyps( P + 3.3, 0.025 ) * reefFade( 0.025, px );
		vec3 tone = mix( base, c2, smoothstep( 0.1, 0.4, n1 ) * 0.5 );
		albedo = tone * ( 0.74 + pit * 0.22 + knob * 0.28 );
		height = pit * 0.0008 + knob * 0.006 + n2 * 0.008 + B.z * 0.004;
		rough = 0.75;

	} else if ( stype == ${ f( S.acropora ) } ) {

		// elkhorn / staghorn: protruding corallites, mottled golden-brown tissue, a thin pale growing
		// margin at the very tips
		float fz = reefFade( 0.005, px );
		float bump = reefPolyps( P, 0.005 ) * fz;
#ifdef REEF_LITE
		float rough2 = 0.0;
#else
		float rough2 = reefVol( P * 4.75 ).x * reefFade( 0.04, px );
#endif
		float tip = smoothstep( 0.6, 1.0, part ) * smoothstep( 0.9, 1.0, t );
		vec3 mott = mix( base, base * vec3( 1.1, 0.95, 0.8 ), smoothstep( -0.3, 0.4, n2 ) );
		albedo = mix( mott, c2, tip * 0.8 ) * ( 0.84 + bump * 0.2 + rough2 * 0.14 );
		height = bump * 0.0016 + rough2 * 0.0025 + n2 * 0.002;
		rough = 0.8;

	} else if ( stype == ${ f( S.finger ) } || stype == ${ f( S.pillar ) } ) {

		// finger / pillar corals: fuzzy with extended polyps, blunt pale tips
#ifdef REEF_LITE
		float fz = 0.0;
#else
		vec4 fzv = reefVol( P * 18.0 );
		float fz = fzv.x * reefFade( 0.008, px ) + fzv.y * reefFade( 0.03, px ) * 0.6;
#endif
		float tip = smoothstep( 0.5, 1.0, part );
		albedo = mix( base, c2, tip * 0.6 ) * ( 0.88 + fz * 0.25 );
		height = fz * 0.002;
		rough = 0.95;

	} else if ( stype == ${ f( S.fire ) } ) {

		// fire coral: smooth, finely porous, mottled mustard with white growing edges
		float edge = smoothstep( 0.86, 1.0, t ) * ( part * 0.5 + 0.5 );
		vec3 mott = mix( base, base * vec3( 1.1, 1.0, 0.75 ), smoothstep( -0.3, 0.3, n2 ) );
		float pore = reefPolyps( P, 0.003 ) * reefFade( 0.003, px );
		albedo = mix( mott, c2, edge * 0.85 ) * ( 0.92 + pore * 0.12 );
		height = n2 * 0.004 + B.z * 0.002 + pore * 0.0004;
		rough = 0.6;

	} else if ( stype == ${ f( S.plate ) } ) {

		// plate corals: concentric ridges on top, pale growing margin, darker underside
		float r = length( L.xz );
		float ridges = sin( r * 260.0 + n1 * 3.0 ) * reefFade( 0.025, px ) * part;
		float margin = smoothstep( 0.85, 1.0, t );
		albedo = mix( base * mix( 0.55, 1.0, part ), c2, margin * 0.7 ) * ( 1.0 + ridges * 0.08 );
		height = ridges * 0.0012;
		rough = 0.7;

	} else if ( stype == ${ f( S.gorgonian ) } ) {

		// sea rods / whips: fuzzy with polyps; tips a little paler
#ifdef REEF_LITE
		float fz = 0.0;
#else
		float fz = reefVol( P * 27.0 ).x * reefFade( 0.006, px );
#endif
		albedo = mix( base, c2, smoothstep( 0.6, 1.0, t ) * 0.5 ) * ( 0.85 + fz * 0.25 );
		height = fz * 0.001;
		rough = 0.95;

	} else if ( stype == ${ f( S.sponge ) } ) {

		// sponges: pores and oscula, a dark inner cavity
		float fz = reefFade( 0.008, px );
		vec2 pc = reefCells( P, 0.009 );
		float pore = ( 1.0 - smoothstep( 0.1, 0.25, pc.x ) ) * fz;
		float inner = part;
		albedo = base * ( 1.0 - pore * 0.45 ) * mix( 1.0, 0.3, inner );
		height = pore * -0.0015 + n2 * 0.004;
		occl = ao * mix( 1.0, 0.45, inner );
		rough = 0.92;

	} else if ( stype == ${ f( S.urchin ) } ) {

		// long-spined urchin: glossy black spines with faint bands, dark purple test
		float band = ( sin( t * 40.0 ) * 0.5 + 0.5 ) * part * 0.15;
		albedo = mix( c2, c1, part ) + band * 0.02;
		rough = 0.35;

	} else if ( stype == ${ f( S.anemone ) } ) {

		// anemone: pale translucent tentacles with coloured tips
		albedo = mix( c1, c2, smoothstep( 0.6, 1.0, t ) * part );
		rough = 0.6;

	} else if ( stype == ${ f( S.rubble ) } ) {

		// rubble: bleached fragments and turf-covered pieces
		vec3 bleached = mix( ${ srgb( 0xd4ccbc ) }, ${ srgb( 0xb9ad98 ) }, n2 * 0.5 + 0.5 );
		vec3 turfed = mix( turf, c2, smoothstep( 0.2, 0.6, n1 ) * 0.6 );
		albedo = mix( turfed, bleached, part );
		height = reefPolyps( P, 0.004 ) * 0.0008 * reefFade( 0.004, px );
		rough = 0.9;

	} else if ( stype == ${ f( S.lettuce ) } ) {

		// lettuce coral: thin brown blades with fine ridges running up to a pale, growing edge
		float r = reefFade( 0.004, px );
		float ridges = sin( ( L.x + L.z ) * 700.0 + n1 * 4.0 ) * r;
		float edgeK = smoothstep( 0.82, 1.0, t );
		albedo = mix( base * ( 0.9 + ridges * 0.08 ), c2, edgeK * 0.75 );
		height = ridges * 0.0007 + n2 * 0.002;
		rough = 0.7;

	} else if ( stype == ${ f( S.algae ) } ) {

		// calcareous green algae: segments / tufts dusted with lime, paler at the edges
		float lime = smoothstep( 0.0, 0.6, n2 + t * 0.4 ) * 0.35;
		float tuft = part;
		albedo = mix( base, c2, lime + tuft * 0.2 ) * mix( 0.85, 1.05, rnd );
		rough = 0.85;

	} else if ( stype == ${ f( S.sargassum ) } ) {

		// Sargassum: olive-golden fronds, darker wiry axes, amber gas bladders
		float leaf = ( part > 0.5 && part < 1.5 ) ? 1.0 : 0.0;
		float bladder = part > 1.5 ? 1.0 : 0.0;
		vec3 tone = base * mix( 0.8, 1.15, rnd ) * mix( 0.75, 1.05, t );
		albedo = mix( mix( tone * 0.6, tone, leaf ), ${ srgb( 0xa87a30 ) }, bladder * 0.7 );
		rough = 0.55;

	} else {

		// seagrass: dark bases, epiphyte-covered older tips
		vec3 aged = mix( base, ${ srgb( 0x8a7c48 ) }, 0.6 );
		float tip = smoothstep( 0.5, 1.0, t ) * ( fract( rnd * 13.7 ) * 0.7 + 0.3 );
		albedo = mix( base * mix( 0.55, 1.0, smoothstep( 0.0, 0.4, t ) ), aged, tip );
		rough = 0.6;

	}

	// the attached base of colonies is dead, turf-covered skeleton, with a paler growing margin of
	// living tissue just above it
	float colonyK = ( stype > 0.5 && stype < 9.5 ) ? 1.0 : 0.0;
	float edgeK = t + n2 * 0.03;
	float deadBase = ( 1.0 - smoothstep( 0.0, 0.06, edgeK ) ) * colonyK;
	float marginK = smoothstep( 0.04, 0.07, edgeK ) * ( 1.0 - smoothstep( 0.07, 0.12, edgeK ) ) * colonyK;
	albedo = mix( albedo, turf, deadBase * 0.9 ) * ( 1.0 + marginK * 0.25 );
	// crevices also receive less direct light
	vec3 reefAlbedo = albedo * mix( 0.6, 1.0, occl );
#ifdef REEF_LITE
	vec3 reefN = rN;
#else
	vec3 reefN = bumpNormal( vReefP, rN, height );
#endif
	float reefRough = rough;
	float reefAO = occl;
	float back = clamp( dot( - rN, reefSunDir ), 0.0, 1.0 ) * 0.8 + 0.2;
	vec3 reefTrans = albedo * ( thin * back );
`;

// soft batch: sea fans and plumes, their net cut out (discard)
const SOFT_SURFACE = /* glsl */`
	reefFadeDiscard();
	vec3 rN = normalize( vReefN ) * ( gl_FrontFacing ? 1.0 : -1.0 );
	vec3 c1 = reefUnpackColor( vReefColors.x );
	vec3 c2 = reefUnpackColor( vReefColors.y );
	vec3 L = vReefLocal; vec4 D = vReefData;
	float seed = vReefInfo.x; float stype = floor( vReefInfo.y + 0.5 ); float sc = vReefInfo.z;
	float t = D.x; float part = D.z; float rnd = D.w;
	float px = reefPixel( vReefP );
	float mask = 1.0;
	vec3 fanAlbedo = vec3( 0.0 );
	if ( stype == ${ f( S.fan ) } ) {

		// fine net of anastomosing branchlets (~7 mm mesh, cells stretched along the radial veins)
		// and main veins forking outward from the stalk. Where the mesh gets too fine to resolve
		// the strands thicken until the holes close (a solid silhouette): holes cost overdraw.
		// (Salt Life: Tidewater filled them with a dither that its TAA smoothed; without TAA a
		// dither shows as a fixed checker, so the fill is continuous here)
		vec2 q = L.xy + seed * 3.1;
		float cell = 0.007;
		float resolve = smoothstep( 0.3, 1.0, px / cell );
		vec2 rel = L.xy - vec2( 0.0, sc * 0.06 );
		float r = length( rel ) / sc;
		float th = atan( rel.x, rel.y );
		float forks = r < 0.22 ? 5.0 : ( r < 0.48 ? 10.0 : 20.0 );
		vec4 wv = reefVol( vec3( r * 0.75, seed * 1.1, q.x * 0.5 ) );
		float vv = abs( fract( th * forks / PI + wv.x * 0.35 ) - 0.5 ) * 2.0;
		float veinW = mix( 0.12, 0.035, r );
		float vein = 1.0 - smoothstep( veinW, veinW + 0.03, vv );
		float strand = 1.0;
#ifndef REEF_LITE
		if ( resolve < 0.98 ) {
			vec2 net = mx_worley_noise_vec2_2( vec2( q.x, q.y * 0.55 ) / cell, 0.9 );
			float edge = sqrt( net.y ) - sqrt( net.x );
			strand = edge < mix( 0.16, 0.6, resolve ) ? 1.0 : 0.0;
		}
#endif
		mask = ( strand > 0.5 || vein > 0.5 || part > 0.5 || t < 0.05 ) ? 1.0 : 0.0;
		float tone = wv.y * 0.5 + 0.5;
		// a filled-in (distant) fan is darker: holes let the background through
		vec3 col = mix( c1 * mix( 0.8, 1.1, tone ), c2, vein * 0.35 );
		fanAlbedo = mix( col, vec3( dot( col, vec3( 0.3, 0.5, 0.2 ) ) ), resolve * 0.45 ) * mix( 1.0, 0.7, resolve );

	} else {

		// plume: pinnules angled toward the branch tip on both sides of the rachis, of uneven
		// length; filled in where they can't be resolved
		float a = abs( part );
		bool stem = part > 3.0;
		float k = t * 150.0 - a * 2.4 + rnd * 5.0;
		float lines = fract( k );
		float reach = 0.55 + fract( floor( k ) * 0.618 + rnd ) * 0.45;
		float resolve = smoothstep( 0.3, 1.0, px / ( sc * 0.0045 ) );
		bool pin = lines < mix( 0.32, 1.0, resolve ) && a < mix( reach, 1.0, resolve );
		bool edge = a < mix( 1.0, 0.75, resolve );
		bool solid = stem || a < 0.07 || ( pin && edge );
		mask = solid ? 1.0 : 0.0;
		fanAlbedo = mix( c1, c2, a * 0.5 ) * mix( 0.8, 1.1, rnd ) * mix( 1.0, 0.8, resolve );

	}
	if ( mask < 0.5 ) discard;
	vec3 reefAlbedo = fanAlbedo;
	vec3 reefN = rN;
	float reefRough = 0.85;
	float reefAO = 1.0;
	// light shining through the thin tissue
	float back = clamp( dot( - rN, reefSunDir ), 0.0, 1.0 );
	vec3 reefTrans = fanAlbedo * ( back * 0.4 + 0.05 );
`;

// Materials: { hard, soft, hardDepth } (hardDepth: the shadow pass of the hard batch's proxies).
// hard, soft: the KindBatches (their records textures); noise: ReefNoise's volume; ground: the
// Terrain (the shared underwater uniforms); view: { position, range } uniforms ({ value }); lite
// (see above).
export function createReefMaterials( { hard, soft, noise, ground, view, lite = false } ) {

	const uw = underwaterUniforms( ground );
	const make = ( batch, surface, { side = THREE.FrontSide, name } ) => {

		const m = new THREE.MeshStandardMaterial( { roughness: 0.8, metalness: 0, side } );
		m.name = name;
		if ( lite ) m.defines = { REEF_LITE: '' };
		const uniforms = {
			reefRecords: { value: batch.texture }, reefNoise: { value: noise },
			reefViewPos: view.position, reefRange: view.range, reefTime: G.time,
			reefSunDir: G.sunDir, reefSunColor: G.sunColor, ...uw,
		};
		m.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, uniforms );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\n' + REEF_NOISE_GLSL + batch.glsl( 'reefRecords' ) + SURGE_GLSL + POSE_GLSL + 'varying vec3 vReefN;\n' )
				.replace( '#include <beginnormal_vertex>', 'vec3 reefWorld; vec3 reefNrm;\n\treefPose( reefWorld, reefNrm );\n\tvReefN = reefNrm;\n\tvec3 objectNormal = reefNrm;' )
				.replace( '#include <begin_vertex>', 'vec3 transformed = reefWorld;' );
			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', '#include <common>\n' + REEF_NOISE_GLSL + LOD_FADE_GLSL + UNDERWATER_GLSL + FRAG_GLSL + 'varying vec3 vReefN;\n' )
				.replace( '#include <color_fragment>', '#include <color_fragment>\n' + surface + '\tdiffuseColor.rgb = uwShade( reefAlbedo, vReefP, rN );' )
				.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = reefRough;' )
				.replace( '#include <normal_fragment_maps>', 'normal = normalize( ( viewMatrix * vec4( reefN, 0.0 ) ).xyz );' )
				.replace( '#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uwShade( reefTrans, vReefP, vec3( 0.0, 1.0, 0.0 ) ) * reefSunColor * 0.5;' )
				.replace( '#include <aomap_fragment>', '\treflectedLight.indirectDiffuse *= reefAO;\n\treflectedLight.indirectSpecular *= reefAO;' );

		};
		m.customProgramCacheKey = () => name + ( lite ? 'Lite' : '' );
		return m;

	};

	const hardMat = make( hard, HARD_SURFACE, { name: 'Reef' } );
	const softMat = make( soft, SOFT_SURFACE, { name: 'ReefSoft', side: THREE.DoubleSide } );

	// the shadow pass: the same pose
	const depth = new THREE.MeshDepthMaterial( { depthPacking: THREE.RGBADepthPacking } );
	depth.onBeforeCompile = ( shader ) => {

		Object.assign( shader.uniforms, { reefRecords: { value: hard.texture }, reefViewPos: view.position, reefRange: view.range, reefTime: G.time } );
		shader.vertexShader = shader.vertexShader
			.replace( '#include <common>', '#include <common>\n' + REEF_NOISE_GLSL + hard.glsl( 'reefRecords' ) + SURGE_GLSL + POSE_GLSL )
			.replace( '#include <begin_vertex>', 'vec3 reefWorld; vec3 reefNrm;\n\treefPose( reefWorld, reefNrm );\n\tvec3 transformed = reefWorld;' );

	};
	depth.customProgramCacheKey = () => 'reefDepth';
	return { hard: hardMat, soft: softMat, hardDepth: depth };

}
