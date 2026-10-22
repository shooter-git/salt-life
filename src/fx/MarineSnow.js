import * as THREE from 'three';
import { G } from '../core/Globals.js';

// Suspended particles in the water around the camera (marine snow, plankton, sand grains).
// Positions are procedural (hash of the instance) inside a box that wraps around the camera, so
// there is no simulation and no CPU work. The particles drift with a slow current and sway back
// and forth with the orbital motion of the passing swell (decaying with depth). Only drawn while
// the camera is under water, and only below the surface (when the waterline crosses the lens, none
// float in the air half). The specks are tiny depth-writing discs in the opaque pass, so the
// underwater fog treats each one at its own distance.
//
// (Salt Life) Tidewater's WebGPU material on three's WebGL 2: one instanced quad, the swell from
// the Gerstner waves (ocean/Waves.js) instead of the FFT cascades, the diver's torch from
// LocalLights' flashlight. Its TAA smoothed specks smaller than a pixel; here each speck is drawn
// at least ~1.5 px across, dimmed as it shrinks, so none flicker in and out. Fewer on weaker tiers.
//
//   const snow = new MarineSnow( { waves, tier } ); scene.add( snow.mesh );
//   snow.update( camera, underwater, viewHeight, flashlight )  (each frame)

const TIER = {
	low: { count: 2500, box: 6 },
	mid: { count: 6000, box: 7 },
	high: { count: 12000, box: 8 },
};

const VERTEX = /* glsl */`
#include <fog_pars_vertex>
uniform vec3 snowCamPos;
uniform float snowBox;
uniform float snowSeaLevel;
uniform float snowViewHeight;
uniform vec3 snowAbsorption;
uniform vec3 snowScattering;
uniform float flashOn;
uniform vec3 flashPos;
uniform vec3 flashDir;
uniform vec3 flashCol;
uniform vec2 flashCone; // cos inner, cos outer
varying vec2 vUv;
varying float vFade;
varying float vDepth;
varying float vDim;
varying float vPx;
varying vec3 vTorch;

// hash3 of the reference (sin-fract)
vec3 snowHash3( float n ) { return fract( sin( vec3( n, n + 17.13, n + 43.71 ) ) * vec3( 43758.5453, 22578.1459, 19642.3490 ) ); }
// spot profile shared with LocalLights: hot centre, soft edge, faint spill
float snowSpotProfile( float cd, float cosInner, float cosOuter ) {
	float m = smoothstep( cosOuter, cosInner, cd );
	return max( m * m, smoothstep( cosOuter - 0.55, cosOuter, cd ) * 0.05 );
}
// orbital motion under the waves: each wave's orbit shrinks as exp( -k z ) with depth
vec3 snowSway( vec2 x0, float depth ) {
	vec3 d = vec3( 0.0 );
	for ( int i = 0; i < WAVE_COUNT; i ++ ) {
		vec4 A = waveA[ i ];
		vec4 B = waveB[ i ];
		float theta = A.z * dot( A.xy, x0 ) - A.w * waveTime + B.z;
		float decay = exp( - A.z * depth );
		d.xz += A.xy * ( B.y * cos( theta ) * decay );
		d.y += B.x * sin( theta ) * decay;
	}
	return d;
}
// the surface's height over (x, z) (one fixed-point step back from the displaced grid)
float snowWaterHeight( vec2 xz ) {
	vec3 n;
	vec3 d = waveDisplacement( xz, 1.0, n );
	d = waveDisplacement( xz - d.xz, 1.0, n );
	return snowSeaLevel + d.y;
}

void main() {
	float id = float( gl_InstanceID );
	vec3 h = snowHash3( id * 0.7131 );
	vec3 h2 = snowHash3( id * 1.3917 + 5.1 );
	float B = snowBox;
	// slow current + sinking, wrapped into the camera box
	vec3 drift = vec3( 0.05, - 0.012, 0.03 ) * waveTime + ( h2 - 0.5 ) * ( waveTime * 0.02 );
	vec3 local = ( fract( h + drift / B - snowCamPos / B ) - 0.5 ) * B;
	vec3 p = snowCamPos + local;
	float depth = max( snowSeaLevel - p.y, 0.0 );
	vec3 sway = snowSway( p.xz, depth );
	p += vec3( sway.x, sway.y * 0.5, sway.z ) * 0.8;

	// camera-facing quad, 3-8 mm (a few flecks larger)
	float size = mix( 0.003, 0.008, h2.x * h2.x ) + ( h2.y > 0.98 ? 0.008 : 0.0 );
	vec4 mvPosition = viewMatrix * vec4( p, 1.0 );
	// fade in the box edges and right in front of the lens (by shrinking), and above the surface
	float dist = length( local );
	float fade = ( 1.0 - smoothstep( B * 0.3, B * 0.5, dist ) ) * smoothstep( 0.08, 0.3, - mvPosition.z );
	fade *= smoothstep( 0.0, 0.04, snowWaterHeight( p.xz ) - p.y );
	// at least ~1.5 px across, dimmer the smaller it really is
	float px = size * projectionMatrix[ 1 ][ 1 ] * snowViewHeight * 0.5 / max( - mvPosition.z, 0.05 );
	float grow = max( 1.0, 1.5 / max( px, 1e-3 ) );
	vDim = clamp( 1.0 / grow, 0.2, 1.0 );
	vPx = px * grow;
	mvPosition.xy += position.xy * size * grow * fade;
	vUv = uv;
	vFade = fade;
	vDepth = depth;
	// flashlight on the speck (per vertex): the backscatter sparkle of a diver's torch
	vec3 tv = p - flashPos;
	float tr2 = max( dot( tv, tv ), 1e-4 );
	float tr = sqrt( tr2 );
	float tspot = snowSpotProfile( dot( tv / tr, flashDir ), flashCone.x, flashCone.y );
	vTorch = flashCol * exp( - ( snowAbsorption + snowScattering ) * tr ) * ( tspot / ( tr2 + 0.15 ) * flashOn * 0.35 );
	// (a glint, not a blob in the high tier's bloom)
	vTorch = min( vTorch, vec3( 4.0 ) );
	gl_Position = projectionMatrix * mvPosition;
	#include <fog_vertex>
}
`;

