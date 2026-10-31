// (M15) The places a fish is caught (game/Places.js, over the real island and seabed): each named as it should
// be; a catch carries its place, the first fish at each noted in your log (and saved); Joe's ask for a place's
// fish pays as no other, for that place's fish only; Marta's tag-and-release ask pays as a fish is let go.
//
//   node test/places.mjs

import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Offshore, decodeSeabed } from '../src/world/terrain/Offshore.js';
import { SEABED } from '../src/world/terrain/SeabedModel.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { Game } from '../src/game/Game.js';
import { PLACES, placeOf } from '../src/game/Places.js';
import { GameState } from '../src/game/GameState.js';
import { ordersFor, orderFor, tagFor, PLACE_MUL } from '../src/game/Orders.js';
import { fishValue } from '../src/game/FishTable.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );
const T = new TerrainData( 7, decodeIsland( read( 'island.bin' ) ), { offshore: new Offshore( decodeSeabed( read( 'offshore.bin' ) ) ) } );
const P = Game.prototype;
const game = { app: { terrainData: T, finds: null }, _pier: WORLD.pier, findsNear: P.findsNear, windwardAt: P.windwardAt, sandAt: P.sandAt, windReefAt: P.windReefAt, habitatAtPoint: P.habitatAtPoint };
const at = ( x, z ) => {

	const h = P.habitatAtPoint.call( game, x, z, Math.max( 0, - T.heightAt( x, z ) ) );
	h.side = P.windwardAt.call( game, x, z );
	h.big = P.windReefAt.call( game, x, z );
	return placeOf( h, x, z );

};

// ---- the places, on the real island and the seabed out there
{

	const spots = {
		bay: [ 20, 60 ], creek: [ - 478, - 158 ], windReef: [ WORLD.northReef.center.x, WORLD.northReef.center.z ], northBeach: null,
		bank: [ SEABED.bank.x, SEABED.bank.z ], hump: [ SEABED.hump[ 0 ][ 0 ], SEABED.hump[ 0 ][ 1 ] ], blue: [ 3000, 9000 ],
	};
	// (the north beach's wash: the first spot along the north shore it is)
	for ( let x = - 100; x < 150 && ! spots.northBeach; x += 2 ) for ( let z = - 880; z < - 820 && ! spots.northBeach; z += 1 ) if ( at( x, z ) === 'northBeach' ) spots.northBeach = [ x, z ];
	// (the drop-off and the north ledge: the first such along a line out north)
	for ( let z = - 1200; z > - 4000 && ( ! spots.dropoff || ! spots.ledge ); z -= 20 ) {

		const p = at( 0, z );
		if ( p === 'dropoff' && ! spots.dropoff ) spots.dropoff = [ 0, z ];
		if ( p === 'ledge' && ! spots.ledge ) spots.ledge = [ 0, z ];

	}

	const got = Object.fromEntries( Object.entries( spots ).map( ( [ k, p ] ) => [ k, p ? at( p[ 0 ], p[ 1 ] ) : null ] ) );
	console.log( `     ${ Object.entries( spots ).map( ( [ k, p ] ) => `${ k } at ${ p ? p.map( Math.round ).join( ', ' ) : '?' } → ${ got[ k ] }` ).join( '; ' ) }` );
	check( Object.entries( got ).every( ( [ k, v ] ) => k === v ), 'the bay, the mangrove creek, the windward reef, the north beach, the bank, the hump, the blue water, the drop-off and the north ledge, each where it is' );
	check( Object.keys( PLACES ).every( ( k ) => PLACES[ k ].name ), 'each with its name' );

}

// ---- a catch's place, and the first at each in your log (saved)
{

	const m = new Map();
	const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	const a = st.addFish( 'pompano', 1.2, 7, { place: 'northBeach', day: 3 } ), first = st.lastCatch.firstAt;
	st.addFish( 'pompano', 0.9, 8, { place: 'northBeach', day: 3 } );
	const second = st.lastCatch.firstAt;
	st.addFish( 'grunt', 0.5, 9, { place: 'bay', day: 3 } );
	check( a.place === 'northBeach' && first === 'northBeach' && second === null && st.lastCatch.firstAt === 'bay' && st.places.northBeach.n === 2 && st.places.northBeach.first === 'pompano', 'a catch carries its place; the first fish at each is noted' );
	const s2 = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: () => {} } );
	check( s2.load() && s2.places.northBeach.n === 2 && s2.places.bay.day === 3 && s2.inventory.find( ( f ) => f.id === a.id ).place === 'northBeach', 'and it\'s all saved' );

}

// ---- a place's ask
{

	let day = 0, ask = null;
	for ( ; day < 200; day ++ ) {

		ask = ordersFor( day ).find( ( o ) => o.place && o.who === 'joe' && o.species === 'pompano' );
		if ( ask ) break;

	}

	const asks = new Set();
	for ( let d = 0; d < 400; d ++ ) for ( const o of ordersFor( d ) ) if ( o.place ) asks.add( `${ o.species }@${ o.place }` );
	console.log( `     ${ asks.size } asks for a place's fish over 400 days; pompano from the north beach first on day ${ day }` );
	check( ask && asks.size >= 9, 'a different place\'s fish asked for most days, Joe\'s and Marta\'s' );
	const orders = ordersFor( day ), m = new Map();
	const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	const here = st.addFish( 'pompano', 1.5, 7, { place: 'northBeach' } ), there = st.addFish( 'pompano', 1.5, 7, { place: 'bay' } );
	const q = st.quote( null, { who: 'joe', orders, day } );
	check( q.prices.get( here.id ) === Math.round( fishValue( 'pompano', 1.5 ) * PLACE_MUL ) && q.prices.get( there.id ) === fishValue( 'pompano', 1.5 ), `the north beach's pompano at ${ PLACE_MUL } times its price, the bay's at Joe's` );
	const ids = st.wantedIds( orders, day );
	check( ids.has( here.id ) && ! ids.has( there.id ) && orderFor( orders, 'joe', 'pompano', 'northBeach' ).id === ask.id && orderFor( orders, 'joe', 'pompano', 'bay' ) === null, 'only the place\'s fish is wanted' );

}

// ---- Marta's tag-and-release ask: paid as it's let go, as many as it wants
{

	let day = 0, tag = null;
	for ( ; day < 300 && ! tag; day ++ ) tag = ordersFor( day ).find( ( o ) => o.tag );
	day --;
	const orders = ordersFor( day ), st = new GameState( { getItem: () => null, setItem: () => {} } );
	const t = tagFor( orders, tag.species, tag.place ), elsewhere = tagFor( orders, tag.species, 'bay' );
	const paid = st.tag( t, day ), again = st.tag( t, day );
	check( t && t.id === tag.id && ! elsewhere && paid === tag.each && again === 0 && st.money === tag.each, `Marta's ${ tag.species } let go at ${ PLACES[ tag.place ].name }: $${ paid }, once` );

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
