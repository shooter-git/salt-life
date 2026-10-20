import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { connect } from '@allthespaces/portal';
import { createStage } from '@allthespaces/portal/three';

// Salt Life inside All the Spaces. For now this is only the sky and the open sea while the island is
// ported from Tidewater's own engine to three.js (see the README); it proves the frame, the device
// tiers and the publishing checks end to end.

const portal = await connect( { save: { version: 1 } } );
portal.progress( 0.1, 'Lighting the sky' );

const stage = createStage( portal, { fov: 60 } );
const { renderer, camera } = stage;
renderer.toneMappingExposure = 0.55;
camera.far = 20000;
camera.updateProjectionMatrix();

const scene = new THREE.Scene();

// Golden hour, low in the west.
const sun = new THREE.Vector3().setFromSphericalCoords( 1, THREE.MathUtils.degToRad( 90 - 6 ), THREE.MathUtils.degToRad( 200 ) );

const sky = new Sky();
sky.scale.setScalar( 10000 );
const skyUniforms = sky.material.uniforms;
skyUniforms.turbidity.value = 4;
skyUniforms.rayleigh.value = 1.2;
skyUniforms.mieCoefficient.value = 0.004;
skyUniforms.mieDirectionalG.value = 0.85;
skyUniforms.sunPosition.value.copy( sun );

// The sky lights the sea: one prefiltered environment map, made once.
const pmrem = new THREE.PMREMGenerator( renderer );
const skyScene = new THREE.Scene();
skyScene.add( sky );
const environment = pmrem.fromScene( skyScene ).texture;
pmrem.dispose();
scene.add( sky );
scene.environment = environment;

portal.progress( 0.5, 'Filling the sea' );

const sunLight = new THREE.DirectionalLight( 0xffd2a6, 2.2 );
sunLight.position.copy( sun ).multiplyScalar( 100 );
scene.add( sunLight, new THREE.HemisphereLight( 0x9cc7e0, 0x0b2a3c, 0.6 ) );

const seaGeometry = new THREE.PlaneGeometry( 20000, 20000 );
seaGeometry.rotateX( - Math.PI / 2 );
const sea = new THREE.Mesh( seaGeometry, new THREE.MeshStandardMaterial( { color: 0x0b4a66, roughness: 0.08, metalness: 0 } ) );
scene.add( sea );
scene.fog = new THREE.Fog( 0x9cbfd2, 400, 9000 );

const lookAzimuth = THREE.MathUtils.degToRad( 200 );
const target = new THREE.Vector3();
let time = 0;

function frame( dt ) {

	time += dt;
	const sway = portal.reducedMotion ? 0 : 1;
	camera.position.set( 0, 3 + Math.sin( time * 0.6 ) * 0.15 * sway, 0 );
	const yaw = lookAzimuth + Math.sin( time * 0.05 ) * 0.3 * sway;
	target.set( Math.sin( yaw ), 0.12, Math.cos( yaw ) ).add( camera.position );
	camera.lookAt( target );
	renderer.render( scene, camera );

}

await renderer.compileAsync( scene, camera );
portal.progress( 1, 'Ready' );
frame( 0 );
stage.loop( frame );
portal.ready();
