// (Salt Life) The island's clock: the hour of the day and which day it is. Everyone in a session works
// the same time out from one small record, { at, hour, day, speed }: the hour and day at `at` (ms since
// 1970), running at `speed` game hours a real second by day (0 holds it). Nothing ticks over the
// network (together/Together.js keeps the record in the session; on your own it's yours, and saved).
// The day runs at DAY_RATE, an hour in 100 s; deep night (past the twilight glow) runs NIGHT_X times
// faster, so dusk and dawn linger and the dark hours pass quickly: a day is about half an hour.
// Pure (no three.js), for the tests under Node.
//   clockAt( record, now ) -> { hour, day }     advance( hour, day, speed, seconds ) -> { hour, day }
//   restTo( hour, day, 'dawn' ) -> { hour, day }  isOpen( [ 5, 19 ], hour )  timeText( hour, locale )
//   secondsBetween( hour0, day0, hour, day ) -> real seconds between them at DAY_RATE (M15)

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

// (M15) the real seconds from ( hour0, day0 ) to ( hour, day ) as the clock runs at DAY_RATE (the night's
// speed-up undone: a turtle crawls up the beach at her own pace, however fast the night's passing), negative
// before it
export function secondsBetween( hour0, day0, hour, day ) {

	return ( ( day - day0 ) * DAY + base( wrap( hour ) ) - base( wrap( hour0 ) ) ) / DAY_RATE;

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

// ---------------------------------------------------------------------------------------------------- (M17)
// The tide and the moon, from the island's time alone, as the weather is (game/Weather.js: T, island hours since
// day 1 began), so everyone on one clock has the same tide and the same moon and nothing is sent. Resting,
// sleeping aboard and the tow's jump move them with the clock.
//
// The tide is Settlement Point's, Grand Bahama (NOAA 9710441, the only station in the Bahamas with harmonics of its
// own; Nassau, Andros and Eleuthera are predicted from it): its constituents' amplitudes and Greenwich phases
// (TIDE), each turning at its own speed from the moon's and the sun's mean longitudes (s, h, the moon's perigee p),
// as a tide table's worked out. Semidiurnal (highs 12 h 25 min apart, about 50 min later each day), its mean range
// 0.83 m; springs a day after new and full moon, neaps at the quarters, and N2 bigger than S2 there, so the moon's
// distance moves the range more than its phase does (springs at perigee about 1.1 m, at apogee about 0.75). Every
// constituent but the seasons' (SA, SSA: the game has none), each at its constants' own size (the 18.6-year node's
// factors at their mean, 1). Checked against NOAA's own 2026 predictions for the station (test/tide.mjs; with the
// node's factors and the seasons it matches them to about a centimetre). The heights are about mean sea level,
// G.seaLevel's 0, which is where the island was always drawn.
// The island's day 1 is 15 January 2027 by the sky, its hours local mean time at Settlement Point's 79 W: a
// first-quarter moon on the first evening, so neaps to begin, high water a little after noon and the tide near its
// mean and rising as a new game (and All the Spaces' checks) begins at 9:30.
// The moon: its phase (0 new, 0.5 full) from how far it's drawn ahead of the sun, its age in days, how much of its
// disc is lit, and its distance (km), from its mean anomaly.
// Like the weather, it's worked out with + - x / alone (cosTurns), never sin or cos, so every device gets the same
// tide to the last bit, and whatever's decided by it (the flats' fish: game/Flats.js) the same.
//   tideAt( T ) -> m      tideRate( T ) -> m an island hour      tideTurns( T0, T1 ) -> [ { T, height, high } ]
//   tideState( T ) -> { height, rate, flood, last, next, range, since, to }      moonAt( T ) -> { phase, age, lit, distance, perigee }

export const TIDE_EPOCH = Date.UTC( 2027, 0, 15 ); // the island's day 1, by the sky (its 0:00, at TIDE_LON)
export const TIDE_LON = 79; // degrees west: the island's hours are local mean time here (Settlement Point's)
export const SYNODIC = 29.530589; // days, new moon to new moon
// the highest and lowest it reaches (m, over twenty island years: its mean high water's 0.42, its low 0.42 under):
// a kayak's pulled up past the one (world/boat/kayak), and the shore's waves are solved at levels toward both
export const TIDE_HIGHEST = 0.72, TIDE_LOWEST = - 0.62;
// [ m, Greenwich phase (degrees), and its argument's Doodson multiples of T (the mean sun's hour angle), s, h, p,
// and its constant (degrees) ]
export const TIDE = {
	M2: [ 0.405, 10.6, 2, - 2, 2, 0, 0 ],
	S2: [ 0.070, 36.6, 2, 0, 0, 0, 0 ],
	N2: [ 0.093, 349.8, 2, - 3, 2, 1, 0 ],
	K1: [ 0.067, 197.1, 1, 0, 1, 0, - 90 ],
	O1: [ 0.046, 199.2, 1, - 2, 1, 0, 90 ],
	P1: [ 0.021, 197.2, 1, 0, - 1, 0, 90 ],
	K2: [ 0.018, 36.6, 2, 0, 2, 0, 0 ],
	NU2: [ 0.019, 350.0, 2, - 3, 4, - 1, 0 ],
	MU2: [ 0.013, 350.2, 2, - 4, 4, 0, 0 ],
	'2N2': [ 0.013, 330.7, 2, - 4, 2, 2, 0 ],
	L2: [ 0.011, 31.3, 2, - 1, 2, - 1, 180 ],
	Q1: [ 0.009, 200.1, 1, - 3, 1, 1, 90 ],
};

// the moon's, the sun's and the perigee's mean longitudes (degrees) d days from J2000.0, and their rates a day
// (Meeus), and the mean sun's hour angle at Greenwich, T, at d (180 at midnight)
const J2000 = Date.UTC( 2000, 0, 1, 12 );
const S0 = 218.3164477, S1 = 13.17639648, H0 = 280.46646, H1 = 0.98564736, P0 = 83.3532465, P1 = 0.11140353;
const D_EPOCH = ( TIDE_EPOCH - J2000 ) / 864e5 + TIDE_LON / 360; // days from J2000.0 to the island's 0:00
const TAU = 6.283185307179586;

// cos( 2 pi x ), from + - x / alone (to about 1e-11): a Taylor series about the nearer of 0 and a quarter turn
export function cosTurns( x ) {

	let r = x - Math.floor( x ), sign = 1;
	if ( r > 0.5 ) r = 1 - r;
	if ( r > 0.25 ) {

		r = 0.5 - r;
		sign = - 1;

	}

	if ( r > 0.125 ) {

		const b = ( 0.25 - r ) * TAU, b2 = b * b;
		return sign * b * ( 1 - b2 / 6 * ( 1 - b2 / 20 * ( 1 - b2 / 42 * ( 1 - b2 / 72 * ( 1 - b2 / 110 * ( 1 - b2 / 156 ) ) ) ) ) );

	}

	const a = r * TAU, a2 = a * a;
	return sign * ( 1 - a2 / 2 * ( 1 - a2 / 12 * ( 1 - a2 / 30 * ( 1 - a2 / 56 * ( 1 - a2 / 90 * ( 1 - a2 / 132 ) ) ) ) ) );

}

// each constituent as [ amplitude, its argument at d0 (turns), its speed (turns a day) ] for days counted from d0
function constituents( d0 ) {

	const out = [];
	const T = 180 + 360 * ( d0 - Math.floor( d0 ) + 0.5 ), s = S0 + S1 * d0, h = H0 + H1 * d0, p = P0 + P1 * d0;
	for ( const k in TIDE ) {

		const [ A, g, a, b, c, e, k0 ] = TIDE[ k ];
		const at = ( a * T + b * s + c * h + e * p + k0 - g ) / 360, speed = ( a * 360 + b * S1 + c * H1 + e * P1 ) / 360;
		out.push( [ A, at - Math.floor( at ), speed ] );

	}

	return out;

}

const _CON = constituents( D_EPOCH );

// the tide's height (m about mean sea level) d days after d0, from a list of constituents
export function tideOf( con, d ) {

	let y = 0;
	for ( const [ A, at, speed ] of con ) y += A * cosTurns( at + speed * d );
	return y;

}

// (for test/tide.mjs: the same tide at a real time, ms since 1970 UTC, to set beside NOAA's)
export const tideAtUTC = ( ms ) => tideOf( constituents( ( ms - J2000 ) / 864e5 ), 0 );

// the tide at island time T (m about mean sea level)
export const tideAt = ( T ) => tideOf( _CON, T / 24 );

// how fast it's rising at T (m an island hour; falling < 0)
export function tideRate( T ) {

	let r = 0;
	const d = T / 24;
	for ( const [ A, at, speed ] of _CON ) r -= A * speed * TAU * cosTurns( at + speed * d - 0.25 );
	return r / 24;

}

// where the tide turns between T0 and T1 (island hours): [ { T, height, high } ], in order
export function tideTurns( T0, T1, out = [] ) {

	out.length = 0;
	const step = 0.5;
	let a = T0, ra = tideRate( a );
	while ( a < T1 ) {

		const b = Math.min( T1, a + step ), rb = tideRate( b );
		if ( ( ra > 0 ) !== ( rb > 0 ) && ra !== 0 ) {

			let lo = a, hi = b;
			for ( let i = 0; i < 24; i ++ ) {

				const mid = ( lo + hi ) / 2;
				if ( ( tideRate( mid ) > 0 ) === ( ra > 0 ) ) lo = mid;
				else hi = mid;

			}

			const t = ( lo + hi ) / 2;
			out.push( { T: t, height: tideAt( t ), high: ra > 0 } );

		}

		a = b;
		ra = rb;

	}

	return out;

}

// the tide at T, as it's told: its height and rate, flooding or ebbing, the last turn and the next ({ T, height,
// high }), this tide's range (between them), and the hours since the last and to the next
export function tideState( T ) {

	const last = tideTurns( T - 13.5, T ).pop() || null, next = tideTurns( T, T + 13.5 )[ 0 ] || null;
	const height = tideAt( T ), rate = tideRate( T );
	return {
		height, rate, flood: rate > 0, last, next,
		range: last && next ? Math.abs( next.height - last.height ) : 0,
		since: last ? T - last.T : 0, to: next ? next.T - T : 0,
	};

}

// the moon at T: its phase (0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter: how far it's drawn ahead of the
// sun, in turns), its age (days since new), how much of its disc is lit (0..1), its distance (km) and how near
// perigee it is (1 at perigee, 0 at apogee)
export function moonAt( T, out = {} ) {

	const d = D_EPOCH + T / 24;
	const e = ( S1 - H1 ) * d / 360 + ( S0 - H0 ) / 360, m = ( S1 - P1 ) * d / 360 + ( S0 - P0 ) / 360;
	const phase = e - Math.floor( e ), anomaly = cosTurns( m );
	out.phase = phase;
	out.age = phase * SYNODIC;
	out.lit = ( 1 - cosTurns( phase ) ) / 2;
	out.distance = 385000.6 - 20905.4 * anomaly;
	out.perigee = ( 1 + anomaly ) / 2;
	return out;

}
