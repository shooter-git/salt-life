import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';

// (M14) What a blow sets going along the ground: the island's dry litter, skittering over the sand and the
// paths in stops and surges with the gusts, from a fresh breeze up (Beaufort 5-6: "small trees sway",
// loose leaves and litter are blown along). Sea grape leaves (round, leathery, olive to rust), that stand up
// on their edges as they go faster and cartwheel, rolling as far as they run; dry palm leaflets, sliding
// and flipping; tufts of sargassum, hopping. As the flying debris is (fx/FlyingDebris.js: a hurricane's,
// in the air), they're placed by a hash of the instance in a box that wraps round the camera and carried
// along the wind, each at its own share of it and in its own stops and surges (the distance it's run a
// function of how far the wind has, never going back), lying on the ground; no simulation. On the land
// only, fewer where it's wet (rain sticks them down); none in the shelter's room. One instanced draw.
//   const litter = new BlownLitter( { terrain, tier } ); scene.add( litter.mesh );
//   litter.update( dt, camera, cameraWaterHeight )   (each frame)   litter.setRoom( matrix )

// m/s: the wind that starts them going, and all of them by
const WIND = [ 9, 17 ];
const COUNT = { low: 60, mid: 150, high: 240 };
// the box about the camera (m), the share of the wind's run each runs at (each its own), and the length of
// its stops and surges (m of the wind's run)
const BOX = 34, CARRY = [ 0.08, 0.2 ], SURGE = [ 6, 22 ];

const f = ( x ) => {

	const s = String( x );
	return /[.e]/.test( s ) ? s : s + '.0';

};

export class BlownLitter {

