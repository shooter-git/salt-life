import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';
import { Atmosphere, ATMOSPHERE_GLSL, SUN_ANGULAR_RADIUS, SUN_ILLUMINANCE, f } from './Atmosphere.js';
import { SkyProClouds, CLOUDS_GLSL } from './SkyProClouds.js';
import { Environment } from './Environment.js';
import { SunLight } from 'three/addons/lights/SunLight.js';

// The sky and the light it gives: Tidewater's physically based atmosphere (Hillaire 2020 LUTs) with
// the sun disk, stars, moon and moonlit sky, composited with sky-pro's volumetric cumulus and
// Tidewater's cirrus veil; the sun or the moon as the key light, a hemisphere light for the sky's
// fill, and a prefiltered environment map of the sky for reflections. Tidewater's auto exposure is
// stood in for by an eye adaptation of the sky alone (`adaptation`: up to 6x at dusk and at night).
//
// The sky is drawn on a box around the camera at the far plane, after the opaque objects (only the
// pixels they leave are shaded). Its radiance is in Tidewater's units (the sun's illuminance is 11),
// which with Tidewater's exposure (0.55, ACES) gives its deep blue zenith and bright cumulus. The
// lights keep this game's own levels (`levels`): the atmosphere gives their colour and how they
// change over the day (the sun's transmittance, the sky's irradiance) on the CPU, without reading
// anything back from the GPU.
//
// GLSL of the sky (main view and environment variants):
//   vec3 skySunDisk( vec3 dir )        sun disk radiance (atmospheric transmittance included)
//   vec3 skyStars( vec3 dir )
//   vec3 skyMoon( vec3 dir )
//   vec3 skyMoonSky( vec3 dir )        faint moonlit sky + aureole
//   vec3 skyBackground( vec3 dir, float starK )   everything behind the clouds but the disks

const STAR_CELLS = 160; // cells per half cube face (one star candidate per cell, ~9 px at 25 px/deg)
const STAR_SIGMA = 0.1; // star PSF (cells, ~1 px)
const MW = new THREE.Vector3( 0.3, 0.2, 1 ).normalize(); // pole of the Milky Way band
// reflections spread point sources over rough water: only a trace of the stars survives
const STAR_REFLECTION = 0.08;

const _up = new THREE.Vector3( 0, 1, 0 );
const _origin = new THREE.Vector3();
const _anchor = new THREE.Vector3(), _fwd = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3();
const _c = new THREE.Color();
const _tint = new THREE.Color();
const MOON = new THREE.Color( 0.55, 0.65, 1.0 );
const FOG_DISTANCE = { low: [ 250, 1600 ], mid: [ 400, 3000 ], high: [ 600, 5000 ] };
// (Salt Life) under a grey sky (overcast 1) the sun's direct light falls to this share of a clear day's;
// on high the clouds' shadow map already dims it where they are, so less is taken off here
const UNDER_CLOUD = { low: 0.3, mid: 0.3, high: 0.7 };
// the environment: cube size, s between refreshes for the drifting clouds (low: when the sun moves)
const ENV = { low: { size: 64, interval: 60 }, mid: { size: 128, interval: 10 }, high: { size: 128, interval: 4 } };
// Tidewater's night (its units): the moon's light on the clouds and the night sky's ambient, the
// moonlit sky at the horizon (skyMoonSky)
const NIGHT_LIGHT = new THREE.Color( 0.6, 0.7, 1.0 );
const MOON_SKY = new THREE.Color( 0.005, 0.0068, 0.0105 ).multiplyScalar( 2.2 );
// (M9) a flash's radiance on the clouds (the sky's units), and the light it throws on the island (of the
// sky fill's level: a strike a few km off lights the land about as a dull day does)
const FLASH = 0.5;
const FLASH_FILL = 5;
const FLASH_LIGHT = new THREE.Color( 0.8, 0.85, 1.0 );
// (M9) of the sun's light rain's deck takes, the share it scatters down as the sky's light
const DECK_DIFFUSE = 0.5;
// (M11) the showers' curtains in the distance (setCurtains): how many are drawn at most (by tier: the
// nearest), how thick a shaft is (per m through it at full rain), how high it reaches (m: a shower's
// cloud is lower than the deck's, the shaft fades into the haze as it nears this, or the cloud's base
// if that's lower), how far beyond its edge one comes in (m: you're in the rain nearer), how far off it
// goes (m, faded over the last stretch), and how far a shaft leans with the wind (m across for each m
// down, at a gale's wind)
const CURTAINS = { low: 6, mid: 12, high: 12 };
const CURTAIN_MAX = 12;
const CURTAIN_DENSITY = 5e-4;
const CURTAIN_TOP = 3000;
const CURTAIN_NEAR = [ 2000, 5000 ];
const CURTAIN_FAR = [ 20000, 26000 ];
const CURTAIN_LEAN = 0.35;

