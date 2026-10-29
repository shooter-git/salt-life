import { FISH } from './FishTable.js';
import { isOpen } from './IslandClock.js';
import { placeName } from './Places.js';

// (Salt Life) What Joe and Marta want today: Joe chalks two fish on the board by his stand and pays
// over the odds for them, Marta buys one kind of bait fish at the chandlery. A new list each morning,
// from the day alone, so everyone sharing an island's clock sees the same one and nothing is sent.
// The day's list runs from Joe opening (OPENS) to his opening the next morning: a fish caught after he
// shuts still counts, left in his night box. Each order takes a few fish from each player at its price.
// (M9) In a gale or a thunderstorm Joe and Marta shut and go home (SHUT_FOR), as they do after hours:
// Joe's night box and the diesel on Marta's honesty box are still out.
//   const list = ordersFor( tradeDay( hour, day ) )   orderFor( list, 'joe', 'yellowtail' )
//   orderPrice( order, value )   stallOpen( HOURS.joe, hour, weather.id )   shutFor( weather.id )

export const OPENS = 5; // Joe opens at 5 am
export const HOURS = { joe: [ OPENS, 19 ], marta: [ 7, 19 ] }; // [ open, close ) game hours
export const NIGHT_BOX = 0.7; // what Joe's night box pays, of his price (the wanted list in full)
export const SHUT_FOR = [ 'gale', 'storm', 'hurricane' ]; // (M9) the weather they shut for (Weather.js ids)

// (M9) are the stalls shut for the weather (a Weather.js id; none: the day's hours alone)?
export const shutFor = ( weatherId ) => SHUT_FOR.includes( weatherId );
// is a stall with these hours open at `hour`, in this weather?
export const stallOpen = ( hours, hour, weatherId = null ) => isOpen( hours, hour ) && ! shutFor( weatherId );

// Joe's pick: one fish of the twilight (yellowtail, jacks and mutton and mangrove snapper at dusk and
// dawn, tuna offshore at first light) at double, and one more at half as much again (a spiny lobster
// among them). Never a protected fish: it's let go (FishTable.js)
const TWILIGHT = [ 'yellowtail', 'jack', 'tuna', 'muttonSnapper', 'graySnapper' ];
const MORE = [ 'sergeant', 'grunt', 'tang', 'wrasse', 'lionfish', 'angel', 'barracuda', 'blackGrouper', 'redSnapper', 'mahi', 'mullet', 'needlefish', 'silkSnapper', 'lobster' ];
// Marta's bait tank: $ a fish
const BAIT = { silverside: 6, sergeant: 8, grunt: 10, mullet: 12, needlefish: 12, whiteMullet: 10 };
// (M15) and one ask a day for a place's fish (Places.js), paid as no other (PLACE_MUL): Joe's for the table
// (pompano from the north beach's surf, a snook or a mangrove snapper from the mangrove creek, a black grouper
// or a mutton snapper from the windward reef, a tuna off the drop-off, a mahi from the blue water, a silk
// snapper from the north ledge), or Marta's for her tag-and-release log for the fisheries office: a tarpon
// let go in the creek, a permit on the north beach, paid as it's let go (tag: GameState.tag)
const PLACE_ASKS = [
	{ who: 'joe', species: 'pompano', place: 'northBeach', max: 3 },
	{ who: 'joe', species: 'snook', place: 'creek', max: 1 },
	{ who: 'joe', species: 'graySnapper', place: 'creek', max: 3 },
	{ who: 'joe', species: 'blackGrouper', place: 'windReef', max: 2 },
	{ who: 'joe', species: 'muttonSnapper', place: 'windReef', max: 3 },
	{ who: 'joe', species: 'tuna', place: 'dropoff', max: 2 },
	{ who: 'joe', species: 'mahi', place: 'blue', max: 2 },
	{ who: 'joe', species: 'silkSnapper', place: 'ledge', max: 3 },
	{ who: 'marta', species: 'tarpon', place: 'creek', max: 1, tag: 35 },
	{ who: 'marta', species: 'permit', place: 'northBeach', max: 1, tag: 40 },
];
export const PLACE_MUL = 2.5;

