import * as THREE from 'three';
import { G } from '../core/Globals.js';

const GNAT_SWARMS = 4, GNATS_PER_SWARM = 12, SEEDS = 48;
// (M10) a blow's debris: how many pieces, the wind it starts at and is all there by (m/s: a blustery
// day's coming on, a gale's), and the share of the 10 m wind they're blown along by, near the ground
const DEBRIS = 140, BLOW = [ 12, 18 ], DEBRIS_WIND = 0.8;
const VISIBILITY = 8;

const f = ( x ) => {

	const s = String( x );
	return s.includes( '.' ) || s.includes( 'e' ) ? s : s + '.0';

};

// Life in the air around the camera: dust and pollen motes, fine salt aerosol near the surf, a few
// drifting seed tufts and, rarely, a loose swarm of gnats hovering over the vegetation. Like
// MarineSnow the positions are procedural (hash of the instance) in a box that wraps around the
// camera: no simulation, no CPU work beyond a few uniforms. Everything drifts with the wind plus a
// slow per-particle swirl; the gnats hold station in small swarms and dart around in loops.
// The specks are far smaller than a pixel: each is drawn at least ~1.2 px wide with its opacity
// scaled by the coverage of the real particle, so it neither flickers nor turns into a blob. They
// are lit per particle (vertex stage) by the sun through a forward-scattering phase function:
// nearly invisible most of the time, they light up when backlit in the sun against a dark
// background. Drawn premultiplied; one instanced draw.
//
// (Salt Life) On three's WebGL 2, mid and high only (fewer on mid). Without Tidewater's shadow
// cascades, clouds' and hill's shadows at each speck: the sun reaches them all.
// (M10) In a blow, its debris too: torn bits of leaf tumbling along up to head height, and sand streaming
// low over the beach, blown far faster than the motes (their own drift); none below a blustery wind.
//
//   const motes = new AirMotes( { terrain, tier } ); scene.add( motes.mesh );
//   motes.update( dt, camera, cameraWaterHeight, viewHeight )   (each frame)

// ((M10) and the debris's besides: as many motes as ever on a fair day)
const COUNT = { mid: 1500 + DEBRIS, high: 3000 + DEBRIS };

export class AirMotes {

