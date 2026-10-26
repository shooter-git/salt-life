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
// (M9) Two quicker fields bring the rain: showeriness (about 3.5 h and 1.1 h), which rains where the sky
// is grey or a blow is on (a passing shower on a fair day now and then, rain bands in a gale), and how
// unsettled the air is (about 9 h and 3 h), which turns the heaviest rain into a thunderstorm. The
// lightning's strikes come from the real second and how thundery it is (strikeIn), so everyone on one
// clock sees the same strike at the same moment, held clock or not.
//
// Everything here is + - x / and integer hashes (Math.imul), never sin, exp or pow, so every device
// works out the same condition from the same time. Pure (no three.js), for the tests under Node.
//   islandTime( day, hour ) -> T      weatherAt( T, pick ) -> { id, wind, windAngle, coverage, overcast,
//   swell, windSea, surf, period, visibility, rain, thunder, front, murk }   forecast( T ) -> { id, at } | null
//   surfText( 0.34 ) -> '2–3 ft'   windFrom( dx, dz ) -> 'NNW' (where a wind blowing toward ( dx, dz ) comes from)
//   strikeIn( second, thunder ) -> { at, x, z, dist, ground, seed, power } | null   (the lightning)
//   (M10) windBeyondFair( m/s ) -> m/s   blowShare( m/s ) -> 0..1   (the wind on a cast, a float, a line)
//   murkAt( T ) -> 0..1   (the water stirred up by a blow, clearing over a day)

// what a condition brings: wind (m/s at 10 m), cloud cover and how overcast it is (0..1), the open
// sea's swell and wind sea (x today's), the surf (m, the shore waves' offshore amplitude H/2, and its
// period, s), the distance you see (x today's), and (M9) the rain (0..1: 1 a tropical downpour, some
// 50 mm an hour) and the thunder (0..1: how often lightning strikes). Fair is the island as it always was.
export const CONDITIONS = {
	calm: { wind: 2.5, coverage: 0.35, overcast: 0, swell: 0.7, surf: 0.24, period: 10, visibility: 1.1, rain: 0, thunder: 0 },
	fair: { wind: 7, coverage: 0.49, overcast: 0, swell: 1, surf: 0.34, period: 9, visibility: 1, rain: 0, thunder: 0 },
	breezy: { wind: 11, coverage: 0.55, overcast: 0.1, swell: 1.25, surf: 0.42, period: 8.5, visibility: 0.95, rain: 0, thunder: 0 },
	cloudy: { wind: 6, coverage: 0.82, overcast: 0.55, swell: 1, surf: 0.34, period: 9, visibility: 0.8, rain: 0, thunder: 0 },
	rain: { wind: 9, coverage: 0.9, overcast: 0.75, swell: 1.1, surf: 0.38, period: 8.5, visibility: 0.55, rain: 0.65, thunder: 0 },
	blustery: { wind: 15, coverage: 0.75, overcast: 0.45, swell: 1.5, surf: 0.5, period: 8, visibility: 0.75, rain: 0, thunder: 0 },
	gale: { wind: 20, coverage: 0.92, overcast: 0.8, swell: 1.8, surf: 0.6, period: 7.5, visibility: 0.55, rain: 0.45, thunder: 0 },
	storm: { wind: 14, coverage: 0.96, overcast: 0.95, swell: 1.35, surf: 0.46, period: 8, visibility: 0.42, rain: 1, thunder: 1 },
};
// the surf's period (s): a storm's own swell comes short and steep; one that's come far, from a storm
// still on its way, long, and smaller than the storm's own sea by the time it's here. The longest it
// gets, and the biggest such a swell gets (m: it runs further up the beach than a short one)
export const PERIOD_MAX = 12;
export const GROUNDSWELL_MAX = 0.4;
export const WEATHER_IDS = [ 'calm', 'fair', 'breezy', 'cloudy', 'rain', 'blustery', 'gale', 'storm' ];
export const WEATHER_NAMES = { calm: 'Calm', fair: 'Fair', breezy: 'Breezy', cloudy: 'Cloudy', rain: 'Rain', blustery: 'Blustery', gale: 'Gale', storm: 'Thunderstorm' };
// the shore waves' largest amplitude (m): bigger, their run-up floods the beach and the sets break on
// the pier head and over the boat at the dock (test/waves.mjs)
export const SURF_MAX = 0.6;
const FAIR_SURF = CONDITIONS.fair.surf;
// (M10) the wind past a fair day's (m/s): what carries a cast and the cast net, drifts a float and gusts
// on a line. None on a fair day or a calmer one, so they're as they always were; as a share of a gale's
export const FAIR_WIND = CONDITIONS.fair.wind;
export const windBeyondFair = ( wind ) => Math.max( 0, wind - FAIR_WIND );
export const blowShare = ( wind ) => Math.min( 1, windBeyondFair( wind ) / ( CONDITIONS.gale.wind - FAIR_WIND ) );
// the trades blow toward ( 0.35, 0.94 ): from the NNW (core/Globals.js, G.windPrevailing)
const TRADES = { x: 0.35 / Math.hypot( 0.35, 0.94 ), y: 0.94 / Math.hypot( 0.35, 0.94 ) };

