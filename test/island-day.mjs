// Plain-node tests of the island's day (no GPU): the clock, the stalls' hours, the wanted lists and
// selling on them.
import { DAY_RATE, NIGHT_X, START_HOUR, REST, pace, advance, clockAt, restTo, isOpen, timeText, dayLength, sunUp } from '../src/game/IslandClock.js';
import { HOURS, OPENS, NIGHT_BOX, tradeDay, ordersFor, orderFor, orderPrice, orderTerms } from '../src/game/Orders.js';
import { FISH } from '../src/game/FishTable.js';
import { GameState } from '../src/game/GameState.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const near = ( a, b, e = 1e-3 ) => Math.abs( a - b ) < e;
// real seconds from ( h0, day 1 ) until the clock reads h1 the same day, at DAY_RATE (search)
const secondsBetween = ( h0, h1 ) => {

	let lo = 0, hi = dayLength();
	for ( let i = 0; i < 60; i ++ ) {

		const mid = ( lo + hi ) / 2;
		const t = advance( h0, 1, DAY_RATE, mid );
		if ( t.day > 1 || t.hour >= h1 ) hi = mid;
		else lo = mid;

	}

	return hi;

};

// ---- the clock
const day = dayLength() / 60;
console.log( `     a day takes ${ day.toFixed( 1 ) } min; an hour by day ${ ( 1 / DAY_RATE ).toFixed( 0 ) } s` );
ok( day > 25 && day < 35, 'a day is about half an hour' );
ok( pace( 12 ) === 1 && pace( 1 ) === NIGHT_X && pace( 23 ) === NIGHT_X, 'by day the clock runs at its rate, deep night faster' );
ok( pace( 20 ) > 1 && pace( 20 ) < NIGHT_X && pace( 4 ) > 1 && pace( 4 ) < NIGHT_X, 'eased into and out of the night' );
const night = secondsBetween( 19, 24 ) + secondsBetween( 0, OPENS );
console.log( `     Joe shut (7 pm to 5 am): ${ ( night / 60 ).toFixed( 1 ) } min; dusk (5 to 8 pm): ${ ( secondsBetween( 17, 20 ) / 60 ).toFixed( 1 ) } min` );
ok( night < 8 * 60, 'the stalls are shut for under 8 real minutes' );
ok( near( advance( 10, 1, DAY_RATE, 100 ).hour, 11, 1e-2 ), 'an hour by day is 100 s' );
const after = advance( 23.5, 4, DAY_RATE, 600 );
ok( after.day === 5 && after.hour > 0 && after.hour < 12, 'past midnight is the next day' );
ok( advance( 7, 2, 0, 1000 ).hour === 7, 'speed 0 holds the clock' );
const full = advance( 9, 1, DAY_RATE, dayLength() );
ok( full.day === 2 && near( full.hour, 9, 1e-2 ), 'a whole day comes round to the same hour' );
const rec = { at: 1_000_000, hour: 16, day: 3, speed: DAY_RATE };
ok( near( clockAt( rec, 1_000_000 + 50_000 ).hour, 16.5, 1e-2 ) && clockAt( rec, 1_000_000 ).day === 3, 'everyone works the same time out from the record' );
let mono = true, prev = advance( 0, 1, DAY_RATE, 0 );
for ( let s = 30; s < dayLength() * 2; s += 30 ) {

	const t = advance( 0, 1, DAY_RATE, s );
	if ( t.day * 24 + t.hour <= prev.day * 24 + prev.hour ) mono = false;
	prev = t;

}
ok( mono, 'time only goes forward' );
ok( START_HOUR >= HOURS.marta[ 0 ] && START_HOUR < 12, 'a new player starts in the morning, both stalls open' );
ok( restTo( 14, 2, 'dusk' ).hour === REST.dusk && restTo( 14, 2, 'dusk' ).day === 2, 'resting until dusk: today\'s' );
ok( restTo( 14, 2, 'dawn' ).day === 3 && restTo( 22, 2, 'night' ).day === 3, 'resting past it: tomorrow\'s' );
ok( isOpen( HOURS.joe, 6 ) && ! isOpen( HOURS.joe, 19.5 ) && ! isOpen( HOURS.joe, 2 ) && isOpen( HOURS.joe, OPENS ), 'Joe keeps his hours' );
ok( isOpen( [ 20, 4 ], 23 ) && isOpen( [ 20, 4 ], 1 ) && ! isOpen( [ 20, 4 ], 12 ), 'hours past midnight' );
ok( timeText( 18.67, 'en-US' ) === '6:40 PM' && timeText( 18.67, 'en-GB' ) === '18:40' && /^0?0:00$/.test( timeText( 0.02, 'en-GB' ) ), 'the time as people read it' );
ok( sunUp( 12 ) && ! sunUp( 22 ), 'sun or moon' );