const SKY_VERTEX = /* glsl */`
varying vec3 vSkyDir;
void main() {
	vSkyDir = position;
	// a direction at infinity: the camera's rotation only, at the far plane
	vec4 p = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
	gl_Position = vec4( p.xy, p.w * 0.999999, p.w );
}
`;

const SKY_FRAGMENT = ATMOSPHERE_GLSL + CLOUDS_GLSL + /* glsl */`
uniform vec3 skyMoonDir;
uniform float skySunDiskIntensity;
uniform float skyStarIntensity;
uniform float skyNight;
uniform float skyUnderwater;
uniform vec3 skyFogColor;
uniform vec4 skyGrey; // (Salt Life) the horizon under a grey sky: ( its radiance, how much )
uniform vec4 skyFlash; // (M9) lightning: ( toward the strike, how bright )
uniform vec3 skyFlashColor;
uniform float skyTime;
uniform float skyExposure;
uniform vec4 skyCurtains[ ${ CURTAIN_MAX } ]; // (M11) the showers' curtains: ( x, z from the camera, radius (m), strength )
uniform int skyCurtainCount;
uniform vec4 skyCurtainInfo; // ( how high the shafts reach (m), the camera's height (m), the shafts' lean (x, z) )
varying vec3 vSkyDir;

float skySmooth( float e0, float e1, float x ) {
	// smoothstep for either order of the edges (GLSL's is undefined for e0 >= e1)
	float t = clamp( ( x - e0 ) / ( e1 - e0 ), 0.0, 1.0 );
	return t * t * ( 3.0 - 2.0 * t );
}

// hash without sine (D. Hoskins): keeps full precision for large integer coordinates
float skyHash13( vec3 p ) {
	vec3 p3 = fract( p * vec3( 0.1031, 0.1030, 0.0973 ) );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}

// Sun disk radiance along dir (already includes atmospheric transmittance).
vec3 skySunDisk( vec3 dir ) {
	float cosA = dot( dir, atmoSunDir ); // the real sun (the key light is the moon at night)
	float ang = acos( clamp( cosA, -1.0, 1.0 ) );
	float r = ang / ${ f( SUN_ANGULAR_RADIUS ) };
	float mask = skySmooth( 1.0, 0.9, r );
	float mu = sqrt( max( 1.0 - r * r, 0.0 ) );
	float limb = 1.0 - 0.6 * ( 1.0 - mu );
	vec3 T = atmosphereTransmittanceToSpace( dir );
	// physically the disk radiance is E / solid angle (~1.6e5); clamp for fp16 targets
	return T * mask * limb * 2500.0 * skySunDiskIntensity * smoothstep( -0.02, 0.0, dir.y );
}

// Stars: one candidate per cell of a cube-face grid, jittered inside it, with a power law
// magnitude distribution (few bright stars, many faint ones), denser along the Milky Way. They
// come out after civil twilight: the brightest first, the faintest once the sky is fully dark.
vec3 skyStars( vec3 dir ) {
	// cube face coordinates
	vec3 a = abs( dir );
	bool onX = a.x > a.y && a.x > a.z;
	bool onY = a.y > a.z;
	float face = onX ? sign( dir.x ) + 2.0 : ( onY ? sign( dir.y ) + 5.0 : sign( dir.z ) + 8.0 );
	vec2 uv = ( onX ? dir.yz / a.x : ( onY ? dir.xz / a.y : dir.xy / a.z ) ) * ${ f( STAR_CELLS ) };
	vec3 cell = vec3( floor( uv ), face );
	float h = skyHash13( cell );
	float bx = dot( dir, vec3( ${ f( MW.x ) }, ${ f( MW.y ) }, ${ f( MW.z ) } ) ) * 4.0;
	float band = exp( - bx * bx );
	// the cell holds a star with probability P (higher along the Milky Way); an independent
	// uniform u ranks its brightness: N( < m ) ~ 10^( m / 2 ), brightest about magnitude -1
	bool has = h < band * 0.035 + 0.025;
	float uc = max( skyHash13( cell + 7.7 ), 2e-4 );
	float m = log2( uc ) * 0.602 + 6.5;
	// limiting magnitude: -1 when the sun is 6 deg below the horizon, 6.5 below 16 deg
	float dark = 1.0 - smoothstep( -0.28, -0.1, atmoSunDir.y );
	float vis = smoothstep( m - 0.6, m + 0.6, dark * 7.5 - 1.0 ) * ( has ? 1.0 : 0.0 );
	// angular distance to the star (isotropic whatever the cube face distortion), in cells
	vec2 sp = ( floor( uv ) + vec2( skyHash13( cell + 3.1 ), skyHash13( cell + 5.7 ) ) * 0.4 + 0.3 ) / ${ f( STAR_CELLS ) };
	vec3 sdir = normalize( onX ? vec3( sign( dir.x ), sp ) : ( onY ? vec3( sp.x, sign( dir.y ), sp.y ) : vec3( sp, sign( dir.z ) ) ) );
	float d = length( dir - sdir ) * ${ f( STAR_CELLS ) };
	// flux relative to a magnitude 6.5 star; bright stars look bigger (glare), not just clipped
	float flux = pow( uc, -0.8 );
	float size = log2( flux ) * 0.08 + 1.0;
	float psf = exp( d * d / ( size * size ) * ${ f( - 0.5 / ( STAR_SIGMA * STAR_SIGMA ) ) } ) / ( size * size );
	// subtle scintillation, stronger low in the sky
	float tw = sin( skyTime * ( skyHash13( cell + 13.3 ) * 9.0 + 5.0 ) + h * 60.0 ) * mix( 0.18, 0.06, clamp( dir.y * 2.0, 0.0, 1.0 ) ) + 1.0;
	vec3 col = mix( vec3( 1.0, 0.8, 0.6 ), vec3( 0.75, 0.85, 1.0 ), skyHash13( cell + 17.0 ) ) * 0.5 + 0.5;
	vec3 star = col * ( psf * flux * vis * tw * 0.0075 );
	// diffuse glow of the Milky Way
	vec3 glow = vec3( 0.55, 0.6, 0.75 ) * ( band * dark * 0.0035 );
	// atmospheric extinction toward the horizon
	return ( star + glow ) * skyStarIntensity * smoothstep( 0.0, 0.2, dir.y );
}

vec3 skyMoon( vec3 dir ) {
	float cosA = dot( dir, skyMoonDir );
	float ang = acos( clamp( cosA, -1.0, 1.0 ) );
	float r = ang / 0.0048;
	float mask = skySmooth( 1.0, 0.92, r );
	return vec3( 0.9, 0.92, 1.0 ) * mask * 3.0 * skyStarIntensity * smoothstep( -0.02, 0.02, dir.y );
}

// Faint blue-grey moonlit sky (a little brighter toward the horizon) and the moon's aureole.
// Physically dim: about the level of the night ambient light.
vec3 skyMoonSky( vec3 dir ) {
	float cosA = dot( dir, skyMoonDir );
	float ang = acos( clamp( cosA, -1.0, 1.0 ) );
	float aureole = exp( ang * -14.0 ) * 2.4 + exp( ang * -2.5 ) * 0.9;
	float grad = mix( 1.7, 1.0, clamp( dir.y * 3.0, 0.0, 1.0 ) );
	float up = smoothstep( -0.05, 0.15, skyMoonDir.y );
	return vec3( 0.005, 0.0068, 0.0105 ) * ( grad + aureole ) * skyNight * up;
}

// Everything behind the clouds except the sun and moon disks. The night terms are only
// evaluated at night.
vec3 skyBackground( vec3 dir, float starK ) {
	vec3 L = atmosphereSkyLuminance( dir );
	if ( skyStarIntensity > 0.001 ) {
		L += skyMoonSky( dir ) + skyStars( dir ) * starK;
	}
	return L;
}

#ifndef SKY_ENVIRONMENT
// (M11) the showers' curtains in the distance: each a shaft of rain from the sea up into the haze under
// the cloud, leaning with the wind (lower down, carried further), in streaks drifting down. Seen along
// dir: the light through them (the sky behind, a veil darker; silver toward the sun), and how much they
// hide
float skyCurtainNoise( vec2 p ) {
	vec2 i = floor( p ), t = fract( p );
	t = t * t * ( 3.0 - 2.0 * t );
	float a = skyHash13( vec3( i, 3.0 ) ), b = skyHash13( vec3( i + vec2( 1.0, 0.0 ), 3.0 ) );
	float c = skyHash13( vec3( i + vec2( 0.0, 1.0 ), 3.0 ) ), d = skyHash13( vec3( i + vec2( 1.0, 1.0 ), 3.0 ) );
	return mix( mix( a, b, t.x ), mix( c, d, t.x ), t.y );
}
vec4 skyCurtain( vec3 dir, vec3 behind ) {
	float hl = length( dir.xz );
	float top = skyCurtainInfo.x, camY = skyCurtainInfo.y;
	// (none overhead, or above their tops as near as one can be)
	if ( skyCurtainCount == 0 || hl < 0.05 || camY + ${ f( CURTAIN_NEAR[ 0 ] ) } * dir.y / hl > top ) return vec4( 0.0 );
	vec2 d2 = dir.xz / hl;
	float tanE = dir.y / hl, tau = 0.0;
	for ( int i = 0; i < ${ CURTAIN_MAX }; i ++ ) {
		if ( i >= skyCurtainCount ) break;
		vec4 c = skyCurtains[ i ];
		// (where the ray passes it, and how high it is there)
		float s = dot( c.xy, d2 );
		if ( s <= 0.0 ) continue;
		float y = camY + s * tanE;
		if ( y > top ) continue;
		vec2 axis = c.xy + skyCurtainInfo.zw * ( top - max( y, 0.0 ) );
		float b = d2.x * axis.y - d2.y * axis.x;
		float q = b / c.z;
		if ( abs( q ) >= 1.0 ) continue;
		// (as far as the ray goes through it, nearly as thick at its edge as its middle: an edge that shows)
		vec2 fall = vec2( b + float( i ) * 2281.0, y + skyTime * 9.0 );
		float streak = 0.35 + 0.4 * skyCurtainNoise( fall * vec2( 0.012, 0.0009 ) ) + 0.25 * skyCurtainNoise( fall * vec2( 0.04, 0.002 ) + 7.3 );
		float up = 1.0 - smoothstep( top * 0.4, top, y );
		tau += c.w * ( 1.0 - 0.5 * q * q ) * streak * up * 2.0 * c.z * sqrt( 1.0 - q * q );
	}
	float a = 1.0 - exp( - tau * ${ f( CURTAIN_DENSITY ) } );
	float toSun = pow( max( dot( dir, atmoSunDir ), 0.0 ), 6.0 );
	vec3 horizon = atmosphereSkyLuminance( normalize( vec3( d2.x, 0.06, d2.y ) ) );
	return vec4( behind * 0.4 + horizon * toSun * 1.2, a );
}
#endif

void main() {
	vec3 dir = normalize( vSkyDir );
#ifdef SKY_ENVIRONMENT
	// reflections: no sun or moon disk (the key light is lit directly), only a trace of the stars,
	// the panorama's clouds
	vec3 base = skyBackground( dir, ${ f( STAR_REFLECTION ) } );
	vec4 c = cloudsSample( dir );
	vec3 L = base * c.a + c.rgb;
#else
	// the main view: the view clouds, the sun's disc behind them with cloudsSunTransmittance (no sun
	// through the cut-off remainder of thick cloud)
	vec3 base = skyBackground( dir, 1.0 ) + skyMoon( dir );
	vec3 sun = skySunDisk( dir );
	vec4 c = cloudsSampleView( dir );
	vec3 L = base * c.a + sun * cloudsSunTransmittance( c.a ) + c.rgb;
	// (M11) the showers' curtains, under the cloud's base, in front of the cloud beyond them
	vec4 curtain = skyCurtain( dir, L );
	L = mix( L, curtain.rgb, curtain.a );
#endif
	// (Salt Life) under a grey sky the horizon greys, as the fog does (Sky.update): they meet in one grey
	L = mix( L, skyGrey.rgb, skyGrey.a * ( 1.0 - smoothstep( 0.0, 0.3, dir.y ) ) );
#ifndef SKY_ENVIRONMENT
	// (M9) lightning: the cloud lit from inside about the strike, brightest where it's thickest, and the
	// rain's murk to the horizon with it (the reflections' panorama isn't: it's made over seconds)
	if ( skyFlash.w > 0.0 ) {
		float lobe = exp( ( dot( dir, skyFlash.xyz ) - 1.0 ) * 7.0 );
		float murk = skyGrey.a * ( 1.0 - smoothstep( 0.0, 0.3, dir.y ) );
		L += skyFlashColor * skyFlash.w * ( ( 1.0 - c.a ) * ( 2.5 * lobe + 0.2 ) + murk * ( 0.6 * lobe + 0.1 ) );
	}
#endif
	gl_FragColor = vec4( L * skyExposure, 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
#ifndef SKY_ENVIRONMENT
	// (as three's fog, after the tone mapping)
	gl_FragColor.rgb = mix( gl_FragColor.rgb, skyFogColor, skyUnderwater );
	// a triangular +-1/255 dither: the 8-bit sky gradients show no rings (Tidewater's post grain did
	// the same)
	vec3 q = vec3( floor( gl_FragCoord.xy ), 0.0 );
	gl_FragColor.rgb += ( skyHash13( q ) + skyHash13( q + vec3( 0.0, 0.0, 1.0 ) ) - 1.0 ) / 255.0;
#endif
}
`;