// the forecast's rows along storminess (0..1): calm a tenth of the time, then fair for about half,
// breezy, blustery, and the top twentieth a gale
const ALONG = [ [ 0, 'calm' ], [ 0.3, 'fair' ], [ 0.55, 'fair' ], [ 0.72, 'breezy' ], [ 0.88, 'blustery' ], [ 1, 'gale' ] ];
// the swell looks this far ahead (game hours) for the storm it comes from
const SWELL_LEAD = [ 3, 6 ];
// the most the wind turns from the trades, either way (rad: about 35 degrees)
export const VEER = 0.6;
// (M9) the chance of rain (of showeriness's range, at the middle of a shower's edge) on a clear fair
// day, under a grey sky, and in a blow (at most: a gale has its breaks); how much of the range a shower
// takes to come on fully. (A clear fair day's chance is its edge's: a light shower now and then)
const RAIN_CHANCE = [ 0, 0.28, 0.45, 0.75 ];
const RAIN_EDGE = 0.22;
// a blow on its way: how far ahead the fish feel it (game hours)
const FRONT_LEAD = [ 2, 4 ];
// (M10) the water's murk after a blow: from this storminess (a stiff breeze: none for less), full in
// a gale; how long after it it's as murky (game hours) and how long it then takes to clear; the hours
// back it looks; and how murky a held pick is (as if it had been blowing a while)
const MURK_FROM = 0.8;
const MURK_HOLD = 6, MURK_CLEAR = 18;
const MURK_LAGS = [ 1, 2, 3, 4, 6, 8, 10, 12, 15, 18, 21, 24 ];
const MURK_PICK = { blustery: 0.4, gale: 0.7, storm: 0.5 };
// the murk from which the water's said to be murky (Joe's slate, the clock's menu)
export const MURKY = 0.35;

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

// (the two octaves in the same measure, at any pair of scales: the same spread)
const field = ( T, a, b, slow = 60, quick = 14 ) => even( noise( T / slow, a ) * 0.65 + noise( T / quick, b ) * 0.35 );

// how stormy it is at T (0: dead calm .. 1: a full gale), and how cloudy (part storm, part its own)
export const storminess = ( T ) => field( T, 0x5a17c0de, 0x1b0b5eed );
export const cloudiness = ( T ) => field( T, 0x6c10d5e7, 0x2f00b1e5 ) * 0.7 + storminess( T ) * 0.3;
// how far the wind has turned from the trades at T (rad, -VEER .. VEER)
export const veer = ( T ) => ( field( T, 0x3c6ef372, 0x7a3b9d11 ) - 0.5 ) * 2 * VEER;
// (M9) how showery it is at T, and how unsettled the air (what makes a downpour a thunderstorm)
export const showeriness = ( T ) => field( T, 0x4b1d3a95, 0x0e6f2c71, 3.5, 1.1 );
export const unsettled = ( T ) => field( T, 0x77c3e5a1, 0x21d4b8f3, 9, 3 );

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

// the name a set of values goes by: a thunderstorm first, then the wind, the rain and the cloud
function nameOf( w ) {

	if ( w.thunder >= 0.4 ) return 'storm';
	if ( w.wind >= 18 ) return 'gale';
	if ( w.rain >= 0.35 ) return 'rain';
	if ( w.wind >= 13.5 ) return 'blustery';
	if ( w.wind >= 9.5 ) return 'breezy';
	if ( w.overcast >= 0.4 ) return 'cloudy';
	if ( w.wind <= 4 ) return 'calm';
	return 'fair';

}

