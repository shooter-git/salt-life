import { FISH, releaseBonus } from './FishTable.js';
import { placeName, PLACES } from './Places.js';

// (M16) The billfish are let go, as the rules say, as everyone does: a sailfish, a white marlin or a blue marlin is
// measured alongside and sent off alive. The island's billfish fund pays for it (FishTable.releaseBonus), and your log
// keeps it: its best of each kind, with its picture (the catch card's studio portrait, looked at again from the log:
// Game.showTrophy). The tag kit (the `landing` track's stats.tagKit: the rigs') pays half as much again. The fund pays for
// one that swam off: one taken off by hand and out of the water (info.hurt: Rigs.releaseHurt) may not, and it's nothing.
//   letGo( state, info ) -> the bonus (0: not a billfish)       info: GameState.lastCatch
//   trophyRows( state )   the log's list, biggest first         trophyCardOf( state, species )   the card's info
//   trophyNote( info )    what the catch card says of it        cleanTrophies( saved )
//
// (M17) And the slams (docs/m17/sight.md): a day's fish of the kinds a slam names, each caught or let go within one island
// day, kept beside the billfish as a trophy (state.trophies[ 'slam:<id>' ]: how many, and the first and the last), the
// day's tally with them (state.trophies.today). The grand slam is a bonefish, a permit and a tarpon: anglers' own
// (IGFA's inshore slam is any three of its list; its club began with these and the snook). SLAMS is the list: another
// slam is another entry, its kinds and its name. (M17's stream 7, docs/m17/life-list.md) The super grand slam is the grand
// slam and a snook (the IGFA's inshore club's own four), and the billfish grand slam a sailfish, a white marlin and a blue
// marlin, each let go: the offshore anglers' (the billfish trophies are below; this counts them by day).
// "One day" is the island's, sunrise to sunrise (slamDay), and sleeping ends it (slamSlept: the game calls it when the
// clock's jumped). A guest's fish counts for the guest, aboard anyone's boat: the catch is theirs, on their own game. A slam
// pays nothing.
//   slamDay( day, hour )               the island day a catch counts in        slamCatch( state, info, day ) -> [ slam ids ]
//   slamSlept( state )                 the day's tally gone                    slamRows( state )   the log's rows
//   slamNote( ids )                    what's told of them                     slamTold( ids )     the one told: the biggest

// (short: the records board's word for it, together/RecordsBoard.js)
export const SLAMS = {
	grand: { name: 'Grand slam', short: 'grand', kinds: [ 'bonefish', 'permit', 'tarpon' ], what: 'a bonefish, a permit and a tarpon in one day' },
	superGrand: { name: 'Super grand slam', short: 'super grand', kinds: [ 'bonefish', 'permit', 'tarpon', 'snook' ], what: 'a bonefish, a permit, a tarpon and a snook in one day', over: 'grand' },
	billfish: { name: 'Billfish grand slam', short: 'billfish', kinds: [ 'sailfish', 'whiteMarlin', 'blueMarlin' ], what: 'a sailfish, a white marlin and a blue marlin in one day' },
};
export const SUNRISE = 5.8; // (IslandClock's sunUp)
export const slamDay = ( day, hour ) => ( hour < SUNRISE ? day - 1 : day );

// the slams a kind is part of
export const slamsOf = ( species ) => Object.keys( SLAMS ).filter( ( id ) => SLAMS[ id ].kinds.includes( species ) );

