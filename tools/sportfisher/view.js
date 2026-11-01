// (M16) Her alone, on flat water under a plain sky, for looking at her against the photographs (tools/sportfisher/shots.mjs):
// a full game takes minutes to start on a CPU, this a few seconds. Her real look's checked in the game itself.
//   /tools/sportfisher/view.html?tier=low
import * as THREE from '../../src/engine/index.js';
import { SportfisherModel } from '../../src/world/boat/sportfisher/SportfisherModel.js';

const q = new URLSearchParams( location.search ), W = + ( q.get( 'w' ) || 1280 ), H = + ( q.get( 'h' ) || 720 );
const renderer = new THREE.WebGLRenderer( { antialias: true, preserveDrawingBuffer: true } );
renderer.setSize( W, H );
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.72;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild( renderer.domElement );
const scene = new THREE.Scene();
scene.background = new THREE.Color( 0xa8cbe3 );
scene.fog = new THREE.Fog( 0xa8cbe3, 150, 900 );

// a sky to reflect, and a sun as the game's
const pm = new THREE.PMREMGenerator( renderer );
const envScene = new THREE.Scene();
const dome = new THREE.Mesh( new THREE.SphereGeometry( 50, 16, 12 ), new THREE.ShaderMaterial( { side: THREE.BackSide, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }', fragmentShader: 'varying vec3 vP; void main(){ float h = normalize( vP ).y; vec3 c = h > 0.0 ? mix( vec3( 0.75, 0.85, 0.95 ), vec3( 0.25, 0.45, 0.8 ), pow( h, 0.5 ) ) : mix( vec3( 0.55, 0.65, 0.72 ), vec3( 0.05, 0.16, 0.25 ), pow( -h, 0.4 ) ); gl_FragColor = vec4( c, 1.0 ); }' } ) );
envScene.add( dome );
scene.environment = pm.fromScene( envScene, 0.02 ).texture;
scene.environmentIntensity = 0.5;
const sun = new THREE.DirectionalLight( 0xfff4e4, 3 );
sun.position.set( - 30, 50, - 22 );
sun.castShadow = true;
Object.assign( sun.shadow.camera, { left: - 20, right: 20, top: 20, bottom: - 20, near: 1, far: 140 } );
sun.shadow.mapSize.set( 2048, 2048 );
sun.shadow.bias = - 0.0005;
scene.add( sun, new THREE.HemisphereLight( 0xcfe3f5, 0x50707f, 0.55 ) );

const water = new THREE.Mesh( new THREE.PlaneGeometry( 4000, 4000 ), new THREE.MeshStandardMaterial( { color: 0x0f4f73, roughness: 0.28, metalness: 0.05, transparent: true, opacity: 0.86 } ) );
water.rotation.x = - Math.PI / 2;
water.receiveShadow = true;
scene.add( water );

const model = new SportfisherModel( q.get( 'tier' ) || 'high' );
scene.add( model.group );
model.update( 0.016 );
const camera = new THREE.PerspectiveCamera( 40, W / H, 0.05, 3000 );
camera.position.set( 30, 5, 3 );
camera.lookAt( 0, 3, 0 );

window.view = ( px, py, pz, tx, ty, tz, fov = 40 ) => {

	camera.fov = fov;
	camera.updateProjectionMatrix();
	camera.position.set( px, py, pz );
	camera.lookAt( tx, ty, tz );
	renderer.render( scene, camera );
	return renderer.info.render;

};

window.model = model;
window.ready = true;
renderer.render( scene, camera );
