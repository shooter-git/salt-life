import * as THREE from '../engine/index.js';
import { CDLOD } from '../core/CDLOD.js';
import { G } from '../core/Globals.js';
import { rippleTexture } from './SeaTextures.js';
import { WHALE_WATER_GLSL, whaleMarkUniforms } from './WhaleWater.js';

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

const LOD_GRID = { low: 7, mid: 20, high: 32 };
// node size at the finest LOD (m): phones take a coarser sea (their triangle budget is 300k)
const LEAF = { low: 16, mid: 8, high: 8 };
const SHORE_DEEP = 26; // m: the shore waves' envelope is 0 beyond this depth
// an sRGB colour as a linear GLSL vec3 (shading is linear)
const rgb = ( r, g, b ) => {

	const c = new THREE.Color().setRGB( r, g, b, THREE.SRGBColorSpace );
	return `vec3( ${ c.r.toFixed( 4 ) }, ${ c.g.toFixed( 4 ) }, ${ c.b.toFixed( 4 ) } )`;

};

export class WaterSurface {

	constructor( { scene, waves, terrain, shore = null, tier = 'low' } ) {

		this.waves = waves;
		this.terrain = terrain;
		this.shore = shore;
		this.lod = new CDLOD( { gridSize: LOD_GRID[ tier ] ?? LOD_GRID.low, leafSize: LEAF[ tier ] ?? LEAF.low, levels: 12, minY: - 4, maxY: 4, prefix: 'oceanLod' } );
		const SH = !! shore;

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
		};

		// envMapIntensity 12: the scene's environment intensity is only a small diffuse fill (Sky); the
		// sea reflects the sky in full
		const mat = this.material = new THREE.MeshStandardMaterial( { color: 0xffffff, roughness: 0.1, metalness: 0, envMapIntensity: 12, transparent: true, side: THREE.DoubleSide } );
		// (in one pass: three draws a see-through double-sided material twice, back faces then front,
		// with a program for each; a sheet seen from one side at a time doesn't need it)
		mat.forceSinglePass = true;
		mat.name = 'Water';
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
` )
				.replace( '#include <beginnormal_vertex>', /* glsl */`
	${ this.lod.vertexNodes() }
	vec2 x0 = lod.worldXZ;
	float ground = terrainHeightAt( x0 );
	float depth = waterSeaLevel - ground;
	float fade = waveFade( depth );
	vec3 wn;
	vec3 total = waveDisplacement( x0, fade, wn );
	vec3 objectNormal = normalize( wn );
	vSurf = vec4( 0.0 );
	float y = waterSeaLevel + total.y;
${ SH ? /* glsl */`
	// near the shore: the breaking waves on top of the open sea, and the run-up sheet on the sand
	if ( depth < ${ SHORE_DEEP.toFixed( 1 ) } ) {
		ShoreSample sw = shoreEvaluate( x0, depth, ground );
		total += sw.disp;
		y = waterSeaLevel + total.y;
		// the open sea's slopes ride on the shore wave's normal
		vec3 nS = sw.nShore;
		objectNormal = normalize( nS + vec3( objectNormal.x, 0.0, objectNormal.z ) );
		vSurf = vec4( sw.foam, sw.face, sw.roller, 0.0 );
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
	vWaterFade = fade;
	vWaterN = objectNormal;` )
				.replace( '#include <begin_vertex>', 'vec3 transformed = wPos;' );

			shader.fragmentShader = shader.fragmentShader
				.replace( '#include <common>', '#include <common>\n' + terrain.heightGlsl + ( SH ? shore.glsl : '' ) + /* glsl */`
uniform float waterTime;
uniform vec3 waterSunColor;
uniform vec3 waterSunDir;
uniform vec3 waterSky;
varying vec3 vWater;
varying float vWaterFade;
varying vec4 vSurf;
varying vec3 vWaterN;
uniform sampler2D waterRipples;
${ WHALE_WATER_GLSL }
float waterNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	float a = fract( sin( dot( i, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float b = fract( sin( dot( i + vec2( 1.0, 0.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float c = fract( sin( dot( i + vec2( 0.0, 1.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float d = fract( sin( dot( i + vec2( 1.0, 1.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
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
	vec3 waterLight = waterSunColor * ( max( waterSunDir.y, 0.0 ) * 0.22 ) + waterSky * 0.55;
	// foam is a white surface on top: lit like the sand (the sun by its height in the sky, the sky's fill)
	vec3 foamLight = waterSunColor * max( waterSunDir.y, 0.0 ) + waterSky * 1.2 + 0.02;
	vec3 waterBody = mix( body * waterLight, ${ rgb( 0.93, 0.96, 0.96 ) } * foamLight, foam * 0.92 );
	diffuseColor.rgb = vec3( 0.0 );
	diffuseColor.a = clamp( max( max( cover, glow * 0.6 ), foam ), 0.0, 1.0 ) * sheetEdge;
` )
				.replace( '#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.85, foam );' )
				.replace( '#include <normal_fragment_maps>', /* glsl */`
	// short wind ripples and capillary waves on the waves near the camera (two drifting samples),
	// calmed by the foam
	vec3 wN = normalize( vWaterN );
	float rippleK = ( 1.0 - smoothstep( 25.0, 140.0, length( cameraPosition - vWater ) ) ) * ( 1.0 - foam ) * ( 1.0 - whaleMk.y );
	vec2 r1 = texture2D( waterRipples, vWater.xz * 0.11 + waterTime * vec2( 0.012, 0.03 ) ).xy * 2.0 - 1.0;
	vec2 r2 = texture2D( waterRipples, vWater.xz * 0.043 + 0.3 - waterTime * vec2( 0.02, 0.008 ) ).xy * 2.0 - 1.0;
	vec2 rs = ( r1 * 0.6 + r2 * 0.4 ) * 0.32 * rippleK;
	vec3 nP = normalize( wN + vec3( - rs.x, 0.0, - rs.y ) );
	nP = gl_FrontFacing ? nP : - nP;
	normal = normalize( ( viewMatrix * vec4( nP, 0.0 ) ).xyz );` )
				.replace( '#include <opaque_fragment>', /* glsl */`
	// premultiplied: the water's own light by its opacity, reflections in full (less on foam)
	gl_FragColor = vec4( waterBody * diffuseColor.a + totalSpecular * ( 1.0 - foam * 0.8 ) * sheetEdge, diffuseColor.a );` )
				.replace( '#include <premultiplied_alpha_fragment>', '' );
			shader.fragmentShader = shader.fragmentShader.replace( 'uniform float waterTime;', 'uniform float waterTime;\nuniform float waterSeaLevel_;' );
			shader.uniforms.waterSeaLevel_ = G.seaLevel;

		};

		this.mesh = new THREE.Mesh( this.lod.geometry, mat );
		this.mesh.name = 'Water';
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 1;
		scene.add( this.mesh );

	}

	update( camera ) {

		this.lod.update( camera );

	}

}