// a fish caught or let go (info: GameState.lastCatch), on island day `day` (slamDay's): in the day's tally, and each slam
// it completes kept. -> the ids of the slams it completed now (each only once a day)
export function slamCatch( state, info, day ) {

	if ( ! Number.isFinite( day ) || ! slamsOf( info.species ).length ) return [];
	const T = state.trophies;
	if ( ! T.today || T.today.day !== day ) T.today = { day, got: {}, done: {} };
	const got = T.today.got;
	if ( ! got[ info.species ] || info.kg > got[ info.species ].kg ) got[ info.species ] = { kg: info.kg, place: info.place || null };
	const now = [];
	for ( const id of slamsOf( info.species ) ) {

		const S = SLAMS[ id ];
		if ( T.today.done[ id ] || ! S.kinds.every( ( k ) => got[ k ] ) ) continue;
		T.today.done[ id ] = true;
		const t = T[ 'slam:' + id ] || ( T[ 'slam:' + id ] = { n: 0, first: null, day: null, place: null, kinds: {} } );
		t.n ++;
		if ( t.first === null ) t.first = day;
		t.day = day;
		t.place = info.place || null;
		t.kinds = Object.fromEntries( S.kinds.map( ( k ) => [ k, Math.round( got[ k ].kg * 100 ) / 100 ] ) );
		now.push( id );

	}

	state.save();
	return now;

}

// a sleep ends the island day: what was caught before it doesn't count toward a slam after
export function slamSlept( state ) {

	if ( ! state.trophies.today ) return;
	delete state.trophies.today;
	state.save();

}

// the log's rows of the slams you've had: { slam, name, meta, n }
export const slamRows = ( state ) => Object.keys( SLAMS ).filter( ( id ) => state.trophies[ 'slam:' + id ] ).map( ( id ) => {

	const t = state.trophies[ 'slam:' + id ];
	return { slam: id, species: null, name: SLAMS[ id ].name, n: t.n, kg: Object.values( t.kinds ).reduce( ( a, b ) => a + b, 0 ),
		meta: `${ t.n > 1 ? `${ t.n } times, the first day ${ t.first + 1 }; the last day` : 'Day' } ${ t.day + 1 }${ t.place && PLACES[ t.place ] ? `, ${ placeName( t.place ) }` : '' }: ${ SLAMS[ id ].what }` };

} );

// of slams had together (a snook that makes the grand slam and the super grand slam at once), the one told: the biggest
export const slamTold = ( ids ) => ids.filter( ( id ) => ! ids.some( ( o ) => SLAMS[ o ].over === id ) );

// what's told of slams just had ('all let go' only when every kind of it is: (M19) the snook's let go now too)
// (b: how its name's set: the catch card's in bold)
export const slamNote = ( ids, b = ( t ) => t ) => slamTold( ids ).map( ( id ) => {

	const S = SLAMS[ id ], gone = S.kinds.every( ( k ) => FISH[ k ].protected ) ? ', all let go' : '';
	return `${ b( S.name + '!' ) } ${ S.what[ 0 ].toUpperCase() + S.what.slice( 1 ) }${ gone } · it's a trophy in your log`;

} ).join( ' · ' );

// the day's tally so far, for the Guide and the card: the kinds of each slam you've had today, and still to get
export function slamToday( state, day ) {

	const t = state.trophies.today, got = t && t.day === day ? t.got : {};
	return Object.fromEntries( Object.keys( SLAMS ).map( ( id ) => [ id, { got: SLAMS[ id ].kinds.filter( ( k ) => got[ k ] ), left: SLAMS[ id ].kinds.filter( ( k ) => ! got[ k ] ), done: !! ( t && t.day === day && t.done[ id ] ) } ] ) );

}

export function letGo( state, info ) {

	if ( ! info.released || ! FISH[ info.species ].release ) return 0;
	const tagged = !! state.stats.tagKit;
	const bonus = info.hurt ? 0 : releaseBonus( info.species, info.kg, tagged );
	info.fundTag = tagged && bonus > 0;
	const t = state.trophies[ info.species ] || ( state.trophies[ info.species ] = { n: 0, kg: 0, cm: 0, day: null, place: null, tagged: false } );
	t.n ++;
	if ( info.kg > t.kg ) Object.assign( t, { kg: info.kg, cm: info.cm, day: info.day, place: info.place, tagged } );
	state.money += bonus;
	state.save();
	state.emit();
	return bonus;

}

