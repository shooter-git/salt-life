import { FT } from './Units.js';

// (Salt Life) The island's weather: what the day brings, from the island's time alone, so everyone on
// one clock (game/IslandClock.js) has the same weather and nothing is sent. Like the wanted lists
// (Orders.js), it's worked out, not rolled: a forecast is the same function a little further on.
//
// Three slow, smooth fields over the island's time T (game hours since day 1 began): storminess, which
// sets the wind and the swell (fair most of the time, a gale now and then), cloudiness, which can grey a
// calm day too, and how far the wind has turned from the trades. Each is value noise in two octaves (about 60 h and 14 h), mapped through its own
// distribution so that it's spread evenly over 0..1, then read against the conditions' rows below. The
// swell runs ahead of the wind: it comes from the storm a few hours off, so the surf builds before the
// blow. A new player's first day is fair (and the checks', which start on day 1).
//
// Everything here is + - x / and integer hashes (Math.imul), never sin, exp or pow, so every device
// works out the same condition from the same time. Pure (no three.js), for the tests under Node.
//   islandTime( day, hour ) -> T      weatherAt( T, pick ) -> { id, wind, windAngle, coverage, overcast,
//   swell, windSea, surf, period, visibility }   forecast( T ) -> { id, at } | null      surfText( 0.34 ) -> '2–3 ft'
//   windFrom( dx, dz ) -> 'NNW' (where a wind blowing toward ( dx, dz ) comes from)

// what a condition brings: wind (m/s at 10 m), cloud cover and how overcast it is (0..1), the open
// sea's swell and wind sea (x today's), the surf (m, the shore waves' offshore amplitude H/2, and its
// period, s) and the distance you see (x today's). Fair is the island as it always was.
export const CONDITIONS = {
	calm: { wind: 2.5, coverage: 0.35, overcast: 0, swell: 0.7, surf: 0.24, period: 10, visibility: 1.1 },
	fair: { wind: 7, coverage: 0.49, overcast: 0, swell: 1, surf: 0.34, period: 9, visibility: 1 },
	breezy: { wind: 11, coverage: 0.55, overcast: 0.1, swell: 1.25, surf: 0.42, period: 8.5, visibility: 0.95 },
	cloudy: { wind: 6, coverage: 0.82, overcast: 0.55, swell: 1, surf: 0.34, period: 9, visibility: 0.8 },
	blustery: { wind: 15, coverage: 0.75, overcast: 0.45, swell: 1.5, surf: 0.5, period: 8, visibility: 0.75 },
	gale: { wind: 20, coverage: 0.92, overcast: 0.8, swell: 1.8, surf: 0.6, period: 7.5, visibility: 0.55 },
};
// the surf's period (s): a storm's own swell comes short and steep; one that's come far, from a storm
// still on its way, long, and smaller than the storm's own sea by the time it's here. The longest it
// gets, and the biggest such a swell gets (m: it runs further up the beach than a short one)
export const PERIOD_MAX = 12;
export const GROUNDSWELL_MAX = 0.4;
export const WEATHER_IDS = [ 'calm', 'fair', 'breezy', 'cloudy', 'blustery', 'gale' ];
export const WEATHER_NAMES = { calm: 'Calm', fair: 'Fair', breezy: 'Breezy', cloudy: 'Cloudy', blustery: 'Blustery', gale: 'Gale' };
// the shore waves' largest amplitude (m): bigger, their run-up floods the beach and the sets break on
// the pier head and over the boat at the dock (test/waves.mjs)
export const SURF_MAX = 0.6;
const FAIR_SURF = CONDITIONS.fair.surf;

// the forecast's rows along storminess (0..1): calm a tenth of the time, then fair for about half,
// breezy, blustery, and the top twentieth a gale
const ALONG = [ [ 0, 'calm' ], [ 0.3, 'fair' ], [ 0.55, 'fair' ], [ 0.72, 'breezy' ], [ 0.88, 'blustery' ], [ 1, 'gale' ] ];
// the swell looks this far ahead (game hours) for the storm it comes from
const SWELL_LEAD = [ 3, 6 ];
// the most the wind turns from the trades, either way (rad: about 35 degrees)
export const VEER = 0.6;

