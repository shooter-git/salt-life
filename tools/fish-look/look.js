// (M16) Each fish as the catch card's studio draws it, side-on, on its own: for judging a model and its skin against
// photographs (tools/fish-look/compare.mjs) without loading the game. ?fish=blueMarlin&lod=0&w=1000&h=430&lite=1&pose=swim
import { Scene, PerspectiveCamera, WebGLRenderer, Matrix4, Vector3, DirectionalLight, HemisphereLight, PMREMGenerator, ACESFilmicToneMapping, Color, Mesh } from '../../src/engine/index.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FishProps } from '../../src/world/village/FishProps.js';
import { createPropMaterial } from '../../src/world/fish/FishMaterial.js';
import { fishGeometry } from '../../src/world/fish/FishGeometry.js';
import { SPECIES } from '../../src/world/fish/FishSpecies.js';

const q = new URLSearchParams( location.search );
const species = q.get( 'fish' ) || 'blueMarlin', W = + q.get( 'w' ) || 1000, H = + q.get( 'h' ) || 430, lod = + q.get( 'lod' ) || 0, lite = q.has( 'lite' );
const r = new WebGLRenderer( { antialias: true, preserveDrawingBuffer: true } );
r.setSize( W, H );
r.toneMapping = ACESFilmicToneMapping;
r.toneMappingExposure = 1.15;
document.body.appendChild( r.domElement );
const scene = new Scene();
scene.background = new Color( q.get( 'bg' ) || '#26303a' );
const key = new DirectionalLight( 0xfff1e0, 3 );
key.position.set( - 0.45, 0.78, 0.55 );
const rim = new DirectionalLight( 0xcfe2ff, 1.4 );
rim.position.set( 0.6, 0.35, - 0.75 );
scene.add( key, rim, new HemisphereLight( 0xe4ecf0, 0x403a34, 0.3 ) );
const pmrem = new PMREMGenerator( r );
scene.environment = pmrem.fromScene( new RoomEnvironment(), 0.04 ).texture;
scene.environmentIntensity = 0.35;
// the portrait's frame: nose to the left, back up, left flank to the camera
const PORTRAIT = new Matrix4().makeBasis( new Vector3( 0, 0, 1 ), new Vector3( 0, 1, 0 ), new Vector3( - 1, 0, 0 ) );
const SIDE = new Matrix4().makeBasis( new Vector3( 0, 1, 0 ), new Vector3( 0, 0, 1 ), new Vector3( 1, 0, 0 ) );
const FRAME = PORTRAIT.clone().multiply( SIDE.clone().invert() );
const fp = new FishProps();
fp.add( 'whole', species, FRAME, 'side', 1, { curl: + q.get( 'curl' ) || 0, wet: 1, seed: + q.get( 'seed' ) || 0.37 } );
fp.build( { lod, skinned: true, lite } );
const mesh = fp.fishMesh;
scene.add( mesh );
if ( q.has( 'yaw' ) ) mesh.rotation.y = + q.get( 'yaw' );
const cam = new PerspectiveCamera( 16, W / H, 0.05, 50 );
const fill = + q.get( 'fill' ) || 0.96;
const dist = ( 1 / fill ) / 2 / ( Math.tan( 8 * Math.PI / 180 ) * W / H );
cam.position.set( 0, dist * 0.06, dist );
cam.lookAt( 0, 0, 0 );
r.render( scene, cam );
// triangles at each level of detail, for the budgets
window.tris = [ 0, 1, 2, 3 ].map( ( l ) => {

	const g = fishGeometry( SPECIES[ species ], { lod: l, pose: 'swim' } );
	return g.index.count / 3;

} );
window.ready = true;
