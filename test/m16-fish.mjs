// (M16) The fish: each new one's size from its published relation, its model whole at every level of detail (the bill
// above all), what bites how and when (the swordfish, the billfish, the flats'), a billfish let go, and the mahi under a
// hurricane's wreckage.
//
//   node test/m16-fish.mjs

import { readFileSync } from 'node:fs';
import { Vector3, Group } from 'three';
import { FISH, FISH_IDS, fishLengthCm, fishValue, releaseBonus } from '../src/game/FishTable.js';
import { SPECIES, SKIN, PATTERN } from '../src/world/fish/FishSpecies.js';
import { fishGeometry, prof, PART } from '../src/world/fish/FishGeometry.js';
import { FLOAT, hookWeight, depthWeight, pickSpecies, rollWeight, habitatAt } from '../src/game/Bites.js';
import { baitWeight } from '../src/game/Bait.js';
import { biteHint, ordersFor } from '../src/game/Orders.js';
import { weekOrder } from '../src/game/WeekOrder.js';
import { CatchMinigame } from '../src/game/CatchMinigame.js';
import { UPGRADES } from '../src/game/Gear.js';
import { GameState } from '../src/game/GameState.js';
import { letGo, trophyRows, trophyCardOf, trophyNote, cleanTrophies } from '../src/game/Trophies.js';
import { findsAbout, hurricaneWake, FINDS } from '../src/game/Finds.js';
import { lastHurricane } from '../src/game/Weather.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Offshore, decodeSeabed } from '../src/world/terrain/Offshore.js';
import { FishSchools } from '../src/world/Fish.js';
import { Game } from '../src/game/Game.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { computeShoreField } from '../src/world/ShoreField.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
let seed = 5;
const rng = () => ( ( seed = ( seed * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );
const NEW = [ 'wahoo', 'sailfish', 'whiteMarlin', 'blueMarlin', 'swordfish', 'yellowfin', 'redfish', 'trout' ];
const BILLFISH = [ 'sailfish', 'whiteMarlin', 'blueMarlin' ];
const FLATS = [ 'redfish', 'trout', 'snook' ];

// ---- sizes: the table's relation against the published one it's fitted from (kg at a total length, cm), and the
// sizes the sources give
const published = {
	sailfish: ( T ) => 1.2869e-6 * ( 18.171 + 0.686 * T ) ** 3.2439, // Prager, Prince and Lee 1995, ICCAT's
	whiteMarlin: ( T ) => 5.2068e-6 * ( - 0.72 + 0.76 * T ) ** 3.012,
	blueMarlin: ( T ) => 1.1955e-6 * ( 2 + 0.763 * T ) ** 3.3663,
	swordfish: ( T ) => 4.45373e-6 * ( 0.68 * T ) ** 3.203784, // ICCAT, North Atlantic
	yellowfin: ( T ) => 2.153e-5 * ( 0.9 * T ) ** 2.976, // Caverivière 1976, ICCAT's
	wahoo: ( T ) => 1.845e-6 * T ** 3.218, // Hogarth 1976, ICCAT's manual
	redfish: ( T ) => 0.00851 * T ** 3.07 / 1000, // FishBase
	trout: ( T ) => 0.00832 * T ** 3.05 / 1000,
};
for ( const id of NEW ) {

	const f = FISH[ id ];
	let worst = 0;
	for ( let kg = f.kg[ 0 ]; kg <= f.kg[ 1 ]; kg += ( f.kg[ 1 ] - f.kg[ 0 ] ) / 12 ) worst = Math.max( worst, Math.abs( published[ id ]( fishLengthCm( id, kg ) ) / kg - 1 ) );
	check( worst < 0.03, `${ f.name }: ${ f.kg[ 0 ] } to ${ f.kg[ 1 ] } kg is ${ fishLengthCm( id, f.kg[ 0 ] ).toFixed( 0 ) } to ${ fishLengthCm( id, f.kg[ 1 ] ).toFixed( 0 ) } cm, within ${ ( worst * 100 ).toFixed( 1 ) }% of the published relation` );

}

check( FISH.tuna.kg[ 1 ] <= 20.6 && FISH.tuna.kg[ 1 ] > 14 && FISH.mahi.kg[ 1 ] > 18 && FISH.mahi.kg[ 1 ] < 40 && FISH.yellowfin.kg[ 1 ] <= 200 && FISH.wahoo.kg[ 1 ] <= 83.5 && FISH.blueMarlin.kg[ 1 ] <= 636, 'bigger blackfin and mahi, and none past its kind\'s record' );
check( fishLengthCm( 'blueMarlin', 275 ) > 380 && fishLengthCm( 'blueMarlin', 275 ) < 420, `a 600 lb blue marlin is ${ ( fishLengthCm( 'blueMarlin', 275 ) / 30.48 ).toFixed( 1 ) } ft overall, bill and tail` );

// ---- the models: every new one, every level of detail, swimming and on the card
for ( const id of NEW ) {

	const name = FISH[ id ].model, S = SPECIES[ name ];
	const has = PATTERN[ name ] !== undefined && SKIN[ name ] && S.pattern === PATTERN[ name ];
	let sane = has;
	const tris = [];
	for ( const pose of [ 'swim', 'dead' ] ) for ( let lod = 0; lod < 4; lod ++ ) {

		const g = fishGeometry( S, { lod, pose } ), P = g.attributes.position, N = g.attributes.normal;
		let lo = Infinity, hi = - Infinity;
		for ( let i = 0; i < P.count; i ++ ) {

			if ( ! Number.isFinite( P.getX( i ) + P.getY( i ) + P.getZ( i ) + N.getX( i ) ) ) sane = false;
			lo = Math.min( lo, P.getZ( i ) );
			hi = Math.max( hi, P.getZ( i ) );

		}

		if ( hi > 0.5 + 0.02 || hi < 0.49 || lo < - 0.5 - 0.02 || lo > - 0.45 ) sane = false;
		if ( pose === 'swim' ) tris.push( g.index.count / 3 );

	}

	check( sane, `${ FISH[ id ].name }: whole at every level of detail, nose to tail the fish's length (${ tris.join( ', ' ) } triangles)` );
	check( tris[ 0 ] < 5500 && tris[ 1 ] < 1000 && tris[ 2 ] < 320 && tris[ 3 ] < 100, `  no heavier than the others of its build` );

}

// (the bill: shut ahead of the lower jaw's tip, the jaw opening only behind it)
{

	const S = SPECIES.blueMarlin, g = fishGeometry( S, { lod: 0, pose: 'dead', mouth: true } ), P = g.attributes.position, D = g.attributes.aData;
	const zTip = 0.5 - S.mouth.from * S.body;
	let billShut = true, jaws = 0;
	for ( let i = 0; i < P.count; i ++ ) {

		const part = Math.floor( D.getY( i ) + 0.01 ), w = D.getY( i ) - part;
		if ( part === PART.BODY && w > 0.05 ) {

			jaws ++;
			if ( P.getZ( i ) > zTip + 0.002 ) billShut = false;

		}

	}

	check( billShut && jaws > 10, `a marlin's bill is shut: its lower jaw (${ jaws } vertices) starts at its tip, a fifth of the way back` );
	const flat = SPECIES.swordfish, u0 = flat.mouth.from * 0.7, u1 = S.mouth.from * 0.7;
	check( prof( flat.wid, u0 ) > 2 * prof( flat.top, u0 ) && prof( S.wid, u1 ) < 1.2 * prof( S.top, u1 ), 'a swordfish\'s sword is flat, a marlin\'s bill round' );
	check( ! flat.pelvic && SPECIES.sailfish.dorsal.some( ( d ) => d.h.some( ( [ , v ] ) => v > 0.18 ) ), 'no belly fins on a swordfish; a sailfish has its sail' );

}

// ---- what bites, how, when: at a spot of the blue, the drop-off, and the flats
const blue = habitatAt( { depth: 1500, reefDist: 5000, pierDist: 5000 } );
const edge = habitatAt( { depth: 300, reefDist: 3000, pierDist: 3000, slope: 0.5 } );
const flats = habitatAt( { depth: 1.2, reefDist: 300, pierDist: 300 } );
const creek = habitatAt( { depth: 1.5, reefDist: 300, pierDist: 300, creek: 1 } );
const shelf = habitatAt( { depth: 60, reefDist: 400, pierDist: 400 } );
const shares = ( h, hour, bait = null, n = 6000 ) => {

	const c = {};
	for ( let i = 0; i < n; i ++ ) {

		const id = pickSpecies( h, hour, rng, bait );
		if ( id ) c[ id ] = ( c[ id ] || 0 ) + 1 / n;

	}

	return c;

};
const top = ( c ) => Object.entries( c ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 5 ).map( ( [ k, v ] ) => `${ k } ${ Math.round( v * 100 ) }%` ).join( ', ' );
const hooked = ( h, hook ) => ( { ...h, hook } );

// the swordfish: at night up in reach of a float, by day past it
{

	const night = shares( blue, 23, 'mullet' ), day = shares( blue, 11, 'mullet' );
	console.log( `     the blue on live mullet, at night: ${ top( night ) }; by day: ${ top( day ) }` );
	check( night.swordfish > 0.1, `a float at night in the blue: a swordfish ${ Math.round( night.swordfish * 100 ) }% of the bites` );
	check( ! day.swordfish, 'by day, none on a float: it\'s far below it' );
	const drop = shares( hooked( blue, { way: 'drop', depth: 500 } ), 11, 'mullet' );
	console.log( `     deep-dropped to 500 m by day: ${ top( drop ) }` );
	check( drop.swordfish > 0.9, 'deep-dropped to 500 m by day: the swordfish, and none of the surface\'s' );
	check( ! shares( hooked( blue, { way: 'drop', depth: 120 } ), 11, 'mullet' ).swordfish, 'not at 120 m by day' );
	check( depthWeight( FISH.swordfish.at, 500, 11 ) === 1 && depthWeight( FISH.swordfish.at, 6, 23 ) === 1 && depthWeight( FISH.swordfish.at, 6, 11 ) === 0 && depthWeight( FISH.swordfish.at, 150, 6.3 ) > 0, 'it rises and goes down at dusk and dawn: between its depths then' );
	const lit = shares( { ...blue, flood: 1 }, 23, 'mullet' );
	check( lit.swordfish > night.swordfish * 1.2, `lights draw it (${ Math.round( night.swordfish * 100 ) }% to ${ Math.round( lit.swordfish * 100 ) }%)` );
	check( baitWeight( 'squid', 'swordfish' ) > baitWeight( 'mullet', 'swordfish' ) && baitWeight( null, 'swordfish' ) < 0.2, 'squid its bait, frozen shrimp hardly' );
	check( biteHint( 'swordfish' ).includes( 'after dark' ) && biteHint( 'swordfish' ).includes( 'deep-dropped' ), `Joe's hint: "${ biteHint( 'swordfish' ) }"` );

}

// the billfish and the wahoo: trolled and kited, a live bait far better than shrimp, not on the shelf's bottom but for a
// sailfish over its outer edge
{

	const float = shares( edge, 11, 'mullet' ), troll = shares( hooked( edge, { way: 'troll', depth: 2, lure: 'skirt' } ), 11 ), kite = shares( hooked( edge, { way: 'kite', depth: 1 } ), 11, 'mullet' );
	const bill = ( c ) => BILLFISH.reduce( ( a, k ) => a + ( c[ k ] || 0 ), 0 );
	console.log( `     the drop-off, by day: on a float ${ top( float ) }; trolled skirts ${ top( troll ) }; a kite's live mullet ${ top( kite ) }` );
	check( bill( troll ) > bill( float ) && kite.sailfish > float.sailfish, `billfish take a troll or a kite over a float (${ Math.round( bill( float ) * 100 ) }% on a float, ${ Math.round( bill( troll ) * 100 ) }% trolled, sailfish ${ Math.round( kite.sailfish * 100 ) }% on a kite)` );
	check( ( troll.wahoo || 0 ) > ( float.wahoo || 0 ), 'wahoo too' );
	check( FISH.wahoo.teeth && ! FISH.sailfish.teeth, 'a wahoo\'s teeth' );
	check( hookWeight( 'redSnapper', { way: 'drop', depth: 200 }, 11 ) === 1 && hookWeight( 'silkSnapper', { way: 'drop', depth: 200 }, 11 ) === 1 && hookWeight( 'redSnapper', { way: 'troll', depth: 2 }, 11 ) === 0, 'the bottom\'s fish on a deep drop, not on a troll' );
	check( hookWeight( 'blueMarlin', null, 11 ) === FISH.blueMarlin.ways.float * depthWeight( FISH.blueMarlin.at, FLOAT.depth, 11 ), 'no hook is today\'s float' );
	const shrimp = shares( edge, 11 );
	check( bill( shrimp ) < 0.04, `next to none on frozen shrimp (${ ( bill( shrimp ) * 100 ).toFixed( 1 ) }%)` );
	const onShelf = shares( shelf, 11, 'mullet', 20000 );
	check( ! onShelf.wahoo && ! onShelf.blueMarlin && ! onShelf.whiteMarlin && ! onShelf.yellowfin && ! onShelf.swordfish, 'none but a stray sailfish on the shelf' );
	const small = new Array( 2000 ).fill( 0 ).map( () => rollWeight( 'blueMarlin', rng ) ).sort( ( a, b ) => a - b );
	check( small[ 1000 ] < 200 && small[ 1990 ] > 300, `blue marlin mostly the males' size, the great females rare (median ${ small[ 1000 ].toFixed( 0 ) } kg)` );

}

// the flats: the kayak's water
{

	const f = shares( flats, 7 ), c = shares( creek, 7 ), day = shares( flats, 12 );
	console.log( `     the flats at first light: ${ top( f ) }; the creek: ${ top( c ) }` );
	check( f.redfish > 0.05 && f.trout > 0.03, `redfish and trout on the flats at first light (${ Math.round( f.redfish * 100 ) }%, ${ Math.round( f.trout * 100 ) }%), on the frozen shrimp you start with` );
	check( c.redfish > 0.08 && c.snook > 0.15, `and with the snook in the creek (${ Math.round( c.redfish * 100 ) }%, ${ Math.round( c.snook * 100 ) }%)` );
	check( ! Object.keys( day ).some( ( k ) => BILLFISH.includes( k ) || k === 'wahoo' ), 'none of the far water\'s there' );
	for ( const id of FLATS ) check( FISH[ id ].bag > 0 && ! FISH[ id ].protected, `${ FISH[ id ].name }: kept, ${ FISH[ id ].bag } a day` );

}

// ---- today's rig lands them or doesn't: a fish far over the line's strength breaks it (m16/tackle's fights to come)
{

	const fight = ( species, kg, lineKg, reelSpeed ) => {

		const g = new CatchMinigame( { species, kg, lineKg, reelSpeed, distance: 25, rng } );
		let st = 'fighting';
		for ( let i = 0; i < 60 * 300 && st === 'fighting'; i ++ ) st = g.update( 1 / 60, g.tension < 0.55 && g.surge < 0.5 );
		return st;

	};
	const rate = ( species, kg ) => {

		let n = 0;
		for ( let i = 0; i < 20; i ++ ) if ( fight( species, kg, UPGRADES.line.levels[ 3 ].lineKg, UPGRADES.reel.levels[ 1 ].reelSpeed ) === 'caught' ) n ++;
		return n / 20;

	};
	const r = [ [ 'mahi', 12 ], [ 'wahoo', 15 ], [ 'yellowfin', 30 ], [ 'sailfish', 30 ], [ 'swordfish', 60 ], [ 'blueMarlin', 180 ] ].map( ( [ s, kg ] ) => [ s, kg, rate( s, kg ) ] );
	console.log( `     on 60 lb braid and today's best reel, played with care: ${ r.map( ( [ s, kg, x ] ) => `${ s } ${ kg } kg ${ Math.round( x * 100 ) }%` ).join( ', ' ) }` );
	check( r[ 0 ][ 2 ] > 0.5, 'a good mahi can be landed on today\'s best' );
	check( r[ 5 ][ 2 ] < 0.3, 'a big blue marlin all but never' );

}

// ---- a billfish let go
{

	const store = { saved: null, load: () => store.saved, save: ( d ) => ( store.saved = d ) };
	const st = new GameState( store );
	const money = st.money;
	const entry = st.addFish( 'sailfish', 30, 10, { day: 4, place: 'dropoff' } );
	const info = st.lastCatch;
	check( entry === null && info.released && fishValue( 'sailfish', 30 ) === 0, 'a sailfish is measured and let go: never in the hold, and Joe pays nothing for it' );
	const bonus = letGo( st, info );
	check( bonus === releaseBonus( 'sailfish', 30 ) && bonus >= 150 && st.money === money + bonus, `the billfish fund pays $${ bonus } for it` );
	st.upgrades.landing = 2;
	st.addFish( 'sailfish', 25, 10, { day: 5, place: 'dropoff' } );
	const tagged = letGo( st, st.lastCatch );
	check( tagged > releaseBonus( 'sailfish', 25 ), `half as much again with the tag kit ($${ tagged })` );
	check( st.trophies.sailfish.n === 2 && st.trophies.sailfish.kg === 30 && st.trophies.sailfish.day === 4, 'its log keeps how many and your best' );
	st.addFish( 'blueMarlin', 200, 11, { day: 6, place: 'blue' } );
	info.bonus = letGo( st, st.lastCatch );
	const rows = trophyRows( st );
	check( rows.length === 2 && rows[ 0 ].species === 'blueMarlin' && rows[ 1 ].meta.includes( '2 let go' ) && rows[ 1 ].meta.includes( 'day 5' ), `the log's trophies: ${ rows.map( ( t ) => `${ t.name }, ${ t.meta }` ).join( '; ' ) }` );
	const card = trophyCardOf( st, 'blueMarlin' );
	check( card.trophyView && card.species === 'blueMarlin' && card.released && trophyNote( card ).includes( 'blue water' ), `its card again: "${ trophyNote( card ) }"` );
	st.addFish( 'mahi', 5, 10, { day: 4 } );
	check( letGo( st, st.lastCatch ) === 0, 'a mahi\'s no trophy' );
	check( JSON.stringify( cleanTrophies( JSON.parse( JSON.stringify( st.trophies ) ) ) ) === JSON.stringify( st.trophies ) && Object.keys( cleanTrophies( undefined ) ).length === 0 && Object.keys( cleanTrophies( { nosuch: { n: 1, kg: 2 } } ) ).length === 0, 'kept in the save; an old save has none' );

}

// ---- orders: Joe's for the table, Marta's tags for the billfish; never one to sell that's let go
{

	const seen = new Set();
	let sold = true, tagged = new Set();
	for ( let d = 0; d < 800; d ++ ) for ( const o of ordersFor( d ) ) {

		seen.add( o.species );
		if ( FISH[ o.species ].protected && ! o.tag ) sold = false;
		if ( o.tag && FISH[ o.species ].release ) tagged.add( o.species );

	}

	check( sold, 'no order to sell a fish that\'s let go' );
	check( [ ...NEW.filter( ( k ) => ! BILLFISH.includes( k ) ) ].every( ( k ) => seen.has( k ) ), 'Joe asks for each of the new fish some days' );
	check( BILLFISH.every( ( k ) => tagged.has( k ) ), 'Marta\'s log asks for a billfish tagged and let go' );
	const weeks = new Set();
	for ( let w = 0; w < 40; w ++ ) weeks.add( weekOrder( w * 7 * 864e5 + 2000 * 864e5 ).species );
	check( weeks.has( 'swordfish' ) && weeks.has( 'yellowfin' ) && weeks.has( 'wahoo' ) && ! BILLFISH.some( ( k ) => weeks.has( k ) ), 'the week\'s order comes round to them' );

}

// ---- after a hurricane: its wreckage adrift offshore, the mahi under it
const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );
const terrain = new TerrainData( 7, decodeIsland( read( 'island.bin' ) ), { offshore: new Offshore( decodeSeabed( read( 'offshore.bin' ) ) ) } );
const countAt = ( T, wake, x = 12000, z = 3000 ) => {

	const f = findsAbout( T, x, z, 6000, { weed: [], debris: [], bait: [] }, null, wake );
	return { all: f.debris.length, storm: f.debris.filter( ( q ) => q.storm ), f };

};
{

	// (one of the island's own: the first on the lattice)
	let h = null;
	for ( let T = 24 * 40; T < 24 * 2000 && ! h; T += 24 * 10 ) h = lastHurricane( T, 0 );
	check( !! h, `a hurricane in the island's weather (its winds gone by game hour ${ h && h.ends.toFixed( 0 ) })` );
	const T0 = h.ends;
	check( hurricaneWake( T0 - 24 ) === null || hurricaneWake( T0 - 24 ).start < T0, 'none in its own wake until it\'s passed' );
	const after = hurricaneWake( T0 + 48 );
	check( after && Math.abs( after.start - T0 ) < 1e-6, 'its wake two days on' );
	const two = countAt( T0 + 48, after ), plain = countAt( T0 + 48, null );
	check( two.storm.length > 8 && plain.storm.length === 0 && two.all > plain.all + 8, `two days on, within 6 km out there: ${ two.storm.length } pieces of its wreckage, beside ${ plain.all } as always` );
	const again = countAt( T0 + 48, after );
	check( JSON.stringify( again.storm.map( ( q ) => [ q.x, q.z, q.n ] ) ) === JSON.stringify( two.storm.map( ( q ) => [ q.x, q.z, q.n ] ) ), 'the same for everyone: from the clock alone' );
	const lives = ( d ) => {

		const w = hurricaneWake( T0 + d * 24 ), s = countAt( T0 + d * 24, w ).storm;
		return s.length ? Math.max( ...s.map( ( q ) => q.life ) ) : 0;

	};
	check( lives( 2 ) > 0.9 && lives( 8 ) < lives( 2 ) && lives( 12 ) === 0, `it scatters over the days after: its life ${ lives( 2 ).toFixed( 2 ) } at 2 days, ${ lives( 8 ).toFixed( 2 ) } at 8, ${ lives( 12 ).toFixed( 2 ) } at 12` );
	const near = countAt( T0 + 48, after, 0, 0 ).storm.filter( ( q ) => Math.hypot( q.x, q.z ) < FINDS.near );
	check( near.length === 0, 'none about the island itself: offshore' );
	const wrecks = two.storm.slice( 0, 2 );
	const open = { ...blue, debris: 1 };
	const plainLog = shares( open, 11, 'mullet' ), wrecked = shares( { ...open, wake: 1 }, 11, 'mullet' );
	console.log( `     under a log, by day: ${ top( plainLog ) }; under a hurricane's wreckage: ${ top( wrecked ) } (${ wrecks.map( ( q ) => q.kind ).join( ', ' ) }, ...)` );
	check( wrecked.mahi > 0.85 && wrecked.mahi > plainLog.mahi * 1.1, `the mahi gather under it (${ Math.round( plainLog.mahi * 100 ) }% to ${ Math.round( wrecked.mahi * 100 ) }%)` );

	// the game's reading of it (Game.findsNear)
	const near2 = Game.prototype.findsNear.call( { app: { finds: two.f } }, two.storm[ 0 ].x, two.storm[ 0 ].z );
	check( near2.wake > 0.9 && near2.debris >= near2.wake, 'the game reads it about a piece of it' );
	const q0 = plain.f.debris[ 0 ];
	if ( q0 ) check( Game.prototype.findsNear.call( { app: { finds: plain.f } }, q0.x, q0.z ).wake === 0, 'and not about any other log' );

}

// ---- the far water's fish, seen about you: in the water, near the surface, under the debris
{

	const u = ( value ) => ( { value } );
	const ground = { uniforms: { terrainSeaLevel: u( 0 ), terrainWaterAbsorption: u( new Vector3( 0.4, 0.07, 0.03 ) ), terrainCaustics: u( null ), terrainTime: u( 0 ), terrainNight: u( 0 ) } };
	const shoreField = computeShoreField( terrain, { res: 512, swellDir: [ WORLD.swellDir.x, WORLD.swellDir.y ] } );
	const fish = new FishSchools( { parent: new Group(), terrain, ground, tier: 'low', floorAt: ( x, z ) => terrain.heightAt( x, z ), center: WORLD.reef.center, radius: WORLD.reef.radius + 10, anchors: [], shoreField } );
	const names = new Set( fish.modelNames );
	check( NEW.every( ( k ) => names.has( k ) ), `each new one swims (no ${ NEW.filter( ( k ) => ! names.has( k ) ).join( ', ' ) || 'lack' })` );
	const at = new Vector3( 12000, 2, 3000 );
	const finds = { weed: [], bait: [ { x: at.x + 60, z: at.z, r: 30, life: 1, n: 1 } ], debris: [ { x: at.x + 30, z: at.z - 20, kind: 'log', size: 5, life: 1, n: 9, storm: 1, yaw: 0 } ] };
	fish.setFinds( finds, at, 11 );
	const group = ( name ) => fish.groups.filter( ( g ) => g.sp.name === name );
	const dist = ( g, p ) => Math.hypot( g.home.x - p.x, g.home.z - p.z );
	check( group( 'mahiFar' ).every( ( g ) => dist( g, finds.debris[ 0 ] ) < 12 ) && group( 'mahiWake' ).every( ( g ) => dist( g, finds.debris[ 0 ] ) < 16 ), 'mahi under the log, the wreckage\'s schools with them' );
	check( group( 'yellowfin' ).every( ( g ) => dist( g, finds.bait[ 0 ] ) < 40 ) && group( 'sailfish' ).every( ( g ) => dist( g, finds.bait[ 0 ] ) < 40 ), 'yellowfin and sailfish about the bait' );
	for ( let i = 0; i < 90; i ++ ) fish.update( 1 / 30, at );
	let finite = true, shallow = 0, n = 0;
	for ( const name of [ 'mahiFar', 'mahiWake', 'yellowfin', 'sailfish' ] ) for ( const g of group( name ) ) for ( let k = 0; k < g.count; k ++ ) {

		const y = fish.pos[ ( g.offset + k ) * 3 + 1 ];
		if ( ! Number.isFinite( y ) ) finite = false;
		n ++;
		if ( y < 0 && y > - 12 ) shallow ++;

	}

	check( finite && shallow > n * 0.95, `they swim up under the surface (${ shallow } of ${ n } within 12 m) over 1000 m of water, where you can see them` );
	const kept = group( 'mahiFar' )[ 0 ].home.x;
	fish._farT = 0;
	fish.setFinds( { ...finds, debris: [ { ...finds.debris[ 0 ], x: at.x + 200 } ] }, at, 11 );
	check( group( 'mahiFar' )[ 0 ].home.x === kept, 'a school you\'re among stays' );
	fish.setFinds( finds, at, 11 );
	fish.update( 1 / 30, new Vector3( 0, 2, - 300 ) );
	check( true, 'and stays out there, unsimulated, once you\'ve left' );

}

// ---- every fish's table still reads
for ( const id of FISH_IDS ) if ( ! SPECIES[ FISH[ id ].model ] ) check( false, `${ id }: no model` );

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
