#!/usr/bin/env node
// (M17) The fight swept in plain Node: every kind of fish at its weights, against every line, reel and hold it can be
// fought on (a rod in your hands, the stand-up rod in its harness, the fighting chair, the electric reel), played with
// care. Each fight's terms come from the game's own Rigs.fightTerms, on the gear's own gearStats, so the same script
// reads the fight before a change and after it. docs/m17/lines.md.
//
//   node tools/fight-sweep.mjs [--n 10] [--json out.json] [--species tuna,mahi] [--only L3/R3/chair,...] [--no-dh]
//                              [--compact] [--base base.json]
//
// Each cell: the share landed, broken (the line snapped), spooled, got away (slack or past the line) and cut (teeth or a
// bill through the leader), and the landed fights' mean length in s. With --base, each cell's change from that file's.
// --compact writes each cell as [ landed, snapped, spooled, s ] (docs/m17/lines-sweep.json, read by test/lines.mjs).
// A protected fish is also fought with the dehooker ('+dh') on the reels with a drag, unless --no-dh.

import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FISH, FISH_IDS } from '../src/game/FishTable.js';
import { CatchMinigame } from '../src/game/CatchMinigame.js';
import { gearStats, defaultUpgrades, UPGRADES } from '../src/game/Gear.js';
import { Rigs } from '../src/game/rigs/Rigs.js';
import { leaderRisk } from '../src/game/rigs/Presentation.js';

// sizes as the bites roll them (Bites.rollWeight: kg = a + ( b - a ) u ^ 2.2), at these shares of the fish that bite
export const SIZES = [ 0.1, 0.3, 0.5, 0.7, 0.9, 0.99 ];
export const sizeKg = ( id, q ) => {

	const [ a, b ] = FISH[ id ].kg;
	return a + ( b - a ) * Math.pow( q, 2.2 );

};

// how it's fought: by hand on any rod but the stand-up one, in its harness, in the chair (any rod), and the electric reel
// (dropped, from 300 m down) by hand or in the chair. A spinning reel has no drag, so how you hold it doesn't come in
export const HOLDS = [ 'hand', 'harness', 'chair' ];
export function combos() {

	const out = [];
	const lines = UPGRADES.line.levels.length, reels = UPGRADES.reel.levels.length;
	for ( let l = 0; l < lines; l ++ ) for ( let r = 0; r < reels; r ++ ) {

		const drag = UPGRADES.reel.levels[ r ].dragKg !== null;
		for ( const hold of drag ? HOLDS : [ 'hand' ] ) out.push( { key: `L${ l }/R${ r }/${ hold }`, line: l, reel: r, hold, electric: false } );

	}

	for ( let l = 0; l < lines; l ++ ) for ( const hold of [ 'hand', 'chair' ] ) out.push( { key: `L${ l }/E/${ hold }`, line: l, reel: reels - 1, hold, electric: true } );
	return out;

}

// a cell as --compact writes it, and back
export const compact = ( r ) => [ + r.caught.toFixed( 3 ), + r.snapped.toFixed( 3 ), + r.spooled.toFixed( 3 ), Math.round( r.t * 10 ) / 10 ];
export const uncompact = ( c ) => ( { caught: c[ 0 ], snapped: c[ 1 ], spooled: c[ 2 ], t: c[ 3 ] } );

// a careful player: reels below two-thirds of the breaking point and not into a run (test/game-logic's, test/tackle's)
const careful = ( g ) => g.tension < 0.68 && g.surge < 0.6;
const START = { hand: 25, harness: 50, chair: 60 };
const DEEP = 300;

function lcg( s ) {

	let x = s >>> 0;
	return () => ( ( x = ( x * 1664525 + 1013904223 ) >>> 0 ) / 4294967296 );

}

// the fight's terms for this gear, from the game's own code (a Rigs on a stub, as test/tackle does)
export function termsOf( c, id, kg, { dehooker = false } = {} ) {

	const u = { ...defaultUpgrades(), line: c.line, reel: c.reel, rod: c.hold === 'harness' ? 3 : 2, landing: dehooker ? 2 : 1, sfElectricReel: c.electric ? 1 : 0, sfChair: c.hold === 'chair' ? 1 : 0 };
	const stats = gearStats( u, 'sportfisher' );
	const seat = {};
	const r = Object.assign( Object.create( Rigs.prototype ), {
		game: { state: { stats, leaderPick: null }, rod: { rig: c.electric ? 'drop' : 'troll', hookM: c.electric ? DEEP : 0 }, hookBait: null },
		app: { boatCtl: { speed: 0 }, player: { riding: false }, boat: { chair: seat } },
		inChair: c.hold === 'chair',
		kit: null,
	} );
	const T = r.fightTerms( { species: id, kg } );
	// (the leader that suits it, so what's measured is the line and the drag: wire for teeth, 200 lb mono for a bill)
	const risk = leaderRisk( leaderRisk( 'heavy', id ).cut > 0 ? 'wire' : 'heavy', id );
	T.cut = risk.cut;
	T.wear = risk.wear;
	return T;

}