// ---- the wanted lists
ok( tradeDay( 4.9, 6 ) === 5 && tradeDay( OPENS, 6 ) === 6, 'the list runs from Joe opening to his opening the next morning' );
const a = ordersFor( 12 ), b = ordersFor( 12 );
ok( JSON.stringify( a ) === JSON.stringify( b ), 'the same day, the same list (nothing to send)' );
let differ = 0, tw = 0;
for ( let d = 0; d < 40; d ++ ) {

	const l = ordersFor( d );
	if ( JSON.stringify( l ) !== JSON.stringify( ordersFor( d + 1 ) ) ) differ ++;
	if ( new Set( l.map( ( o ) => o.species ) ).size !== l.length ) console.log( 'FAIL day', d, 'repeats a fish' );
	if ( [ 'dawnDusk', 'night' ].includes( FISH[ l[ 0 ].species ].time ) ) tw ++;

}
ok( differ >= 38, 'a new list (nearly) every day' );
ok( tw === 40, 'Joe always wants one fish of the dusk, dawn or dark' );
ok( a.length === 3 && a.every( ( o ) => FISH[ o.species ] && o.max > 0 ), 'Joe\'s two and Marta\'s one' );
console.log( `     day 12: ${ a.map( ( o ) => `${ o.who } ${ o.species } ${ orderTerms( o ) }` ).join( '; ' ) }` );

// ---- selling on them
const m = new Map();
const st = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: ( k, v ) => m.set( k, v ) } );
const list = [ { id: 'joe-a', who: 'joe', species: 'jack', mul: 2, max: 2 }, { id: 'marta', who: 'marta', species: 'mullet', each: 12, max: 4 } ];
const terms = { who: 'joe', orders: list, day: 7 };
const j1 = st.addFish( 'jack', 4 ), j2 = st.addFish( 'jack', 2 ), j3 = st.addFish( 'jack', 1.5 ), g = st.addFish( 'grunt', 0.5 ), mu = st.addFish( 'mullet', 1 );
const q = st.quote( null, terms );
ok( q.prices.get( j1.id ) === j1.value * 2 && q.prices.get( j2.id ) === j2.value * 2 && q.prices.get( j3.id ) === j3.value, 'the biggest fill the order, the rest at Joe\'s price' );
ok( q.wanted === 2 && q.total === j1.value * 2 + j2.value * 2 + j3.value + g.value + mu.value, 'what Joe pays for the lot' );
ok( st.quote( null ).total === st.holdValue, 'without terms, his price' );
const sold = st.sell( [ j1.id ], terms );
ok( sold.total === j1.value * 2 && st.filledOf( list[ 0 ], 7 ) === 1, 'selling one fills one' );
ok( st.quote( [ j2.id, j3.id ], terms ).prices.get( j3.id ) === j3.value, 'the order only takes what\'s left of it' );
const wid = st.wantedIds( list, 7 );
ok( wid.has( j2.id ) && ! wid.has( j3.id ) && wid.has( mu.id ) && ! wid.has( g.id ), 'the fish the list would take: as many as are still wanted, the biggest' );
const box = st.quote( [ j2.id, g.id ], { ...terms, rate: NIGHT_BOX } );
ok( box.prices.get( j2.id ) === j2.value * 2 && box.prices.get( g.id ) === Math.max( 1, Math.round( g.value * NIGHT_BOX ) ), 'the night box: the wanted list in full, the rest for less' );
const marta = st.quote( null, { who: 'marta', orders: list, day: 7 } );
ok( marta.count === 1 && marta.prices.get( mu.id ) === 12, 'Marta takes only what she\'s after' );
ok( st.filledOf( list[ 0 ], 8 ) === 0 && st.quote( [ j2.id ], { ...terms, day: 8 } ).wanted === 1, 'a new day, a new list to fill' );
const st2 = new GameState( { getItem: ( k ) => m.get( k ) ?? null, setItem: () => {} } );
ok( st2.load() && st2.filledOf( list[ 0 ], 7 ) === 1, 'saved with your progress' );
ok( orderPrice( { mul: 1.5 }, 11 ) === 17 && orderPrice( { each: 6 }, 1 ) === 6, 'order prices' );
ok( orderFor( list, 'joe', 'mullet' ) === null && orderFor( list, 'marta', 'mullet' ) === list[ 1 ], 'whose order' );

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