export class Sky {

	constructor( { scene, renderer, tier = 'low' } ) {

		this.scene = scene;
		this.renderer = renderer;
		this.tier = FOG_DISTANCE[ tier ] ? tier : 'low';

		this.atmosphere = new Atmosphere( renderer );
		this.clouds = new SkyProClouds( renderer, this.atmosphere, this.tier );

		this.uniforms = {
			...this.atmosphere.uniforms,
			...this.clouds.sampleUniforms,
			skyMoonDir: { value: new THREE.Vector3( - 0.3, 0.5, 0.8 ).normalize() },
			skySunDiskIntensity: { value: 1 },
			skyStarIntensity: { value: 0 },
			skyNight: G.night,
			skyTime: G.time,
			skyExposure: G.skyExposure, // ((M10) shared: the sea's flash takes it too)
			// (Salt Life) under water the dome is the fog: the camera's far plane is just past the fog
			// there (App), so the dome shows where the sea floor would. skyFogColor: the fog's colour as
			// three hands it to its fog (in the space of the target drawn: the dome's onBeforeRender)
			skyUnderwater: G.cameraUnderwater,
			skyFogColor: { value: new THREE.Color() },
			skyGrey: { value: new THREE.Vector4() },
			skyFlash: G.skyFlash, // ((M10) shared: the sea reflects the flash)
			skyFlashColor: { value: new THREE.Color( 0.82, 0.86, 1.0 ) },
			// (M11) the showers' curtains in the distance (setCurtains)
			skyCurtains: { value: Array.from( { length: CURTAIN_MAX }, () => new THREE.Vector4() ) },
			skyCurtainCount: { value: 0 },
			skyCurtainInfo: { value: new THREE.Vector4() },
		};
		this._curtains = [];
		this.moonDir = this.uniforms.skyMoonDir.value;
		this.sunDiskIntensity = this.uniforms.skySunDiskIntensity;
		this.starIntensity = this.uniforms.skyStarIntensity;

		const material = ( env ) => new THREE.ShaderMaterial( {
			name: env ? 'SkyEnvironment' : 'Sky',
			vertexShader: SKY_VERTEX,
			fragmentShader: SKY_FRAGMENT,
			uniforms: this.uniforms,
			defines: env ? { SKY_ENVIRONMENT: '' } : {},
			side: THREE.BackSide,
			depthWrite: false,
			depthTest: ! env,
		} );

		// the dome: drawn after the opaque objects (only the pixels they leave), before the water
		const dome = this.dome = new THREE.Mesh( new THREE.BoxGeometry( 1, 1, 1 ), material( false ) );
		dome.name = 'Sky';
		dome.frustumCulled = false;
		dome.renderOrder = 1e6;
		dome.onBeforeRender = ( r ) => this.fog.color.getRGB( this.uniforms.skyFogColor.value, r.getRenderTarget() === null ? r.outputColorSpace : THREE.ColorManagement.workingColorSpace );
		scene.add( dome );

		// (Salt Life) on high three's SunLight: two shadow maps fitted to the view, a sharp one near the
		// camera and a wider one beyond (App sets them up). Below, a directional light: on mid its one
		// shadow map ahead of the camera (shadowAhead; two maps drew the village's big merged meshes
		// twice, past mid's triangle budget), on low no shadows
		this.sun = tier === 'high' ? new SunLight( 0xffffff, 2 ) : new THREE.DirectionalLight( 0xffffff, 2 );
		this.shadowAhead = 0; // m
		this.sun.name = 'Sun';
		this.hemi = new THREE.HemisphereLight( 0x9cc4e4, 0x3a3326, 0.6 );
		scene.add( this.sun, this.hemi );
		if ( this.sun.target ) scene.add( this.sun.target );

		const [ near, far ] = FOG_DISTANCE[ this.tier ];
		this.fogNear = near;
		this.fogFar = far;
		this.fog = scene.fog = new THREE.Fog( 0x9fbcd0, near, far );

		// reflections: the sky with its clouds, prefiltered (PMREM), re-made when the sun moves and as
		// the clouds drift
		this.environment = new Environment( renderer, scene, material( true ), ENV[ this.tier ] );

		this.sunDir = new THREE.Vector3(); // true sun direction (the sky)
		// light levels: the key light, the sky's fill (hemisphere) and its reflections (environment)
		// (the sky's prefiltered map is bright and blue: as diffuse light it greys the sand, so it is a
		// small fill here; (M11) the sea reflects it in full, as a mirror: WaterSurface)
		this.levels = { sun: 3.2, sky: 0.25, env: 0.09 };
		// (Salt Life) the weather (WeatherDriver): how grey the sky is (0..1), and how far you see (x the
		// tier's fog distances). 0 and 1 are the island's clear day
		this.overcast = 0;
		this.visibility = 1;
		// (M9) rain's deck over it (0..1): no sun through it at all; the sky's light the more for it
		this.storm = 0;
		// (M9) lightning (Lightning): how bright its flash is now (0: none; 1 a strike a few km off, in the
		// sky's units through FLASH), and toward it (a unit vector from the camera)
		this.flash = 0;
		this.flashDir = new THREE.Vector3( 0, 1, 0 );
		this._lit = { sunTransmittance: new THREE.Color(), skyIrradiance: new THREE.Color(), horizon: new THREE.Color() };
		this._noon = this.atmosphere.lighting( 1, { sunTransmittance: new THREE.Color(), skyIrradiance: new THREE.Color(), horizon: new THREE.Color() } );
		// the sky's irradiance (luminance) below which the eye adapts: the sun 15 degrees up
		this._adaptRef = luminance( this.atmosphere.lighting( 0.25 ).skyIrradiance );
		this._keyColor = new THREE.Color();
		this._nightSky = new THREE.Color();
		this._skyIrr = new THREE.Color();
		this._envVersion = - 1;
		this.stats = { passes: 0 };
		// eye adaptation of the sky (Tidewater metered the whole frame and raised its exposure up to 6x
		// at dusk and at night; here the sky's radiance, its reflections and the fog follow it)
		this.adaptation = 1;
		this._adaptSun = new THREE.Vector3();
		// sceneAdaptation: the whole scene's exposure follows the adaptation (App multiplies the
		// renderer's exposure by it, as Tidewater's auto exposure did), so the sky and the fog don't
		// apply it again themselves
		this.sceneAdaptation = false;

		// the passes' shaders compile in the background (the clouds wait for them: no hitch on first use)
		this._compile();

	}

