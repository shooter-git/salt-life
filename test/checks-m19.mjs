// (M19) Stream CHECKS (docs/m19/checks.md), in plain Node on the real island (both bakes):
//   - the radio's shadow: from behind the island's ridge a set raises Pearl, not Marta; from the south, Marta; round the east
//     and the west, both; a headland under VHF_CLEAR doesn't stop it;
//   - a flare's seen from the village or Pearl's camp, whichever has it in reach and over the hills: not from the island's middle;
//   - a slam reached through real fights;
//   - the stars' sky turns with the sun, a little more each day.
//   node test/checks-m19.mjs
import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { inSight, SHORE_AERIAL, SHORE_VHF_H, VHF_CLEAR, WATCHERS, FLARE_M } from '../src/game/Seaworthy.js';
import { DaysOut } from '../src/game/DaysOut.js';
import { G } from '../src/core/Globals.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else console.log( 'ok  ', msg );

};
const ISLE = { x: 30, z: - 320 };
// k sixteenths round from the north, clockwise, r m out from the island's middle
const round = ( k, r ) => ( { x: ISLE.x + Math.sin( k / 16 * Math.PI * 2 ) * r, z: ISLE.z - Math.cos( k / 16 * Math.PI * 2 ) * r } );

for ( const file of [ 'island.bin', 'island-1024.bin' ] ) {

	const T = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( `../public/world/${ file }`, import.meta.url ) ) ) ) );
	const sea = G.seaLevel.value;
	const d = Object.assign( Object.create( DaysOut.prototype ), { app: { terrainData: T, boatCtl: { position: { x: 0, z: 0 } } }, game: { state: { stats: { vhfH: 3.71 } } } } );
	const raises = ( p ) => {

		d.app.boatCtl.position = p;
		return ( d.radioSees( 'marta' ) ? 'M' : '' ) + ( d.radioSees( 'pearl' ) ? 'P' : '' );

	};
	// ---- the radio's shadow
	const north = [ 15, 0, 1 ].map( ( k ) => raises( round( k, 1500 ) ) ), south = [ 7, 8, 9 ].map( ( k ) => raises( round( k, 1500 ) ) ), sides = [ 4, 12 ].map( ( k ) => raises( round( k, 3000 ) ) );
	ok( north.every( ( r ) => r === 'P' ) && south.every( ( r ) => r === 'M' ), `${ file }: the north raises Pearl and not Marta (${ north.join( ' ' ) }), the south Marta and not Pearl (${ south.join( ' ' ) })` );
	ok( sides.every( ( r ) => r.includes( 'M' ) ), `round the east and the west, 3 km out, Marta (${ sides.join( ' ' ) })` );
	let none = 0;
	for ( let k = 0; k < 16; k ++ ) for ( const r of [ 1500, 3000 ] ) {

		const p = round( k, r );
		if ( T.heightAt( p.x, p.z ) < sea - 1 && ! raises( p ) ) none ++;

	}

	ok( none === 0, `nowhere round the island 1.5 and 3 km out raises nobody (${ none })` );
	const A = SHORE_AERIAL.marta, me = round( 0, 1500 ), line = { x: me.x, y: sea + 3.71, z: me.z }, her = { x: A.x, y: sea + SHORE_VHF_H.marta, z: A.z };
	ok( ! inSight( ( x, z ) => T.heightAt( x, z ), line, her, VHF_CLEAR ) && ! inSight( ( x, z ) => T.heightAt( x, z ), line, her ), 'from the north the ridge stands more than VHF_CLEAR over the line to Marta\'s aerial' );

	// ---- the flares
	const day = FLARE_M.day, night = FLARE_M.night;
	const n = round( 0, 1500 ), s = round( 8, 900 );
	const fromIsle = ( p, reach ) => Math.hypot( p.x - ISLE.x, p.z - ISLE.z ) < reach;
	ok( d.flareSeen( n.x, n.z, day ) && d.flareSeen( s.x, s.z, day ), 'by day, a flare north of the island is seen (from Pearl\'s camp), and one south of it (from the village)' );
	const far = round( 0, 3400 );
	ok( ! d.flareSeen( far.x, far.z, day ) && fromIsle( far, day + 1000 ), 'one 3.4 km north of the middle, past the camp\'s 2.8 km by day: not seen, where the island\'s middle had it within reach of its own shore' );
	const behind = round( 8, 2500 );
	ok( d.flareSeen( behind.x, behind.z, night ) && Math.hypot( behind.x - WATCHERS.camp.x, behind.z - WATCHERS.camp.z ) < night, 'by night one far south, in the camp\'s reach too, is seen (from the village)' );

}

// ---- (M18's list) a slam reached through real fights: each kind fought on the tackle a player would take to it (the game's own
// terms, tools/fight-sweep.mjs), played with care, landed, and the slams counted from what was landed
{

	const { fightOnce, combos } = await import( '../tools/fight-sweep.mjs' );
	const { GameState } = await import( '../src/game/GameState.js' );
	const { slamCatch } = await import( '../src/game/Trophies.js' );
	const C = Object.fromEntries( combos().map( ( c ) => [ c.key, c ] ) );
	const st = new GameState( { getItem: () => null, setItem() {} } ), day = 5, said = [];
	let got = [];
	for ( const [ id, kg, key ] of [ [ 'bonefish', 2.6, 'F8' ], [ 'permit', 9, 'F10' ], [ 'tarpon', 30, 'F12' ], [ 'snook', 5, 'L1/R1/hand' ] ] ) {

		let seed = 1, o;
		while ( ( o = fightOnce( C[ key ], id, kg, seed ) ).st !== 'caught' && seed < 40 ) seed ++;
		said.push( `a ${ kg } kg ${ id } on ${ key } (${ o.st === 'caught' ? `landed in ${ o.t.toFixed( 0 ) } s, fight ${ seed }` : 'never landed' })` );
		if ( o.st !== 'caught' ) continue;
		st.inventory = [];
		st.addFish( id, kg, 9, { day, place: null } );
		got = got.concat( slamCatch( st, st.lastCatch, day ) );

	}

	ok( got.join() === 'grand,superGrand', `the grand slam and the super grand slam, reached through real fights: ${ said.join( '; ' ) }` );

}

// ---- the stars' sky turns
{

	const { Sky } = await import( '../src/sky/Sky.js' ).catch( () => ( {} ) );
	const src = readFileSync( new URL( '../src/sky/Sky.js', import.meta.url ), 'utf8' );
	ok( /uniform mat3 skyCelestial/.test( src ) && /vec3 cd = skyCelestial \* dir;/.test( src ) && /makeRotationAxis\( _pole/.test( src ), 'the stars looked up on the turning sky (skyCelestial), the horizon\'s light by where you look' + ( Sky ? '' : ' (the sky\'s class not loaded in Node)' ) );

}

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
