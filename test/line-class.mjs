// (M19) Stream RECORDS (docs/m19/records.md), in plain Node: the line-class records.
//   - the classes as IGFA's: each of the game's lines and tippets in the class step 0 put it in; a tippet's classes the tippet
//     classes; none past the 60 kg's 132.27 lb;
//   - a record fish at least half its class, beating the last by 2 oz under 25 lb and by 0.5% from there;
//   - kept in your log by the real addFish, and read back from a save; a fish too light for its class, or on no class (a speared
//     one), none;
//   - the board's line: the island's best for its class, kept under the records' one '%' key.
//   node test/line-class.mjs
import { classOf, classKg, classLabel, isClass, counts, beats, ratio } from '../src/game/LineClass.js';
import { UPGRADES, FLY_RODS } from '../src/game/Gear.js';
import { GameState } from '../src/game/GameState.js';
import { classLine } from '../src/together/RecordsBoard.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else console.log( 'ok  ', msg );

};
const LB = 0.45359237;

// ---- the classes
{

	const want = { 8: '4', 15: '8', 30: '15', 60: '37', 80: '37', 130: '60' };
	const lines = UPGRADES.line.levels.map( ( l ) => [ Math.round( l.lineKg / LB ), classOf( l.lineKg ) ] );
	ok( lines.every( ( [ lb, c ] ) => want[ lb ] === c ), `the game's lines: ${ lines.map( ( [ lb, c ] ) => `${ lb } lb in ${ classLabel( c ) }` ).join( ', ' ) }` );
	const tips = Object.values( FLY_RODS ).map( ( r ) => [ Math.round( r.lineKg / LB ), classOf( r.lineKg, true ) ] );
	ok( tips.map( ( t ) => t[ 1 ] ).join() === 'f6,f8,f10', `the fly rods' tippets: ${ tips.map( ( [ lb, c ] ) => `${ lb } lb in the ${ classLabel( c ) }` ).join( ', ' ) }` );
	ok( classOf( 8.81 * LB ) === '4' && classOf( 8.82 * LB ) === '6' && classOf( 132.3 * LB ) === null && classOf( 23 * LB, true ) === null, 'a line that tests over its class goes up one; none past 60 kg, no tippet past 10 kg' );
	ok( isClass( '37' ) && isClass( 'f10' ) && ! isClass( 'f15' ) && ! isClass( '5' ) && classKg( 'f8' ) === 8, 'the keys' );

}

// ---- what makes a record
{

	ok( counts( '15', 7.5 ) && ! counts( '15', 7.4 ) && counts( 'f6', 3 ), 'at least half its class' );
	ok( beats( 3, 0 ) && beats( 2.057, 2 ) && ! beats( 2.05, 2 ) && beats( 20.1, 20 ) && ! beats( 20.09, 20 ), 'beating the last by 2 oz under 25 lb, by 0.5% from there' );
	ok( Math.abs( ratio( '4', 9.2 ) - 2.3 ) < 1e-9, 'the island\'s ratio: the fish\'s weight to its class\'s' );

}

// ---- kept in your log
{

	const m = new Map(), st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
	const land = ( sp, kg, cls, o = {} ) => {

		st.inventory = [];
		st.addFish( sp, kg, 10, { day: 3, place: null, cls, ...o } );
		return st.lastCatch.clsRecord;

	};
	ok( ! land( 'bonefish', 2.4, 'f6' ) && ! st.log.bonefish.cls, 'a 2.4 kg bonefish on a 12 lb tippet: under half the 6 kg tippet class' );
	const a = land( 'bonefish', 3.2, 'f6' );
	ok( a && a.cls === 'f6' && a.prevKg === 0 && st.log.bonefish.cls.f6.kg === 3.2, 'a 3.2 kg one, let go: the first on the 6 kg tippet class' );
	ok( ! land( 'bonefish', 3.22, 'f6' ) && land( 'bonefish', 3.26, 'f6' ).prevKg === 3.2, 'one 20 g heavier isn\'t a record; 60 g heavier is' );
	ok( ! land( 'bonefish', 3.5, 'f10' ) && ! st.log.bonefish.cls.f10, 'a 3.5 kg one too light for the 10 kg tippet class: none' );
	ok( ! land( 'wrasse', 3, null, { method: 'spear' } ), 'a speared fish: on no class' );
	const b = land( 'jack', 9, '15' ), c = land( 'jack', 10, '37' );
	ok( b && ! c && st.log.jack.cls[ '15' ].kg === 9 && ! st.log.jack.cls[ '37' ], 'a 9 kg jack on 30 lb braid in the 15 kg class; a 10 kg one on 80 lb too light for the 37 kg' );
	st.save();
	const back = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem() {} } );
	ok( back.load() && back.log.bonefish.cls.f6.kg === 3.26 && back.log.jack.cls[ '15' ].day === 3, 'read back from the save' );

}

// ---- the board's line
{

	ok( classLine( {} ).length === 0 && classLine( { '%': { s: 'nope', c: '4', kg: 3 } } ).length === 0, 'none till someone has one (and none for what isn\'t one)' );
	const t = classLine( { '%': { s: 'bonefish', c: '4', kg: 4.2, who: 'Robin' } } )[ 0 ];
	ok( /Robin's 9\.3 lb bonefish on 4 kg \(8 lb\), 1\.1 to 1/.test( t ), `"${ t }"` );

}

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
