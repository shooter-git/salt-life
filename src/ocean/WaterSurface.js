import * as THREE from '../engine/index.js';
import { CDLOD } from '../core/CDLOD.js';
import { G } from '../core/Globals.js';
import { rippleTexture } from './SeaTextures.js';
import { WHALE_WATER_GLSL, whaleMarkUniforms } from './WhaleWater.js';
import { SeaDetail } from './SeaDetail.js';
import { Whitecaps } from './Whitecaps.js';
import { useLocalLights, LOCAL_LIGHTS_MAX } from '../materials/LocalLights.js';

// The sea: one instanced CDLOD grid that follows the camera out to the horizon. Its surface is the
// open sea's Gerstner waves (Waves), fading out over the outer surf zone, plus Tidewater's breaking
// shore waves (ShoreWaves): shoaling, plunging, the whitewater bore, and the swash sheet that runs
// up the sand and drains back.
//
// The water is drawn after the opaque scene. Its own colour is the light scattered back up from inside
// it, lit by the sky and the sun (not by which way the surface faces): turquoise over the sand, deep
// blue offshore, milky in the surf, by the depth read from the terrain's height texture. Over the
// shallows it lets the sea floor show through; its reflections stay at full strength there
// (premultiplied output: the water's own light is weighted by its opacity, the reflections are not).
// (Salt Life) In a breeze the open sea's crests break: whitecaps ((M14) each its own: Whitecaps.js, set by
// the weather; none, and nothing drawn for them, in light airs). (M13) In a hurricane's wind the sea's
// streaked white with foam blown into long streaks along the wind, the bay and all (this.spume).
// (M11) It reflects the sky as a mirror would (the scene's environment, made in the same light as the
// sky you see, at REFLECT), as much as the water's Fresnel lets it: little looking down, nearly all of it
// toward the horizon. From under water its underside keeps the faint fill it had (waterEnvUnder): there
// a real one mirrors the dark sea below, not the sky.

const LOD_GRID = { low: 7, mid: 20, high: 32 };
// node size at the finest LOD (m): phones take a coarser sea (their triangle budget is 300k)
const LEAF = { low: 16, mid: 8, high: 8 };
const SHORE_DEEP = 26; // m: the shore waves' envelope is 0 beyond this depth
// (M11) the sky's reflection off the surface: the environment as it is (1, a mirror's: the sky drawn as
// you see it); and where three turns a reflected ray into the world (a ray pointing down is turned up)
const REFLECT = 1;
const REFLECT_RAY = 'reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );';
if ( ! THREE.ShaderChunk.envmap_physical_pars_fragment.includes( REFLECT_RAY ) ) throw new Error( 'WaterSurface: three\'s envmap_physical_pars_fragment changed (' + REFLECT_RAY + ')' );
// an sRGB colour as a linear GLSL vec3 (shading is linear)
const rgb = ( r, g, b ) => {

	const c = new THREE.Color().setRGB( r, g, b, THREE.SRGBColorSpace );
	return `vec3( ${ c.r.toFixed( 4 ) }, ${ c.g.toFixed( 4 ) }, ${ c.b.toFixed( 4 ) } )`;

};

export class WaterSurface {