	constructor( { terrain, tier = 'high' } ) {

		const count = COUNT[ tier ] ?? COUNT.low;
		this.uniforms = {
			...THREE.UniformsUtils.clone( THREE.UniformsLib.fog ),
			...terrain.heightUniforms,
			litterCamPos: { value: new THREE.Vector3() },
			litterDrift: { value: new THREE.Vector2() }, // how far the wind's run (m, along x and z)
			litterRun: { value: 0 }, // and in all (m, whichever way)
			litterAmount: { value: 0 },
			litterSunDir: G.sunDir,
			litterSun: G.sunColor,
			litterSky: G.skyIrradiance,
			litterWindDir: G.windDir,
			litterSeaLevel: G.seaLevel,
			litterWet: G.wet,
			litterRoom: { value: new THREE.Matrix4().makeScale( 0, 0, 0 ).setPosition( 1e4, 1e4, 1e4 ) },
		};
		const vertexShader = /* glsl */`
#include <common>
#include <fog_pars_vertex>
${ terrain.heightGlsl }
uniform vec3 litterCamPos;
uniform vec2 litterDrift;
uniform float litterRun;
uniform float litterAmount;
uniform vec3 litterSunDir;
uniform vec3 litterSun;
uniform vec3 litterSky;
uniform vec2 litterWindDir;
uniform float litterSeaLevel;
uniform float litterWet;
uniform mat4 litterRoom;
varying vec2 vLitterUV;
varying vec4 vLitterCol; // radiance, opacity
varying float vLitterKind; // 0 sea grape leaf, 1 palm leaflet, 2 sargassum
vec4 litterHash4( float n ) { return fract( sin( vec4( n, n + 17.13, n + 43.71, n + 71.37 ) ) * vec4( 43758.5453, 22578.1459, 19642.3490, 31337.7217 ) ); }
float litterSs( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
void main() {
	float id = float( gl_InstanceID );
	vec4 h = litterHash4( id * 0.6131 + 0.71 );
	vec4 h2 = litterHash4( id * 1.7917 + 3.3 );
	// (wet, they stick: rain holds most of them down)
	float keep = clamp( ( litterAmount * ( 1.0 - 0.8 * litterWet ) - h.w ) * 6.0, 0.0, 1.0 );
	// what: half sea grape leaves, a third palm leaflets, the rest weed; their size (m: length, width)
	float kind = h2.x < 0.5 ? 0.0 : h2.x < 0.83 ? 1.0 : 2.0;
	vec2 size = kind < 0.5 ? vec2( mix( 0.1, 0.2, h2.y ) ) : kind < 1.5 ? vec2( mix( 0.3, 0.6, h2.y ), mix( 0.025, 0.045, h2.z ) ) : vec2( mix( 0.1, 0.22, h2.y ), mix( 0.08, 0.16, h2.z ) );
	// where: carried along the wind at its own share of it, in stops and surges (its run: carry ( D - L / 2pi
	// sin( 2pi D / L ) ), never going back), wrapped about the camera
	float carry = mix( ${ f( CARRY[ 0 ] ) }, ${ f( CARRY[ 1 ] ) }, h2.w ), L = mix( ${ f( SURGE[ 0 ] ) }, ${ f( SURGE[ 1 ] ) }, h.y );
	float phase = 6.2832 * ( litterRun / L + h.x * 7.0 );
	float surge = 1.0 - cos( phase ); // its pace (0 stopped .. 2), of its share
	vec2 run = litterDrift * carry - litterWindDir * carry * L / 6.2832 * sin( phase );
	vec2 local = ( fract( h.xz + ( run - litterCamPos.xz ) / ${ f( BOX ) } ) - 0.5 ) * ${ f( BOX ) };
	vec2 xz = litterCamPos.xz + local;
	float ground = terrainHeightAt( xz );
	// (on the land only, clear of the swash: none out on the water)
	keep *= litterSs( litterSeaLevel + 0.3, litterSeaLevel + 0.8, ground );
	vec3 W = vec3( litterWindDir.x, 0.0, litterWindDir.y ), side = vec3( - W.z, 0.0, W.x );
	// its pose: lying, turned its own way; going fast a leaf stands on its edge and rolls (its face across the
	// wind), a leaflet swings round to trail along it and flips, weed hops
	float yaw = h.z * 6.2832 + ( kind > 0.5 ? surge * 0.6 : 0.0 );
	vec3 lieA = vec3( cos( yaw ), 0.0, sin( yaw ) ), lieB = vec3( - lieA.z, 0.0, lieA.x );
	float up = kind < 0.5 ? litterSs( 0.7, 1.5, surge ) : 0.0;
	float roll = ( dot( litterDrift, litterWindDir ) * carry - L / 6.2832 * sin( phase ) * carry ) / max( size.x * 0.5, 0.03 );
	vec3 edgeA = W * cos( roll ) + vec3( 0.0, 1.0, 0.0 ) * sin( roll ), edgeB = W * - sin( roll ) + vec3( 0.0, 1.0, 0.0 ) * cos( roll );
	vec3 along = normalize( mix( kind > 0.5 ? normalize( mix( lieA, W, litterSs( 0.3, 1.2, surge ) ) ) : lieA, edgeA, up ) );
	vec3 across = normalize( mix( kind > 0.5 ? cross( vec3( 0.0, 1.0, 0.0 ), normalize( mix( lieA, W, litterSs( 0.3, 1.2, surge ) ) ) ) : lieB, edgeB, up ) );
	// (a leaflet flips now and then as it surges, a tuft of weed hops)
	float flip = kind > 0.5 && kind < 1.5 ? sin( phase * 2.0 + h.y * 9.0 ) * litterSs( 1.2, 1.9, surge ) : 0.0;
	across = normalize( across * cos( flip * 3.1 ) + vec3( 0.0, 1.0, 0.0 ) * sin( flip * 3.1 ) );
	float hop = kind > 1.5 ? max( 0.0, sin( phase * 3.0 + h.z * 5.0 ) ) * 0.12 * litterSs( 0.8, 1.6, surge ) : 0.0;
	vec3 p = vec3( xz.x, ground + 0.015 + up * size.x * 0.5 + hop, xz.y );
	// (none in the shelter's room)
	vec3 qr = ( litterRoom * vec4( p, 1.0 ) ).xyz;
	if ( all( lessThan( abs( qr ), vec3( 1.0 ) ) ) ) keep = 0.0;
	vec2 corner = position.xy; // plane is 2 x 2
	vec3 world = p + across * ( corner.x * size.y * 0.5 ) + along * ( corner.y * size.x * 0.5 );
	// lit from the sky and the sun on either face; darker wet
	vec3 n = normalize( cross( across, along ) );
	// ((dry: a sea grape leaf tan to rust, a leaflet straw, weed gold to brown), lit as the ground about them is)
	float sunK = abs( dot( n, litterSunDir ) ) * 0.85 + 0.1;
	vec3 albedo = kind < 0.5 ? mix( vec3( 0.46, 0.34, 0.16 ), vec3( 0.48, 0.22, 0.09 ), h.y * h.y ) : kind < 1.5 ? mix( vec3( 0.55, 0.45, 0.28 ), vec3( 0.42, 0.33, 0.2 ), h.z ) : mix( vec3( 0.45, 0.33, 0.1 ), vec3( 0.28, 0.19, 0.08 ), h.z );
	albedo *= mix( 1.0, 0.65, litterWet );
	vec3 col = albedo * ( litterSun * sunK * 0.8 + litterSky * 0.9 );
	// fades: the box's edges (before the wrap), and far off (they're small)
	float dist = length( cameraPosition - p );
	float edge = 1.0 - litterSs( ${ f( BOX * 0.36 ) }, ${ f( BOX * 0.5 ) }, max( abs( local.x ), abs( local.y ) ) );
	float a = keep * edge * litterSs( 0.3, 0.8, dist );
	vLitterUV = corner;
	vLitterCol = vec4( col, a );
	vLitterKind = kind;
	vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
	gl_Position = projectionMatrix * mvPosition;
	if ( a < 2e-3 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
	#include <fog_vertex>
}
`;
		// each in its shape: a sea grape leaf (round, notched at its stalk), a leaflet (a strip tapering to
		// its tip), a tuft of weed (a ragged clump of little blades and bladders)
		const fragmentShader = /* glsl */`
#include <common>
#include <fog_pars_fragment>
varying vec2 vLitterUV;
varying vec4 vLitterCol;
varying float vLitterKind;
void main() {
	vec2 uv = vLitterUV; // x across (-1..1), y along (-1..1)
	float a;
	if ( vLitterKind < 0.5 ) {
		float r = length( uv );
		a = step( r, 0.95 ) * ( 1.0 - step( length( uv - vec2( 0.0, 0.95 ) ), 0.22 ) );
	} else if ( vLitterKind < 1.5 ) {
		a = step( abs( uv.x ), 0.9 * ( 1.0 - max( uv.y, 0.0 ) * 0.85 ) );
	} else {
		// (a ragged clump, lobed and torn, with gaps through it)
		float ang = atan( uv.y, uv.x ), r = length( uv );
		float rim = 0.72 + 0.16 * sin( ang * 5.0 + 1.3 ) + 0.1 * sin( ang * 11.0 + 4.1 ) + 0.06 * sin( ang * 23.0 );
		float gaps = sin( uv.x * 9.0 + sin( uv.y * 7.0 ) * 2.0 ) * sin( uv.y * 8.0 - uv.x * 3.0 );
		a = step( r, rim ) * step( - 0.55, gaps );
	}
	// (fading in and out as a dither: they're drawn solid)
	float dither = fract( sin( dot( gl_FragCoord.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
	if ( a * vLitterCol.w <= dither ) discard;
	gl_FragColor = vec4( vLitterCol.rgb, 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}
`;
		this.material = new THREE.ShaderMaterial( {
			name: 'BlownLitter',
			uniforms: this.uniforms,
			vertexShader,
			fragmentShader,
			side: THREE.DoubleSide,
			fog: true,
		} );
		const plane = new THREE.PlaneGeometry( 2, 2 );
		const geo = new THREE.InstancedBufferGeometry();
		geo.index = plane.index;
		geo.setAttribute( 'position', plane.getAttribute( 'position' ) );
		geo.instanceCount = count;
		geo.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e5 );
		this.mesh = new THREE.Mesh( geo, this.material );
		this.mesh.name = 'BlownLitter';
		this.mesh.frustumCulled = false;
		this.mesh.matrixAutoUpdate = false;
		this.mesh.visible = false;

	}

	// cameraWaterHeight: water level at the camera (none drawn with the camera under water)
	update( dt, camera, cameraWaterHeight = 0 ) {

		const U = this.uniforms, ws = G.windSpeed.value;
		const amount = THREE.MathUtils.smoothstep( ws, WIND[ 0 ], WIND[ 1 ] );
		U.litterAmount.value = amount;
		// (the wind's run: they're carried by it only past the first of it, as they start)
		const d = U.litterDrift.value, s = Math.max( 0, ws - WIND[ 0 ] * 0.7 ) * dt;
		d.x = ( d.x + G.windDir.value.x * s ) % ( BOX * 1e4 );
		d.y = ( d.y + G.windDir.value.y * s ) % ( BOX * 1e4 );
		U.litterRun.value = ( U.litterRun.value + s ) % ( SURGE[ 0 ] * SURGE[ 1 ] * 1e3 );
		const visible = amount > 0 && camera.position.y > cameraWaterHeight;
		this.mesh.visible = visible;
		if ( ! visible ) return;
		U.litterCamPos.value.copy( camera.position );

	}

	// the shelter's room (StormPlaces.roomMatrix: the world into its box)
	setRoom( matrix ) {

		this.uniforms.litterRoom.value.copy( matrix );

	}

}
