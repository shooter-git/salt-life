#!/usr/bin/env node
// (M17, the figures: docs/m17/figures.md) A week of trap income, one copy's Traps.js against another's (M16's soak against
// Austin's), with each one's real haulOf: the bag of 6 a day (the heaviest kept), the gauge's 22.4 cm and berried females back;
// 2, 4 and 8 traps on the reef's edge, 6 m down, baited ($8 for 4 traps a set), over 3,000 seeds a case.
//   git archive <base> src | tar -x -C <dir>      then   node tools/figures/traps-week.mjs <dir> <this checkout>
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [ base, here = '.' ] = process.argv.slice( 2 );
const at = ( root, f ) => pathToFileURL( resolve( root, f ) ).href;
const load = async ( root ) => ( { T: await import( at( root, 'src/game/Traps.js' ) ), F: await import( at( root, 'src/game/FishTable.js' ) ) } );
const A = await load( base ), B = await load( here );
const q = 1, sizeCm = 1.5, depth = 6, BAG = 6, MIN = 22.4, BAIT_EACH = 2;
function round( M, traps, nights, seed0 ) {

	let kept = 0, dollars = 0, caught = 0;
	const fish = [];
	for ( let i = 0; i < traps; i ++ ) {

		const trap = { T: 8, seed: ( seed0 * 131 + i * 7919 ) >>> 0, bait: true };
		const r = M.T.haulOf( trap, q, sizeCm, depth, 8 + 24 * nights, 0 );
		caught += r.lobsters.length;
		for ( const l of r.lobsters ) if ( l.cm >= MIN && ! l.berried ) fish.push( l );

	}

	fish.sort( ( a, b ) => b.kg - a.kg );
	for ( const l of fish.slice( 0, BAG ) ) {

		kept ++;
		dollars += M.F.fishValue( 'lobster', l.kg );

	}

	return { caught, legal: fish.length, kept, dollars };

}

const N = 3000;
const mean = ( M, traps, nights ) => {

	const s = { caught: 0, legal: 0, kept: 0, dollars: 0 };
	for ( let k = 0; k < N; k ++ ) {

		const r = round( M, traps, nights, k + 1 );
		for ( const x in s ) s[ x ] += r[ x ] / N;

	}

	return s;

};
const f = ( s ) => `${ s.caught.toFixed( 1 ) } caught, ${ s.legal.toFixed( 1 ) } legal, ${ s.kept.toFixed( 2 ) } kept, $${ s.dollars.toFixed( 0 ) }`;
console.log( 'one haul of all of them, by nights soaked' );
for ( const traps of [ 2, 4, 8 ] ) for ( const n of [ 1, 3, 7, 14 ] ) console.log( `${ traps } traps, ${ n } night${ n > 1 ? 's' : '' }:  base ${ f( mean( A, traps, n ) ) }  |  now ${ f( mean( B, traps, n ) ) }` );
console.log( '\na real week (an hour a day is about 3 island days: 2 in play, 1 away; bait $2 a trap a set)' );
const plans = [ [ 'each night\'s soak hauled (3 a day)', 21, 1 ], [ 'hauled once a session (3 nights)', 7, 3 ], [ 'once a week (7 nights, played once)', 1, 7 ] ];
for ( const traps of [ 2, 4, 8 ] ) for ( const [ name, hauls, n ] of plans ) {

	const a = mean( A, traps, n ), b = mean( B, traps, n ), bait = hauls * traps * BAIT_EACH;
	console.log( `${ traps } traps, ${ name }: base ${ ( a.kept * hauls ).toFixed( 1 ) } kept, $${ ( a.dollars * hauls - bait ).toFixed( 0 ) } net  |  now ${ ( b.kept * hauls ).toFixed( 1 ) } kept, $${ ( b.dollars * hauls - bait ).toFixed( 0 ) } net  (bait $${ bait })` );

}