const clamp01 = ( x ) => ( x < 0 ? 0 : x > 1 ? 1 : x );
const lerp = ( a, b, t ) => a + ( b - a ) * t;
const sstep = ( a, b, x ) => {

	const t = clamp01( ( x - a ) / ( b - a ) );
	return t * t * ( 3 - 2 * t );

};

// the island's time: game hours since day 1 began
export const islandTime = ( day, hour ) => ( Math.max( 1, Math.floor( day ) || 1 ) - 1 ) * 24 + hour;

function hash( i, seed ) {

	let a = ( Math.imul( i, 0x9e3779b1 ) ^ seed ) >>> 0;
	a = Math.imul( a ^ ( a >>> 16 ), 0x45d9f3b );
	a = Math.imul( a ^ ( a >>> 16 ), 0x45d9f3b );
	return ( ( a ^ ( a >>> 16 ) ) >>> 0 ) / 4294967296;

}

// 1D value noise in 0..1, smooth (eased between lattice points)
function noise( x, seed ) {

	const i = Math.floor( x ), f = x - i, u = f * f * ( 3 - 2 * f );
	const a = hash( i, seed ), b = hash( i + 1, seed );
	return a + ( b - a ) * u;

}

// the two octaves' sum is bunched around the middle: these are its twentieths (sampled over 20,000 days),
// so mapping through them spreads it evenly over 0..1
const Q = [ 0, 0.199, 0.254, 0.296, 0.330, 0.362, 0.391, 0.418, 0.446, 0.472, 0.498, 0.525, 0.552, 0.579, 0.607, 0.636, 0.668, 0.702, 0.744, 0.801, 1 ];
function even( v ) {

	let k = 0;
	while ( k < Q.length - 2 && v > Q[ k + 1 ] ) k ++;
	return clamp01( ( k + ( v - Q[ k ] ) / ( Q[ k + 1 ] - Q[ k ] ) ) / ( Q.length - 1 ) );

}

const field = ( T, a, b ) => even( noise( T / 60, a ) * 0.65 + noise( T / 14, b ) * 0.35 );

// how stormy it is at T (0: dead calm .. 1: a full gale), and how cloudy (part storm, part its own)
export const storminess = ( T ) => field( T, 0x5a17c0de, 0x1b0b5eed );
export const cloudiness = ( T ) => field( T, 0x6c10d5e7, 0x2f00b1e5 ) * 0.7 + storminess( T ) * 0.3;
// how far the wind has turned from the trades at T (rad, -VEER .. VEER)
export const veer = ( T ) => ( field( T, 0x3c6ef372, 0x7a3b9d11 ) - 0.5 ) * 2 * VEER;

// the rows' values at storminess s
function along( s, key ) {

	let k = 0;
	while ( k < ALONG.length - 2 && s > ALONG[ k + 1 ][ 0 ] ) k ++;
	const [ s0, a ] = ALONG[ k ], [ s1, b ] = ALONG[ k + 1 ];
	return lerp( CONDITIONS[ a ][ key ], CONDITIONS[ b ][ key ], clamp01( ( s - s0 ) / ( s1 - s0 ) ) );

}

// the short wind sea grows with the wind (x today's at 7 m/s: its height goes about as wind^1.5)
const windSeaOf = ( wind ) => {

	const r = wind / CONDITIONS.fair.wind;
	return Math.min( 3, r * Math.sqrt( r ) );

};

// the name a set of values goes by: the wind first, then the cloud
function nameOf( w ) {

	if ( w.wind >= 18 ) return 'gale';
	if ( w.wind >= 13.5 ) return 'blustery';
	if ( w.wind >= 9.5 ) return 'breezy';
	if ( w.overcast >= 0.4 ) return 'cloudy';
	if ( w.wind <= 4 ) return 'calm';
	return 'fair';

}

