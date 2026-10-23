// The clouds' shadows in the lit materials (materials/CloudShadows.js, no GPU): three's lights chunk
// dims the sun's light (SunLight and DirectionalLight) under CLOUD_SHADOWS; a material that takes them
// gets the define and the shared uniforms on top of its own onBeforeCompile, and its program key stays
// its own (two materials with different shaders must not share a program, nor one with its version
// without the shadows).
//   node test/cloud-shadows.mjs
import * as THREE from 'three';
import { useCloudShadows, holdCloudShadows } from '../src/materials/CloudShadows.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

const begin = THREE.ShaderChunk.lights_fragment_begin;
const hooks = begin.split( 'directLight.color *= cloudShadowView( geometryPosition );' ).length - 1;
check( hooks === 2, `the sun's light and directional lights are dimmed by the clouds (${ hooks } hooks)` );
check( begin.indexOf( 'getSunLightInfo( sunLight, directLight );' ) < begin.indexOf( 'cloudShadowView' ), 'after the light is looked up' );
check( THREE.ShaderChunk.lights_pars_begin.includes( 'float cloudShadowXZ( vec2 xz )' ), 'the lookup is declared with the lights' );

// two materials with their own shaders
const a = new THREE.MeshStandardMaterial();
a.onBeforeCompile = ( shader ) => {

	shader.fragmentShader = '// a\n' + shader.fragmentShader;

};

const b = new THREE.MeshStandardMaterial();
b.onBeforeCompile = ( shader ) => {

	shader.fragmentShader = '// b\n' + shader.fragmentShader;

};

const keyA = a.customProgramCacheKey(), keyB = b.customProgramCacheKey();
useCloudShadows( a );
useCloudShadows( b );
useCloudShadows( a ); // (twice: no second wrap)
check( a.customProgramCacheKey() !== b.customProgramCacheKey(), 'two materials keep different program keys' );
check( a.customProgramCacheKey() !== keyA && a.customProgramCacheKey().startsWith( keyA ), 'a material with the shadows has its own key, built on its old one' );
check( b.customProgramCacheKey().startsWith( keyB ), '(the other one too)' );
check( 'CLOUD_SHADOWS' in a.defines, 'the define is set' );

const shader = { uniforms: {}, fragmentShader: 'void main() {}', vertexShader: '' };
a.onBeforeCompile( shader, null );
a.onBeforeCompile( { uniforms: {}, fragmentShader: '', vertexShader: '' }, null );
check( shader.fragmentShader.startsWith( '// a\n' ), 'its own onBeforeCompile still runs' );
check( shader.uniforms.cloudShadowMap && shader.uniforms.cloudShadowArea && shader.uniforms.cloudShadowViewX && shader.uniforms.cloudShadowViewZ, 'and the shared uniforms are added' );

// a material with its own key method keeps using it
const c = new THREE.MeshStandardMaterial();
let state = 'one';
c.customProgramCacheKey = () => 'c:' + state;
useCloudShadows( c );
state = 'two';
check( c.customProgramCacheKey() === 'c:two|cloudShadows', 'a material\'s own key method is still asked' );

// held off for a render with another camera, then back
const s2 = { uniforms: {}, fragmentShader: '', vertexShader: '' };
b.onBeforeCompile( s2, null );
s2.uniforms.cloudShadowArea.value.w = 0.85;
let during = - 1;
holdCloudShadows( () => {

	during = s2.uniforms.cloudShadowArea.value.w;

} );
check( during === 0 && s2.uniforms.cloudShadowArea.value.w === 0.85, 'held off for a moment, then back' );

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
