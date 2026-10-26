import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';

// (M13) What a hurricane's wind tears off and carries: bits of palm frond, leaves and twigs, tumbling
// past from about a strong gale's wind (Beaufort 10: "trees uprooted, considerable structural damage";
// a Category 1 strips fronds and branches, and drives them along at the wind's speed). As the air motes
// are (fx/AirMotes.js), they're placed by a hash of the instance in a box that wraps around the camera,
// blown along it (each at its own share of the wind) and tumbling about an axis of their own: no
// simulation. Each is a flat piece drawn in its own shape (a strip of frond with its leaflets, a leaf, a
// twig), lit from the sky and the sun on either face, in the fog. Over the land and the shore, fewer out
// over the sea; none in a lesser wind. One instanced draw, held out of the load's compile with the
// rain's (App).
//   const debris = new FlyingDebris( { terrain, tier } ); scene.add( debris.mesh );
//   debris.update( dt, camera, cameraWaterHeight )   (each frame)

// m/s: the wind they're torn off in, and all of them by
const WIND = [ 24, 34 ];
const COUNT = { low: 18, mid: 40, high: 72 };
// the box about the camera (m: across, and its height above the ground), and the share of the 10 m wind
// they're carried at (each its own, from the first to the second)
const BOX = 70, HEIGHT = 12, CARRY = [ 0.55, 0.9 ];

const f = ( x ) => {

	const s = String( x );
	return /[.e]/.test( s ) ? s : s + '.0';

};

export class FlyingDebris {

