// (Salt Life) The island's clock: the hour of the day and which day it is. Everyone in a session works
// the same time out from one small record, { at, hour, day, speed }: the hour and day at `at` (ms since
// 1970), running at `speed` game hours a real second by day (0 holds it). Nothing ticks over the
// network (together/Together.js keeps the record in the session; on your own it's yours, and saved).
// The day runs at DAY_RATE, an hour in 100 s; deep night (past the twilight glow) runs NIGHT_X times
// faster, so dusk and dawn linger and the dark hours pass quickly: a day is about half an hour.
// Pure (no three.js), for the tests under Node.
//   clockAt( record, now ) -> { hour, day }     advance( hour, day, speed, seconds ) -> { hour, day }
//   restTo( hour, day, 'dawn' ) -> { hour, day }  isOpen( [ 5, 19 ], hour )  timeText( hour, locale )

export const DAY_RATE = 0.01; // game hours per real second by day
export const NIGHT_X = 4; // deep night runs this much faster
export const START_HOUR = 9.5; // a new player's first morning
// "rest until": where each lands (the next one ahead)
export const REST = { dawn: 5.5, noon: 12, dusk: 17.5, night: 20.5 };
export const REST_NAMES = { dawn: 'Dawn', noon: 'Noon', dusk: 'Dusk', night: 'Night' };

const smooth = ( e0, e1, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - e0 ) / ( e1 - e0 ) ) );
	return t * t * ( 3 - 2 * t );

};

// how many times faster than by day the clock runs at `hour`: 1 from 4:30 to 19:30 (the sun's up or
// its glow is), NIGHT_X from 20:30 to 3:30, eased between
export function pace( hour ) {

	const h = ( ( hour % 24 ) + 24 ) % 24;
	const deep = h < 12 ? 1 - smooth( 3.5, 4.5, h ) : smooth( 19.5, 20.5, h );
	return 1 + ( NIGHT_X - 1 ) * deep;

}

// the day in "daylight hours" (game hours at pace 1): CUM[ i ] from midnight to i half-minutes
const STEPS = 24 * 120;
const CUM = new Float64Array( STEPS + 1 );
for ( let i = 0; i < STEPS; i ++ ) CUM[ i + 1 ] = CUM[ i ] + ( 24 / STEPS ) / pace( ( i + 0.5 ) * 24 / STEPS );
const DAY = CUM[ STEPS ];

// real seconds a whole day takes at `speed`
export const dayLength = ( speed = DAY_RATE ) => DAY / speed;

// daylight hours from midnight to `hour`
function base( hour ) {

	const x = Math.min( Math.max( hour, 0 ), 24 ) / 24 * STEPS;
	const i = Math.min( STEPS - 1, Math.floor( x ) );
	return CUM[ i ] + ( CUM[ i + 1 ] - CUM[ i ] ) * ( x - i );

}

// the hour `b` daylight hours after midnight (0 <= b < DAY)
function hourAt( b ) {

	let lo = 0, hi = STEPS;
	while ( hi - lo > 1 ) {

		const mid = ( lo + hi ) >> 1;
		if ( CUM[ mid ] <= b ) lo = mid;
		else hi = mid;

	}

	const f = ( b - CUM[ lo ] ) / ( CUM[ lo + 1 ] - CUM[ lo ] );
	return ( lo + Math.min( 1, Math.max( 0, f ) ) ) * 24 / STEPS;

}

const wrap = ( hour ) => ( ( hour % 24 ) + 24 ) % 24;

// the hour and day `seconds` (real) after ( hour, day ), at `speed`
export function advance( hour, day, speed, seconds ) {

	hour = wrap( hour );
	day = Number.isFinite( day ) ? day : 1;
	if ( ! ( speed > 0 ) || ! ( seconds > 0 ) ) return { hour, day };
	const b = base( hour ) + seconds * speed;
	const days = Math.floor( b / DAY );
	return { hour: hourAt( b - days * DAY ), day: day + days };

}

// the time now, from a clock record ({ at, hour, day, speed })
export function clockAt( c, now = Date.now() ) {

	return advance( c.hour, c.day, c.speed, ( now - c.at ) / 1000 );

}

// resting until `to` ('dawn' | 'noon' | 'dusk' | 'night'): the next one ahead, tomorrow's if it's past
export function restTo( hour, day, to ) {

	const target = REST[ to ];
	if ( target === undefined ) return { hour, day };
	return { hour: target, day: target > hour + 1 / 60 ? day : day + 1 };

}

// is a stall with hours [ open, close ) open at `hour`?
export function isOpen( hours, hour ) {

	if ( ! hours ) return true;
	const [ open, close ] = hours, h = wrap( hour );
	return open <= close ? h >= open && h < close : h >= open || h < close;

}

// the time of day as the person reads it ('6:40 PM', '18:40'), to `step` minutes
export function timeText( hour, locale = undefined, step = 5 ) {

	const m = Math.floor( wrap( hour ) * 60 / step ) * step;
	const d = new Date( Date.UTC( 2000, 0, 1, Math.floor( m / 60 ), m % 60 ) );
	try {

		return new Intl.DateTimeFormat( locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' } ).format( d );

	} catch ( e ) {

		return `${ Math.floor( m / 60 ) }:${ String( m % 60 ).padStart( 2, '0' ) }`;

	}

}

// is the sun up (for the clock's sun or moon)?
export const sunUp = ( hour ) => {

	const h = wrap( hour );
	return h >= 5.8 && h < 18.2;

};
