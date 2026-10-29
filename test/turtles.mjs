// (M15) The turtle beach (world/terrain/NorthBeach.js) and its green turtles (game/Turtles.js), under Node: the
// beach made of the north coast's flat, dry above the waves; on most nights a female or two coming ashore after
// dark, a third of them false crawls; each one's way up the beach to a nest above the waves and back down to the
// sea, sound on both islands; each back in the sea before dawn; her night in order; the nests hatching 50 to 60
// nights on, their hatchlings running down to the sea; the tracks on the sand into the next day; and none of the
// island's rocks moved by the beach (placed on the ground as it was).
//
//   node test/turtles.mjs

import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { NORTH_BEACH } from '../src/world/terrain/NorthBeach.js';
import { femalesOf, planCrawl, soundCrawl, timeline, femaleAt, hatchingsOf, hatchlingsAt, tracksOf, NEST, BEACH_X } from '../src/game/Turtles.js';
import { advance, secondsBetween } from '../src/game/IslandClock.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ what }` );
	if ( ! ok ) failed ++;

};
const read = ( f ) => new Uint8Array( readFileSync( new URL( `../public/world/${ f }`, import.meta.url ) ) );

// ---- the beach: a beach face up from the flat to a berm near 2 m, dry sand behind it, on both islands
for ( const file of [ 'island.bin', 'island-1024.bin' ] ) {

	const T = new TerrainData( 7, decodeIsland( read( file ) ) );
	let dry = 0, n = 0;
	for ( let x = BEACH_X[ 0 ]; x <= BEACH_X[ 1 ]; x += 5 ) {

		let z = - 790;
		while ( z > - 900 && T.heightAt( x, z ) > 2.4 ) z -= 0.5;
		let top = - 1e9;
		for ( let zz = z; zz > z - 25; zz -= 0.5 ) top = Math.max( top, T.heightAt( x, zz ) );
		n ++;
		if ( top > 1.4 && top < 2.6 ) dry ++;

	}

	check( dry >= n * 0.9, `${ file }: the turtle beach's berm 1.4 to 2.6 m up along ${ dry } of ${ n } of its 5 m steps` );
	const was = T.uncut.heightAt( 150, - 840 ), now = T.heightAt( 150, - 840 );
	check( was < 0.5 && now > was + 0.5, `${ file }: made of the flat (at x 150, z -840: ${ was.toFixed( 2 ) } m, now ${ now.toFixed( 2 ) } m)` );

}

// ---- the nights: how many come ashore, the false crawls
const T = new TerrainData( 7, decodeIsland( read( 'island.bin' ) ) ), low = new TerrainData( 7, decodeIsland( read( 'island-1024.bin' ) ) );
const g = ( x, z ) => T.heightAt( x, z ), gl = ( x, z ) => low.heightAt( x, z );
let females = 0, falses = 0, none = 0, unsound = 0, latest = 0, ordered = true, hatchings = 0, early = 0;
for ( let d = 1; d <= 200; d ++ ) {

	const fs = femalesOf( d );
	if ( ! fs.length ) none ++;
	females += fs.length;
	for ( const f of fs ) {

		if ( f.false ) falses ++;
		if ( f.arrive < 19.5 || f.arrive > 21.5 ) early ++;
		for ( const ground of [ g, gl ] ) if ( ! soundCrawl( planCrawl( f, ground ), ground ) ) unsound ++;
		const p = planCrawl( f, g ), line = timeline( f, p ), total = line.reduce( ( s, q ) => s + q[ 2 ], 0 );
		const end = advance( f.arrive, d, 0.01, total );
		latest = Math.max( latest, ( end.day - d ) * 24 + end.hour - 24 );
		const want = f.false ? [ 'emerge', 'up', 'abort', 'down', 'enter' ] : [ 'emerge', 'up', 'choose', 'pit', 'chamber', 'lay', 'cover', 'down', 'enter' ];
		if ( line.map( ( q ) => q[ 0 ] ).join() !== want.join() ) ordered = false;

	}

	hatchings += hatchingsOf( d ).length;

}