export function fightOnce( c, id, kg, seed, { dehooker = false, policy = careful, capS = 3600 } = {} ) {

	const T = termsOf( c, id, kg, { dehooker } );
	const g = new CatchMinigame( { species: id, kg, ...T, distance: c.electric ? DEEP : START[ c.hold ], rng: lcg( seed ) } );
	let st = 'fighting';
	const dt = 1 / 30;
	while ( st === 'fighting' && g.time < capS ) st = g.update( dt, policy( g ) );
	return { st: st === 'fighting' ? 'long' : st, t: g.time };

}

const OUT = [ 'caught', 'snapped', 'spooled', 'escaped', 'cut', 'long' ];
export function cell( c, id, kg, n, opts = {} ) {

	const r = { n, t: 0 };
	for ( const k of OUT ) r[ k ] = 0;
	let h = 0;
	for ( let i = 0; i < id.length; i ++ ) h = ( h * 31 + id.charCodeAt( i ) ) >>> 0;
	for ( let i = 0; i < n; i ++ ) {

		const o = fightOnce( c, id, kg, ( h ^ ( Math.round( kg * 1000 ) * 2654435761 ) ^ ( i * 40503 ) ) >>> 0, opts );
		r[ o.st ] ++;
		if ( o.st === 'caught' ) r.t += o.t;

	}

	r.t = r.caught ? r.t / r.caught : 0;
	for ( const k of OUT ) r[ k ] /= n;
	return r;

}

export const SPECIES = FISH_IDS.filter( ( id ) => ! FISH[ id ].hand && FISH[ id ].fight > 0 );

export function sweep( { n = 10, species = SPECIES, sizes = SIZES, only = null, dh = true } = {} ) {

	const out = {};
	const cs = combos().filter( ( c ) => ! only || only.includes( c.key ) );
	for ( const id of species ) {

		out[ id ] = {};
		for ( const q of sizes ) {

			const kg = sizeKg( id, q ), row = out[ id ][ q ] = { kg };
			for ( const c of cs ) row[ c.key ] = cell( c, id, kg, n );
			if ( dh && FISH[ id ].protected ) for ( const c of cs.filter( ( c ) => c.reel >= 2 ) ) row[ c.key + '+dh' ] = cell( c, id, kg, n, { dehooker: true } );

		}

	}

	return out;

}

// ---- the command line
if ( process.argv[ 1 ] && fileURLToPath( import.meta.url ) === resolve( process.argv[ 1 ] ) ) {

	const arg = ( k, d ) => {

		const i = process.argv.indexOf( k );
		return i > 0 ? process.argv[ i + 1 ] : d;

	};
	const n = + arg( '--n', 10 );
	const species = arg( '--species', null )?.split( ',' ) || SPECIES;
	const t0 = Date.now();
	const only = arg( '--only', null )?.split( ',' ) || null;
	const res = sweep( { n, species, only, dh: ! process.argv.includes( '--no-dh' ) } );
	const json = arg( '--json', null );
	const meta = { n, lines: UPGRADES.line.levels.map( ( l ) => [ l.label, + l.lineKg.toFixed( 3 ) ] ), reels: UPGRADES.reel.levels.map( ( l ) => [ l.label, l.dragKg === null ? null : + l.dragKg.toFixed( 3 ) ] ), s: ( Date.now() - t0 ) / 1000 };
	if ( json ) {

		let out = res;
		if ( process.argv.includes( '--compact' ) ) {

			out = {};
			for ( const id in res ) {

				out[ id ] = {};
				for ( const q in res[ id ] ) {

					out[ id ][ q ] = { kg: + res[ id ][ q ].kg.toFixed( 3 ) };
					for ( const k in res[ id ][ q ] ) if ( k !== 'kg' ) out[ id ][ q ][ k ] = compact( res[ id ][ q ][ k ] );

				}

			}

		}

		writeFileSync( json, JSON.stringify( { meta, res: out } ) );

	}
	const base = arg( '--base', null ) ? JSON.parse( readFileSync( arg( '--base' ), 'utf8' ) ).res : null;
	const pc = ( x ) => `${ Math.round( x * 100 ) }`.padStart( 3 );
	for ( const id of species ) {

		console.log( `\n${ id } (${ FISH[ id ].kg.join( '-' ) } kg, fight ${ FISH[ id ].fight }, stamina ${ FISH[ id ].stamina })` );
		const keys = Object.keys( res[ id ][ SIZES[ 0 ] ] ).filter( ( k ) => k !== 'kg' );
		console.log( `  ${ 'gear'.padEnd( 16 ) }${ SIZES.map( ( q ) => `${ res[ id ][ q ].kg.toFixed( 1 ).padStart( 13 ) }` ).join( '' ) }` );
		for ( const k of keys ) {

			const cellTxt = ( q ) => {

				const r = res[ id ][ q ][ k ], b = base && base[ id ] && base[ id ][ q ] && base[ id ][ q ][ k ];
				const main = `${ pc( r.caught ) }/${ pc( r.snapped + r.spooled ) }`;
				return b ? `${ main }(${ ( Math.round( ( r.caught - b.caught ) * 100 ) ).toString().padStart( 4 ) })` : `${ main } ${ Math.round( r.t ).toString().padStart( 4 ) }s`;

			};
			console.log( `  ${ k.padEnd( 16 ) }${ SIZES.map( ( q ) => cellTxt( q ).padStart( 13 ) ).join( '' ) }` );

		}

	}

	console.error( `\n${ meta.s.toFixed( 0 ) } s` );

}
