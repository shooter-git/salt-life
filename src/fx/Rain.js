import * as THREE from 'three';
import { G } from '../core/Globals.js';
import { CoverMap, COVER } from '../world/Cover.js';

const f = ( x ) => {

	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};

// (M9) The rain around the camera: drops falling through a box that wraps around it, as the air motes
// do (fx/AirMotes.js: positions from a hash of the instance, no simulation). Each drop falls at its
// size's speed (four sizes, from 5.6 to 9 m/s: eighths of the fastest's, so each wraps round the box
// whole) and is carried along by the wind near the ground, so a squall drives
// it slanting across; drawn as the streak it leaves in a moment's look (its motion blurred: a few tens of
// centimetres), at least a pixel or so across, its opacity the real drop's share of that. The shower's
// strength (G.rain) is how many of them fall. They're lit as the water they are: the sky's light through
// them, a glint of the sun's against the light, the flash of lightning. None under the ground, the sea,
// or a roof (the wheelhouse's, as a box in the boat's frame: shelter), and (M11) none under what covers
// the island (the pier, the boardwalks, the roofs, the stalls: world/Cover.js).
//
// Drawn premultiplied, one instanced draw; fewer drops on the lesser tiers (phones' fill rate is what
// rain costs).
// (M10) And where they land, splashes: a small crown popping up and gone in a moment, on the ground
// above the sea (the sea has its rings: WaterSurface) and on the boat's cockpit sole (the deck aft of
// the wheelhouse, as a box in her frame: setDeck), (M12) and on whatever's highest of her: the
// wheelhouse roof, the foredeck, the traps (setDeck's tops), and on the rocks about you (setRocks: each
// as an ellipsoid, as Rocks.splashRocks gives them), and (M11) on what covers the island where it's the
// top (the pier's deck, the boardwalks, the roofs and awnings; not the thatch, which takes it in), so
// none under it. Hashed about the camera too, each at a new spot each time it pops; one more instanced
// draw, as many as the rain is hard.
//   const rain = new Rain( { terrain, cover, tier } ); scene.add( rain.mesh, rain.splash );
//   rain.update( dt, camera, cameraWaterHeight, viewHeight )   (each frame)   rain.flash.value
//   rain.setDeck( boatMatrixWorld, tops )   (tops: (M12) what of her takes the rain, in her frame:
//     [ { x0, x1, z0, z1, y } ]; given once)
//   rain.setRocks( [ Matrix4 ] )   ((M12) the rocks about the camera: world -> unit sphere, SPLASH_ROCKS
//     at most)

const COUNT = { low: 1400, mid: 3200, high: 6400 };
const BOX = 22, HEIGHT = 14; // m: the box across, and its height (the camera a third of the way up)
const FALL = 9; // m/s, the biggest drops' (the others fall 5, 6 or 7 eighths as fast)
const NEAR_WIND = 0.7; // the wind they're carried by: near the ground, of the 10 m wind
const EXPOSURE = 0.04; // s: a look's motion blur (the streak's length)
const VISIBILITY = 3.5; // how much more a streak shows than the drop's own breadth would
// (M13) in a hurricane's wind (from SHEETS[ 0 ] m/s, in full by [ 1 ]) the rain comes in sheets driven
// past with the air: bands across the wind SHEET_GAP m apart, wavering along their length over
// SHEET_ALONG m, heaviest in a sheet and thin between (SHEET_LOW of it)
export const SHEETS = [ 18, 30 ], SHEET_GAP = 30, SHEET_ALONG = 45, SHEET_LOW = 0.3;
// how heavy the sheets are at u (in gaps along the wind, less their phase), 0..1
export const sheetAt = ( u ) => {

	const s = Math.sin( u * Math.PI * 2 ) * 0.5 + 0.5;
	return s * s;

};
const NO_ROOF = new THREE.Matrix4().makeScale( 0, 0, 0 ).setPosition( 10, 10, 10 ); // (no roof: everything's outside it)
// (M10) the splashes: how many by tier, the square about the camera they pop in (m), how long one lasts
// (s), how often each pops again (s, a spread), how big it's thrown (m); the cockpit's sole in the boat's
// frame (her deckY, and the open deck aft of the wheelhouse: x either side, z from the transom forward)
const SPLASH = { low: 300, mid: 1200, high: 2400 };
const SPLASH_BOX = 16;
const SPLASH_LIFE = 0.15;
const SPLASH_PERIOD = [ 0.3, 0.7 ];
const SPLASH_SIZE = 0.06;
const COCKPIT = { y: 0.35, x: 1.1, z: [ - 3.7, - 1.0 ] };
// (M12) and the rest of her that takes the rain from above, at most (setDeck's tops); the rocks about
// the camera the splashes land on, at most (setRocks)
const TOPS = 12;
export const SPLASH_ROCKS = 16;

