// (M15) Beachcombing (game/Beachcomb.js, world/Beachcombing.js), under Node: each day's finds the same for
// everyone, a few on a calm day, more after a north sea and many after a hurricane, mostly on the north beach;
// the common things common and the ambergris rare but there to be found; each lying three days; where they lie
// on the sand (on both islands), not under the sea or up in the trees; the wrack line along the north beach's
// high-water line; and what you pick up kept, sold to Marta or Joe, and saved.
//
//   node test/beachcomb.mjs

import { readFileSync } from 'node:fs';
import { Group, MeshStandardMaterial } from '../src/engine/index.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { FINDS, KINDS, BEACHES, LIES, findsOf, lying, messageOf } from '../src/game/Beachcomb.js';
import { Beachcombing } from '../src/world/Beachcombing.js';
import { GameState } from '../src/game/GameState.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );

// ---- each day's finds
{

	check( JSON.stringify( findsOf( 41, { north: 0.6 } ) ) === JSON.stringify( findsOf( 41, { north: 0.6 } ) ), 'a day\'s finds are the same every time (the same for everyone)' );
	let ok = true, unique = true;
	const counts = { north: [ 1e9, 0 ], bay: [ 1e9, 0 ] };
	for ( let d = 0; d < 400; d ++ ) {

		const F = findsOf( d ), ids = new Set( F.map( ( f ) => f.id ) );
		if ( ids.size !== F.length ) unique = false;
		for ( const b of [ 'north', 'bay' ] ) {

			const n = F.filter( ( f ) => f.beach === b ).length;
			counts[ b ] = [ Math.min( counts[ b ][ 0 ], n ), Math.max( counts[ b ][ 1 ], n ) ];

		}

		for ( const f of F ) if ( ! FINDS[ f.kind ] || f.day !== d || ! ( f.u >= 0 && f.u < 1 ) || Math.abs( f.off ) > 1.5 || ! Number.isInteger( f.seed ) ) ok = false;

	}

	check( ok && unique, 'each find\'s a kind, along its beach, near its line, and its own' );
	check( counts.north[ 0 ] === BEACHES.north.n[ 0 ] && counts.north[ 1 ] === BEACHES.north.n[ 1 ], `on a calm day, ${ counts.north.join( ' to ' ) } on the north beach` );
	check( counts.bay[ 0 ] === 0 && counts.bay[ 1 ] <= BEACHES.bay.n[ 1 ], `and ${ counts.bay.join( ' to ' ) } in the bay, in the lee` );
	let calm = 0, rough = 0, storm = 0, bayStorm = 0;
	for ( let d = 0; d < 400; d ++ ) {

		calm += findsOf( d ).length;
		rough += findsOf( d, { north: 1 } ).length;
		const S = findsOf( d, { storm: true } );
		storm += S.length;
		bayStorm += S.filter( ( f ) => f.beach === 'bay' ).length;

	}

	check( rough > calm * 1.5, `more after a big north sea (${ ( rough / 400 ).toFixed( 1 ) } a day to ${ ( calm / 400 ).toFixed( 1 ) })` );
	check( storm > calm * 3 && bayStorm > 400 * 4, `and many after a hurricane (${ ( storm / 400 ).toFixed( 1 ) } a day, the bay's beach too)` );

	// how common each kind is
	const n = Object.fromEntries( KINDS.map( ( k ) => [ k, 0 ] ) );
	let all = 0;
	for ( let d = 0; d < 4000; d ++ ) for ( const f of findsOf( d, { north: 0.5 } ) ) {

		n[ f.kind ] ++;
		all ++;

	}

	check( KINDS.every( ( k ) => n[ k ] <= n.driftwood ), 'driftwood the commonest find' );
	check( n.ambergris > 0 && n.ambergris / all < 0.01, `ambergris rare but there to be found (${ n.ambergris } in 4000 days)` );
	check( n.glassFloat < n.trawlFloat / 4 && n.marysBean < n.seaHeart / 4, 'a glass float and a Mary\'s bean much rarer than their plain cousins' );

	// lying three days
	const L = lying( 20, () => ( { north: 0.3 } ) ), days = new Set( L.map( ( f ) => f.day ) );
	check( LIES === 3 && days.size === 3 && days.has( 18 ) && days.has( 20 ) && ! days.has( 17 ), 'what\'s on the sand: the last three days\' finds' );
	check( L.filter( ( f ) => f.day === 19 ).length === findsOf( 19, { north: 0.3 } ).length, 'each day\'s as that day\'s sea left it' );

	// who buys what
	check( FINDS.ambergris.who === 'joe' && FINDS.bottle.who === null && KINDS.filter( ( k ) => ! [ 'ambergris', 'bottle' ].includes( k ) ).every( ( k ) => FINDS[ k ].who === 'marta' ), 'Marta buys the beach\'s things, Joe the ambergris, nobody the bottle' );
	check( FINDS.ambergris.price > FINDS.glassFloat.price && FINDS.glassFloat.price > FINDS.marysBean.price && FINDS.marysBean.price > FINDS.driftwood.price, 'the rarer, the dearer' );
	check( [ 0, 7, - 3, 123456789, 3.7 ].every( ( s ) => { const m = messageOf( s ); return m && m.from && m.text.length > 20; } ), 'every bottle has its note' );

}

