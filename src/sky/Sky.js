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
// the environment: cube size, s between refreshes for the drifting clouds (low: when the sun moves)
const ENV = { low: { size: 64, interval: 60 }, mid: { size: 128, interval: 10 }, high: { size: 128, interval: 4 } };
// Tidewater's night (its units): the moon's light on the clouds and the night sky's ambient, the
// moonlit sky at the horizon (skyMoonSky)
const NIGHT_LIGHT = new THREE.Color( 0.6, 0.7, 1.0 );
const MOON_SKY = new THREE.Color( 0.005, 0.0068, 0.0105 ).multiplyScalar( 2.2 );

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
uniform float skyTime;
uniform float skyExposure;
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
			skyExposure: { value: 1 },
			// (Salt Life) under water the dome is the fog: the camera's far plane is just past the fog
			// there (App), so the dome shows where the sea floor would. skyFogColor: the fog's colour as
			// three hands it to its fog (in the space of the target drawn: the dome's onBeforeRender)
			skyUnderwater: G.cameraUnderwater,
			skyFogColor: { value: new THREE.Color() },
		};
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
		// small fill here; the water reflects it at full strength through its own envMapIntensity)
		this.levels = { sun: 3.2, sky: 0.25, env: 0.09 };
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
		if ( sunUp ) {

			const m = Math.max( T.r, T.g, T.b, 1e-6 );
			this.sun.color.setRGB( T.r / m, T.g / m, T.b / m );
			// (the square root: to the adapted eye a low sun reddens more than it dims; the full
			// transmittance left golden hour dull at this game's exposure)
			this.sun.intensity = this.levels.sun * Math.sqrt( m ) * horizonFade;

		} else {

			this.sun.color.copy( MOON );
			this.sun.intensity = 0.25 * night;

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
		_tint.setRGB( irr.r / il, irr.g / il, irr.b / il ).lerp( _c.setRGB( 1, 1, 1 ), 0.45 ).multiplyScalar( 0.68 );
		// (a floor: at dusk the adapted eye still sees the land by the sky's light)
		this.hemi.color.copy( _tint ).multiplyScalar( 0.32 + 0.68 * k ).lerp( MOON, night * 0.5 );
		this.hemi.intensity = this.levels.sky * ( 0.65 + 0.35 * day );
		this.hemi.groundColor.setRGB( 0.32, 0.28, 0.2 ).multiplyScalar( 0.1 + 0.9 * day );
		G.skyIrradiance.value.copy( this.hemi.color ).multiplyScalar( this.hemi.intensity );

		// eye adaptation: the sky's exposure rises as its irradiance falls below that of a sun 15 degrees
		// up (at most 6x, as Tidewater's auto exposure), at Tidewater's rates (1/s)
		const target = THREE.MathUtils.clamp( Math.pow( this._adaptRef / Math.max( luminance( irr ) + 0.004 * night, 1e-5 ), 0.6 ), 1, 6 );
		const jump = this._adaptSun.dot( dir ) < 0.9986; // a time of day jump (> 3 degrees): no adaptation
		this._adaptSun.copy( dir );
		this.adaptation = jump ? target : this.adaptation + ( target - this.adaptation ) * ( 1 - Math.exp( - dt * ( target > this.adaptation ? 1.6 : 1.1 ) ) );
		const skyAdapt = this.sceneAdaptation ? 1 : this.adaptation;
		this.uniforms.skyExposure.value = skyAdapt;

		// the horizon haze the fog fades into: the atmosphere's horizon (Tidewater's units, those of the
		// sky behind the island) and the moonlit sky's at night
		_c.copy( MOON_SKY ).multiplyScalar( night ).add( lit.horizon ).multiplyScalar( skyAdapt );
		this.fog.color.copy( _c );
		G.horizonColor.value.copy( _c );
		if ( this.scene.background && this.scene.background.isColor ) this.scene.background.copy( _c );

		this.scene.environmentIntensity = this.levels.env * ( 0.6 + 0.4 * day );

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