// the crown a drop throws up where it lands, on its quad (uv: -1..1, y up; s: how far through its life,
// 0..1): a thin ring spreading at its foot and three drops thrown up and out of it. Its coverage. (M11:
// the drips' too, fx/Drips.js)
export const CROWN_GLSL = /* glsl */`
float splashCrown( vec2 uv, float s ) {
	float y = uv.y * 0.5 + 0.5;
	float ring = exp( - pow( ( abs( uv.x ) - 0.3 - 0.6 * s ) * 7.0, 2.0 ) ) * exp( - y * 10.0 );
	float up = sin( s * 3.14159 );
	float drops = 0.0;
	for ( int i = 0; i < 3; i ++ ) {
		float fi = float( i ) - 1.0;
		vec2 at = vec2( fi * 0.55 * s, 0.2 + up * ( 0.7 - 0.25 * abs( fi ) ) );
		drops += smoothstep( 0.24, 0.06, length( vec2( uv.x - at.x, ( y - at.y ) * 1.3 ) ) );
	}
	return ( ring * 0.7 + drops ) * ( 1.0 - 0.6 * s );
}
`;

export class Rain {

	// terrain: the Terrain (its heightGlsl / heightUniforms); cover: what covers the island (a CoverMap,
	// built later: until then nothing does)
	constructor( { terrain, cover = new CoverMap(), tier = 'high' } ) {

		const count = COUNT[ tier ] ?? COUNT.low;
		this.count = count;
		this.flash = { value: 0 }; // (the lightning's light on the drops: Lightning, through App)
		this.uniforms = {
			...THREE.UniformsUtils.clone( THREE.UniformsLib.fog ),
			...terrain.heightUniforms,
			...cover.uniforms,
			rainCamPos: { value: new THREE.Vector3() },
			rainDrift: { value: new THREE.Vector3() }, // how far they've fallen and drifted, wrapped to the box (m)
			rainAmount: G.rain,
			rainViewHeight: { value: 720 },
			rainSunDir: G.sunDir,
			rainSun: G.sunColor,
			rainSky: G.skyIrradiance,
			rainWindDir: G.windDir,
			rainWindSpeed: G.windSpeed,
			rainSeaLevel: G.seaLevel,
			rainFlash: this.flash,
			// (a roof: world -> its box, -1..1; none: everything lands far outside it)
			rainShelter: { value: NO_ROOF.clone() },
			// ((M13) the sheets: their phase, in gaps along the wind (kept at the camera as the wind turns))
			rainSheet: { value: 0 },
		};
		this.sheet = 0; // (M13) how heavy the sheet passing the camera is (0..1: App dims the view in it)
		this._sheetDir = new THREE.Vector2( 0, 1 );

		const vertexShader = /* glsl */`
#include <common>
#include <fog_pars_vertex>
${ terrain.heightGlsl }
${ cover.glsl }
uniform vec3 rainCamPos;
uniform vec3 rainDrift;
uniform float rainAmount;
uniform float rainViewHeight;
uniform vec3 rainSunDir;
uniform vec3 rainSun;
uniform vec3 rainSky;
uniform vec2 rainWindDir;
uniform float rainWindSpeed;
uniform float rainSeaLevel;
uniform float rainFlash;
uniform mat4 rainShelter;
uniform float rainSheet;
varying vec4 vRainCol; // radiance, opacity
varying vec2 vRainUV; // quad corner
vec4 rainHash4( float n ) { return fract( sin( vec4( n, n + 17.13, n + 43.71, n + 71.37 ) ) * vec4( 43758.5453, 22578.1459, 19642.3490, 31337.7217 ) ); }
float rainSs( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
void main() {
	float id = float( gl_InstanceID );
	vec4 h = rainHash4( id * 0.7131 + 0.37 );
	vec4 h2 = rainHash4( id * 1.3917 + 5.1 );
	// how many fall: the shower's strength (the first of them in a drizzle)
	float keep = clamp( ( rainAmount - h.w ) * 12.0, 0.0, 1.0 );
	// the drop: its size (mm) and how fast it falls (eighths of the fastest), carried by the wind near the
	// ground (mostly small ones)
	float eighths = 5.0 + floor( h2.x * h2.x * 3.999 );
	float size = mix( 0.8, 2.6, ( eighths - 5.0 ) / 3.0 );
	float fall = ${ f( FALL ) } * eighths / 8.0;
	vec3 vel = vec3( rainWindDir.x * rainWindSpeed * ${ f( NEAR_WIND ) }, - fall, rainWindDir.y * rainWindSpeed * ${ f( NEAR_WIND ) } );
	// where: wrapped around the camera (each falls at its own speed: its share of the drift)
	vec3 B = vec3( ${ f( BOX ) }, ${ f( HEIGHT ) }, ${ f( BOX ) } );
	vec3 moved = rainDrift * vec3( 1.0, eighths / 8.0, 1.0 );
	vec3 local = ( fract( h.xyz + ( moved - rainCamPos ) / B ) - vec3( 0.5, 0.35, 0.5 ) ) * B;
	vec3 p = rainCamPos + local;
	// none under the ground or the sea, or under what covers it (the pier's deck, a roof), or under the
	// wheelhouse's roof
	float ground = max( max( terrainHeightAt( p.xz ), rainSeaLevel ), coverHeightAt( p.xz ) );
	vec3 q = ( rainShelter * vec4( p, 1.0 ) ).xyz;
	float dry = all( lessThan( abs( q ), vec3( 1.0 ) ) ) ? 0.0 : 1.0;
	// the streak: along its fall, a look's motion blur long; at least ~1.2 px across
	vec3 toCam = cameraPosition - p;
	float dist = max( length( toCam ), 0.05 );
	vec3 Vd = toCam / dist;
	float pixel = dist * 2.0 / ( projectionMatrix[ 1 ][ 1 ] * rainViewHeight );
	float width = max( size * 0.001, pixel * 1.2 );
	vec3 axis = normalize( vel );
	float len = max( length( vel ) * ${ f( EXPOSURE ) }, pixel * 3.0 );
	vec3 across = normalize( cross( axis, Vd ) + vec3( 1e-5, 0.0, 0.0 ) );
	// (x VISIBILITY: as film sees them, each streak a drop's light gathered along its fall)
	float cover = min( size * 0.001 / width * ${ f( VISIBILITY ) }, 1.0 ) * 0.5;
	// fades: the box's edges (before the wrap), right in front of the lens, the ground
	float edge = 1.0 - rainSs( B.x * 0.36, B.x * 0.5, max( abs( local.x ), abs( local.z ) ) );
	// (right by the lens they're a blur, and gone)
	float fade = edge * rainSs( 0.6, 2.5, dist ) * ( 1.0 - rainSs( B.x * 0.32, B.x * 0.48, dist ) ) * rainSs( 0.0, 0.3, p.y - ground );
	// lit as water: the sky's light through it, the sun's glinting against the light, a flash's
	float cosT = - dot( Vd, rainSunDir );
	vec3 col = rainSky * 0.9 + rainSun * ( 0.04 + 0.5 * pow( max( cosT, 0.0 ), 8.0 ) ) + vec3( 0.8, 0.85, 1.0 ) * rainFlash * 0.4;
	float a = cover * fade * keep * dry;
	// ((M13) in a hurricane's wind, in sheets driven past with the air)
	float sheetK = rainSs( ${ f( SHEETS[ 0 ] ) }, ${ f( SHEETS[ 1 ] ) }, rainWindSpeed );
	if ( sheetK > 0.0 ) {
		vec2 perp = vec2( - rainWindDir.y, rainWindDir.x );
		float u = dot( p.xz, rainWindDir ) / ${ f( SHEET_GAP ) } - rainSheet + sin( dot( p.xz, perp ) / ${ f( SHEET_ALONG ) } * 6.2832 ) * 0.18;
		float s = sin( u * 6.2832 ) * 0.5 + 0.5;
		a *= mix( 1.0, ${ f( SHEET_LOW ) } + ( 2.0 - ${ f( SHEET_LOW ) } ) * s * s, sheetK );
	}
	vec2 corner = position.xy; // plane is 2 x 2
	vec3 world = p + across * ( corner.x * width ) + axis * ( corner.y * len * 0.5 );
	vRainCol = vec4( col, a );
	vRainUV = corner;
	vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
	gl_Position = projectionMatrix * mvPosition;
	// nothing to draw: off the screen
	if ( a < 2e-4 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
	#include <fog_vertex>
}
`;

		// a soft streak: brightest along its middle, tapering at its ends
		const fragmentShader = /* glsl */`
#include <common>
#include <fog_pars_fragment>
varying vec4 vRainCol;
varying vec2 vRainUV;
void main() {
	float g = ( 1.0 - vRainUV.x * vRainUV.x ) * ( 1.0 - vRainUV.y * vRainUV.y );
	float a = min( vRainCol.w * g * 1.6, 1.0 );
	if ( a < 0.003 ) discard;
	gl_FragColor = vec4( vRainCol.rgb * a, a );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
#ifdef USE_FOG
	// (premultiplied: the fog's colour by the drop's coverage; materials/HeightHaze.js)
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * gl_FragColor.a, sceneFogFactor() );
#endif
}
`;

		this.material = new THREE.ShaderMaterial( {
			name: 'Rain',
			uniforms: this.uniforms,
			vertexShader,
			fragmentShader,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			fog: true,
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.OneFactor,
			blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
			premultipliedAlpha: true,
		} );
		this.material.forceSinglePass = true;

		const plane = new THREE.PlaneGeometry( 2, 2 );
		const geo = new THREE.InstancedBufferGeometry();
		geo.index = plane.index;
		geo.setAttribute( 'position', plane.getAttribute( 'position' ) );
		geo.instanceCount = count;
		geo.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e5 );
		this.mesh = new THREE.Mesh( geo, this.material );
		this.mesh.name = 'Rain';
		this.mesh.frustumCulled = false;
		this.mesh.matrixAutoUpdate = false;
		this.mesh.renderOrder = 22;
		this.mesh.visible = false;