	// terrain: the Terrain (its heightGlsl / heightUniforms)
	constructor( { terrain, tier = 'high', box = 12 } ) {

		const count = COUNT[ tier ] ?? COUNT.high;
		this.box = box;
		this.windScale = 0.25; // near the ground, among the plants: a fraction of the 10 m wind
		this.uniforms = {
			...THREE.UniformsUtils.clone( THREE.UniformsLib.fog ),
			...terrain.heightUniforms,
			airCamPos: { value: new THREE.Vector3() },
			airDrift: { value: new THREE.Vector2() }, // wind drift, wrapped to the box (m)
			airDebrisDrift: { value: new THREE.Vector2() }, // (M10) the debris's, blown faster
			airIntensity: { value: 1 },
			airViewHeight: { value: 720 },
			airTime: G.time,
			airSunDir: G.sunDir,
			airSun: G.sunColor,
			airSky: G.skyIrradiance,
			airNight: G.night,
			airWindDir: G.windDir,
			airWindSpeed: G.windSpeed,
			airSeaLevel: G.seaLevel,
			// ((M13) the world into the shelter's room: no blow's debris in there)
			airRoom: { value: new THREE.Matrix4().makeScale( 0, 0, 0 ).setPosition( 1e4, 1e4, 1e4 ) },
		};
		const B = f( box ), NG = GNAT_SWARMS * GNATS_PER_SWARM;

		const vertexShader = /* glsl */`
#include <common>
#include <fog_pars_vertex>
${ terrain.heightGlsl }
uniform vec3 airCamPos;
uniform vec2 airDrift;
uniform vec2 airDebrisDrift;
uniform float airIntensity;
uniform float airViewHeight;
uniform float airTime;
uniform vec3 airSunDir;
uniform vec3 airSun;
uniform vec3 airSky;
uniform float airNight;
uniform vec2 airWindDir;
uniform float airWindSpeed;
uniform float airSeaLevel;
uniform mat4 airRoom;
varying vec4 vAirCol; // radiance, opacity
varying vec2 vAirUV; // quad corner
vec3 airHash3( float n ) { return fract( sin( vec3( n, n + 17.13, n + 43.71 ) ) * vec3( 43758.5453, 22578.1459, 19642.3490 ) ); }
// Henyey-Greenstein phase (1/sr)
float airPhaseHG( float cosT, float g ) { return ( ( 1.0 - g * g ) / ( 4.0 * PI ) ) / pow( max( 1.0 + g * g - cosT * 2.0 * g, 1e-4 ), 1.5 ); }
float airSs( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
void main() {
	float id = float( gl_InstanceID );
	vec3 h = airHash3( id * 0.7131 + 0.37 );
	vec3 h2 = airHash3( id * 1.3917 + 5.1 );
	vec3 h3 = airHash3( id * 2.1733 + 11.7 );
	bool isGnat = id < ${ f( NG ) };
	bool isSeed = id >= ${ f( NG ) } && id < ${ f( NG + SEEDS ) };
	// (M10) a blow's debris: torn leaf (the first half of them) and sand
	bool isDebris = id >= ${ f( NG + SEEDS ) } && id < ${ f( NG + SEEDS + DEBRIS ) };
	bool isLeaf = isDebris && h2.z < 0.5;
	float blow = airSs( ${ f( BLOW[ 0 ] ) }, ${ f( BLOW[ 1 ] ) }, airWindSpeed );
	float t = airTime;
	float Bx = ${ B };

	// ---- where: wrapped around the camera. Gnats: a swarm home fixed in the world (no drift)
	float sid = floor( id / ${ f( GNATS_PER_SWARM ) } );
	vec3 hs = airHash3( sid * 3.917 + 1.3 );
	vec2 home = isGnat ? hs.xz : h.xz;
	vec2 drift = isGnat ? vec2( 0.0 ) : isDebris ? airDebrisDrift : airDrift;
	vec2 local = ( fract( home + ( drift - airCamPos.xz ) / Bx ) - 0.5 ) * Bx;
	vec2 xz0 = airCamPos.xz + local;
	float ht = terrainHeightAt( xz0 );
	float hA = ht - airSeaLevel;

	// ---- motion: slow swirl (two octaves, random phases); gnats dart in loops
	vec3 ph = h3 * 6.2832;
	vec3 w1 = h2 * 0.5 + 0.35; // rad/s
	vec3 w2 = h2.zxy * 1.4 + 1.5;
	vec3 A1 = vec3( 0.45, 0.22, 0.45 ) * ( isSeed ? 1.6 : isLeaf ? 2.2 : 1.0 );
	vec3 A2 = vec3( 0.07, 0.05, 0.07 );
	vec3 swirl = sin( w1 * t + ph ) * A1 + sin( w2 * t + ph.zxy ) * A2;
	vec3 gw = h2 * 2.2 + 1.8;
	vec3 gA = vec3( 0.3, 0.2, 0.3 ) * ( h3.x * 0.6 + 0.6 );
	vec3 gnatOff = ( h - 0.5 ) * vec3( 0.9, 0.6, 0.9 ) + sin( gw * t + ph ) * gA + sin( gw.zxy * ( t * 1.7 ) + ph.yzx ) * ( gA * 0.45 );
	vec3 off = isGnat ? gnatOff : swirl;

	// height above the ground (or the sea): mostly low down, seeds and gnats in the first metres
	float ground = max( ht, airSeaLevel + 0.25 );
	float yMote = pow( h.y, 1.8 ) * 6.5 + 0.2;
	float ySeed = h.y * 2.5 + 0.3;
	float yGnat = hs.y * 1.4 + 0.8;
	float yDebris = isLeaf ? h.y * 2.2 + 0.3 : h.y * h.y * 0.5 + 0.05; // (leaf tumbling, sand streaming low)
	float y = ground + ( isGnat ? yGnat : isSeed ? ySeed : isDebris ? yDebris : yMote );
	vec3 p = vec3( xz0.x, y, xz0.y ) + off;

	// ---- how many live here: most over the beach and the plants, very few far out over the sea,
	// fewer at night; gnats only inland over the vegetation, in a few places (per world tile)
	float land = airSs( 0.3, 1.5, hA );
	float shore = airSs( -7.0, -2.0, hA );
	float day = 1.0 - airNight * 0.75;
	vec2 tile = floor( xz0 / Bx );
	float tileHash = fract( sin( dot( tile, vec2( 12.9898, 78.233 ) ) + sid * 7.31 ) * 43758.5453 );
	float dMote = max( max( land * 0.85, shore ), 0.06 ) * day;
	float dSeed = land * day;
	float dGnat = airSs( 1.5, 4.0, hA ) * ( tileHash < 0.3 ? 1.0 : 0.0 ) * ( 1.0 - airNight );
	// (the debris over the land and the beach, in a blow)
	float dDebris = max( land, shore * 0.8 ) * blow;
	float density = isGnat ? dGnat : isSeed ? dSeed : isDebris ? dDebris : dMote;
	float keep = clamp( ( density - ( isGnat ? 0.5 : h3.y ) ) * 8.0, 0.0, 1.0 );
	// ((M13) a blow's debris stays out of the shelter's room)
	if ( isDebris && all( lessThan( abs( ( airRoom * vec4( p, 1.0 ) ).xyz ), vec3( 1.0 ) ) ) ) keep = 0.0;

	// ---- what: salt aerosol near the surf / over the sea, dust and pollen over the land
	float salt = 1.0 - airSs( -0.5, 0.8, hA );
	// (the size of what catches the eye in film: lint, pollen clumps, bits of plant, sea salt crystals)
	float rMote = mix( 0.00015, 0.0005, h2.x * h2.x ) * mix( 1.0, 0.6, salt ) * ( h2.y > 0.96 ? 2.2 : 1.0 );
	float r = isGnat ? mix( 0.0008, 0.0011, h2.x ) : isSeed ? mix( 0.0025, 0.0045, h2.x ) : isLeaf ? mix( 0.006, 0.014, h2.x ) : isDebris ? mix( 0.0004, 0.0009, h2.x ) : rMote;

	// ---- lighting (per particle): forward-scattering phase
	vec3 toCam = cameraPosition - p;
	float dist = max( length( toCam ), 0.05 );
	vec3 Vd = toCam / dist;
	float cosT = - dot( Vd, airSunDir ); // 1 = looking toward the sun through the particle
	vec3 sun = airSun;
	// diffraction + refraction: a strong forward lobe with a narrow glint core, a weak broad part
	// (the broad part keeps sunlit motes faintly visible from the side against shade)
	float phDust = airPhaseHG( cosT, 0.93 ) * 0.22 + airPhaseHG( cosT, 0.7 ) * 0.43 + airPhaseHG( cosT, 0.15 ) * 0.35;
	float phSalt = airPhaseHG( cosT, 0.93 ) * 0.35 + airPhaseHG( cosT, 0.75 ) * 0.5 + airPhaseHG( cosT, 0.2 ) * 0.15;
	float phMote = mix( phDust, phSalt, salt );
	vec3 albMote = mix( vec3( 0.95, 0.85, 0.66 ), vec3( 1.0 ), salt );
	vec3 cMote = albMote * ( sun * phMote + airSky * 0.2 );
	// seed tufts: white fluff, diffuse from any side plus a forward glow
	vec3 cSeed = sun * ( airPhaseHG( cosT, 0.55 ) * 0.8 + 0.05 ) + airSky * 0.35;
	// gnats: dark bodies (specks against the sky), wings that catch the light when backlit
	vec3 cGnat = sun * ( airPhaseHG( cosT, 0.9 ) * 0.12 ) + airSky * 0.02;
	// (M10) torn leaf: green to dry brown, lit from any side; sand: pale, a glint against the sun
	vec3 cLeaf = mix( vec3( 0.16, 0.22, 0.08 ), vec3( 0.36, 0.28, 0.16 ), h3.z ) * ( sun * ( max( dot( airSunDir, vec3( 0.0, 1.0, 0.0 ) ), 0.0 ) * 0.25 + 0.04 ) + airSky * 0.5 );
	vec3 cSand = vec3( 0.95, 0.88, 0.72 ) * ( sun * phDust + airSky * 0.3 );
	vec3 col = isGnat ? cGnat : isSeed ? cSeed : isLeaf ? cLeaf : isDebris ? cSand : cMote;

	// ---- footprint: at least ~1.2 px wide, opacity = the real particle's coverage of it
	float pixel = dist * 2.0 / ( projectionMatrix[ 1 ][ 1 ] * airViewHeight );
	float size = max( r, pixel * 1.2 );
	// (x VISIBILITY: in film these read larger than they are, defocused and bloomed)
	float rs = r / size;
	float cover = min( rs * rs * ${ f( 3.5 * VISIBILITY ) }, 1.0 );
	// fades: box edges (before the wrap), right in front of the lens, near the water surface
	float edge = 1.0 - airSs( Bx * 0.36, Bx * 0.5, max( abs( p.x - airCamPos.x ), abs( p.z - airCamPos.z ) ) );
	float fade = edge * ( 1.0 - airSs( Bx * 0.3, Bx * 0.5, dist ) ) * airSs( 0.12, 0.5, dist ) * airSs( 0.25, 0.9, p.y - airSeaLevel );
	float a = cover * fade * keep * airIntensity;

	// camera-facing quad
	vec3 right = normalize( cross( vec3( 0.0, 1.0, 0.0 ), Vd ) + vec3( 1e-5, 0.0, 0.0 ) );
	vec3 up = cross( Vd, right );
	vec2 corner = position.xy; // plane is 2 x 2: half-width = size
	vec3 world = p + right * ( corner.x * size ) + up * ( corner.y * size );
	vAirCol = vec4( col, a );
	vAirUV = corner;
	vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
	gl_Position = projectionMatrix * mvPosition;
	// nothing to draw: off the screen
	if ( a < 2e-4 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
	#include <fog_vertex>
}
`;

		// gaussian speck cut at its core (the cut tails' energy is folded into the core: 1 / 0.65)
		const fragmentShader = /* glsl */`
#include <common>
#include <fog_pars_fragment>
varying vec4 vAirCol;
varying vec2 vAirUV;
void main() {
	float g = exp( dot( vAirUV, vAirUV ) * -3.5 );
	float a = min( vAirCol.w * g / 0.65, 1.0 );
	if ( g < 0.35 || a < 0.003 ) discard;
	gl_FragColor = vec4( vAirCol.rgb * a, a );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
#ifdef USE_FOG
	// (premultiplied: the fog's colour by the particle's coverage; materials/HeightHaze.js)
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * gl_FragColor.a, sceneFogFactor() );
#endif
}
`;

		this.material = new THREE.ShaderMaterial( {
			name: 'AirMotes',
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
		this.mesh.name = 'AirMotes';
		this.mesh.frustumCulled = false;
		this.mesh.matrixAutoUpdate = false;
		this.mesh.renderOrder = 21;

	}

	// cameraWaterHeight: water level at the camera (none drawn with the camera under water)
	update( dt, camera, cameraWaterHeight = 0, viewHeight = 720 ) {

		const U = this.uniforms;
		const visible = U.airIntensity.value > 0 && camera.position.y > cameraWaterHeight;
		this.mesh.visible = visible;
		if ( ! visible ) return;
		U.airCamPos.value.copy( camera.position );
		U.airViewHeight.value = viewHeight;
		const s = G.windSpeed.value * this.windScale * dt;
		const d = U.airDrift.value;
		d.x = ( d.x + G.windDir.value.x * s ) % this.box;
		d.y = ( d.y + G.windDir.value.y * s ) % this.box;
		// (M10) the debris, blown along faster
		const sd = G.windSpeed.value * DEBRIS_WIND * dt, dd = U.airDebrisDrift.value;
		dd.x = ( dd.x + G.windDir.value.x * sd ) % this.box;
		dd.y = ( dd.y + G.windDir.value.y * sd ) % this.box;

	}

	// (M13) the shelter's room (StormPlaces.roomMatrix: the world into its box)
	setRoom( matrix ) {

		this.uniforms.airRoom.value.copy( matrix );

	}

	dispose() {

		this.mesh.geometry.dispose();
		this.material.dispose();

	}

}
