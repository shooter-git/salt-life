// (M19) Stream STALLS (docs/m19/stalls.md), in plain Node:
//   - the bait and the ice are Joe's: the day's live-bait order his (while he's open, not into his night box), the frozen lots, his
//     live shrimp and sardines; Pearl's her conch and crabs; Marta's none; a save's Marta's order carried over as Joe's;
//   - Pearl's day's challenges: the same for everyone on the day, one each for the rod, the speargun and the net, each that can
//     be done done by its own catch and no other, paid once at her camp, a new day's list with what's owed kept;
//   - the signs' words.
//   node test/stalls-m19.mjs
import { readFileSync } from 'node:fs';
import { ordersFor, ordersOf } from '../src/game/Orders.js';
import { GameState } from '../src/game/GameState.js';
import { BAITS, BAIT_IDS, KEEPER_KG, baitOf } from '../src/game/Bait.js';
import { FISH } from '../src/game/FishTable.js';
import { challengesFor, meets, Challenges, ROD, SPEAR, NET } from '../src/game/Challenges.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) {

		fails ++;
		console.log( 'FAIL', msg );

	} else console.log( 'ok  ', msg );

};
const store = () => {

	const m = new Map();
	return { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) };

};

// ---- the bait's Joe's
{

	let all = true;
	for ( let d = 1; d < 200; d ++ ) {

		const b = ordersFor( d ).find( ( o ) => o.bait );
		if ( ! b || b.who !== 'joe' || b.id !== 'bait' || ordersFor( d ).some( ( o ) => o.id === 'marta' ) ) all = false;
		if ( b && baitOf( b.species ) !== b.species ) all = false;

	}

	ok( all, 'the day\'s live-bait order is Joe\'s, every day (id bait), none of Marta\'s, and of a kind the bait bucket holds' );
	const list = ordersFor( 5 ), b = list.find( ( o ) => o.bait );
	ok( ordersOf( list, 'joe', b.species, null, true ).includes( b ) && ! ordersOf( list, 'joe', b.species, null, false ).includes( b ), 'his bait tank takes them while he\'s open, not into his night box' );
	const st = new GameState( store() );
	st.bait[ b.species ] = 6;
	const open = st.quoteBait( { who: 'joe', orders: list, day: 5, open: true } ), shut = st.quoteBait( { who: 'joe', orders: list, day: 5, open: false } ), marta = st.quoteBait( { who: 'marta', orders: list, day: 5 } );
	ok( open && open.n === Math.min( 6, b.max ) && ! shut && ! marta, `from the bucket: ${ open && open.n } live to Joe while he's open; none to his night box, none to Marta` );
	const joe = BAIT_IDS.filter( ( k ) => BAITS[ k ].price && ! BAITS[ k ].lure && ( ! BAITS[ k ].seller || BAITS[ k ].seller === 'joe' ) );
	const pearl = BAIT_IDS.filter( ( k ) => BAITS[ k ].seller === 'pearl' );
	ok( [ 'ballyhoo', 'squid', 'liveShrimp', 'sardine' ].every( ( k ) => joe.includes( k ) ) && pearl.join() === 'conch,hermitCrab', `Joe sells ${ joe.join( ', ' ) }; Pearl ${ pearl.join( ', ' ) }` );
	// a save from before: Marta's order filled that day, carried over as Joe's
	const s0 = store(), a = new GameState( s0 );
	a.orders = { day: 9, filled: { marta: 3, 'joe-a': 1 } };
	a.save();
	const back = new GameState( s0 );
	ok( back.load() && back.orders.filled.bait === 3 && back.orders.filled.marta === undefined && back.orders.filled[ 'joe-a' ] === 1, 'a save from before: what was filled of Marta\'s bait order is Joe\'s' );

}