// which list is up: the day's from Joe opening, until he opens again
export const tradeDay = ( hour, day ) => ( hour >= OPENS ? day : day - 1 );

function rng( seed ) {

	let a = ( seed * 2654435761 ^ 0x5a17 ) >>> 0;
	return () => {

		a = ( a + 0x6d2b79f5 ) >>> 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;

	};

}

const pick = ( list, r ) => list[ Math.floor( r() * list.length ) % list.length ];

// the day's orders: [ { id, who, species, mul | each, max, place?, tag? } ] ((M15) the place's ask drawn last:
// the others are as they always were)
export function ordersFor( day ) {

	const r = rng( Math.floor( day ) );
	const bait = pick( Object.keys( BAIT ), r );
	const a = pick( TWILIGHT, r );
	const b = pick( MORE.filter( ( s ) => s !== bait ), r );
	const p = pick( PLACE_ASKS.filter( ( q ) => ! [ a, b, bait ].includes( q.species ) ), r );
	return [
		{ id: 'joe-a', who: 'joe', species: a, mul: 2, max: 3 },
		{ id: 'joe-b', who: 'joe', species: b, mul: 1.5, max: 3 },
		{ id: 'marta', who: 'marta', species: bait, each: BAIT[ bait ], max: 4 },
		p.tag ? { id: 'place', who: p.who, species: p.species, place: p.place, each: p.tag, max: p.max, tag: true } : { id: 'place', who: p.who, species: p.species, place: p.place, mul: PLACE_MUL, max: p.max },
	].filter( ( o ) => FISH[ o.species ] );

}

// the orders a fish from `place` would fill, the place's own first (none that's a tag-and-release one: those
// are paid as they're let go)
export const ordersOf = ( list, who, species, place = null ) => ( list || [] ).filter( ( o ) => o.who === who && o.species === species && ! o.tag && ( ! o.place || o.place === place ) )
	.sort( ( a, b ) => ( b.place ? 1 : 0 ) - ( a.place ? 1 : 0 ) );
export const orderFor = ( list, who, species, place = null ) => ordersOf( list, who, species, place )[ 0 ] || null;
// (M15) Marta's tag-and-release ask a fish let go at `place` fills, or null
export const tagFor = ( list, species, place ) => ( list || [] ).find( ( o ) => o.tag && o.species === species && o.place === place ) || null;
// (M15) where an order's fish has to come from, as it's said ('from the north beach'; '' for none)
export const orderPlace = ( o ) => ( o.place ? `${ o.tag ? 'tagged and let go at' : 'from' } ${ placeName( o.place ) }` : '' );

// what an order pays for a fish Joe would give `value` for
export const orderPrice = ( o, value ) => ( o.each ?? Math.round( value * o.mul ) );

// where and when a fish bites, from its table entry ('over the reef, at dawn and dusk'): Joe's hint
const WHERE = { shallows: 'in the shallows', pier: 'off the pier', reef: 'over the reef', bay: 'in the bay', deep: 'offshore',
	edge: 'on the drop-off', ledge: 'on the deep ledges', blue: 'in the blue water', weed: 'under the weedlines', debris: 'under floating debris', birds: 'where the birds are working',
	wash: 'in the surf', creek: 'in the mangrove creek' };
const WHEN = { dawnDusk: 'at dawn and dusk', night: 'after dark', day: 'by day', any: '' };
export function biteHint( species ) {

	const f = FISH[ species ];
	if ( ! f ) return '';
	// (the spiny lobster: by hand on a dive)
	if ( f.hand ) return 'in the reef\'s ledges, by hand, after dark';
	// (one that gathers under the pier's lamps after dark: there, then)
	if ( f.lights ) return 'under the pier lights, after dark';
	const best = Object.entries( f.habitat ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] )[ 0 ];
	return [ best && WHERE[ best[ 0 ] ], WHEN[ f.time ] ].filter( Boolean ).join( ', ' );

}

// how an order reads ('pays double', '$12 each'; (M15) a tag-and-release ask: '$35 tagged')
export const orderTerms = ( o ) => ( o.tag ? `$${ o.each } tagged` : o.each ? `$${ o.each } each` : o.mul === 2 ? 'pays double' : `pays ×${ o.mul }` );
