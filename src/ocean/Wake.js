import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';

// The boat's wake: foam left behind the hull. Tidewater simulated a Kelvin wake on a 512² grid with
// compute shaders; here the boat sheds patches of lacy foam at its quarters (spreading outward, the
// arms of the wake) and astern (the propeller wash), which ride the waves, spread and fade.
// One instanced draw of soft quads.

const MAX = 160;
const LIFE = 9; // s

export class Wake {

	// boat: BoatController (position, velocity, getYaw(), rpm, throttle); waves: Waves (heights)
	constructor( { scene, boat, waves, tier = 'low' } ) {

		this.boat = boat;
		this.waves = waves;
		this.max = tier === 'low' ? 80 : MAX;
		const geo = new THREE.PlaneGeometry( 1, 1 ).rotateX( - Math.PI / 2 );
		const inst = new THREE.InstancedBufferGeometry().copy( geo );
		this.data = new Float32Array( this.max * 4 ); // x, z, age, seed
		this.attr = new THREE.InstancedBufferAttribute( this.data, 4 ).setUsage( THREE.DynamicDrawUsage );
		inst.setAttribute( 'puff', this.attr );
		this.size = new Float32Array( this.max * 2 ); // start size, spread rate
		this.sizeAttr = new THREE.InstancedBufferAttribute( this.size, 2 ).setUsage( THREE.DynamicDrawUsage );
		inst.setAttribute( 'puffSize', this.sizeAttr );
		this.heights = new Float32Array( this.max );
		this.heightAttr = new THREE.InstancedBufferAttribute( this.heights, 1 ).setUsage( THREE.DynamicDrawUsage );
		inst.setAttribute( 'puffY', this.heightAttr );
		this.vel = new Float32Array( this.max * 2 );
		for ( let i = 0; i < this.max; i ++ ) this.data[ i * 4 + 2 ] = LIFE; // all expired
		inst.instanceCount = this.max;

		this.material = new THREE.ShaderMaterial( {
			uniforms: THREE.UniformsUtils.merge( [ THREE.UniformsLib.fog, {
				wakeLife: { value: LIFE },
			} ] ),
			vertexShader: /* glsl */`
#include <common>
#include <fog_pars_vertex>
attribute vec4 puff;
attribute vec2 puffSize;
attribute float puffY;
uniform float wakeLife;
varying vec2 vUv;
varying float vFade;
varying float vSeed;
void main() {
	float age = puff.z;
	float s = puffSize.x + puffSize.y * age;
	vec3 p = vec3( position.x * s + puff.x, puffY + 0.03, position.z * s + puff.y );
	vUv = uv;
	vSeed = puff.w;
	vFade = age < wakeLife ? ( 1.0 - age / wakeLife ) * min( age * 4.0, 1.0 ) : 0.0;
	vec4 mvPosition = viewMatrix * vec4( p, 1.0 );
	gl_Position = projectionMatrix * mvPosition;
	#include <fog_vertex>
}`,
			fragmentShader: /* glsl */`
#include <common>
#include <fog_pars_fragment>
uniform vec3 wakeLight;
varying vec2 vUv;
varying float vFade;
varying float vSeed;
float wakeNoise( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	float a = fract( sin( dot( i, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float b = fract( sin( dot( i + vec2( 1.0, 0.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float c = fract( sin( dot( i + vec2( 0.0, 1.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	float d = fract( sin( dot( i + vec2( 1.0, 1.0 ), vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}
void main() {
	if ( vFade <= 0.0 ) discard;
	vec2 q = vUv * 2.0 - 1.0;
	float r = length( q );
	vec2 o = vec2( vSeed * 37.0, vSeed * 91.0 );
	float n = wakeNoise( q * 3.0 + o ) * 0.6 + wakeNoise( q * 8.0 + o * 1.7 ) * 0.4;
	// lacy patch: dense at the middle, a net of bubbles toward the rim, thinning as it ages
	float cover = ( 1.0 - smoothstep( 0.35, 1.0, r ) ) * vFade;
	float a = smoothstep( 1.0 - cover, 1.0 - cover + 0.25, n ) * 0.85;
	if ( a < 0.01 ) discard;
	gl_FragColor = vec4( wakeLight, a );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,
			transparent: true,
			depthWrite: false,
			fog: true,
		} );
		this.material.uniforms.wakeLight = { value: new THREE.Color() };
		this.mesh = new THREE.Mesh( inst, this.material );
		this.mesh.name = 'Wake';
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 2; // over the water
		scene.add( this.mesh );
		this._next = 0;
		this._t = 0;
		this._fwd = new THREE.Vector3();

	}

	_spawn( x, z, vx, vz, size, spread ) {

		const i = this._next;
		this._next = ( i + 1 ) % this.max;
		this.data[ i * 4 ] = x;
		this.data[ i * 4 + 1 ] = z;
		this.data[ i * 4 + 2 ] = 0;
		this.data[ i * 4 + 3 ] = Math.random();
		this.size[ i * 2 ] = size;
		this.size[ i * 2 + 1 ] = spread;
		this.vel[ i * 2 ] = vx;
		this.vel[ i * 2 + 1 ] = vz;

	}

	update( dt ) {

		const b = this.boat;
		const speed = b.velocity ? Math.hypot( b.velocity.x, b.velocity.z ) : 0;
		const yaw = b.getYaw();
		const fx = Math.sin( yaw ), fz = Math.cos( yaw ); // the boat's forward (+Z in its frame)
		const rx = fz, rz = - fx; // its port side
		const p = b.model.group.position;
		// shed foam with distance travelled: the faster, the more
		this._t += dt * ( speed > 0.8 ? speed * 0.9 + ( b.rpm || 0 ) * 3 : 0 );
		while ( this._t > 1 ) {

			this._t -= 1;
			const jitter = ( Math.random() - 0.5 ) * 0.6;
			// the arms of the wake at the quarters, spreading out sideways
			for ( const side of [ - 1, 1 ] ) this._spawn( p.x - fx * 2.0 + rx * side * 1.5, p.z - fz * 2.0 + rz * side * 1.5, rx * side * 0.9, rz * side * 0.9, 1.0 + jitter * 0.3, 0.45 );
			// the propeller wash astern
			this._spawn( p.x - fx * 4.2 + rx * jitter, p.z - fz * 4.2 + rz * jitter, - fx * 0.4, - fz * 0.4, 1.6, 0.35 );

		}

		const t = G.time.value;
		for ( let i = 0; i < this.max; i ++ ) {

			const age = this.data[ i * 4 + 2 ];
			if ( age >= LIFE ) continue;
			this.data[ i * 4 + 2 ] = age + dt;
			const damp = Math.exp( - age * 0.4 );
			this.data[ i * 4 ] += this.vel[ i * 2 ] * dt * damp;
			this.data[ i * 4 + 1 ] += this.vel[ i * 2 + 1 ] * dt * damp;
			this.heights[ i ] = this.waves.heightAt( this.data[ i * 4 ], this.data[ i * 4 + 1 ], t );

		}

		this.attr.needsUpdate = true;
		this.sizeAttr.needsUpdate = true;
		this.heightAttr.needsUpdate = true;
		// lit like the foam on the water: the sun by its height in the sky, the sky's fill
		const L = this.material.uniforms.wakeLight.value;
		L.copy( G.sunColor.value ).multiplyScalar( Math.max( G.sunDir.value.y, 0 ) ).add( G.skyIrradiance.value ).multiplyScalar( 0.9 );

	}

}