function row( id ) {

	const c = CONDITIONS[ id ];
	return { id, wind: c.wind, windAngle: 0, coverage: c.coverage, overcast: c.overcast, swell: c.swell, windSea: windSeaOf( c.wind ), surf: Math.min( SURF_MAX, c.surf ), period: c.period, visibility: c.visibility, rain: c.rain, thunder: c.thunder, front: 0, murk: MURK_PICK[ id ] || 0 };

}

// (M10) the water's murk at T (0..1): the strongest blow of the last day, as murky as it made it for
// MURK_HOLD hours after and clearing over MURK_CLEAR more (day 1, and its first hours on day 2, count as
// fair, as the forecast does)
export function murkAt( T ) {

	let m = 0;
	for ( const L of MURK_LAGS ) {

		const t = T - L, day = clamp01( ( t - 24 ) / 6 );
		if ( day === 0 ) continue;
		const fade = L <= MURK_HOLD ? 1 : clamp01( 1 - ( L - MURK_HOLD ) / MURK_CLEAR );
		m = Math.max( m, sstep( MURK_FROM, 1, storminess( t ) ) * day * fade );

	}

	return m;

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
	// (M9) the rain: where it's showery enough for the sky, heavier the greyer and stormier it is; the
	// heaviest, in unsettled air, a thunderstorm. Rain greys the sky and closes in the horizon (its
	// squalls' gusts are WeatherDriver's: they come and go within the hour's wind)
	const blow = sstep( 0.6, 0.97, s );
	const chance = Math.min( RAIN_CHANCE[ 3 ], RAIN_CHANCE[ 0 ] + ( RAIN_CHANCE[ 1 ] - RAIN_CHANCE[ 0 ] ) * grey + RAIN_CHANCE[ 2 ] * blow );
	const rain = sstep( 1 - chance - RAIN_EDGE / 2, 1 - chance + RAIN_EDGE / 2, showeriness( T ) ) * ( 0.5 + 0.5 * Math.max( grey, blow ) ) * k;
	const thunder = sstep( 0.45, 0.9, rain ) * sstep( 0.66, 0.9, unsettled( T ) * 0.7 + s * 0.3 );
	const wet = {
		coverage: Math.max( coverage, lerp( coverage, CONDITIONS.rain.coverage + 0.06 * thunder, rain ) ),
		overcast: Math.max( overcast, CONDITIONS.rain.overcast * rain + 0.2 * thunder ),
		visibility: Math.min( visibility, lerp( 1, CONDITIONS.rain.visibility, rain ) - 0.13 * thunder ) };
	// a blow on its way (0..1): the storm a few hours on, more than now (the fish feed hard ahead of it)
	const front = clamp01( ( Math.max( storminess( T + FRONT_LEAD[ 0 ] ), storminess( T + FRONT_LEAD[ 1 ] ) ) - s ) * 12 ) * sstep( 0.45, 0.75, Math.max( storminess( T + FRONT_LEAD[ 1 ] ), s ) ) * k;
	const w = { id: 'fair', wind, windAngle: veer( T ) * k, coverage: wet.coverage, overcast: wet.overcast, swell, windSea: windSeaOf( wind ), surf, period, visibility: wet.visibility, rain, thunder, front, murk: murkAt( T ) };
	w.id = nameOf( w );
	return w;

}

