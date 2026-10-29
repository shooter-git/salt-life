// (M15) The far water's bites (Bites.habitatAt's edge, ledge, blue, weed, debris and birds; Game.habitatAtPoint
// over the real seabed, baked in public/world/offshore.bin): the mahi and tuna out in the blue water and not on
// the shelf, the tuna on the drop-off and under the birds, the mahi under the weed and the debris, the silk
// snapper on the deep ledges, the open ocean slow, and the bank's top a reef.
//
//   node test/far-bites.mjs

import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Offshore, decodeSeabed } from '../src/world/terrain/Offshore.js';
import { SEABED } from '../src/world/terrain/SeabedModel.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { Game } from '../src/game/Game.js';
import { pickSpecies, biteDelay } from '../src/game/Bites.js';
import { biteHint } from '../src/game/Orders.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );
const T = new TerrainData( 7, decodeIsland( read( 'island.bin' ) ), { offshore: new Offshore( decodeSeabed( read( 'offshore.bin' ) ) ) } );
let seed = 11;
const rng = () => ( ( seed = ( seed * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );

// the game's own reading of a spot (Game.habitatAtPoint), with what's found out there given
const none = { weed: [], debris: [], bait: [] };
const game = { app: { terrainData: T, finds: none }, _pier: WORLD.pier, findsNear: Game.prototype.findsNear, windwardAt: Game.prototype.windwardAt, sandAt: Game.prototype.sandAt };
const at = ( x, z, finds = none ) => {

	game.app.finds = finds;
	return Game.prototype.habitatAtPoint.call( game, x, z, Math.max( 0, - T.heightAt( x, z ) ) );

};
// the share of bites by species at a spot (by day, or at `hour`), and the mean wait (s)
const bites = ( h, hour = 10, n = 3000 ) => {

	const c = {};
	for ( let i = 0; i < n; i ++ ) {

		const id = pickSpecies( h, hour, rng );
		if ( id ) c[ id ] = ( c[ id ] || 0 ) + 1 / n;

	}

	let wait = 0;
	for ( let i = 0; i < 400; i ++ ) wait += biteDelay( h, hour, rng ) / 400;
	return { c, wait, share: ( ...ids ) => ids.reduce( ( a, k ) => a + ( c[ k ] || 0 ), 0 ) };

};
const top = ( b ) => Object.entries( b.c ).sort( ( a, q ) => q[ 1 ] - a[ 1 ] ).slice( 0, 4 ).map( ( [ k, v ] ) => `${ k } ${ Math.round( v * 100 ) }%` ).join( ', ' );

// ---- the waters out there, found on the real seabed: a 200 m grid out to 14 km
const kinds = { shelf: [], edge: [], ledge: [], blue: [], bank: [] };
for ( let z = - 14000; z <= 14000; z += 200 ) for ( let x = - 14000; x <= 14000; x += 200 ) {

	const h = at( x, z ), d = - T.heightAt( x, z );
	if ( h.deep > 0.95 && d > 30 && d < 100 && h.edge === 0 ) kinds.shelf.push( [ x, z ] );
	if ( h.edge > 0.95 && d > 300 ) kinds.edge.push( [ x, z ] );
	if ( h.ledge > 0.95 ) kinds.ledge.push( [ x, z ] );
	if ( d > 1200 && h.edge === 0 && h.ledge === 0 ) kinds.blue.push( [ x, z ] );
	if ( h.reef > 0.5 && Math.hypot( x - SEABED.bank.x, z - SEABED.bank.z ) < SEABED.bank.a + 1500 ) kinds.bank.push( [ x, z ] );

}

console.log( `     on a 200 m grid out to 14 km: ${ Object.entries( kinds ).map( ( [ k, v ] ) => `${ k } ${ v.length }` ).join( ', ' ) }` );
// (a spot of each, and the mean of its bites over a few of them)
const some = ( list, n = 12 ) => list.filter( ( _, i ) => i % Math.max( 1, Math.floor( list.length / n ) ) === 0 ).slice( 0, n );
const over = ( list, hour = 10 ) => {

	const c = {};
	let wait = 0;
	const pts = some( list );
	for ( const [ x, z ] of pts ) {

		const b = bites( at( x, z ), hour, 800 );
		for ( const k in b.c ) c[ k ] = ( c[ k ] || 0 ) + b.c[ k ] / pts.length;
		wait += b.wait / pts.length;

	}

	return { c, wait, share: ( ...ids ) => ids.reduce( ( a, k ) => a + ( c[ k ] || 0 ), 0 ) };

};

check( kinds.shelf.length > 50 && kinds.edge.length > 50 && kinds.ledge.length > 5 && kinds.blue.length > 1000 && kinds.bank.length > 20, 'the shelf, the drop-off, the deep ledges, the open ocean and the bank\'s reef are all out there' );
const north = kinds.ledge.filter( ( [ , z ] ) => z < - 1500 ).length;
check( north > kinds.ledge.length * 0.3, `the deep ledges: the north's ledge among them (${ north } of ${ kinds.ledge.length })` );
const [ hx, hz ] = SEABED.hump[ 0 ];
const humpEdge = kinds.edge.filter( ( [ x, z ] ) => Math.hypot( x - hx, z - hz ) < 1500 ).length;
check( humpEdge > 3, `the hump's flanks are the drop-off's water too (${ humpEdge } within 1.5 km of its top)` );

const shelf = over( kinds.shelf ), edge = over( kinds.edge, 6.5 ), ledge = over( kinds.ledge ), blue = over( kinds.blue ), bank = over( kinds.bank );
console.log( `     the shelf: ${ top( shelf ) }; a bite every ${ shelf.wait.toFixed( 1 ) } s` );
console.log( `     the drop-off, at first light: ${ top( edge ) }; ${ edge.wait.toFixed( 1 ) } s` );
console.log( `     the deep ledges: ${ top( ledge ) }; ${ ledge.wait.toFixed( 1 ) } s` );
console.log( `     the open ocean: ${ top( blue ) }; ${ blue.wait.toFixed( 1 ) } s` );
console.log( `     the bank's top: ${ top( bank ) }; ${ bank.wait.toFixed( 1 ) } s` );
check( shelf.share( 'mahi', 'tuna' ) === 0, 'no mahi or tuna on the shelf: they\'re out in the blue water' );
check( edge.share( 'tuna' ) > 0.5 && edge.share( 'mahi', 'tuna' ) > 0.999, `the blackfin tuna the drop-off's fish at first light (${ Math.round( edge.share( 'tuna' ) * 100 ) }%), and no bottom fish over it: a bait won't reach them` );
check( ledge.share( 'silkSnapper' ) > 0.55, `the silk snapper the deep ledges' (${ Math.round( ledge.share( 'silkSnapper' ) * 100 ) }%)` );
check( blue.share( 'mahi', 'tuna' ) > 0.999, 'nothing but the wanderers in the open ocean: mahi and tuna' );
check( blue.wait > 2 * shelf.wait, `and few of them: a bite every ${ blue.wait.toFixed( 0 ) } s there, ${ shelf.wait.toFixed( 0 ) } on the shelf` );
const reefy = Object.entries( bank.c ).filter( ( [ k ] ) => [ 'yellowtail', 'grunt', 'sergeant', 'tang', 'angel', 'chromis', 'parrot', 'wrasse', 'muttonSnapper', 'graySnapper', 'lionfish', 'grouper', 'blackGrouper' ].includes( k ) ).reduce( ( a, [ , v ] ) => a + v, 0 );
check( reefy > 0.4, `the bank's top a reef: its fish ${ Math.round( reefy * 100 ) }% of the bites` );

// ---- what's found out there, in the open ocean: the mahi under the weed and the debris, the tuna under the
// birds, and the bites sooner by them
{

	const [ x, z ] = kinds.blue[ Math.floor( kinds.blue.length / 2 ) ];
	const weed = { weed: [ { x0: x - 300, z0: z - 2, x1: x + 300, z1: z - 2, width: 6, life: 1, n: 1 } ], debris: [], bait: [] };
	const log = { weed: [], debris: [ { x: x + 10, z, kind: 'log', size: 4, yaw: 0, life: 1, n: 2 } ], bait: [] };
	const birds = { weed: [], debris: [], bait: [ { x: x + 20, z, r: 40, life: 1, n: 3 } ] };
	const open = bites( at( x, z ) ), byWeed = bites( at( x, z, weed ) ), byLog = bites( at( x, z, log ) ), byBirds = bites( at( x, z, birds ) );
	console.log( `     ${ ( - T.heightAt( x, z ) ).toFixed( 0 ) } m of water: alone ${ top( open ) }, ${ open.wait.toFixed( 1 ) } s; by a weedline ${ top( byWeed ) }, ${ byWeed.wait.toFixed( 1 ) } s; by a log ${ top( byLog ) }, ${ byLog.wait.toFixed( 1 ) } s; under the birds ${ top( byBirds ) }, ${ byBirds.wait.toFixed( 1 ) } s` );
	check( byWeed.share( 'mahi' ) > 0.6 && byLog.share( 'mahi' ) > 0.5 && byLog.share( 'barracuda' ) > 0.05, 'the mahi under the weedline and the log, a barracuda or two about the log' );
	check( byBirds.share( 'tuna' ) > 0.55, 'the tuna under the birds, busting the bait, whatever the hour' );
	check( byWeed.wait < open.wait / 2 && byLog.wait < open.wait / 2 && byBirds.wait < open.wait / 2, 'and the bites come at least twice as fast by them' );
	// (how near: a few metres off a weedline's edge counts fully, 45 m off it not at all; a school's own water,
	// and fading out 80 m past it; and only as much as each one's life)
	const near = ( dz ) => at( x, z + dz, weed ).weed;
	check( near( 0 ) === 1 && near( 30 ) > 0 && near( 30 ) < 1 && near( 60 ) === 0, 'a weedline\'s fish within a few tens of metres of it' );
	const fading = { ...weed, weed: [ { ...weed.weed[ 0 ], life: 0.3 } ] };
	check( Math.abs( at( x, z, fading ).weed - 0.3 ) < 1e-9 && at( x + 140, z, birds ).birds === 0 && at( x + 20, z, birds ).birds === 1, 'as much as it\'s there (its life), and a school\'s own water' );

}

// ---- the fish finder (Minimap._richest, the sounder's fish: the sum of a spot's waters): nothing in the open
// ocean's empty water, but on the drop-off and under the birds
{

	const rich = ( h ) => Object.values( h ).reduce( ( a, v ) => a + v, 0 );
	const [ bx, bz ] = kinds.blue[ 0 ], [ ex, ez ] = kinds.edge[ 0 ];
	check( rich( at( bx, bz ) ) < 0.7 && rich( at( ex, ez ) ) > 0.7 && rich( at( bx, bz, { weed: [], debris: [], bait: [ { x: bx, z: bz, r: 40, life: 1 } ] } ) ) > 0.7, 'the fish finder marks none in the empty blue, but on the drop-off and under the birds' );

}

// ---- Joe's hints say where they are now
check( biteHint( 'mahi' ) === 'under the weedlines, by day' && biteHint( 'tuna' ) === 'where the birds are working, at dawn and dusk' && biteHint( 'silkSnapper' ) === 'on the deep ledges', `Joe's hints: mahi "${ biteHint( 'mahi' ) }", tuna "${ biteHint( 'tuna' ) }", silk snapper "${ biteHint( 'silkSnapper' ) }"` );

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