// when and where it was let go: 'from the drop-off, day 12'
const whereOf = ( t ) => [ t.place && PLACES[ t.place ] ? `from ${ placeName( t.place ) }` : '', Number.isFinite( t.day ) ? `day ${ t.day + 1 }` : '' ].filter( Boolean ).join( ', ' );

export const trophyRows = ( state ) => [ ...slamRows( state ), ...Object.entries( state.trophies ).filter( ( [ k ] ) => FISH[ k ] ).sort( ( a, b ) => b[ 1 ].kg - a[ 1 ].kg )
	.map( ( [ species, t ] ) => ( { species, name: FISH[ species ].name, kg: t.kg, cm: t.cm, meta: `${ t.n } let go · your best ${ whereOf( t ) }${ t.tagged ? ', tagged' : '' }` } ) ) ];

export function trophyCardOf( state, species ) {

	const t = state.trophies[ species ];
	if ( ! t || ! FISH[ species ] ) return null;
	return { species, kg: t.kg, cm: t.cm, value: 0, released: true, kept: false, why: 'protected', method: 'rod', trophyView: true, n: t.n, day: t.day, place: t.place, tagged: 0, wasTagged: t.tagged };

}

export function trophyNote( info ) {

	if ( info.trophyView ) return `${ info.n > 1 ? `Your best of the ${ info.n } you've` : 'The one you\'ve' } let go, ${ whereOf( info ) }${ info.wasTagged ? ', tagged' : '' }`;
	if ( info.hurt ) return 'Unhooked by hand, out of the water, it went off slowly on its side. The billfish fund only pays for one that swims off: Marta\'s dehooker takes the hook out with it still in the water. It\'s in your log';
	return `${ info.fundTag ? 'Tagged and let go' : 'Let go' } alive, as everyone does. The billfish fund pays <b>$${ info.bonus }</b> for it${ info.tagged ? `, Marta's log <b>$${ info.tagged }</b>` : '' }, and it's a trophy in your log`;

}

export function cleanTrophies( saved ) {

	const out = {};
	const day = ( d ) => ( Number.isInteger( d ) && d >= 0 ? d : null );
	for ( const [ k, t ] of Object.entries( saved && typeof saved === 'object' ? saved : {} ) ) {

		// ((M17) a slam, and the day's tally toward them)
		if ( k.startsWith( 'slam:' ) && SLAMS[ k.slice( 5 ) ] && t && Number.isInteger( t.n ) && t.n >= 1 ) {

			const kinds = {};
			for ( const s of SLAMS[ k.slice( 5 ) ].kinds ) kinds[ s ] = Number.isFinite( t.kinds && t.kinds[ s ] ) ? t.kinds[ s ] : 0;
			out[ k ] = { n: t.n, first: day( t.first ), day: day( t.day ), place: PLACES[ t.place ] ? t.place : null, kinds };
			continue;

		}

		if ( k === 'today' && t && day( t.day ) !== null ) {

			const got = {}, done = {};
			for ( const [ s, g ] of Object.entries( t.got || {} ) ) if ( FISH[ s ] && g && Number.isFinite( g.kg ) ) got[ s ] = { kg: g.kg, place: PLACES[ g.place ] ? g.place : null };
			for ( const id of Object.keys( t.done || {} ) ) if ( SLAMS[ id ] ) done[ id ] = true;
			out.today = { day: t.day, got, done };
			continue;

		}

		if ( ! FISH[ k ] || ! t || ! Number.isInteger( t.n ) || t.n < 1 || ! Number.isFinite( t.kg ) ) continue;
		out[ k ] = { n: t.n, kg: t.kg, cm: Number.isFinite( t.cm ) ? t.cm : 0, day: Number.isFinite( t.day ) ? t.day : null, place: PLACES[ t.place ] ? t.place : null, tagged: !! t.tagged };

	}

	return out;

}