	// (this.compiled: resolves once they're compiled)
	_compile() {

		const r = this.renderer;
		this.compiled = Promise.resolve();
		if ( ! r.compileAsync ) return;
		const scene = new THREE.Scene();
		for ( const m of [ ...this.clouds.meshes, this.atmosphere.skyViewPass.mesh, this.atmosphere.multiScatPass.mesh, this.atmosphere.transmittancePass.mesh ] ) scene.add( m.clone() );
		// compiled for a float target (the passes never draw to the screen)
		const old = r.getRenderTarget();
		r.setRenderTarget( this.atmosphere.skyViewLUT );
		const done = r.compileAsync( scene, new THREE.OrthographicCamera() );
		r.setRenderTarget( old );
		this.clouds._compiling = true;
		this.compiled = done.then( () => {

			this.clouds._compiling = false;

		}, () => {

			this.clouds._compiling = false;

		} );

	}

	// hours: time of day; azimuth (degrees) turns the sun's daily path about the vertical
	update( hours, azimuth = 0, camera = null, dt = G.dt.value ) {

		const dir = sunDirectionFromTime( hours, 24, 6, this.sunDir ).applyAxisAngle( _up, THREE.MathUtils.degToRad( azimuth ) );
		// the sky is always scattered sunlight, even with the sun below the horizon (twilight)
		this.atmosphere.sunDir.value.copy( dir );

		// below the horizon the moon takes over as the key light
		const night = THREE.MathUtils.smoothstep( - dir.y, 0.02, 0.18 );
		G.night.value = night;
		this.starIntensity.value = night;
		this.moonDir.set( - dir.x, Math.abs( dir.y ) * 0.8 + 0.25, - dir.z ).normalize();
		const sunUp = dir.y > - 0.07;
		const light = sunUp ? dir : this.moonDir;
		G.sunDir.value.copy( light );

		// the atmosphere at sea level (CPU): the sun's transmittance, the sky's irradiance, the horizon
		const lit = this.atmosphere.lighting( dir.y, this._lit );
		const T = lit.sunTransmittance;

		// key light: the sun's transmitted light at this game's level (its colour from the atmosphere,
		// faded out as it sets), the moon at night
		const horizonFade = THREE.MathUtils.smoothstep( dir.y, - 0.03, 0.02 );
		const day = THREE.MathUtils.smoothstep( dir.y, - 0.04, 0.12 );
		// (the sun, or the moon, through a grey sky)
		const clouded = 1 - ( 1 - ( UNDER_CLOUD[ this.tier ] ?? UNDER_CLOUD.low ) ) * this.overcast, veiled = clouded * ( 1 - 0.8 * this.storm );
		// ((M9) the sun rain's deck takes, a share of it scattered down through the cloud as the sky's light)
		let deck = 0;
		if ( sunUp ) {

			const m = Math.max( T.r, T.g, T.b, 1e-6 );
			this.sun.color.setRGB( T.r / m, T.g / m, T.b / m );
			// (the square root: to the adapted eye a low sun reddens more than it dims; the full
			// transmittance left golden hour dull at this game's exposure)
			this.sun.intensity = this.levels.sun * Math.sqrt( m ) * horizonFade * veiled;
			deck = this.levels.sun * Math.sqrt( m ) * horizonFade * ( clouded - veiled ) * DECK_DIFFUSE;

		} else {

			this.sun.color.copy( MOON );
			this.sun.intensity = 0.25 * night * veiled;

		}

		G.sunColor.value.copy( this.sun.color ).multiplyScalar( this.sun.intensity );
		// (a sun light shines from its position toward the origin; a directional light at its target: the
		// camera, or with shadows a point shadowAhead metres ahead of it, moved across the light in
		// whole texels of the shadow map so the shadows' edges hold still)
		if ( this.sun.isSunLight ) this.sun.position.copy( light );
		else {

			const anchor = _anchor.copy( camera ? camera.position : _origin );
			if ( camera && this.sun.castShadow ) {

				camera.getWorldDirection( _fwd ).setY( 0 );
				if ( _fwd.lengthSq() > 1e-6 ) anchor.addScaledVector( _fwd.normalize(), this.shadowAhead );
				const sc = this.sun.shadow.camera, texel = ( sc.right - sc.left ) / this.sun.shadow.mapSize.x;
				// (the shadow camera's own axes: three's lookAt from the light toward the target)
				_u.crossVectors( _up, light ).normalize();
				_v.crossVectors( light, _u );
				const a = Math.round( anchor.dot( _u ) / texel ) * texel, b = Math.round( anchor.dot( _v ) / texel ) * texel;
				const c = anchor.dot( light );
				anchor.copy( light ).multiplyScalar( c ).addScaledVector( _u, a ).addScaledVector( _v, b );

			}

			this.sun.position.copy( anchor ).addScaledVector( light, 200 );
			this.sun.target.position.copy( anchor );

		}

		// sky fill: the sky's irradiance (its colour a little desaturated, its level relative to noon's
		// at this game's level); a little blue at night; the ground bounces warm light back
		const irr = lit.skyIrradiance, noon = this._noon.skyIrradiance;
		const k = Math.min( 1.2, luminance( irr ) / luminance( noon ) );
		const il = Math.max( luminance( irr ), 1e-6 );
		// (a grey sky's light is greyer, and a little more of it: the cloud scatters the sun's light down,
		// and the eye's adaptation, which follows the clear sky, doesn't make up for the dimmer sun)
		_tint.setRGB( irr.r / il, irr.g / il, irr.b / il ).lerp( _c.setRGB( 1, 1, 1 ), 0.45 + 0.35 * this.overcast ).multiplyScalar( 0.68 );
		// (a floor: at dusk the adapted eye still sees the land by the sky's light)
		this.hemi.color.copy( _tint ).multiplyScalar( 0.32 + 0.68 * k ).lerp( MOON, night * 0.5 );
		this.hemi.intensity = this.levels.sky * ( 0.65 + 0.35 * day ) * ( 1 + 0.3 * this.overcast ) + deck;
		// ((M10) how much more of the sky's light there is under a grey sky and rain's deck: the
		// environment's level rises with it, below; 1 under a clear sky)
		const greyRise = this.hemi.intensity / Math.max( this.levels.sky * ( 0.65 + 0.35 * day ), 1e-6 );
		this.hemi.groundColor.setRGB( 0.32, 0.28, 0.2 ).multiplyScalar( 0.1 + 0.9 * day );
		// (M9) a flash of lightning lights the island from the sky, bluish white (more so at night, where the
		// eye's adapted to the dark: the scene's exposure, which follows the sky, does the rest)
		if ( this.flash > 0 ) {

			const fl = this.flash * FLASH_FILL / ( 1 + 3 * day ) * ( 1 - 0.5 * night );
			this.hemi.color.lerp( FLASH_LIGHT, Math.min( 1, fl / ( 1 + fl ) ) );
			this.hemi.intensity += this.levels.sky * fl;

		}
		G.skyIrradiance.value.copy( this.hemi.color ).multiplyScalar( this.hemi.intensity );

		// eye adaptation: the sky's exposure rises as its irradiance falls below that of a sun 15 degrees
		// up (at most 6x, as Tidewater's auto exposure), at Tidewater's rates (1/s)
		// ((M9) and under a grey sky, as a camera would: the clear sky's irradiance is more than the cloud lets down)
		const target = THREE.MathUtils.clamp( Math.pow( this._adaptRef / Math.max( luminance( irr ) * ( 1 - 0.55 * this.overcast ) + 0.004 * night, 1e-5 ), 0.6 ), 1, 6 );
		const jump = this._adaptSun.dot( dir ) < 0.9986; // a time of day jump (> 3 degrees): no adaptation
		this._adaptSun.copy( dir );
		this.adaptation = jump ? target : this.adaptation + ( target - this.adaptation ) * ( 1 - Math.exp( - dt * ( target > this.adaptation ? 1.6 : 1.1 ) ) );
		const skyAdapt = this.sceneAdaptation ? 1 : this.adaptation;
		this.uniforms.skyExposure.value = skyAdapt;

		// the horizon haze the fog fades into: the atmosphere's horizon (Tidewater's units, those of the
		// sky behind the island) and the moonlit sky's at night. (Salt Life) Under a grey sky, a grey of
		// its brightness, a little dimmer the greyer it is; the sky's dome takes the same toward its horizon
		_c.copy( MOON_SKY ).multiplyScalar( night ).add( lit.horizon );
		const grey = this.uniforms.skyGrey.value, gl = luminance( _c ) * ( 1 - 0.35 * this.overcast );
		grey.set( 0.93 * gl, 0.96 * gl, gl, 0.85 * this.overcast );
		_c.lerp( _tint.setRGB( grey.x, grey.y, grey.z ), grey.w ).multiplyScalar( skyAdapt );
		// (M9: the murk lit by a flash)
		if ( this.flash > 0 ) _c.lerp( _tint.copy( FLASH_LIGHT ).multiplyScalar( luminance( _c ) * 1.8 + 0.01 * this.flash ), Math.min( 0.3, this.flash * 0.12 ) );
		this.fog.color.copy( _c );
		G.horizonColor.value.copy( _c );
		const F = this.uniforms.skyFlash.value;
		F.set( this.flashDir.x, this.flashDir.y, this.flashDir.z, this.flash * FLASH );
		if ( this.scene.background && this.scene.background.isColor ) this.scene.background.copy( _c );

		this.scene.environmentIntensity = this.levels.env * ( 0.6 + 0.4 * day ) * greyRise;
		// (Salt Life) how far you see: the tier's fog distances, nearer in rain and murk (App takes them
		// into the scene's fog above water)
		const [ near, far ] = FOG_DISTANCE[ this.tier ];
		this.fogNear = near * this.visibility;
		this.fogFar = far * this.visibility;

		// ---- the GPU side: sky view LUT, clouds, environment
		const cameraY = camera ? camera.position.y : 2;
		this.atmosphere.update( cameraY );
		// the clouds' key light at night and the night sky's ambient: Tidewater's (its units)
		this._keyColor.copy( NIGHT_LIGHT ).multiplyScalar( sunUp ? 0 : 0.12 * night );
		this._nightSky.copy( NIGHT_LIGHT ).multiplyScalar( 0.012 );
		this._skyIrr.copy( this._nightSky ).multiplyScalar( night ).add( lit.skyIrradiance );
		if ( camera ) this.clouds.update( dt, camera, this._keyColor, this._nightSky, night, this._skyIrr );
		// the environment is re-made once the clouds have faded in, and with every new panorama
		const version = this.clouds.fade.value === 1 ? this.clouds.panoVersion : - 1;
		const soon = version !== this._envVersion;
		this._envVersion = version;
		this.environment.update( dt, dir, soon );
		this.stats.passes = this.atmosphere.passes + this.clouds.passes + this.environment.passes;

	}