console.log( `     200 nights: ${ females } females, ${ falses } false crawls, ${ none } nights with none, ${ hatchings } nests hatching` );
check( females > 200 && females < 400 && none > 15 && none < 70, 'on most nights a female or two comes ashore, on some none' );
check( falses > females * 0.2 && falses < females * 0.45, 'about a third of the crawls are false crawls' );
check( early === 0, 'they come ashore after dark (19:30 to 21:30)' );
check( unsound === 0, 'each one\'s way, on both islands: out of the surf, up to a nest above the waves, back to the sea' );
check( latest < 4.5, `each back in the sea before dawn (the latest ${ latest.toFixed( 2 ) } h past midnight)` );
check( ordered, 'her night in order: up, (a nest dug, laid, covered,) back down' );
check( hatchings > 100 && hatchings < females, 'nests hatch: about one a night' );

// ---- one female through her night
{

	const f = femalesOf( 2 ).find( ( q ) => ! q.false ), p = planCrawl( f, g ), line = timeline( f, p );
	const at = ( t ) => {

		const { hour, day } = advance( f.arrive, f.day, 0.01, t );
		return femaleAt( f, p, hour, day, line );

	};
	const before = femaleAt( f, p, f.arrive - 0.05, f.day, line ), start = at( 1 ), up = at( line[ 1 ][ 1 ] + line[ 1 ][ 2 ] * 0.5 ), lay = at( line.find( ( q ) => q[ 0 ] === 'lay' )[ 1 ] + 1 );
	const total = line.reduce( ( s, q ) => s + q[ 2 ], 0 ), gone = at( total + 2 );
	check( before === null && start.phase === 'emerge' && g( start.x, start.z ) < 0 && up.phase === 'up' && g( up.x, up.z ) > g( start.x, start.z ), 'she comes out of the surf and crawls up the beach' );
	check( lay.phase === 'lay' && lay.dig === 1 && g( lay.x, lay.z ) > 1.2 && gone === null, `she lays in her pit ${ g( lay.x, lay.z ).toFixed( 2 ) } m up, and she's gone after ${ total.toFixed( 0 ) } s` );
	// her crawl's pace: between a tenth and two thirds of a metre a second, with rests
	const v = p.upLength / line[ 1 ][ 2 ];
	check( v > 0.1 && v < 0.67, `up the beach at ${ v.toFixed( 2 ) } m/s, resting between bouts of strokes` );

}

// ---- the hatchlings: out of the nest in a burst, down the beach to the sea, gone into it
{

	const h = hatchingsOf( 3 )[ 0 ], p = planCrawl( h.female, g );
	const at = ( t ) => {

		const { hour, day } = advance( h.hour, h.day, 0.01, t );
		return hatchlingsAt( h, p, hour, day, g ).filter( Boolean );

	};
	const first = at( 2 ), mid = at( 30 ), late = at( 200 );
	const down = mid.every( ( q ) => g( q[ 0 ], q[ 1 ] ) < g( ...p.nest ) + 0.2 );
	check( first.length < h.count * 0.2 && mid.length === h.count && late.length === 0 && down, `${ h.count } hatchlings: a few first, then all of them on the sand, running down it; in the sea in minutes` );
	check( h.day * 24 + h.hour >= ( h.laid + NEST.incubation[ 0 ] ) * 24 + NEST.hatchHour[ 0 ] - 1e-6, 'hatching 50 to 60 nights after the nest was laid, at night' );

}

// ---- the tracks: on the sand from when she makes them, into the next day, then gone
{

	const f = femalesOf( 2 )[ 0 ];
	const on = ( hour, day ) => tracksOf( day, hour ).some( ( q ) => q.female.id === f.id );
	check( ! on( 19, 2 ) && on( 23, 2 ) && on( 9, 3 ) && on( 15, 3 ) && ! on( 12, 4 ), 'her tracks there from the night she makes them through the next day, gone the day after' );
	check( Math.abs( secondsBetween( 20, 1, 20, 2 ) - secondsBetween( 0, 1, 0, 2 ) ) < 1e-6, 'the clock\'s seconds between two times: a day\'s the same from any hour' );

}

console.log( failed ? `${ failed } failed` : 'all passed' );
process.exit( failed ? 1 : 0 );
