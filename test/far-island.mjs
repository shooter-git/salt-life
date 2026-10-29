// (M15) The island seen from far off (world/FarIsland.js), under Node: its far shape, its ground on both
// islands, every bit of it that's out of the sea; the earth's curve setting its low land under the horizon
// first (the beaches past 10 to 15 km, the hills later, the summit last); pulled in past the far plane and
// shrunk by as much, the same size seen.
//
//   node test/far-island.mjs

import { readFileSync } from 'node:fs';
import * as THREE from '../src/engine/index.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { FarIsland, curveDrop } from '../src/world/FarIsland.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};

for ( const file of [ 'island.bin', 'island-1024.bin' ] ) {

	const T = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( `../public/world/${ file }`, import.meta.url ) ) ) ) );
	const t0 = performance.now(), far = new FarIsland( { scene: new THREE.Scene(), terrain: T } ), ms = performance.now() - t0;
	const tris = far.geometry.index.count / 3;
	let summit = - Infinity;
	for ( let z = - 1000; z < 1000; z += 4 ) for ( let x = - 1000; x < 1000; x += 4 ) summit = Math.max( summit, T.heightAt( x, z ) );
	check( tris > 4000 && tris < 40000 && ms < 400, `${ file }: its far shape, ${ tris } triangles, made in ${ ms.toFixed( 0 ) } ms` );
	check( Math.abs( far.top + 1.5 - summit ) < 8, `${ file }: its summit ${ ( far.top + 1.5 ).toFixed( 0 ) } m (the ground's ${ summit.toFixed( 0 ) } m), a little under the real ground` );
	// (all of the island out of the sea's in it)
	const P = far.geometry.attributes.position;
	let x0 = Infinity, x1 = - Infinity, z0 = Infinity, z1 = - Infinity;
	for ( let i = 0; i < P.count; i ++ ) if ( P.getY( i ) > - 1 ) {

		x0 = Math.min( x0, P.getX( i ) ); x1 = Math.max( x1, P.getX( i ) ); z0 = Math.min( z0, P.getZ( i ) ); z1 = Math.max( z1, P.getZ( i ) );

	}

	let outside = 0;
	for ( let z = - 1000; z < 1000; z += 20 ) for ( let x = - 1000; x < 1000; x += 20 ) if ( T.heightAt( x, z ) > 1 && ( x < x0 - 16 || x > x1 + 16 || z < z0 - 16 || z > z1 + 16 ) ) outside ++;
	check( outside === 0, `${ file }: all of the island out of the sea in it (${ x0.toFixed( 0 ) }..${ x1.toFixed( 0 ) }, ${ z0.toFixed( 0 ) }..${ z1.toFixed( 0 ) })` );
	// pulled in past the far plane: at 25 km, its far side no further than 10.5 km, the same angle seen
	const cam = new THREE.PerspectiveCamera();
	cam.position.set( 0, 3, 25000 );
	far.update( cam );
	far.mesh.updateMatrixWorld();
	const v = new THREE.Vector3( 0, 100, - 600 ), w = v.clone().applyMatrix4( far.mesh.matrixWorld );
	const a0 = Math.atan2( v.y - 3, 25000 + 600 ), a1 = Math.atan2( w.y - 3, w.z - cam.position.z === 0 ? 1 : cam.position.z - w.z );
	check( far.mesh.visible && cam.position.distanceTo( w ) < 10600 && Math.abs( a0 - a1 ) < 1e-6, `${ file }: from 25 km pulled in to ${ ( cam.position.distanceTo( w ) / 1000 ).toFixed( 1 ) } km and shrunk, the same angle seen` );
	cam.position.set( 0, 3, - 200 );
	far.update( cam );
	check( ! far.mesh.visible, `${ file }: not drawn while you're on it (its own ground is)` );

}

// the earth's curve, for an eye 3 m over the sea (refraction's 0.13 taken)
const hidden = ( d ) => curveDrop( d, 3 );
console.log( `     set down under the horizon from 3 m: ${ [ 5, 10, 15, 20, 30, 50 ].map( ( k ) => `${ k } km ${ hidden( k * 1000 ).toFixed( 1 ) } m` ).join( ', ' ) }` );
check( hidden( 6000 ) === 0 && hidden( 15000 ) > 2 && hidden( 15000 ) < 8 && hidden( 30000 ) > 30, 'the beaches go under the horizon past 10 to 15 km, the low hills by 30' );
check( hidden( 50000 ) < 180, 'the summit (some 300 m) well over the horizon at 50 km: it\'s the haze that hides it first' );

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
