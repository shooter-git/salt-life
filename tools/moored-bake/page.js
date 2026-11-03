// (M16) The page tools/moored-bake/look.mjs drives: one boat at a time, her own model beside what's baked of her
// (public/boats/moored/) and the stand-in, from where she's seen, each lit alike, to judge the bake by.
import * as THREE from 'three';
import { loadBoat } from '/src/world/boat/Boats.js';
import { gearStats, defaultUpgrades } from '/src/game/Gear.js';
import { mooredGeometry } from '/src/game/fleet/MooredModels.js';
import { readLook, lookGeometry } from '/src/game/fleet/MooredLooks.js';

const W = 560, H = 420;
// eye and target in her frame (+Z bow, +X port), in her lengths: from the pier's deck beside her, from the beach, her quarter
const VIEWS = {
	pier: { eye: [ 0.75, 0.5, - 0.25 ], at: [ 0, 0.06, 0 ], fov: 50 },
	beach: { eye: [ 2.6, 0.12, 1.2 ], at: [ 0, 0.1, 0 ], fov: 30 },
	quarter: { eye: [ - 1.2, 0.45, - 1.4 ], at: [ 0, 0.1, 0 ], fov: 34 },
	near: { eye: [ 0.45, 0.32, 0.2 ], at: [ 0, 0.1, 0 ], fov: 60 },
};

window.sheet = async ( id, view, { stats = null, paint = null, scale = 1 } = {} ) => {

	const s = stats || gearStats( defaultUpgrades(), id );
	const model = await loadBoat( id );
	if ( model.fit ) model.fit( s );
	if ( model.setPaint && paint !== null ) model.setPaint( paint );
	const material = new THREE.MeshStandardMaterial( { vertexColors: true, roughness: 0.42, metalness: 0, side: THREE.DoubleSide } );
	const look = readLook( await ( await fetch( `/boats/moored/${ id }.bin` ) ).arrayBuffer() );
	const baked = new THREE.Mesh( lookGeometry( look, { paint, stats: s } ), material );
	const stand = new THREE.Mesh( mooredGeometry( id, { paint, stats: s } ), material );
	const renderer = new THREE.WebGLRenderer( { antialias: true, preserveDrawingBuffer: true } );
	renderer.setSize( W * 3, H, false );
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.setScissorTest( true );
	const scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x8fb4c8 );
	const pmrem = new THREE.PMREMGenerator( renderer );
	const env = new THREE.Scene();
	env.background = new THREE.Color( 0x9fc4dc );
	scene.environment = pmrem.fromScene( env ).texture;
	scene.environmentIntensity = 0.35;
	scene.add( new THREE.HemisphereLight( 0xdfeeff, 0x6a7c84, 1.3 ) );
	const sun = new THREE.DirectionalLight( 0xfff4e0, 2.8 );
	sun.position.set( - 6, 12, 4 );
	scene.add( sun );
	const sea = new THREE.Mesh( new THREE.PlaneGeometry( 400, 400 ).rotateX( - Math.PI / 2 ), new THREE.MeshStandardMaterial( { color: 0x2c5a6c, roughness: 0.3, transparent: true, opacity: 0.85 } ) );
	scene.add( sea );
	const V = VIEWS[ view ], L = model.dimensions.length * scale;
	const camera = new THREE.PerspectiveCamera( V.fov, W / H, 0.05, 500 );
	camera.position.set( V.eye[ 0 ] * L, V.eye[ 1 ] * L, V.eye[ 2 ] * L );
	camera.lookAt( V.at[ 0 ] * L, V.at[ 1 ] * L, V.at[ 2 ] * L );
	const shows = [ model.group, baked, stand ];
	shows.forEach( ( o, i ) => {

		for ( const x of shows ) x.removeFromParent();
		scene.add( o );
		renderer.setViewport( i * W, 0, W, H );
		renderer.setScissor( i * W, 0, W, H );
		renderer.render( scene, camera );

	} );
	// (opaque: a boat's materials leave her height in the frame's alpha, SeenInWater, which a picture would show as fading her)
	const gl = renderer.getContext(), px = new Uint8Array( W * 3 * H * 4 );
	gl.readPixels( 0, 0, W * 3, H, gl.RGBA, gl.UNSIGNED_BYTE, px );
	const c2 = document.createElement( 'canvas' );
	c2.width = W * 3;
	c2.height = H;
	const ctx = c2.getContext( '2d' ), img = ctx.createImageData( W * 3, H );
	for ( let y = 0; y < H; y ++ ) for ( let x = 0; x < W * 3; x ++ ) {

		const s = ( ( H - 1 - y ) * W * 3 + x ) * 4, d = ( y * W * 3 + x ) * 4;
		img.data[ d ] = px[ s ];
		img.data[ d + 1 ] = px[ s + 1 ];
		img.data[ d + 2 ] = px[ s + 2 ];
		img.data[ d + 3 ] = 255;

	}

	ctx.putImageData( img, 0, 0 );
	const url = c2.toDataURL( 'image/png' );
	const tris = { model: model.triangleCount, baked: baked.geometry.index.count / 3, stand: stand.geometry.attributes.position.count / 3 };
	renderer.dispose();
	model.dispose();
	return { url, tris };

};

window.ready = true;
