import { FISH } from './FishTable.js';

// (Salt Life) The week's order: a restaurant on the mainland orders one kind of fish through Joe, so
// many kilos by the end of the week (real weeks, Monday 00:00 UTC to the next, the same for everyone).
// The group fills it together: every one of those fish sold to Joe (or left in his night box) goes
// toward it and fetches half as much again (WEEK_MUL). Once it's filled, the restaurant's bonus is
// shared by what each of you brought, and Joe pays you your share when he's in. The tally is the
// group's, in its shared save ('weekOrder', together/Together.js), so it counts whoever plays when.
//   const w = weekOrder( Date.now() )   t = tallyFor( saved, w )   t = deliver( saved, w, me, kg )   weekNumber( now )
//   delivered( t )  filled( t )  mineOf( t, id )  owed( t, id, paidWeek )
// A tally: { week, species, kg, bonus, by: { id: { name, kg } }, prev } (prev: the last filled week's,
// kept for whoever hasn't collected their share yet)

export const WEEK_MUL = 1.5;
const MENU = [ 'redSnapper', 'grouper', 'mahi', 'tuna', 'yellowtail', 'wrasse' ]; // what a restaurant would order
const FISH_N = 12; // the order is about this many fish of the kind
const SHARE = 0.5; // the bonus: half of what the order would fetch at Joe's price
const DAY = 864e5, WEEK = 7 * DAY, MONDAY = 4 * DAY; // (1 January 1970 was a Thursday)

// which week `now` (ms since 1970) is in, and when a week ends (ms)
export const weekNumber = ( now ) => Math.floor( ( now - MONDAY ) / WEEK );
export const weekEnds = ( week ) => MONDAY + ( week + 1 ) * WEEK;

// the week's order at `now`: { week, species, kg, bonus, ends (ms) }. The kinds come round in turn,
// never the same two weeks running
export function weekOrder( now ) {

	const week = weekNumber( now );
	const species = MENU[ ( ( week * 5 ) % MENU.length + MENU.length ) % MENU.length ];
	const f = FISH[ species ], [ a, b ] = f.kg;
	// (a typical fish of the kind: Bites.rollWeight's mean)
	const kg = Math.max( 10, Math.round( ( a + ( b - a ) / 3.2 ) * FISH_N / 5 ) * 5 );
	const bonus = Math.max( 200, Math.round( kg * f.price * SHARE / 10 ) * 10 );
	return { week, species, kg, bonus, ends: weekEnds( week ) };

}

export const delivered = ( t ) => ( t ? Object.values( t.by ).reduce( ( n, b ) => n + b.kg, 0 ) : 0 );
export const filled = ( t ) => !! t && delivered( t ) >= t.kg;
export const mineOf = ( t, id ) => ( t && t.by[ id ] ? t.by[ id ].kg : 0 );

// a saved tally, checked (anything else: null)
function clean( t ) {

	if ( ! t || typeof t !== 'object' || ! Number.isFinite( t.week ) || ! FISH[ t.species ] || ! ( t.kg > 0 ) || ! t.by || typeof t.by !== 'object' ) return null;
	const by = {};
	for ( const [ id, b ] of Object.entries( t.by ) ) if ( b && Number.isFinite( b.kg ) && b.kg > 0 ) by[ id ] = { name: String( b.name || '' ).slice( 0, 40 ), kg: b.kg };
	return { week: t.week, species: t.species, kg: t.kg, bonus: Number.isFinite( t.bonus ) ? t.bonus : 0, by, prev: clean( t.prev ) };

}

// this week's tally from the saved one (from an earlier week: a fresh one, keeping the last filled week's;
// from a later one, on a device whose clock is behind: that one)
export function tallyFor( saved, w ) {

	const t = clean( saved );
	if ( t && t.week >= w.week ) return t;
	const prev = t ? ( filled( t ) ? { ...t, prev: null } : t.prev ) : null;
	return { week: w.week, species: w.species, kg: w.kg, bonus: w.bonus, by: {}, prev };

}

// `kg` of the fish brought by me ({ id, name }): the tally after (until it's filled: the fish that fills
// it counts whole, those after it don't)
export function deliver( saved, w, me, kg ) {

	const t = tallyFor( saved, w );
	if ( filled( t ) || ! ( kg > 0 ) ) return t;
	const was = mineOf( t, me.id );
	t.by[ me.id ] = { name: me.name, kg: Math.round( ( was + kg ) * 1000 ) / 1000 };
	return t;

}

// your share of a filled order's bonus: by what you brought
export const shareOf = ( t, id ) => ( filled( t ) && mineOf( t, id ) > 0 ? Math.round( t.bonus * mineOf( t, id ) / delivered( t ) ) : 0 );

// what Joe owes you from the tally (this week's and the last filled one), after the week you were last
// paid for -> { total, week }
export function owed( t, id, paidWeek = - Infinity ) {

	let total = 0, week = paidWeek;
	for ( const x of [ t && t.prev, t ] ) {

		if ( ! x || x.week <= paidWeek ) continue;
		const s = shareOf( x, id );
		if ( s > 0 ) {

			total += s;
			week = Math.max( week, x.week );

		}

	}

	return { total, week };

}