	constructor( { terrain, tier = 'high' } ) {

		const count = COUNT[ tier ] ?? COUNT.low;
		this.uniforms = {
			...THREE.UniformsUtils.clone( THREE.UniformsLib.fog ),
			...terrain.heightUniforms,
			debrisCamPos: { value: new THREE.Vector3() },
			debrisDrift: { value: new THREE.Vector2() }, // how far the air's carried them (m, along x and z)
			debrisTime: { value: 0 },
			debrisAmount: { value: 0 },
			debrisSunDir: G.sunDir,
			debrisSun: G.sunColor,
			debrisSky: G.skyIrradiance,
			debrisWindDir: G.windDir,
			debrisSeaLevel: G.seaLevel,
			debrisWet: G.wet,
			// (the world into the shelter's room: none flies in there, App's setRoom)
			debrisRoom: { value: new THREE.Matrix4().makeScale( 0, 0, 0 ).setPosition( 1e4, 1e4, 1e4 ) },
		};
		const vertexShader = /* glsl */`
#include <common>
#include <fog_pars_vertex>
${ terrain.heightGlsl }
uniform vec3 debrisCamPos;
uniform vec2 debrisDrift;
uniform float debrisTime;
uniform float debrisAmount;
uniform vec3 debrisSunDir;
uniform vec3 debrisSun;
uniform vec3 debrisSky;
uniform vec2 debrisWindDir;
uniform float debrisSeaLevel;
uniform float debrisWet;
uniform mat4 debrisRoom;
varying vec2 vDebrisUV;
varying vec4 vDebrisCol; // radiance, opacity
varying float vDebrisKind; // 0 frond, 1 leaf, 2 twig
vec4 debrisHash4( float n ) { return fract( sin( vec4( n, n + 17.13, n + 43.71, n + 71.37 ) ) * vec4( 43758.5453, 22578.1459, 19642.3490, 31337.7217 ) ); }
float debrisSs( float a, float b, float x ) { float t = clamp( ( x - a ) / ( b - a ), 0.0, 1.0 ); return t * t * ( 3.0 - 2.0 * t ); }
void main() {
	float id = float( gl_InstanceID );
	vec4 h = debrisHash4( id * 0.7131 + 0.37 );
	vec4 h2 = debrisHash4( id * 1.3917 + 5.1 );
	// how many are about: the wind's, the first of them in a strong gale
	float keep = clamp( ( debrisAmount - h.w ) * 6.0, 0.0, 1.0 );
	// what: half frond strips, a third leaves, the rest twigs; their size (m: length, width)
	float kind = h2.x < 0.5 ? 0.0 : h2.x < 0.83 ? 1.0 : 2.0;
	vec2 size = kind < 0.5 ? vec2( mix( 0.5, 1.3, h2.y ), mix( 0.2, 0.38, h2.z ) ) : kind < 1.5 ? vec2( mix( 0.12, 0.28, h2.y ), mix( 0.06, 0.14, h2.z ) ) : vec2( mix( 0.25, 0.7, h2.y ), mix( 0.02, 0.04, h2.z ) );
	// where: wrapped about the camera, carried along the wind at its own share of it
	float carry = mix( ${ f( CARRY[ 0 ] ) }, ${ f( CARRY[ 1 ] ) }, h2.w );
	vec2 local = ( fract( h.xz + ( debrisDrift * carry - debrisCamPos.xz ) / ${ f( BOX ) } ) - 0.5 ) * ${ f( BOX ) };
	vec2 xz = debrisCamPos.xz + local;
	float ground = max( terrainHeightAt( xz ), debrisSeaLevel );
	float t = debrisTime;
	// (low, mostly: skipping and lifting in the gusts)
	float y = ground + 0.3 + h.y * h.y * ${ f( HEIGHT ) } + sin( t * ( 0.7 + h2.z ) + h.x * 40.0 ) * ( 0.4 + h.y * 1.5 );
	vec3 p = vec3( xz.x, y, xz.y );
	// (fewer out over the sea: what's torn off the island's trees, out past its shore)
	float land = debrisSs( debrisSeaLevel - 3.0, debrisSeaLevel + 0.5, terrainHeightAt( xz ) );
	keep *= mix( 0.35, 1.0, land );
	// (none in the shelter's room)
	vec3 qr = ( debrisRoom * vec4( p, 1.0 ) ).xyz;
	if ( all( lessThan( abs( qr ), vec3( 1.0 ) ) ) ) keep = 0.0;
	// tumbling: its length turns about an axis of its own, as fast as it's small
	vec3 axis = normalize( debrisHash4( id * 3.71 + 2.3 ).xyz - 0.5 + vec3( 0.0, 1e-3, 0.0 ) );
	float spin = ( 2.0 + h2.z * 6.0 ) * ( kind > 0.5 ? 1.6 : 1.0 ) * t + h.x * 6.2832;
	vec3 a0 = normalize( cross( axis, vec3( 0.31, 0.83, 0.47 ) ) );
	vec3 a1 = cross( axis, a0 );
	vec3 along = a0 * cos( spin ) + a1 * sin( spin );
	vec3 across = normalize( cross( axis, along ) * 0.7 + vec3( debrisWindDir.x, 0.0, debrisWindDir.y ) * 0.3 );
	vec2 corner = position.xy; // plane is 2 x 2
	vec3 world = p + across * ( corner.x * size.y * 0.5 ) + along * ( corner.y * size.x * 0.5 );
	// lit from the sky and the sun on either face; green to dry brown, darker wet
	vec3 n = normalize( cross( across, along ) );
	float sunK = abs( dot( n, debrisSunDir ) ) * 0.6 + 0.15;
	vec3 albedo = kind < 1.5 ? mix( vec3( 0.13, 0.2, 0.06 ), vec3( 0.34, 0.27, 0.13 ), h.z ) : vec3( 0.22, 0.16, 0.1 );
	albedo *= mix( 1.0, 0.7, debrisWet );
	vec3 col = albedo * ( debrisSun * sunK * 0.35 + debrisSky * 0.75 );
	// fades: the box's edges (before the wrap), right in front of the lens
	float dist = length( cameraPosition - p );
	float edge = 1.0 - debrisSs( ${ f( BOX * 0.36 ) }, ${ f( BOX * 0.5 ) }, max( abs( local.x ), abs( local.y ) ) );
	float a = keep * edge * debrisSs( 0.4, 1.5, dist );
	vDebrisUV = corner;
	vDebrisCol = vec4( col, a );
	vDebrisKind = kind;
	vec4 mvPosition = viewMatrix * vec4( world, 1.0 );
	gl_Position = projectionMatrix * mvPosition;
	if ( a < 2e-3 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );
	#include <fog_vertex>
}
`;
		// each in its shape: a frond's strip (its midrib and its leaflets angled off it, torn ragged), a
		// leaf (pointed at both ends), a twig (a thin stick)
		const fragmentShader = /* glsl */`
#include <common>
#include <fog_pars_fragment>
varying vec2 vDebrisUV;
varying vec4 vDebrisCol;
varying float vDebrisKind;
void main() {
	vec2 uv = vDebrisUV; // x across (-1..1), y along (-1..1)
	float a;
	if ( vDebrisKind < 0.5 ) {
		float rib = step( abs( uv.x ), 0.07 );
		float leaflets = step( fract( uv.y * 7.0 + abs( uv.x ) * 1.6 ), 0.42 ) * step( abs( uv.x ), 0.95 - 0.35 * abs( uv.y ) );
		float ragged = step( 0.25, fract( sin( floor( uv.y * 7.0 + abs( uv.x ) * 1.6 ) * 91.7 + sign( uv.x ) * 13.1 ) * 437.5 ) );
		a = max( rib, leaflets * ragged );
	} else if ( vDebrisKind < 1.5 ) {
		a = step( abs( uv.x ), 1.0 - uv.y * uv.y );
	} else {
		a = step( abs( uv.x ), 0.8 );
	}
	a *= vDebrisCol.w;
	if ( a < 0.01 ) discard;
	gl_FragColor = vec4( vDebrisCol.rgb, 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	gl_FragColor.a = a;
}
`;
		this.material = new THREE.ShaderMaterial( {
			name: 'FlyingDebris',
			uniforms: this.uniforms,
			vertexShader,
			fragmentShader,
			transparent: true,
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
		this.mesh.name = 'FlyingDebris';
		this.mesh.frustumCulled = false;
		this.mesh.matrixAutoUpdate = false;
		this.mesh.renderOrder = 21;
		this.mesh.visible = false;

	}

	// cameraWaterHeight: water level at the camera (none drawn with the camera under water)
	update( dt, camera, cameraWaterHeight = 0 ) {

		const U = this.uniforms, ws = G.windSpeed.value;
		const amount = THREE.MathUtils.smoothstep( ws, WIND[ 0 ], WIND[ 1 ] );
		U.debrisAmount.value = amount;
		const d = U.debrisDrift.value, s = ws * dt;
		// (wrapped to the box at every share of the wind they're carried at: CARRY's an integer's worth of
		// boxes apart only by chance, so kept unwrapped well past any session's drift, and wrapped far out)
		d.x = ( d.x + G.windDir.value.x * s ) % ( BOX * 1e4 );
		d.y = ( d.y + G.windDir.value.y * s ) % ( BOX * 1e4 );
		U.debrisTime.value = ( U.debrisTime.value + dt ) % 3600;
		const visible = amount > 0 && camera.position.y > cameraWaterHeight;
		this.mesh.visible = visible;
		if ( ! visible ) return;
		U.debrisCamPos.value.copy( camera.position );

	}

	// (M13) the shelter's room (StormPlaces.roomMatrix: the world into its box)
	setRoom( matrix ) {

		this.uniforms.debrisRoom.value.copy( matrix );

	}

	dispose() {

		this.mesh.geometry.dispose();
		this.material.dispose();

	}

}
