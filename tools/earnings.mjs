#!/usr/bin/env node
// (M16) What fishing earns, for tuning Marta's prices (docs/m16/opening.md): the game's own bites, weights and prices, played
// out as a steady hand would: cast, wait for the bite, fight, and when the cooler's full run in and sell to Joe. No wanted
// lists or orders. Dollars an hour of play, after fuel.
//   node tools/earnings.mjs
import { habitatAt, pickSpecies, rollWeight, biteDelay } from '../src/game/Bites.js';
import { FISH, fishValue, releaseBonus } from '../src/game/FishTable.js';
import { ABLE } from '../src/game/Seaworthy.js';
import { fuelBurn, fuelPrice, UPGRADES } from '../src/game/Gear.js';

const far = 500;
const SPOTS = {
	flats: { depth: 2, reefDist: far, pierDist: far },
	pier: { depth: 5, reefDist: far, pierDist: 3 },
	bay: { depth: 9, reefDist: far, pierDist: far },
	creek: { depth: 1.5, reefDist: far, pierDist: far, creek: 1 },
	reef: { depth: 6, reefDist: 10, pierDist: far },
	shelf: { depth: 60, reefDist: far, pierDist: far },
	edge: { depth: 300, reefDist: far, pierDist: far, slope: 0.4 },
	blue: { depth: 1200, reefDist: far, pierDist: far, weed: 0.3, debris: 0.1, birds: 0.1 },
};

// a stage of the game: where they fish, the gear, the box, and the run in: seconds under way (0 walking or paddling) and
// the rest of the time a trip costs (tying up, walking to Joe, selling). ((M17) line: the line's level, at its label)
const LINE = UPGRADES.line.levels.map( ( l ) => l.lineKg );
const STAGES = [
	{ name: 'kayak, bare', boat: 'kayak', spot: [ 'flats', 'pier', 'bay' ], lineKg: LINE[ 0 ], reel: 1.1, holdKg: 12, ashore: 150, run: 0 },
	{ name: 'kayak, line and rod and crate', boat: 'kayak', spot: [ 'flats', 'pier', 'bay', 'creek' ], lineKg: LINE[ 1 ], reel: 1.6, holdKg: 25, ashore: 170, run: 0 },
	{ name: 'console, inshore gear', boat: 'console', spot: [ 'reef', 'reef', 'bay', 'creek' ], lineKg: LINE[ 1 ], reel: 1.6, holdKg: 60, ashore: 70, run: 60 },
	{ name: 'console, near offshore', boat: 'console', spot: [ 'reef', 'shelf', 'shelf' ], lineKg: LINE[ 2 ], reel: 2.2, holdKg: 60, ashore: 70, run: 240 },
	{ name: 'lobster boat, bare', boat: 'lobster', spot: [ 'reef', 'shelf', 'shelf' ], lineKg: LINE[ 2 ], reel: 2.2, holdKg: 30, ashore: 70, run: 360 },
	{ name: 'lobster boat, upgraded', boat: 'lobster', spot: [ 'reef', 'shelf', 'shelf', 'edge' ], lineKg: LINE[ 3 ], reel: 2.2, holdKg: 160, ashore: 70, run: 500 },
	{ name: 'sportfisher, edge and blue', boat: 'sportfisher', spot: [ 'edge', 'blue' ], lineKg: LINE[ 3 ], reel: 2.6, holdKg: 300, ashore: 90, run: 520, drag: true },
];
// (past about 3.9 times its line's breaking strength a fish is mostly lost: twice the 8 lb line's old 7 kg, the lines
// having held about 1.9 times their labels before M17. With the two-speed's drag, up to about 200 kg: tools/fight-sweep.mjs
// has a blue marlin landed from the chair to there on 60 lb, docs/m17/lines.md)
const LOST = 2 * 7 / LINE[ 0 ], DRAG_LANDS = 200;

let seed = 11;
const rng = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;

function play( st, hours = 400 ) {

	let t = 0, money = 0, hold = 0, fish = 0;
	const seen = {};
	const burn = st.boat === 'kayak' ? 0 : fuelBurn( ABLE[ st.boat ].cruise.rpm, st.boat, !! st.twin ) * fuelPrice( st.boat ); // ((M17) a twin's two: st.twin)
	while ( t < hours * 3600 ) {

		const hour = 6 + rng() * 13, h = habitatAt( SPOTS[ st.spot[ Math.floor( rng() * st.spot.length ) ] ] );
		t += 6 + biteDelay( h, hour, rng ) + 2; // cast, wait, strike
		const id = pickSpecies( h, hour, rng );
		if ( ! id ) continue;
		const f = FISH[ id ], kg = rollWeight( id, rng );
		// (the fight: its stamina as CatchMinigame has it, a little of it out of the band, and the line back on the reel)
		const fightS = f.stamina * Math.pow( Math.max( kg / f.kg[ 1 ], 0.15 ), 0.35 ) * 1.3 + 25 / st.reel;
		// (past what its line lands, half the fight for nothing)
		if ( kg > st.lineKg * LOST && ! ( st.drag && kg < DRAG_LANDS ) ) {

			t += fightS / 2;
			continue;

		}

		t += fightS + 4; // (and the catch card)
		fish ++;
		seen[ id ] = ( seen[ id ] || 0 ) + 1;
		if ( f.release ) money += releaseBonus( id, kg, false );
		if ( f.protected ) continue;
		money += fishValue( id, kg );
		hold += kg;
		if ( hold >= st.holdKg ) {

			hold = 0;
			t += st.ashore + st.run * 2;
			money -= burn * st.run * 2;

		}

	}

	const top = Object.entries( seen ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] ).slice( 0, 4 ).map( ( [ k, n ] ) => `${ k } ${ Math.round( n / fish * 100 ) }%` ).join( ', ' );
	return { perH: money / hours, fishH: fish / hours, top };

}

for ( const st of STAGES ) {

	const r = play( st );
	console.log( `${ st.name.padEnd( 30 ) } $${ Math.round( r.perH ).toString().padStart( 5 ) } /h  ${ r.fishH.toFixed( 0 ).padStart( 3 ) } fish/h  ${ r.top }` );

}