	constructor( { scene, waves, terrain, shore = null, cover = null, rocks = null, tier = 'low' } ) {

		this.waves = waves;
		this.terrain = terrain;
		this.shore = shore;
		this.lod = new CDLOD( { gridSize: LOD_GRID[ tier ] ?? LOD_GRID.low, leafSize: LEAF[ tier ] ?? LEAF.low, levels: 12, minY: - 4, maxY: 4, prefix: 'oceanLod' } );
		const SH = !! shore;
		// gusts, slicks and windrows drifting with the wind (update( dt ) moves them)
		this.detail = new SeaDetail( { lite: tier === 'low' } );
		// (Salt Life) the open sea's crests breaking white ((M14) Whitecaps: set by WeatherDriver from the wind);
		// whitecap, the share of the sea they whiten
		this.whitecaps = new Whitecaps( { waves, tier } );
		this.whitecap = this.whitecaps.cover;
		// (M13) how much of the sea's streaked with blown foam (0..1: the weather's, in a hurricane's wind)
		this.spume = { value: 0 };

		const uniforms = {
			...this.lod.uniforms,
			...terrain.heightUniforms,
			...waves.uniforms,
			...( SH ? shore.uniforms : {} ),
			waterSeaLevel: G.seaLevel,
			waterTime: G.time,
			waterSunColor: G.sunColor,
			waterSunDir: G.sunDir,
			waterSky: G.skyIrradiance,
			waterRipples: { value: rippleTexture() },
			...whaleMarkUniforms,
			...this.detail.uniforms,
			...this.whitecaps.uniforms,
			waterSpume: this.spume,
			waterRain: G.rain, // (M9: the rings where the drops land)
			// ((M14) none under what covers the sea: the pier, the boathouse (world/Cover.js), a rock's overhang
			// (world/RockCover.js))
			...( cover ? cover.uniforms : {} ),
			...( rocks ? rocks.uniforms : {} ),
			waterFlash: G.skyFlash, // (M10: lightning in the reflections)
			waterFlashShape: G.skyFlashShape, // ((M12) its glow's shape: Sky's)
			waterSkyExposure: G.skyExposure,
			// (M11) the underside's reflection, of the surface's: the scene's fill (update)
			waterEnvUnder: { value: 0.07 },
		};
		this.envUnder = uniforms.waterEnvUnder;

		// (M11) the sky it reflects: the scene's environment given to it as its own (update), so its strength
		// is REFLECT (with no envMap of its own three would give it the scene's environmentIntensity: Sky's
		// small fill for the lit materials, about 0.05 to 0.09, which the sea once reflected at)
		this.scene = scene;
		const mat = this.material = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.1, metalness: 0, envMapIntensity: REFLECT, transparent: true, side: THREE.DoubleSide } );
		// (high) refraction: the frame drawn so far (all that's opaque: the seabed, the reef, the hull
		// under water) copied just before the sea is drawn (one copy a frame, no second scene pass),
		// and seen through the surface bent by its waves and ripples
		this.refract = tier === 'high';
		if ( this.refract ) {

			mat.defines = { ...( mat.defines || {} ), WATER_REFRACT: '' };
			uniforms.waterRefract = { value: null };
			uniforms.waterRefractSize = { value: new THREE.Vector2( 1, 1 ) };

		}

		// (in one pass: three draws a see-through double-sided material twice, back faces then front,
		// with a program for each; a sheet seen from one side at a time doesn't need it)
		mat.forceSinglePass = true;
		mat.name = 'Water';
		// the lamps' light on the sea (their glints too, above low)
		useLocalLights( mat, { water: true, cheap: tier === 'low' } );
		mat.premultipliedAlpha = true;
		mat.onBeforeCompile = ( shader ) => {

			Object.assign( shader.uniforms, uniforms );
			shader.vertexShader = shader.vertexShader
				.replace( '#include <common>', '#include <common>\n' + this.lod.glsl + terrain.heightGlsl + waves.glsl + ( SH ? shore.glsl : '' ) + /* glsl */`
uniform float waterSeaLevel;
varying vec3 vWater;
varying float vWaterFade;
varying vec4 vSurf; // whitewater, clear plunging face, roller relief, swash sheet (0..1)
varying vec3 vWaterN;
varying vec2 vWaterX0; // (M14) the grid's point: the water's own (its foam rides it)
` )
				.replace( '#include <beginnormal_vertex>', /* glsl */`
	${ this.lod.vertexNodes() }
	vec2 x0 = lod.worldXZ;
	float ground = terrainHeightAt( x0 );
	float depth = waterSeaLevel - ground;
	float fade = waveFade( depth );
	vec3 wn;
	vec3 total = waveDisplacementLod( x0, fade, lod.spacing, wn );
	vec3 objectNormal = normalize( wn );
	vSurf = vec4( 0.0 );
	float y = waterSeaLevel + total.y;
${ SH ? /* glsl */`
	// near the shore: the breaking waves on top of the open sea, and the run-up sheet on the sand
	if ( depth < ${ SHORE_DEEP.toFixed( 1 ) } ) {
		ShoreSample sw = shoreEvaluate( x0, depth, ground );
		total += sw.disp;
		y = waterSeaLevel + total.y;
		// the open sea's slopes ride on the shore wave's, added as slopes: where the shore wave's gone (at
		// SHORE_DEEP) it's the open sea's own normal, as beyond (its up part kept: a seam along that depth
		// lit up as each crest crossed it)
		vec3 nS = sw.nShore;
		vec2 slope = nS.xz / max( nS.y, 0.2 ) + objectNormal.xz / max( objectNormal.y, 0.2 );
		objectNormal = normalize( vec3( slope.x, 1.0, slope.y ) );
		vSurf = vec4( sw.foam, sw.face, sw.roller, 0.0 );
		// ((M14) seen from afar, where the grid's too coarse for the breakers (a few vertices a wave), the
		// white they'd leave there on average: a reef's break line seen from a boat or the air)
		vSurf.x = mix( vSurf.x, sw.meanFoam, smoothstep( 0.12, 0.3, lod.spacing / max( sw.lam, 1.0 ) ) );
		// thin run-up sheet on the sand: take whichever surface is higher (smooth max)
		float k = 0.04;
		float hmx = clamp( ( sw.swashLevel - y ) / k * 0.5 + 0.5, 0.0, 1.0 );
		float smax = mix( y, sw.swashLevel, hmx ) + hmx * ( 1.0 - hmx ) * k;
		vSurf.w = smoothstep( -0.02, 0.03, sw.swashLevel - y );
		y = smax;
		// where the sheet is the surface, it lies on the sand: no wave motion, no plunging face
		float still = 1.0 - hmx;
		total.xz *= still;
		vSurf.xyz *= vec3( 1.0, still, still );
		objectNormal = normalize( mix( objectNormal, vec3( 0.0, 1.0, 0.0 ), hmx ) );
	}` : '' }
	// hide the water sheet below dry land (beyond the swash zone)
	float below = depth < -3.0 ? min( ground - 2.0, waterSeaLevel - 1.0 ) : ground - 0.06;
	if ( y < ground ) y = min( y, below );
	vec3 wPos = vec3( x0.x + total.x, y, x0.y + total.z );
	vWater = wPos;
	vWaterX0 = x0;
	vWaterFade = fade;
	vWaterN = objectNormal;` )
				.replace( '#include <begin_vertex>', 'vec3 transformed = wPos;' );

			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', '#include <common>\n' + terrain.heightGlsl + ( SH ? shore.glsl : '' ) + waves.glsl + this.whitecaps.glsl + ( cover ? cover.glsl : '' ) + ( rocks ? rocks.glsl : '' ) + /* glsl */`
uniform float waterTime;
uniform vec3 waterSunColor;
uniform vec3 waterSunDir;
uniform vec3 waterSky;
varying vec3 vWater;
varying float vWaterFade;
varying vec4 vSurf;
varying vec3 vWaterN;
varying vec2 vWaterX0;
uniform sampler2D waterRipples;
uniform float waterSpume;
uniform float waterRain;
uniform vec4 waterFlash;
uniform vec4 waterFlashShape;
uniform float waterSkyExposure;
#ifdef WATER_REFRACT
uniform sampler2D waterRefract;
uniform vec2 waterRefractSize;
#endif
${ WHALE_WATER_GLSL }
${ this.detail.glsl }
float waterNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	float a = fract( sin( dot( i, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float b = fract( sin( dot( i + vec2( 1.0, 0.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float c = fract( sin( dot( i + vec2( 0.0, 1.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float d = fract( sin( dot( i + vec2( 1.0, 1.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
// (M9) rain on the water: a ring spreading from each drop, in cells (one drop a cell at a time, somewhere
// in its middle, its ring never reaching the cell's edge); the slope of the rings at p, scaled by how
// hard it rains (fewer cells have a drop in a drizzle)
vec2 waterRainRing( vec2 p, float cell, float rate, float seed, float amount ) {
	vec2 c = floor( p / cell ), q = p / cell - c;
	vec3 h = fract( sin( vec3( dot( c, vec2( 127.1, 311.7 ) ), dot( c, vec2( 269.5, 183.3 ) ), dot( c, vec2( 419.2, 371.9 ) ) ) + seed ) * 43758.5453 );
	float age = fract( waterTime * rate + h.z );
	// (its drop: which of the cell's turns rain on it, by how hard it rains)
	float turn = floor( waterTime * rate + h.z );
	if ( fract( sin( turn * 12.9898 + h.x * 78.233 ) * 43758.5453 ) > amount ) return vec2( 0.0 );
	vec2 d = q - ( 0.4 + 0.2 * h.xy );
	float r = length( d ), ring = age * 0.36;
	float x = ( r - ring ) * 28.0;
	// (a ripple's slope across the ring, fading as it spreads)
	float slope = - 2.0 * x * exp( - x * x ) * ( 1.0 - age ) * ( 1.0 - age );
	return d / max( r, 1e-4 ) * slope;
}
// foam lace: bubbles that cluster and tear into a net as the foam thins out
float waterLace( vec2 p, float cover ) {
	float n = waterNoise( p * 1.7 ) * 0.55 + waterNoise( p * 4.3 + 7.1 ) * 0.3 + waterNoise( p * 11.0 + 3.3 ) * 0.15;
	float cells = abs( waterNoise( p * 2.6 + 1.9 ) - 0.5 ) * 2.0; // ridges: the strands of the net
	float net = mix( n, 1.0 - cells, 0.45 );
	return smoothstep( 1.0 - cover, 1.0 - cover + 0.18, net );
}
` )
				.replace( '#include <color_fragment>', /* glsl */`
	float floorH = terrainHeightAt( vWater.xz );
	float depth = max( vWater.y - floorH, 0.0 );
	float meanDepth = max( waterSeaLevel_ - floorH, 0.0 );
	// see-through only over the shallows: deeper, the water's own colour is all there is
	float cover = smoothstep( 0.0, 4.5, depth ) * 0.85 + 0.15;
	float turbid = ${ SH ? 'shoreSurfTurbidity( vWater.xz, meanDepth )' : '0.0' };
	// whitewater: the breakers' foam as lace, denser at the roller; a soft line where the swash
	// runs out on the sand
	vec2 drift = vec2( 0.0, waterTime * 0.12 );
	float ww = clamp( vSurf.x, 0.0, 1.0 );
	// two scales of lace: clumps of bubbles (~0.5 m) torn into a fine net; solid only at the very top
	// of the roller
	float lace = waterLace( vWater.xz * 2.1 + drift, ww * 0.9 ) * 0.65 + waterLace( vWater.xz * 5.3 + drift * 1.7 + 3.1, ww * 0.8 ) * 0.35;
	float foam = lace * ww;
	foam = max( foam, smoothstep( 0.75, 1.0, ww ) * 0.75 );
	float film = depth;
${ SH ? /* glsl */`
	vec4 se = shoreSwashEdge( vWater.xz, film );
	float frontD = se.y;
	float uprush = smoothstep( 0.46, 0.32, se.z );
	float frontFoam = smoothstep( 0.9, 0.0, frontD ) * smoothstep( -0.05, 0.08, frontD ) * uprush;
	foam = max( foam, waterLace( vWater.xz * 4.5 + 3.7, 0.65 ) * frontFoam * 0.85 );
	// the swash sheet ends on its analytic front, not on the mesh triangles
	float sheetEdge = smoothstep( 0.0, 0.012, se.x );` : `
	float sheetEdge = smoothstep( 0.0, 0.03, film );
	float lap = sin( dot( vWater.xz, vec2( 0.11, 0.93 ) ) * 1.7 - waterTime * 1.3 ) * 0.5 + 0.5;
	foam = max( foam, ( 1.0 - smoothstep( 0.0, 0.08 + 0.16 * lap, depth ) ) * ( 0.35 + 0.45 * lap ) );` }
	// the humpback's marks: churned white water, and the flat slick of its fluke print (WhaleWater)
	vec2 whaleMk = whaleMarksOn > 0.5 ? whaleWater( vWater.xz ) : vec2( 0.0 );
	foam = max( foam, whaleMk.x );
	// the sea's large-scale detail: rougher gusts, calm slicks, the windrows' foam ((M14) beaded lines of it,
	// granular as the whitecaps' foam; seen from afar, as much white spread)
	vec4 seaD = seaDetailSample( vWater.xz );
	float wrFw = length( fwidth( vWaterX0 ) );
	if ( seaD.w > 0.0 ) {
		float wr = min( seaD.w * 1.5, 0.75 );
		foam = max( foam, mix( waterLace( vWaterX0 * 3.3, wr ), wr, smoothstep( 0.35, 1.2, wrFw ) ) * 0.8 );
	}
	// (Salt Life) whitecaps: ((M14) the open sea's crests breaking here and there, each its own: a roller down
	// a crest's face while it breaks, and the foam it's left behind it thinning (Whitecaps.js)); more in the
	// gusts; out over the open sea only (the shore waves have their own)
	if ( whitecapCover > 0.0 ) {
		vec2 wc = min( whitecapsAt( vWaterX0 ) * vWaterFade * ( 0.55 + 0.9 * seaD.y ), 1.0 );
		// the foam left marbled (white with dark veins, swirled and drawn out along the wind), thinning
		// unevenly and tearing into lace, froth at its edges, less white than the roller; the roller solid,
		// its edge torn. (Seen from afar, as much white spread)
		vec2 wcD = seaDetailWindDir, wcQ = vec2( dot( vWaterX0, wcD ), dot( vWaterX0, vec2( - wcD.y, wcD.x ) ) ) * vec2( 2.2, 3.6 );
		float wcFw = length( fwidth( wcQ ) );
		if ( wc.y > 0.002 ) {
			vec2 q = wcQ + 1.1 * vec2( waterNoise( wcQ * 0.3 ), waterNoise( wcQ * 0.3 + 3.7 ) );
			float fine = 1.0 - smoothstep( 0.25, 0.7, wcFw );
			float n = waterNoise( q ) * 0.5 + waterNoise( q * 2.3 + 7.1 ) * 0.3 + waterNoise( q * 5.3 + 2.6 ) * 0.2 * fine;
			float net = mix( n + 0.1 * ( 1.0 - fine ), 1.0 - abs( waterNoise( q * 1.3 + 1.9 ) - 0.5 ) * 2.0, 0.45 );
			float cover = min( wc.y * ( 0.5 + waterNoise( wcQ * 0.12 + 9.2 ) ), 0.8 ); // (never a solid sheet)
			float w = 0.14 + wcFw * 0.5, far = smoothstep( 1.2, 3.5, wcFw );
			float left = mix( smoothstep( 1.0 - cover - w * 0.5, 1.0 - cover + w * 0.5, net ), cover, far );
			// (froth: its bubbles, near by)
			left *= mix( 1.0, 0.35 + 0.65 * waterLace( vWaterX0 * 4.5, 0.7 ), fine );
			// (the roller's whitest in a head or two along the crest)
			float roll = smoothstep( 0.2, 0.6, wc.x * ( 0.6 + 0.8 * mix( net, 0.5, far ) ) * ( 0.45 + 0.9 * waterNoise( wcQ * 0.15 + 5.5 ) ) );
			foam = max( foam, max( left * 0.78, roll ) );
		}
	}
	// (M13) in a hurricane's wind the sea's streaked white (Beaufort 10 to 12: "dense streaks of foam along
	// the direction of the wind", "the sea completely white"): foam blown into streaks tens of metres long and
	// a metre or two across, drifting downwind, over the bay as well as the open sea (not on the sand's film)
	if ( waterSpume > 0.0 ) {
		vec2 wd = seaDetailWindDir, wp = vec2( - wd.y, wd.x ), q = vWater.xz - seaDetailOffset * 0.5;
		vec2 s = vec2( dot( q, wd ) * 0.025, dot( q, wp ) * 0.45 );
		float streak = smoothstep( 0.45, 0.8, waterNoise( s ) ) * smoothstep( 0.25, 0.65, waterNoise( s * vec2( 2.3, 0.6 ) + 5.3 ) );
		float spDist = length( cameraPosition - vWater );
		float spCover = waterSpume * ( 0.75 * streak + 0.2 * waterNoise( q * 0.08 ) ) * smoothstep( 0.15, 0.8, depth ) * ( 1.0 - smoothstep( 600.0, 2000.0, spDist ) );
		foam = max( foam, waterLace( q * 0.5, min( spCover, 0.75 ) ) * 0.85 );
	}
	// the body of the water: light scattered back up from inside it (and off the sand under the
	// shallows), lit by the sky and the sun whatever way the surface faces. Turquoise over sand,
	// deep blue offshore, milky in the surf (suspended sand and fine bubbles)
	vec3 body = mix( ${ rgb( 0.2, 0.62, 0.6 ) }, ${ rgb( 0.035, 0.16, 0.25 ) }, smoothstep( 0.8, 14.0, depth ) );
	body = mix( body, ${ rgb( 0.012, 0.06, 0.11 ) }, smoothstep( 14.0, 60.0, depth ) );
	body = mix( body, ${ rgb( 0.42, 0.72, 0.66 ) }, turbid * 0.55 );
	cover = max( cover, turbid * 0.75 );
	// light through the thin, clear face of a plunging wave and its crest: it glows turquoise
	float glow = clamp( vSurf.y, 0.0, 1.0 );
	body = mix( body, ${ rgb( 0.25, 0.85, 0.75 ) } * 1.35, glow * 0.7 );
#ifdef CLOUD_SHADOWS
	float cloudSh = cloudShadowXZ( vWater.xz ); // (high: under a cloud the sun's share of the light dims)
#else
	float cloudSh = 1.0;
#endif
	vec3 waterLight = waterSunColor * ( max( waterSunDir.y, 0.0 ) * 0.22 * cloudSh ) + waterSky * 0.55;
	// foam is a white surface on top: lit like the sand (the sun by its height in the sky, the sky's fill)
	vec3 foamLight = waterSunColor * ( max( waterSunDir.y, 0.0 ) * cloudSh ) + waterSky * 1.2 + 0.02;
	vec3 lampSum = vec3( 0.0 );
#ifdef LOCAL_LIGHTS_WATER
	// lamps and searchlights on the sea (LocalLights): their light scattered back up from inside the
	// water, on the foam, and off the surface's roughness: a pool where a beam meets the sea
	{
		vec3 llP = - vViewPosition;
		float llPY = dot( llWorldY.xyz, llP ) + llWorldY.w;
		vec3 llN = normalize( ( viewMatrix * vec4( normalize( vWaterN ), 0.0 ) ).xyz ); // (the wave's face)
		for ( int i = 0; i < ${ LOCAL_LIGHTS_MAX }; i ++ ) {

			if ( float( i ) >= llInfo.x ) break;
			vec3 L;
			// (a beam makes a pool; a lamp's light on the water is mostly its glints)
			vec3 lc = llIncident( i, llP, llPY, L ) * ( llDir[ i ].w > - 1.0 ? 1.0 : 0.3 );
			float up = abs( dot( L, llN ) ); // (on the wave's face; or from below, under water)
			waterLight += lc * ( 0.3 + 0.7 * up );
			foamLight += lc * up;
			lampSum += lc * up;

		}
	}
#endif
	vec3 waterBody = mix( body * waterLight, ${ rgb( 0.93, 0.96, 0.96 ) } * foamLight, foam * 0.92 ) + lampSum * 0.06 * ( 1.0 - foam );
	diffuseColor.rgb = vec3( 0.0 );
	diffuseColor.a = clamp( max( max( cover, glow * 0.6 ), foam ), 0.0, 1.0 ) * sheetEdge;
` )
				.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor * mix( 1.0, 0.35, seaD.z ) * mix( 1.0, 1.6, seaD.y ), 0.85, foam );' )
				.replace( '#include <normal_fragment_maps>', /* glsl */`
	// short wind ripples and capillary waves on the waves near the camera (two drifting samples),
	// calmed by the foam
	vec3 wN = normalize( vWaterN );
	float rippleK = ( 1.0 - smoothstep( 25.0, 140.0, length( cameraPosition - vWater ) ) ) * ( 1.0 - foam ) * ( 1.0 - whaleMk.y ) * seaD.x;
	vec2 r1 = texture2D( waterRipples, vWater.xz * 0.11 + waterTime * vec2( 0.012, 0.03 ) ).xy * 2.0 - 1.0;
	vec2 r2 = texture2D( waterRipples, vWater.xz * 0.043 + 0.3 - waterTime * vec2( 0.02, 0.008 ) ).xy * 2.0 - 1.0;
	vec2 rs = ( r1 * 0.6 + r2 * 0.4 ) * 0.32 * rippleK;
	// (M9) the rings where the rain lands, near the camera; and the drops beat the wind's ripples down
	// ((M10) all over the sea: a downpour flattens them as far as you see; (M14) not under the pier, the
	// boathouse or a rock's overhang)
	if ( waterRain > 0.0 ) {
		float rainN = clamp( waterRain * 1.5, 0.0, 1.0 );
		float rainOver = ${ cover ? 'coverHeightAt( vWater.xz )' : '-1e4' };
		${ rocks ? 'rainOver = max( rainOver, rockUndersideAt( vWater.xz ) );' : '' }
		rainN *= step( rainOver, vWater.y + 0.1 );
		rs *= 1.0 - 0.35 * rainN;
		float rainD = length( cameraPosition - vWater );
		if ( rainD < 45.0 ) {
			float rainK = ( 1.0 - smoothstep( 12.0, 45.0, rainD ) ) * ( 1.0 - foam );
			rs = rs * ( 1.0 - 0.4 * rainN * rainK ) + ( waterRainRing( vWater.xz, 0.55, 1.4, 0.0, rainN ) + waterRainRing( vWater.xz + 0.27, 0.8, 1.1, 3.7, rainN ) * 0.8 ) * 0.5 * rainK;
		}
	}
	vec3 nP = normalize( wN + vec3( - rs.x, 0.0, - rs.y ) );
	nP = gl_FrontFacing ? nP : - nP;
	normal = normalize( ( viewMatrix * vec4( nP, 0.0 ) ).xyz );` )
				// (M11) a wave's face tilted toward you at a grazing angle reflects a ray that points down: on a
				// real sea it meets the sky in the next wave's face, not the dark under the horizon (as the
				// flash's lobe takes it, below)
				.replace( '#include <envmap_physical_pars_fragment>', THREE.ShaderChunk.envmap_physical_pars_fragment.replace( REFLECT_RAY, REFLECT_RAY + '\n\t\t\treflectVec.y = abs( reflectVec.y );' ) )
				.replace( '#include <lights_fragment_end>', /* glsl */`#include <lights_fragment_end>
	// (M11) from under water, the underside's faint fill, not the sky's mirror
	if ( ! gl_FrontFacing ) reflectedLight.indirectSpecular *= waterEnvUnder;` )
				.replace( '#include <opaque_fragment>', /* glsl */`
#ifdef WATER_REFRACT
	if ( gl_FrontFacing ) {
		// what's under the surface seen through it where the water's own colour leaves it visible,
		// bent by the waves and ripples (more where it's deeper)
		vec2 bend = ( viewMatrix * vec4( nP - vec3( 0.0, 1.0, 0.0 ), 0.0 ) ).xy * ( 0.08 * clamp( depth * 0.5, 0.0, 1.0 ) );
		vec3 behind = texture2D( waterRefract, gl_FragCoord.xy / waterRefractSize + bend ).rgb;
		gl_FragColor = vec4( waterBody * diffuseColor.a + totalSpecular * ( 1.0 - foam * 0.8 ) * sheetEdge + behind * ( 1.0 - diffuseColor.a ), 1.0 );
	} else
#endif
	// premultiplied: the water's own light by its opacity, reflections in full (less on foam)
	gl_FragColor = vec4( waterBody * diffuseColor.a + totalSpecular * ( 1.0 - foam * 0.8 ) * sheetEdge, diffuseColor.a );
	// (M10) lightning in the reflections: the panorama the sea reflects is made over seconds and never
	// has the flash, so its lobe about the strike (as the sky draws it) is added off the surface here
	if ( waterFlash.w > 0.0 && gl_FrontFacing ) {
		vec3 vd = normalize( vWater - cameraPosition ), rd = reflect( vd, nP );
		rd.y = abs( rd.y );
		float fres = 0.02 + 0.98 * pow( 1.0 - max( dot( - vd, nP ), 0.0 ), 5.0 );
		float lobe = exp( ( dot( normalize( rd ), waterFlash.xyz ) - 1.0 ) * waterFlashShape.x );
		gl_FragColor.rgb += ${ rgb( 0.82, 0.86, 1.0 ) } * waterFlash.w * ( 2.5 * lobe + 0.2 * ( 1.0 - waterFlashShape.z ) ) * fres * waterSkyExposure * ( 1.0 - foam * 0.8 ) * sheetEdge;
	}` )
				.replace( '#include <premultiplied_alpha_fragment>', '' );
			shader.fragmentShader = shader.fragmentShader.replace( 'uniform float waterTime;', 'uniform float waterTime;\nuniform float waterSeaLevel_;\nuniform float waterEnvUnder;' );
			shader.uniforms.waterSeaLevel_ = G.seaLevel;

		};

		this.mesh = new THREE.Mesh( this.lod.geometry, mat );
		this.mesh.name = 'Water';
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 1;
		scene.add( this.mesh );
		if ( this.refract ) {

			const tex = this._refractTex = new THREE.FramebufferTexture( 1, 1 );
			tex.type = THREE.HalfFloatType; // (as the post chain's buffer: PostChain)
			tex.minFilter = tex.magFilter = THREE.LinearFilter;
			uniforms.waterRefract.value = tex;
			this.mesh.onBeforeRender = ( renderer ) => {

				// (only into the post chain's buffer: never the screen's)
				const rt = renderer.getRenderTarget();
				if ( ! rt ) return;
				if ( tex.image.width !== rt.width || tex.image.height !== rt.height ) {

					tex.dispose();
					tex.image.width = rt.width;
					tex.image.height = rt.height;
					tex.needsUpdate = true;

				}

				renderer.copyFramebufferToTexture( tex );
				uniforms.waterRefractSize.value.set( rt.width, rt.height );

			};

		}

	}

	update( camera ) {

		this.lod.update( camera );
		// (M11) the sky it reflects, as the scene's environment is (made once, refreshed in place); its
		// underside at the scene's fill
		const env = this.scene.environment;
		if ( this.material.envMap !== env ) this.material.envMap = env;
		this.envUnder.value = this.scene.environmentIntensity / REFLECT;

	}

}
