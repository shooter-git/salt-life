// The spray pool on the CPU (no GPU): drops thrown up fall back and die in the water, mist skims it
// and lasts, the ring never holds more than its capacity, only live particles are drawn, and drops
// thrown into the boat's hull are pushed out of it.
//   node test/spray.mjs
import { readFileSync } from 'node:fs';
import { Vector3, Matrix4, Quaternion } from 'three';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Waves } from '../src/ocean/Waves.js';
import { Spray, SPRAY } from '../src/fx/Spray.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island-1024.bin', import.meta.url ) ) ) ) );
const waves = new Waves( { tier: 'low', terrain } );
const spray = new Spray( { waves, terrain, tier: 'low' } );
const sea = new Vector3( 60, 0, 220 ); // open water off the bay
const dt = 1 / 30;

// drops thrown up from the surface: up, then back into the water within ~1.5 s
spray.emit( sea, new Vector3( 0, 5, 0 ), 100, 0.004, SPRAY.DROPLET, { life: 5 } );
spray.update( dt );
const thrown = spray.live;
let peak = 0;
for ( let i = 0; i < 30; i ++ ) {

	spray.update( dt );
	for ( let k = 0; k < spray.N; k ++ ) if ( spray.info[ k * 4 + 1 ] > 0 ) peak = Math.max( peak, spray.pos[ k * 4 + 1 ] );

}

for ( let i = 0; i < 60; i ++ ) spray.update( dt );
check( thrown === 100, `100 drops thrown (${ thrown } live)` );
check( peak > 0.8 && peak < 2, `they rise about v^2 / 2g (highest ${ peak.toFixed( 2 ) } m)` );
check( spray.live === 0, `and die in the water (${ spray.live } left after 3 s)` );

// mist skims over the water and lasts its life
spray.emit( sea, new Vector3( 1, 0.5, 0 ), 50, 0.3, SPRAY.MIST, { life: 4 } );
for ( let i = 0; i < 60; i ++ ) spray.update( dt );
let above = true;
for ( let k = 0; k < spray.N; k ++ ) if ( spray.info[ k * 4 + 1 ] > 0 && spray.pos[ k * 4 + 1 ] < waves.heightAt( spray.pos[ k * 4 ], spray.pos[ k * 4 + 2 ] ) - 0.05 ) above = false;
check( spray.live > 0 && above, `mist skims the water (${ spray.live } of 25 kept on low, none under the surface after 2 s)` );
for ( let i = 0; i < 100; i ++ ) spray.update( dt );
check( spray.live === 0, 'and is gone after its life (at most 1.25 x 4 s)' );

// the ring never holds more than its capacity; only live particles are handed to the sprites
for ( let i = 0; i < 40; i ++ ) spray.emit( sea, new Vector3( 0, 3, 0 ), 200, 0.01, SPRAY.DROPLET, { life: 5 } );
spray.update( dt );
check( spray.live <= spray.N && spray.mesh.geometry.instanceCount === spray.live, `the ring holds at most ${ spray.N } (${ spray.live } live, ${ spray.mesh.geometry.instanceCount } drawn)` );
for ( let i = 0; i < 120; i ++ ) spray.update( dt );

// drops thrown at a hull (a box-shaped boat at the origin of its frame) end up outside it
const boat = new Matrix4().compose( new Vector3( 60, 0, 220 ), new Quaternion(), new Vector3( 1, 1, 1 ) );
spray.setBodyShape( { zAft: - 4, zShoulder: 2, zStem: 4, halfBeam: 1.5, wlShoulder: 1.5, wlStem: 3.6, wlHalfBeam: 1.3, ySheerAft: 1, ySheerStem: 1.4, yBottom: - 0.6, boxMin: new Vector3( - 1, 1, - 2 ), boxMax: new Vector3( 1, 2.5, 0 ) } );
spray.setBody( boat, new Vector3() );
spray.emit( new Vector3( 63, 0.6, 220 ), new Vector3( - 6, 1, 0 ), 60, 0.004, SPRAY.DROPLET, { life: 3, spread: 0.2, jitter: 0.05 } );
let inside = 0, reached = 0;
for ( let i = 0; i < 45; i ++ ) {

	spray.update( 1 / 60 );
	for ( let k = 0; k < spray.N; k ++ ) {

		if ( spray.info[ k * 4 + 1 ] <= 0 ) continue;
		const x = spray.pos[ k * 4 ] - 60, y = spray.pos[ k * 4 + 1 ], z = spray.pos[ k * 4 + 2 ] - 220;
		if ( Math.abs( x ) < 1.25 && y > - 0.5 && y < 0.9 && z > - 3.5 && z < 1.5 ) inside ++;
		if ( x < 1.7 ) reached ++;

	}

}

check( reached > 0 && inside === 0, `drops thrown at the hull reach it but don't pass into it (${ reached } at its side, ${ inside } inside)` );

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