// (M9) how fast the weather comes down the trades (km a game hour): a front's bank is told this far up
// them for each hour it's ahead (WeatherDriver, SkyProClouds.front), and (M11) the showers drift at it
export const FRONT_KMH = 8;
// (M11) The showers about the island, for their curtains in the distance (Sky): cells of rain drifting
// down the trades with the weather, each bringing the rain the island has when it's over it (weatherAt
// then), so what you see coming is what comes, and what you saw go is what went.
//   - Along the trades, a slot every SHOWER_GAP in a frame drifting at FRONT_KMH; two cells a slot, set
//     off to either side (up to SHOWER_SIDE). Those that pass over the island rain whenever it does when
//     they're over it; those off to the side half the time (the showers are patchy).
//   - Each is { along, side, r, rain }: where it is now (m down the trades from the island's middle,
//     upwind < 0; m to the left of them), its radius (m), and its rain (0..1). Within `range` along.
//   - cache: a Map of each slot's rain (it's the slot's for good: keep one while the pick's the same)
const SHOWER_GAP = 4000;
const SHOWER_SIDE = 14000;
const SHOWER_R = [ 1200, 3000 ];
export function showers( T, pick = null, range = 26000, out = [], cache = null ) {

	out.length = 0;
	const v = FRONT_KMH * 1000, drift = T * v; // (how far the weather's come since day 1 began, m)
	const k0 = Math.ceil( ( - range - drift ) / SHOWER_GAP ), k1 = Math.floor( ( range - drift ) / SHOWER_GAP );
	for ( let k = k0; k <= k1; k ++ ) {

		// (over the island when its slot is: k * SHOWER_GAP + drift = 0)
		let rain = cache ? cache.get( k ) : undefined;
		if ( rain === undefined ) {

			rain = weatherAt( - k * SHOWER_GAP / v, pick ).rain;
			if ( cache ) cache.set( k, rain );

		}

		if ( rain < 0.02 ) continue;
		for ( let j = 0; j < 2; j ++ ) {

			const n = k * 2 + j;
			const side = ( hash( n, 0x51ee7 ) - 0.5 ) * 2 * SHOWER_SIDE;
			const r = SHOWER_R[ 0 ] + ( SHOWER_R[ 1 ] - SHOWER_R[ 0 ] ) * hash( n, 0x2ad1 );
			const passes = Math.abs( side ) < r + 1000;
			if ( ! passes && hash( n, 0x7c3a ) > 0.5 ) continue;
			// (those off to the side a little ahead or behind their slot)
			const along = k * SHOWER_GAP + drift + ( passes ? 0 : ( hash( n, 0x39b1 ) - 0.5 ) * SHOWER_GAP * 0.6 );
			out.push( { along, side, r, rain } );

		}

	}

	return out;

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

// (M9) The lightning. In each real second (`second`: whole seconds since 1970, as the shared clock
// counts them) a strike or none, from the second alone and how thundery it is, so everyone on one clock
// sees the same strike at the same moment, wherever they are (the thunder reaches each of them in its
// own time). Where: from the island's middle, mostly the way the storm comes from (up the trades) until
// it's overhead, then all round; near strikes are rare. A third come down to the sea or the land as a
// bolt, the rest stay in the cloud. `at`: the moment in the second (s since 1970), `power` 0..1, `seed`
// shapes its bolt and flickers.
export const STRIKE_RATE = 0.17; // strikes a second at full thunder (one every 6 s or so)
const STRIKE_NEAR = 400, STRIKE_FAR = 12000; // m from the island's middle
export function strikeIn( second, thunder, toward = TRADES ) {

	const n = second >>> 0;
	if ( ! ( thunder > 0 ) || hash( n, 0x51a7b0c3 ) >= STRIKE_RATE * Math.min( 1, thunder ) ) return null;
	const u = ( k ) => hash( n, 0x2c9e0000 + k );
	// (the way the storm comes from: against `toward`, the wind's direction; spread all round as it arrives)
	const spread = 0.35 + 0.65 * Math.min( 1, thunder );
	const a = Math.atan2( - toward.x, - toward.y ) + ( u( 1 ) - 0.5 ) * 2 * Math.PI * spread;
	const dist = STRIKE_NEAR + ( STRIKE_FAR - STRIKE_NEAR ) * Math.pow( u( 2 ), 1.2 );
	return { at: n + u( 3 ), x: Math.sin( a ) * dist, z: Math.cos( a ) * dist, dist, ground: u( 4 ) < 0.34, seed: ( u( 5 ) * 4294967296 ) >>> 0, power: 0.45 + 0.55 * u( 6 ) };

}

// where a wind blowing toward ( dx, dz ) comes from, on the island's compass (north is -z, east +x)
const POINTS = [ 'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW' ];
export function windFrom( dx, dz ) {

	const bearing = Math.atan2( - dx, dz ) / ( Math.PI * 2 ) * 16; // (of the point it comes from: - ( dx, dz ))
	return POINTS[ ( ( Math.round( bearing ) % 16 ) + 16 ) % 16 ];

}