// ---- Pearl's challenges
{

	const a = challengesFor( 12 ), b = challengesFor( 12 );
	ok( JSON.stringify( a ) === JSON.stringify( b ) && a.map( ( c ) => c.id ).join() === 'rod,spear,net' && a.every( ( c ) => c.what && c.pay > 0 ), `the same for everyone on the day: ${ a.map( ( c ) => c.what ).join( '; ' ) }` );
	const days = new Set();
	for ( let d = 1; d < 60; d ++ ) days.add( challengesFor( d ).map( ( c ) => c.what ).join() );
	ok( days.size > 30, `a new list most days (${ days.size } of 59)` );
	// each that can be asked: done by its own catch, and not by another way of catching it
	const evFor = ( c ) => {

		if ( c.id === 'net' ) return c.kind === 'keeper' ? { method: 'net', fish: [ { species: 'mullet', kg: KEEPER_KG + 0.1 } ], haul: { bait: {} } } : c.kind === 'baits' ? { method: 'net', fish: [], haul: { bait: { silverside: c.n } } } : { method: 'net', fish: [ { species: c.species, kg: 0.3 } ], haul: { bait: {} } };
		if ( c.id === 'spear' ) return { method: 'spear', species: c.species, kg: FISH[ c.species ].kg[ 1 ], released: false };
		return { method: 'rod', species: c.species, kg: c.kg ? c.kg + 0.5 : 2, place: c.place || null, released: c.kind === 'release', rig: c.kind === 'fly' ? 'fly' : 'float' };

	};

	let each = true, other = true;
	for ( const t of [ ...ROD.map( ( x ) => ( { id: 'rod', ...x } ) ), ...SPEAR.map( ( x ) => ( { id: 'spear', ...x } ) ), ...NET.map( ( x ) => ( { id: 'net', ...x } ) ) ] ) {

		if ( ! meets( t, evFor( t ) ) ) each = false;
		const wrong = t.id === 'net' ? { ...evFor( { id: 'rod', ...ROD[ 0 ] } ) } : { ...evFor( t ), method: t.id === 'rod' ? 'spear' : 'rod' };
		if ( meets( t, wrong ) ) other = false;
		// a protected fish's ask is done with it let go
		if ( t.species && FISH[ t.species ].protected && ( t.id !== 'rod' || ! meets( t, { ...evFor( t ), released: true } ) ) ) each = false;

	}

	ok( each, 'every one of them can be done, by its own catch, and a protected fish\'s done with it let go' );
	ok( other, 'and not by another way of catching it' );
	ok( ! meets( { id: 'rod', kind: 'over', species: 'jack', kg: 4 }, { method: 'rod', species: 'jack', kg: 3.9 } ) && ! meets( { id: 'rod', kind: 'fly', species: 'bonefish' }, { method: 'rod', species: 'bonefish', rig: 'float' } ), 'not one too small, nor a bonefish on bait for the fly\'s' );
	// done by the catch, paid once at her camp, a new day's list with what's owed kept
	const st = new GameState( store() ), game = { tradeDay: 12, state: st, toasts: [], toast( t ) {

		this.toasts.push( t );

	} };
	const C = new Challenges( game );
	C.update();
	const rod = a.find( ( c ) => c.id === 'rod' );
	st._caught( evFor( rod ) );
	st._caught( evFor( rod ) );
	ok( st.challenges.done.rod && st.challenges.owed === rod.pay && game.toasts.length === 1 && C.today().list.find( ( c ) => c.id === 'rod' ).done, `the rod's done by its catch ($${ rod.pay } owed), once` );
	game.tradeDay = 13;
	st._caught( { method: 'rod', species: 'grunt', kg: 0.5 } );
	ok( ! st.challenges.done.rod && st.challenges.owed === rod.pay && st.challenges.day === 13, 'a new day: a new list, what\'s owed kept' );
	const m0 = st.money, paid = st.collectChallenges();
	ok( paid === rod.pay && st.money === m0 + rod.pay && st.collectChallenges() === 0, `paid at her camp, $${ paid }, and only once` );

}

// ---- the signs
{

	const build = readFileSync( new URL( '../tools/props/build.mjs', import.meta.url ), 'utf8' );
	const stand = readFileSync( new URL( '../src/game/FishStand.js', import.meta.url ), 'utf8' ), shop = readFileSync( new URL( '../src/game/Chandlery.js', import.meta.url ), 'utf8' ), camp = readFileSync( new URL( '../src/game/FishCamp.js', import.meta.url ), 'utf8' );
	ok( build.includes( '\'BAIT  ·  ICE\'' ) && build.includes( '\'TACKLE  ·  FUEL  ·  BOATS\'' ) && ! build.includes( '\'BAIT  ·  TACKLE  ·  FUEL\'' ), 'the signs: Joe\'s says bait and ice, Marta\'s tackle, fuel and boats' );
	ok( stand.includes( '\'bait · ice\'' ) && shop.includes( '\'tackle · fuel · boats\'' ) && camp.includes( '\'fish bought · bait · diesel\'' ), 'and the painted boards the same, on low, and Pearl\'s board her bait' );

}

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
