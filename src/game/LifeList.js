import { FISH, FISH_IDS, fishLengthCm } from './FishTable.js';
import { PLACES, farName } from './Places.js';
import { SLAMS } from './Trophies.js';

// (M17) The life list (docs/m17/life-list.md): every kind in the fish table, caught or still to catch, the anglers' own goal
// once the shop has nothing more to sell. Your log (GameState.log) keeps each kind's count and best; since M17 also the
// island day and the place of your best (bestDay, bestAt) and of your first (first: [ day, place ]). A save from before has
// neither, so they show blank until that kind's next best (its first stays unknown). A protected kind let go counts as
// caught: it's logged as it's let go (GameState.addFish), as the billfish trophies keep theirs (Trophies.js).
//   KINDS                          the table's kinds (39 on v2.2.2)
//   caught( state, species )       had one, kept or let go
//   lifeCount( state )             how many kinds you've had
//   lifeList( state ) -> { n, of, caught: [ { species, count, kg, cm, first: { day, place }, best: { day, place } } ],
//                          left: [ { species, hint } ] }, each in the table's order
//   whenWhere( { day, place }, found )   'day 12, the drop-off' (either may be missing: '' for neither)
//   cleanLog( saved )              the save's log read back: each kind's day and place checked, none made up
//   lifeOf( state ) -> { k, sl }   what the group's records board is sent: your kinds, and the slams you've had (together/)

export const KINDS = FISH_IDS.length;

export const caught = ( state, species ) => ( state.log[ species ] && state.log[ species ].count > 0 ) || ( state.trophies[ species ] && state.trophies[ species ].n > 0 );

export function lifeCount( state ) {

	let n = 0;
	for ( const k of FISH_IDS ) if ( caught( state, k ) ) n ++;
	return n;

}

const dayOf = ( d ) => ( Number.isInteger( d ) && d >= 0 ? d : null );
const placeOf = ( p ) => ( PLACES[ p ] ? p : null );

export function lifeList( state ) {

	const out = { n: 0, of: KINDS, caught: [], left: [] };
	for ( const species of FISH_IDS ) {

		if ( ! caught( state, species ) ) {

			out.left.push( { species, hint: FISH[ species ].hint || '' } );
			continue;

		}

		// (a billfish let go before it was logged, if one ever was: its trophy has its best)
		const v = state.log[ species ], t = state.trophies[ species ];
		const e = v && v.count > 0 ? { species, count: v.count, kg: v.bestKg, cm: v.bestCm, first: { day: dayOf( v.first && v.first[ 0 ] ), place: placeOf( v.first && v.first[ 1 ] ) }, best: { day: dayOf( v.bestDay ), place: placeOf( v.bestAt ) } }
			: { species, count: t.n, kg: t.kg, cm: t.cm, first: { day: null, place: null }, best: { day: dayOf( t.day ), place: placeOf( t.place ) } };
		out.caught.push( e );

	}

	out.n = out.caught.length;
	return out;

}

export const whenWhere = ( w, found = null ) => [ w.day !== null ? `day ${ w.day + 1 }` : '', w.place ? farName( w.place, found ) : '' ].filter( Boolean ).join( ', ' );

export function cleanLog( saved ) {

	const out = {};
	if ( ! saved || typeof saved !== 'object' ) return out;
	for ( const [ k, v ] of Object.entries( saved ) ) {

		if ( ! v || typeof v !== 'object' ) continue;
		// (a kind the table doesn't have now is kept as it was: it may come back)
		if ( ! FISH[ k ] ) {

			out[ k ] = v;
			continue;

		}

		const e = { count: Number.isInteger( v.count ) && v.count > 0 ? v.count : 0, bestKg: Number.isFinite( v.bestKg ) && v.bestKg > 0 ? v.bestKg : 0 };
		if ( Number.isFinite( v.bestCm ) ) e.bestCm = v.bestCm;
		else if ( e.bestKg > 0 ) e.bestCm = Math.round( fishLengthCm( k, e.bestKg ) ); // (saves from before lengths were recorded)
		if ( 'bestDay' in v || 'bestAt' in v ) {

			e.bestDay = dayOf( v.bestDay );
			e.bestAt = placeOf( v.bestAt );

		}

		if ( Array.isArray( v.first ) ) e.first = [ dayOf( v.first[ 0 ] ), placeOf( v.first[ 1 ] ) ];
		// ((M19) the line-class records, stream RECORDS': each class's best, { kg, day, place }, by a class's key (IGFA's kg,
		// a tippet's with an f before it))
		if ( v.cls && typeof v.cls === 'object' ) {

			const c = {};
			for ( const [ cl, r ] of Object.entries( v.cls ) ) if ( /^f?\d{1,3}$/.test( cl ) && r && Number.isFinite( r.kg ) && r.kg > 0 ) c[ cl ] = { kg: r.kg, day: dayOf( r.day ), place: placeOf( r.place ) };
			if ( Object.keys( c ).length ) e.cls = c;

		}

		out[ k ] = e;

	}

	return out;

}

// for the board (together/): { k: kinds, sl: the slams' ids you've had }
export const lifeOf = ( state ) => ( { k: lifeCount( state ), sl: Object.keys( SLAMS ).filter( ( id ) => state.trophies[ 'slam:' + id ] ) } );