// ---- where they lie, on both islands
for ( const [ file, tier ] of [ [ 'island.bin', 'high' ], [ 'island-1024.bin', 'low' ] ] ) {

	const T = new TerrainData( 7, decodeIsland( read( file ) ) );
	const mat = new MeshStandardMaterial();
	const W = new Beachcombing( { terrain: T, materials: { nature: mat, wood: mat, hard: mat }, parent: new Group(), lite: tier === 'low' } );
	let on = 0, all = 0, lowest = 1e9, highest = - 1e9;
	for ( let d = 0; d < 60; d ++ ) for ( const f of findsOf( d, { north: 1, storm: d % 10 === 0 } ) ) {

		const [ x, z ] = W.at( f ), h = T.heightAt( x, z );
		all ++;
		lowest = Math.min( lowest, h );
		highest = Math.max( highest, h );
		if ( h > 0.4 && h < 3 ) on ++;

	}

	check( on === all, `${ tier }: every find lies on the sand above the swash (${ lowest.toFixed( 2 ) } to ${ highest.toFixed( 2 ) } m up)` );
	// two washed up together lie a step apart
	W.set( [ { id: 'a', day: 0, beach: 'north', kind: 'seaHeart', u: 0.4, off: 0, yaw: 0, seed: 1 }, { id: 'b', day: 1, beach: 'north', kind: 'trawlFloat', u: 0.4, off: 0, yaw: 0, seed: 2 } ] );
	const [ A, B ] = [ ...W.finds.values() ];
	check( Math.hypot( A.x - B.x, A.z - B.z ) >= 0.5 && W.nearest( A.x, A.z, 0.3 ) === A.f, `${ tier }: two washed up on one spot lie a step apart, each to be picked up` );
	W.set( [ { id: 'a', day: 0, beach: 'north', kind: 'seaHeart', u: 0.4, off: 0, yaw: 0, seed: 1 } ] );
	check( W.finds.size === 1 && W.finds.has( 'a' ) && W.group.children.length > 0, `${ tier }: one picked up is gone from the sand` );

	// the wrack line: along the north beach's line, on the sand, in its stretches
	let tris = 0, off = 0, verts = 0;
	const B0 = BEACHES.north;
	for ( let i = 0; i < 12; i ++ ) for ( const m of W._wrack( i ) ) {

		tris += m.geometry.index.count / 3;
		const p = m.geometry.attributes.position;
		for ( let k = 0; k < p.count; k += 7 ) {

			const x = p.getX( k ), y = p.getY( k ), z = p.getZ( k ), line = W.lineAt( 'north', x );
			verts ++;
			if ( x < B0.x[ 0 ] - 6 || x > B0.x[ 1 ] + 6 || Math.abs( z - line ) > 6 || y < T.heightAt( x, z ) - 0.08 ) off ++;

		}

	}

	check( off === 0, `${ tier }: the wrack along the north beach's high-water line, on the sand (${ verts } points looked at)` );
	check( tris > 20000 && tris < ( tier === 'low' ? 120000 : 400000 ), `${ tier }: its weight, ${ Math.round( tris / 1000 ) }k triangles` );
	W.dispose();

}

// ---- what you pick up: kept, sold, saved
{

	const s = new GameState( null );
	const f = ( day, k, kind ) => ( { id: `${ day }:north:${ k }`, day, beach: 'north', kind, seed: day * 10 + k } );
	check( s.pickFind( f( 10, 0, 'seaHeart' ) ) && s.finds.length === 1 && s.picked.includes( '10:north:0' ), 'picked up: in your finds, and not on the sand again' );
	check( ! s.pickFind( f( 10, 0, 'seaHeart' ) ) && ! s.pickFind( f( 10, 1, 'pearl' ) ), 'not twice, and nothing that isn\'t a find' );
	s.picked.push( '5:north:0', '6:north:1', '7:north:2' );
	s.pickFind( f( 10, 2, 'ambergris' ) );
	check( ! s.picked.includes( '5:north:0' ) && ! s.picked.includes( '6:north:1' ) && s.picked.includes( '7:north:2' ), 'what you\'ve picked up remembered only while it would still be lying there' );
	s.pickFind( f( 10, 3, 'glassFloat' ) );
	s.pickFind( f( 10, 4, 'bottle' ) );
	const q = s.quoteFinds( 'marta' );
	check( q.items.length === 2 && q.total === FINDS.seaHeart.price + FINDS.glassFloat.price, 'Marta\'s price for what she buys' );
	s.money = 10;
	const r = s.sellFinds( 'marta', [ '10:north:3' ] );
	check( r.count === 1 && r.total === FINDS.glassFloat.price && s.money === 10 + FINDS.glassFloat.price && s.finds.length === 3, 'one sold to her' );
	check( s.sellFinds( 'marta', [ '10:north:2' ] ).count === 0, 'she won\'t take the ambergris' );
	const j = s.sellFinds( 'joe' );
	check( j.count === 1 && j.total === FINDS.ambergris.price, 'Joe will' );
	check( s.dropFind( '10:north:0' ) && ! s.dropFind( '10:north:0' ) && s.finds.map( ( x ) => x.kind ).join() === 'bottle', 'a find tossed' );
	const t = new GameState( null );
	check( t.fromJSON( JSON.parse( JSON.stringify( s.toJSON() ) ) ) && t.finds.length === 1 && t.finds[ 0 ].kind === 'bottle' && t.picked.join() === s.picked.join(), 'your finds and what you\'ve picked up saved with the game' );
	const old = s.toJSON();
	delete old.finds;
	delete old.picked;
	check( t.fromJSON( old ) && t.finds.length === 0 && t.picked.length === 0, 'an old save loads with none' );
	check( t.fromJSON( { ...old, finds: [ { id: 'x', kind: 'pearl' }, null, { id: 3, kind: 'bottle' }, { id: '1:bay:0', kind: 'nickernut', day: 1, seed: 4 } ] } ) && t.finds.length === 1, 'and a bad one\'s junk dropped' );

}

console.log( failed ? `\n${ failed } failed` : '\nall ok' );
process.exit( failed ? 1 : 0 );