function row( id ) {

	const c = CONDITIONS[ id ];
	return { id, wind: c.wind, windAngle: 0, coverage: c.coverage, overcast: c.overcast, swell: c.swell, windSea: windSeaOf( c.wind ), surf: Math.min( SURF_MAX, c.surf ), period: c.period, visibility: c.visibility };

}

// the weather at island time T. `pick` (a condition's id) holds it there instead: on your own, you
// can choose the day's weather (its wind from the trades)
export function weatherAt( T, pick = null ) {

	if ( pick && CONDITIONS[ pick ] ) return row( pick );
	// day 1 is fair; the forecast comes in over the first hours of day 2
	const k = clamp01( ( T - 24 ) / 6 );
	if ( k === 0 ) return row( 'fair' );
	const s = storminess( T );
	// the swell comes from the storm ahead
	const sw = Math.max( s, ( storminess( T + SWELL_LEAD[ 0 ] ) + storminess( T + SWELL_LEAD[ 1 ] ) ) * 0.5 );
	// a grey day: cloud over whatever wind there is
	const grey = sstep( 0.5, 0.75, cloudiness( T ) );
	const f = CONDITIONS.fair;
	const wind = lerp( f.wind, along( s, 'wind' ), k );
	const swell = lerp( f.swell, along( sw, 'swell' ), k );
	const coverage = lerp( f.coverage, Math.max( along( s, 'coverage' ), lerp( along( s, 'coverage' ), CONDITIONS.cloudy.coverage, grey ) ), k );
	const overcast = lerp( f.overcast, Math.max( along( s, 'overcast' ), CONDITIONS.cloudy.overcast * grey ), k );
	const visibility = lerp( f.visibility, Math.min( along( s, 'visibility' ), lerp( 1, CONDITIONS.cloudy.visibility, grey ) ), k );
	// the period: the storm's own (short), lengthened when the swell is from one still on its way
	const far = clamp01( ( sw - s ) * 6 );
	const period = lerp( f.period, Math.min( PERIOD_MAX, along( s, 'period' ) + 3.5 * far ), k );
	// (the longer it is, the further it's come, and the smaller it's grown by the time it's here)
	const surf = Math.min( lerp( SURF_MAX, GROUNDSWELL_MAX, clamp01( ( period - f.period ) / ( PERIOD_MAX - f.period ) ) ), FAIR_SURF * swell );
	const w = { id: 'fair', wind, windAngle: veer( T ) * k, coverage, overcast, swell, windSea: windSeaOf( wind ), surf, period, visibility };
	w.id = nameOf( w );
	return w;

}

// what's coming: the next change of condition within `ahead` game hours ({ id, at: T }), or null
export function forecast( T, ahead = 12, pick = null ) {

	if ( pick && CONDITIONS[ pick ] ) return null;
	const now = weatherAt( T ).id;
	for ( let t = 0.5; t <= ahead; t += 0.5 ) {

		const id = weatherAt( T + t ).id;
		if ( id !== now ) return { id, at: T + t };

	}

	return null;

}

// the surf as a surf report gives it: the face height of the waves to the sets', in feet ('2-3 ft')
export function surfText( amplitude ) {

	const lo = Math.max( 1, Math.round( amplitude * 2 * 0.8 / FT ) ), hi = Math.max( lo + 1, Math.round( amplitude * 2 * 1.5 / FT ) );
	return `${ lo }–${ hi } ft`;

}

// where a wind blowing toward ( dx, dz ) comes from, on the island's compass (north is -z, east +x)
const POINTS = [ 'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW' ];
export function windFrom( dx, dz ) {

	const bearing = Math.atan2( - dx, dz ) / ( Math.PI * 2 ) * 16; // (of the point it comes from: - ( dx, dz ))
	return POINTS[ ( ( Math.round( bearing ) % 16 ) + 16 ) % 16 ];

}