const FRAGMENT = /* glsl */`
#include <fog_pars_fragment>
uniform vec3 snowSun;
uniform vec3 snowSky;
uniform vec3 snowAbsorption;
uniform vec3 snowScattering;
uniform float snowOpacity;
varying vec2 vUv;
varying float vFade;
varying float vDepth;
varying float vDim;
varying float vPx;
varying vec3 vTorch;

void main() {
	float r = length( vUv - 0.5 ) * 2.0;
	// (round only where it's a few pixels across: a pixel-sized speck stays a square)
	if ( vFade < 0.02 || ( r > 1.0 && vPx > 3.0 ) ) discard;
	// lit by the light that reaches this depth, slightly greenish-white (organic matter)
	vec3 light = ( snowSun * 0.1 + snowSky * 1.2 ) * exp( - ( snowAbsorption + snowScattering ) * vDepth );
	gl_FragColor = vec4( ( light + vTorch ) * vec3( 0.9, 1.0, 0.95 ) * mix( 1.3, 0.8, min( r, 1.0 ) ) * snowOpacity * vDim, 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}
`;

export class MarineSnow {

	constructor( { waves, tier = 'low' } ) {

		const T = TIER[ tier ] || TIER.low;
		this.box = T.box;

		const plane = new THREE.PlaneGeometry( 1, 1 );
		const geo = new THREE.InstancedBufferGeometry();
		geo.index = plane.index;
		geo.setAttribute( 'position', plane.getAttribute( 'position' ) );
		geo.setAttribute( 'uv', plane.getAttribute( 'uv' ) );
		geo.instanceCount = T.count;
		geo.boundingSphere = new THREE.Sphere( new THREE.Vector3(), 1e5 );

		this.flash = {
			flashOn: { value: 0 }, flashPos: { value: new THREE.Vector3() }, flashDir: { value: new THREE.Vector3( 0, 0, - 1 ) },
			flashCol: { value: new THREE.Vector3() }, flashCone: { value: new THREE.Vector2( 0.99, 0.82 ) },
		};
		this.uniforms = {
			...THREE.UniformsUtils.clone( THREE.UniformsLib.fog ),
			...waves.uniforms,
			...this.flash,
			snowCamPos: { value: new THREE.Vector3() },
			snowBox: { value: T.box },
			snowSeaLevel: G.seaLevel,
			snowViewHeight: { value: 720 },
			snowAbsorption: G.waterAbsorption,
			snowScattering: G.waterScattering,
			snowSun: G.sunColor,
			snowSky: G.skyIrradiance,
			snowOpacity: { value: 1 },
		};
		this.material = new THREE.ShaderMaterial( {
			name: 'MarineSnow',
			uniforms: this.uniforms,
			vertexShader: waves.glsl + VERTEX,
			fragmentShader: FRAGMENT,
			fog: true,
		} );

		this.mesh = new THREE.Mesh( geo, this.material );
		this.mesh.name = 'MarineSnow';
		this.mesh.frustumCulled = false;
		this.mesh.matrixAutoUpdate = false;
		this.mesh.visible = false;

	}

	// underwater: whether the camera is below the surface; viewHeight: the canvas height (px);
	// flashlight: LocalLights' flashlight ({ on, position, dir, color, intensity, cosInner, cosOuter })
	update( camera, underwater, viewHeight, flashlight = null ) {

		this.mesh.visible = underwater;
		if ( ! underwater ) return;
		this.uniforms.snowCamPos.value.copy( camera.position );
		this.uniforms.snowViewHeight.value = viewHeight;
		const F = this.flash, fl = flashlight;
		F.flashOn.value = fl && fl.on ? 1 : 0;
		if ( fl && fl.on ) {

			// (as LocalLights: faint against daylight)
			const k = fl.intensity * ( 0.08 + 0.92 * THREE.MathUtils.smoothstep( G.night.value, 0, 0.6 ) );
			F.flashPos.value.copy( fl.position );
			F.flashDir.value.copy( fl.dir );
			F.flashCol.value.set( fl.color.r * k, fl.color.g * k, fl.color.b * k );
			F.flashCone.value.set( fl.cosInner, fl.cosOuter );

		}

	}

	dispose() {

		this.mesh.geometry.dispose();
		this.material.dispose();

	}

}