	// (M11) the showers about the island (Weather.showers: { along, side, r, rain }, along the trades from
	// the island's middle), as curtains in the distance: the nearest of them from 2 km beyond their edge
	// (full from 5), out to 26 km (faded at both ends), as they're seen from `at` (the camera). Up into the
	// haze under the cloud, leaning with the wind
	setCurtains( cells, at ) {

		const U = this.uniforms, list = U.skyCurtains.value, p = G.windPrevailing.value, near = this._curtains;
		near.length = 0;
		for ( const c of cells ) {

			const x = p.x * c.along - p.y * c.side - at.x, z = p.y * c.along + p.x * c.side - at.z;
			const d = Math.hypot( x, z );
			const w = Math.min( 1, c.rain * 1.6 ) * THREE.MathUtils.smoothstep( d - c.r, CURTAIN_NEAR[ 0 ], CURTAIN_NEAR[ 1 ] ) * ( 1 - THREE.MathUtils.smoothstep( d, CURTAIN_FAR[ 0 ], CURTAIN_FAR[ 1 ] ) );
			if ( w > 0.01 ) near.push( { x, z, r: c.r, w, d } );

		}

		near.sort( ( a, b ) => a.d - b.d );
		const n = Math.min( near.length, CURTAINS[ this.tier ] );
		for ( let i = 0; i < n; i ++ ) list[ i ].set( near[ i ].x, near[ i ].z, near[ i ].r, near[ i ].w );
		U.skyCurtainCount.value = n;
		const lean = CURTAIN_LEAN * Math.min( 1, G.windSpeed.value / 20 );
		U.skyCurtainInfo.value.set( Math.min( CURTAIN_TOP, this.clouds.base ), at.y, G.windDir.value.x * lean, G.windDir.value.y * lean );

	}

	dispose() {

		this.environment.dispose();
		this.clouds.dispose();
		this.atmosphere.dispose();
		this.dome.geometry.dispose();
		this.dome.material.dispose();

	}

}

function luminance( c ) {

	return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;

}

// Simple solar position model. Returns direction toward the sun (world: +x east, -z north, +y up).
export function sunDirectionFromTime( hours, latitudeDeg = 24, declinationDeg = 6, out = new THREE.Vector3() ) {

	const phi = THREE.MathUtils.degToRad( latitudeDeg );
	const dec = THREE.MathUtils.degToRad( declinationDeg );
	const H = THREE.MathUtils.degToRad( ( hours - 12 ) * 15 );
	const east = - Math.cos( dec ) * Math.sin( H );
	const north = Math.cos( phi ) * Math.sin( dec ) - Math.sin( phi ) * Math.cos( dec ) * Math.cos( H );
	const up = Math.sin( phi ) * Math.sin( dec ) + Math.cos( phi ) * Math.cos( dec ) * Math.cos( H );
	return out.set( east, up, - north ).normalize();

}

export { SUN_ILLUMINANCE };
