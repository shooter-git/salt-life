import * as THREE from 'three';
import { G } from '../core/Globals.js';

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
// or a roof (the wheelhouse's, as a box in the boat's frame: shelter).
//
// Drawn premultiplied, one instanced draw; fewer drops on the lesser tiers (phones' fill rate is what
// rain costs).
// (M10) And where they land, splashes: a small crown popping up and gone in a moment, on the ground
// above the sea (the sea has its rings: WaterSurface) and on the boat's cockpit sole (the deck aft of
// the wheelhouse, as a box in her frame: setDeck). Hashed about the camera too, each at a new spot each
// time it pops; one more instanced draw, as many as the rain is hard.
//   const rain = new Rain( { terrain, tier } ); scene.add( rain.mesh, rain.splash );
//   rain.update( dt, camera, cameraWaterHeight, viewHeight )   (each frame)   rain.flash.value
//   rain.setDeck( boatMatrixWorld )

const COUNT = { low: 1400, mid: 3200, high: 6400 };
const BOX = 22, HEIGHT = 14; // m: the box across, and its height (the camera a third of the way up)
const FALL = 9; // m/s, the biggest drops' (the others fall 5, 6 or 7 eighths as fast)
const NEAR_WIND = 0.7; // the wind they're carried by: near the ground, of the 10 m wind
const EXPOSURE = 0.04; // s: a look's motion blur (the streak's length)
const VISIBILITY = 3.5; // how much more a streak shows than the drop's own breadth would
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

export class Rain {

	// terrain: the Terrain (its heightGlsl / heightUniforms)
	constructor( { terrain, tier = 'high' } ) {

		const count = COUNT[ tier ] ?? COUNT.low;
		this.count = count;
		this.flash = { value: 0 }; // (the lightning's light on the drops: Lightning, through App)
		this.uniforms = {
			...THREE.UniformsUtils.clone( THREE.UniformsLib.fog ),
			...terrain.heightUniforms,
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
		};

		const vertexShader = /* glsl */`
#include <common>
#include <fog_pars_vertex>
${ terrain.heightGlsl }
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
	// none under the ground or the sea, or under a roof
	float ground = max( terrainHeightAt( p.xz ), rainSeaLevel );
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

		this.splash = this.buildSplash( terrain, tier );

	}

	// (M10) the splashes where the drops land (see above)
	buildSplash( terrain, tier ) {

		const count = SPLASH[ tier ] ?? SPLASH.low;
		const U = this.splashUniforms = {
			...THREE.UniformsUtils.clone( THREE.UniformsLib.fog ),
			...terrain.heightUniforms,
			splashCamPos: { value: new THREE.Vector3() },
			splashTime: { value: 0 },
			splashBoat: { value: new THREE.Matrix4() }, // the boat's frame -> the world, and back
			splashBoatInv: { value: NO_ROOF.clone() },
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
uniform vec3 splashCamPos;
uniform float splashTime;
uniform mat4 splashBoat;
uniform mat4 splashBoatInv;
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
	// where it lands: the cockpit's sole, or the ground where it's above the sea
	vec3 b = ( splashBoatInv * vec4( p, 1.0 ) ).xyz;
	float deck = abs( b.x ) < ${ f( COCKPIT.x ) } && b.z > ${ f( COCKPIT.z[ 0 ] ) } && b.z < ${ f( COCKPIT.z[ 1 ] ) } ? 1.0 : 0.0;
	float ground = terrainHeightAt( p.xz );
	p = deck > 0.5 ? ( splashBoat * vec4( b.x, ${ f( COCKPIT.y ) }, b.z, 1.0 ) ).xyz : vec3( p.x, ground, p.z );
	float land = max( deck, ground > rainSeaLevel + 0.03 ? 1.0 : 0.0 );
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
		// the crown: a thin ring spreading at its foot, and three drops thrown up and out of it
		const fragmentShader = /* glsl */`
#include <common>
#include <fog_pars_fragment>
varying vec4 vSplashCol;
varying vec3 vSplashUV;
void main() {
	vec2 uv = vSplashUV.xy;
	float s = vSplashUV.z, y = uv.y * 0.5 + 0.5;
	float ring = exp( - pow( ( abs( uv.x ) - 0.3 - 0.6 * s ) * 7.0, 2.0 ) ) * exp( - y * 10.0 );
	float up = sin( s * 3.14159 );
	float drops = 0.0;
	for ( int i = 0; i < 3; i ++ ) {
		float fi = float( i ) - 1.0;
		vec2 at = vec2( fi * 0.55 * s, 0.2 + up * ( 0.7 - 0.25 * abs( fi ) ) );
		drops += smoothstep( 0.24, 0.06, length( vec2( uv.x - at.x, ( y - at.y ) * 1.3 ) ) );
	}
	float a = clamp( ( ring * 0.7 + drops ) * vSplashCol.w * ( 1.0 - 0.6 * s ), 0.0, 1.0 );
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

	// (M10) the boat, for the splashes on her cockpit's sole: her frame -> the world
	setDeck( matrix ) {

		const U = this.splashUniforms;
		U.splashBoat.value.copy( matrix );
		U.splashBoatInv.value.copy( matrix ).invert();

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
