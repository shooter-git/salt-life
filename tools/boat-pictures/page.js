// (M16) The page tools/boat-pictures.mjs drives: one boat at a time, side-on and a little from her quarter, on nothing,
// cut at her waterline, as a picture for Marta's list.
import * as THREE from 'three';
import { loadBoat } from '/src/world/boat/Boats.js';
import { gearStats, defaultUpgrades } from '/src/game/Gear.js';

const W = 600, H = 264;
// where her waterline sits, from the top of the picture, and how much of the width she fills
const WATER = 0.82, FILLS = 0.86;

window.picture = async ( id ) => {

	const model = await loadBoat( id );
	if ( model.fit ) model.fit( gearStats( defaultUpgrades(), id ) );
	const renderer = new THREE.WebGLRenderer( { antialias: true, alpha: true, preserveDrawingBuffer: true } );
	renderer.setSize( W, H, false );
	renderer.setClearColor( 0x000000, 0 );
	renderer.localClippingEnabled = true;
	renderer.clippingPlanes = [ new THREE.Plane( new THREE.Vector3( 0, 1, 0 ), 0 ) ];
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1;
	const scene = new THREE.Scene();
	scene.add( new THREE.HemisphereLight( 0xdfeeff, 0x8c9aa0, 2.4 ) );
	const sun = new THREE.DirectionalLight( 0xfff4e0, 2.6 );
	sun.position.set( - 8, 12, 6 );
	scene.add( sun );
	scene.add( model.group );
	model.group.updateMatrixWorld( true );

	// looking at her starboard... her side with her bow to the right, a long lens, from a little aft of abeam
	const box = new THREE.Box3().setFromObject( model.group );
	const length = box.max.z - box.min.z, top = Math.max( box.max.y, 0.5 );
	const look = new THREE.Vector3( 1, 0.1, - 0.28 ).normalize();
	const across = length * 1.04 / FILLS;
	const high = Math.max( across * H / W, top / WATER * 1.04 ); // (a tall boat: as much of her as there is)
	const wide = high * W / H;
	const camera = new THREE.OrthographicCamera( - wide / 2, wide / 2, high * WATER, - high * ( 1 - WATER ), 0.1, 200 );
	const mid = ( box.max.z + box.min.z ) / 2;
	camera.position.set( look.x * 60, look.y * 60, mid + look.z * 60 );
	camera.up.set( 0, 1, 0 );
	camera.lookAt( 0, 0, mid );
	renderer.render( scene, camera );
	const url = renderer.domElement.toDataURL( 'image/webp', 0.86 );
	renderer.dispose();
	model.dispose();
	return url;

};

window.ready = true;
