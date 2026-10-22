import * as THREE from '../engine/index.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { G } from '../core/Globals.js';

// (Salt Life) Light shafts toward the sun (high tier: PostChain), in place of Tidewater's marched
// haze in-scatter (post/AirHaze.js, which needed its depth and shadow passes): a radial march over
// the scene's image toward the sun's place on the screen, adding up its brightest parts, the sky
// around the sun. Where trees, the hill or the boat break that light up, the march carries their
// gaps out as shafts. Faded out unless the sun is up, in front of the camera and roughly on the
// screen; never under water.

const SAMPLES = 40;

const SunShaftsShader = {
	uniforms: {
		tDiffuse: { value: null },
		sunUV: { value: new THREE.Vector2( 0.5, 0.5 ) },
		sunOn: { value: 0 },
		aspect: { value: 1 },
		threshold: { value: 0.65 },
		strength: { value: 1.0 },
	},
	vertexShader: /* glsl */`
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`,
	fragmentShader: /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 sunUV;
uniform float sunOn;
uniform float aspect;
uniform float threshold;
uniform float strength;
varying vec2 vUv;
void main() {
	vec4 base = texture2D( tDiffuse, vUv );
	if ( sunOn <= 0.0 ) {
		gl_FragColor = base;
		return;
	}
	// march toward the sun over most of the way; nearer samples count more
	vec2 delta = ( sunUV - vUv ) * ( 0.85 / ${ SAMPLES }.0 );
	vec2 uv = vUv;
	float illum = 1.0;
	vec3 acc = vec3( 0.0 );
	for ( int i = 0; i < ${ SAMPLES }; i ++ ) {
		uv += delta;
		vec3 s = texture2D( tDiffuse, clamp( uv, 0.0, 1.0 ) ).rgb;
		float l = dot( s, vec3( 0.2126, 0.7152, 0.0722 ) );
		acc += s * ( max( l - threshold, 0.0 ) / max( l, 1e-4 ) ) * illum;
		illum *= 0.96;
	}
	// shafts fade with their distance from the sun on the screen
	float r = length( ( vUv - sunUV ) * vec2( aspect, 1.0 ) );
	float fall = 1.0 - smoothstep( 0.15, 1.3, r );
	gl_FragColor = vec4( base.rgb + acc * ( strength * sunOn * fall / ${ SAMPLES }.0 ), base.a );
}
`,
};

const _p = new THREE.Vector3(), _f = new THREE.Vector3();

export class SunShafts {

	constructor() {

		this.pass = new ShaderPass( SunShaftsShader );
		this.uniforms = this.pass.uniforms;

	}

	// where the sun is on the screen this frame, and how much of it shines
	update( camera, width, height ) {

		const U = this.uniforms, sun = G.sunDir.value;
		camera.getWorldDirection( _f );
		_p.copy( camera.position ).addScaledVector( sun, 1000 ).project( camera );
		const facing = _f.dot( sun );
		const onScreen = Math.max( Math.abs( _p.x ), Math.abs( _p.y ) );
		const on = facing > 0 && G.cameraUnderwater.value < 0.5
			? THREE.MathUtils.smoothstep( sun.y, - 0.02, 0.08 ) * THREE.MathUtils.smoothstep( facing, 0, 0.35 ) * ( 1 - THREE.MathUtils.smoothstep( onScreen, 1.2, 2.2 ) ) * ( 1 - G.night.value )
			: 0;
		U.sunOn.value = on;
		U.sunUV.value.set( _p.x * 0.5 + 0.5, _p.y * 0.5 + 0.5 );
		U.aspect.value = width / Math.max( height, 1 );
		this.pass.enabled = on > 0.001;

	}

}
