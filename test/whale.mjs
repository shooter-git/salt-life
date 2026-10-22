// The humpback on the CPU (no GPU): ten minutes of its loop through the bay (finite, over deep
// water and clear of the floor; it breathes at the surface and dives flukes up), and the rig the
// vertex shader poses it with (toWorld, its CPU copy, agrees with the spine frames).
//   node test/whale.mjs
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Whale } from '../src/world/marine/Whale.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island-1024.bin', import.meta.url ) ) ) ) );
const manifest = JSON.parse( readFileSync( new URL( '../public/models/whale/humpback.json', import.meta.url ), 'utf8' ) );
const whale = new Whale( { scene: null, terrain, ground: null } );
whale.manifest = manifest;
whale._setupRig( manifest );
const b = whale.brain;

let finite = true, clearance = Infinity, shallowest = - Infinity, blows = 0, flukes = 0, worstRig = 0;
const states = new Set();
const p = new Vector3(), q = new Vector3();
const dt = 0.05;
for ( let i = 0; i < 10 * 60 / dt; i ++ ) {

	b.update( dt );
	whale._pose();
	const P = b.position;
	if ( ! Number.isFinite( P.x + P.y + P.z ) ) finite = false;
	for ( const v of whale.uPos.value ) if ( ! Number.isFinite( v.x + v.y + v.z + v.w ) ) finite = false;
	const floor = terrain.heightAt( P.x, P.z );
	clearance = Math.min( clearance, P.y - floor );
	shallowest = Math.max( shallowest, floor );
	if ( b.blow > 0.3 ) blows ++;
	if ( b.flukeUp > 0.5 ) flukes ++;
	states.add( b.state );
	// a point at each of a few spine frames, posed on the CPU, lands on that frame
	if ( i % 200 === 0 ) for ( const k of [ 0, 10, 25, 39 ] ) {

		whale.toWorld( p.set( 0, whale.rest[ k ].y, whale.rest[ k ].z ), q );
		worstRig = Math.max( worstRig, q.distanceTo( whale.pos[ k ] ) );

	}

}

check( finite, 'ten minutes of swimming stay finite (brain and rig)' );
check( shallowest < - 5, `over deep water all the way (the shallowest floor under it: ${ shallowest.toFixed( 1 ) } m)` );
check( clearance > 1, `clear of the floor (closest: ${ clearance.toFixed( 1 ) } m)` );
check( blows > 0, `it blows at the surface (${ ( blows * dt ).toFixed( 1 ) } s of blowing)` );
check( flukes > 0, `it dives flukes up (${ ( flukes * dt ).toFixed( 1 ) } s with its flukes up)` );
check( states.has( 'cruise' ) && states.has( 'surface' ), `it cruises and surfaces (${ [ ...states ].join( ', ' ) })` );
check( worstRig < 1e-3, `the CPU pose lands on the spine frames (worst ${ worstRig.toExponential( 1 ) } m)` );

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