		this.splash = this.buildSplash( terrain, cover, tier );

	}

	// (M10) the splashes where the drops land (see above)
	buildSplash( terrain, cover, tier ) {

		const count = SPLASH[ tier ] ?? SPLASH.low;
		const U = this.splashUniforms = {
			...THREE.UniformsUtils.clone( THREE.UniformsLib.fog ),
			...terrain.heightUniforms,
			...cover.uniforms,
			splashCamPos: { value: new THREE.Vector3() },
			splashTime: { value: 0 },
			splashBoat: { value: new THREE.Matrix4() }, // the boat's frame -> the world, and back
			splashBoatInv: { value: NO_ROOF.clone() },
			// (M12) her tops: ( x0, x1, z0, z1 ) and their heights, in her frame (the cockpit's sole first)
			splashTops: { value: Array.from( { length: TOPS }, () => new THREE.Vector4() ) },
			splashTopY: { value: new Array( TOPS ).fill( 0 ) },
			splashTopCount: { value: 0 },
			// (M12) the rocks about the camera: world -> the unit sphere of each one's ellipsoid
			splashRocks: { value: Array.from( { length: SPLASH_ROCKS }, () => new THREE.Matrix4() ) },
			splashRockCount: { value: 0 },
			rainAmount: G.rain,
			rainViewHeight: this.uniforms.rainViewHeight,
			rainSunDir: G.sunDir,
			rainSun: G.sunColor,
			rainSky: G.skyIrradiance,
			rainSeaLevel: G.seaLevel,
			rainFlash: this.flash,
		};
		const vertexShader = /* glsl */`
#include <common>
#include <fog_pars_vertex>
${ terrain.heightGlsl }
${ cover.glsl }
uniform vec3 splashCamPos;
uniform float splashTime;
uniform mat4 splashBoat;
uniform mat4 splashBoatInv;
uniform vec4 splashTops[ ${ TOPS } ];
uniform float splashTopY[ ${ TOPS } ];
uniform int splashTopCount;
uniform mat4 splashRocks[ ${ SPLASH_ROCKS } ];
uniform int splashRockCount;
uniform float rainAmount;
uniform float rainViewHeight;
uniform vec3 rainSunDir;
uniform vec3 rainSun;
uniform vec3 rainSky;
uniform float rainSeaLevel;
uniform float rainFlash;
varying vec4 vSplashCol; // radiance, opacity
varying vec3 vSplashUV; // quad corner, how far through its life
vec4 rainHash4( float n ) { return fract( sin( vec4( n, n + 17.13, n + 43.71, n + 71.37 ) ) * vec4( 43758.5453, 22578.1459, 19642.3490, 31337.7217 ) ); }
float rainSs( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
void main() {
	float id = float( gl_InstanceID );
	vec4 h = rainHash4( id * 0.917 + 2.3 );
	// how many: the rain's strength; each pops every so often, at a new spot each time
	float keep = clamp( ( rainAmount - h.w ) * 12.0, 0.0, 1.0 );
	float period = mix( ${ f( SPLASH_PERIOD[ 0 ] ) }, ${ f( SPLASH_PERIOD[ 1 ] ) }, h.z );
	float k = splashTime / period + h.y, cycle = floor( k );
	float life = fract( k ) * period / ${ f( SPLASH_LIFE ) };
	vec4 c = rainHash4( id * 0.917 + cycle * 7.13 + 11.0 );
	float B = ${ f( SPLASH_BOX ) };
	vec2 local = ( fract( c.xy - splashCamPos.xz / B ) - 0.5 ) * B;
	vec3 p = vec3( splashCamPos.x + local.x, 0.0, splashCamPos.z + local.y );
	// where it lands: the highest of the boat's tops there ((M12) her cockpit's sole, the wheelhouse roof,
	// the foredeck, the traps), or the top of what's there where it's above the sea: what covers the
	// ground (the pier's deck, a roof: not thatch, which takes it in), or the ground
	vec3 b = ( splashBoatInv * vec4( p, 1.0 ) ).xyz;
	float deckY = -1e4;
	for ( int i = 0; i < ${ TOPS }; i ++ ) {
		if ( i >= splashTopCount ) break;
		vec4 t = splashTops[ i ];
		if ( b.x > t.x && b.x < t.y && b.z > t.z && b.z < t.w ) deckY = max( deckY, splashTopY[ i ] );
	}
	float deck = deckY > -1e3 ? 1.0 : 0.0;
	float ground = terrainHeightAt( p.xz );
	vec2 over = coverAt( p.xz );
	float top = max( ground, over.x );
	// ((M12) a rock's top: where a drop falling there first meets its ellipsoid)
	for ( int i = 0; i < ${ SPLASH_ROCKS }; i ++ ) {
		if ( i >= splashRockCount ) break;
		vec3 o = ( splashRocks[ i ] * vec4( p.x, 500.0, p.z, 1.0 ) ).xyz, d = mat3( splashRocks[ i ] ) * vec3( 0.0, - 1.0, 0.0 );
		float a = dot( d, d ), b = dot( o, d ), disc = b * b - a * ( dot( o, o ) - 1.0 );
		if ( disc > 0.0 ) top = max( top, 500.0 - ( - b - sqrt( disc ) ) / a );
	}
	bool thatch = over.x > ground && over.y == ${ f( COVER.THATCH ) };
	p = deck > 0.5 ? ( splashBoat * vec4( b.x, deckY, b.z, 1.0 ) ).xyz : vec3( p.x, top, p.z );
	float land = max( deck, top > rainSeaLevel + 0.03 && ! thatch ? 1.0 : 0.0 );
	// a crown facing you (about the upright), at least a couple of pixels across
	vec3 toCam = cameraPosition - p;
	float dist = max( length( toCam ), 0.05 );
	float pixel = dist * 2.0 / ( projectionMatrix[ 1 ][ 1 ] * rainViewHeight );
	float w = max( ${ f( SPLASH_SIZE ) } * ( 0.5 + 0.5 * min( life, 1.0 ) ), pixel * 2.0 );
	vec3 right = normalize( vec3( - toCam.z, 0.0, toCam.x ) + vec3( 1e-5, 0.0, 0.0 ) );
	float fade = rainSs( 0.5, 1.5, dist ) * ( 1.0 - rainSs( B * 0.36, B * 0.5, max( abs( local.x ), abs( local.y ) ) ) );
	float a = keep * land * fade * ( life < 1.0 ? 1.0 : 0.0 ) * 0.8;
	// (lit as water thrown up: the sky's light caught in the drops, brighter than the ground's under it)
	vec3 col = rainSky * 2.2 + rainSun * ( 0.1 + 0.5 * pow( max( - dot( toCam / dist, rainSunDir ), 0.0 ), 8.0 ) ) + vec3( 0.8, 0.85, 1.0 ) * rainFlash * 0.6;
	vec2 corner = position.xy;
	vec3 world = p + right * ( corner.x * w ) + vec3( 0.0, ( corner.y + 1.0 ) * 0.4 * w, 0.0 );
	vSplashCol = vec4( col, a );
	vSplashUV = vec3( corner, min( life, 1.0 ) );
	vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
	gl_Position = projectionMatrix * mvPosition;
	if ( a < 2e-4 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
	#include <fog_vertex>
}
`;
		// the crown (CROWN_GLSL)
		const fragmentShader = /* glsl */`
#include <common>
#include <fog_pars_fragment>
varying vec4 vSplashCol;
varying vec3 vSplashUV;
${ CROWN_GLSL }
void main() {
	float a = clamp( splashCrown( vSplashUV.xy, vSplashUV.z ) * vSplashCol.w, 0.0, 1.0 );
	if ( a < 0.003 ) discard;
	gl_FragColor = vec4( vSplashCol.rgb * a, a );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
#ifdef USE_FOG
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * gl_FragColor.a, sceneFogFactor() );
#endif
}
`;
		const material = new THREE.ShaderMaterial( {
			name: 'RainSplash',
			uniforms: U,
			vertexShader,
			fragmentShader,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide,
			fog: true,
			blending: THREE.CustomBlending,
			blendSrc: THREE.OneFactor,
			blendDst: THREE.OneMinusSrcAlphaFactor,
			blendSrcAlpha: THREE.OneFactor,
			blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
			premultipliedAlpha: true,
		} );
		material.forceSinglePass = true;
		const plane = new THREE.PlaneGeometry( 2, 2 );
		const geo = new THREE.InstancedBufferGeometry();
		geo.index = plane.index;
		geo.setAttribute( 'position', plane.getAttribute( 'position' ) );
		geo.instanceCount = count;
		geo.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e5 );
		const mesh = new THREE.Mesh( geo, material );
		mesh.name = 'RainSplash';
		mesh.frustumCulled = false;
		mesh.matrixAutoUpdate = false;
		mesh.renderOrder = 21;
		mesh.visible = false;
		return mesh;

	}

	// (M10) the boat, for the splashes on her cockpit's sole: her frame -> the world; (M12) and the rest
	// of her that takes the rain from above (tops, in her frame: [ { x0, x1, z0, z1, y } ], given once)
	setDeck( matrix, tops = null ) {

		const U = this.splashUniforms;
		U.splashBoat.value.copy( matrix );
		U.splashBoatInv.value.copy( matrix ).invert();
		if ( ! tops || this._tops ) return;
		this._tops = true;
		const all = [ { x0: - COCKPIT.x, x1: COCKPIT.x, z0: COCKPIT.z[ 0 ], z1: COCKPIT.z[ 1 ], y: COCKPIT.y }, ...tops ].slice( 0, TOPS );
		all.forEach( ( t, i ) => {

			U.splashTops.value[ i ].set( t.x0, t.x1, t.z0, t.z1 );
			U.splashTopY.value[ i ] = t.y;

		} );
		U.splashTopCount.value = all.length;

	}

	// (M12) the rocks about the camera (Rocks.splashRocks: world -> each one's unit sphere)
	setRocks( list ) {

		const U = this.splashUniforms, n = Math.min( list.length, SPLASH_ROCKS );
		for ( let i = 0; i < n; i ++ ) U.splashRocks.value[ i ].copy( list[ i ] );
		U.splashRockCount.value = n;

	}

	// a roof over part of the box: world -> its box (-1..1), or null for none
	setShelter( matrix ) {

		this.uniforms.rainShelter.value.copy( matrix || NO_ROOF );

	}

	// cameraWaterHeight: water level at the camera (none drawn with the camera under water)
	update( dt, camera, cameraWaterHeight = 0, viewHeight = 720 ) {

		const U = this.uniforms;
		const visible = G.rain.value > 0.002 && camera.position.y > cameraWaterHeight;
		this.mesh.visible = visible;
		this.splash.visible = visible;
		this.splashUniforms.splashTime.value = ( this.splashUniforms.splashTime.value + dt ) % 3600;
		// (the drops fall and drift: wrapped to the box; the fastest's fall, the others take their eighths of
		// it, so it's wrapped to eight boxes' heights)
		const d = U.rainDrift.value, s = G.windSpeed.value * NEAR_WIND * dt;
		d.x = ( d.x + G.windDir.value.x * s ) % BOX;
		d.y = ( d.y - FALL * dt ) % ( HEIGHT * 8 );
		d.z = ( d.z + G.windDir.value.y * s ) % BOX;
		// ((M13) the sheets go by with the air; as the wind comes round, their phase at the camera is kept)
		const wd = G.windDir.value, sd = this._sheetDir, cp = camera.position;
		U.rainSheet.value = ( U.rainSheet.value + ( cp.x * ( wd.x - sd.x ) + cp.z * ( wd.y - sd.y ) ) / SHEET_GAP + s / SHEET_GAP ) % 1e3;
		sd.copy( wd );
		this.sheet = G.windSpeed.value > SHEETS[ 0 ] ? sheetAt( ( cp.x * wd.x + cp.z * wd.y ) / SHEET_GAP - U.rainSheet.value + Math.sin( ( cp.z * wd.x - cp.x * wd.y ) / SHEET_ALONG * Math.PI * 2 ) * 0.18 ) : 0;
		if ( ! visible ) return;
		U.rainCamPos.value.copy( camera.position );
		U.rainViewHeight.value = viewHeight;
		this.splashUniforms.splashCamPos.value.copy( camera.position );

	}

	dispose() {

		this.mesh.geometry.dispose();
		this.material.dispose();
		this.splash.geometry.dispose();
		this.splash.material.dispose();

	}

}
