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
// (M12) Each blow its own track (trackAt): most still come down the trades, some from the south or the
// west, and now and then a front swings the wind round as it passes (south, west, north) behind a line
// of showers, and clears. The weather comes the way the wind blows, so the showers, the front's bank and
// the lightning come from up the track, and a westerly blow's swell from the west (`west`).
// (M13) Now and then a blow is a hurricane's (HURRICANE): a vortex passing the island down the trades,
// its eye over the island or to one side, its rain bands spiralling in, its swell days ahead of it, the
// water murky days after. Watched for two days ahead and warned of a day and a half (hurricaneNews).
//
// Everything here is + - x / and integer hashes (Math.imul), never sin, exp or pow, so every device
// works out the same condition from the same time. Pure (no three.js), for the tests under Node.
//   islandTime( day, hour ) -> T      weatherAt( T, pick ) -> { id, wind, windAngle, coverage, overcast,
//   swell, windSea, surf, period, west, visibility, rain, thunder, front, murk }   forecast( T ) -> { id, at } | null
//   surfText( 0.34 ) -> '2–3 ft'   windFrom( dx, dz ) -> 'NNW' (where a wind blowing toward ( dx, dz ) comes from)
//   (M12) swellFrom( west ) -> 'S' | 'S + W' | 'W'
//   strikeIn( second, thunder ) -> { at, x, z, dist, ground, seed, power } | null   (the lightning)
//   (M10) windBeyondFair( m/s ) -> m/s   blowShare( m/s ) -> 0..1   (the wind on a cast, a float, a line)
//   murkAt( T ) -> 0..1   (the water stirred up by a blow, clearing over a day)
//   (M12) trackAt( T ) -> rad   towardOf( windAngle ) -> { x, y }   (where a blow comes from, and the
//   way the weather goes)
//   (M13) weatherAt( T, 'hurricane', since ): your own, picked at `since`   (and its values' hurricane, eye,
//   surge, rainHaze, sprayHaze, boarded: (step 4) the island shut for it)
//   hurricaneAt( T, pick, since ) -> { r, x, z, rmax, ... } | null   hurricaneNews( T, pick, since ) ->
//   { stage: 'outlook' | 'watch' | 'warning', onset, ends, eye, over, from } | null   dayWeatherAt( T )

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
	// (M13) a hurricane's wall at its height (what the menu says of it: a picked one passes, HURRICANE). Its
	// sea is a gale's at most until the shore takes a hurricane's
	hurricane: { wind: 38, coverage: 0.97, overcast: 1, swell: 1.8, surf: 0.6, period: 11, visibility: 0.42, rain: 1, thunder: 0.12 },
};
// the surf's period (s): a storm's own swell comes short and steep; one that's come far, from a storm
// still on its way, long, and smaller than the storm's own sea by the time it's here. The longest it
// gets, and the biggest such a swell gets (m: it runs further up the beach than a short one)
export const PERIOD_MAX = 12;
export const GROUNDSWELL_MAX = 0.4;
export const WEATHER_IDS = [ 'calm', 'fair', 'breezy', 'cloudy', 'rain', 'blustery', 'gale', 'storm', 'hurricane' ];
export const WEATHER_NAMES = { calm: 'Calm', fair: 'Fair', breezy: 'Breezy', cloudy: 'Cloudy', rain: 'Rain', blustery: 'Blustery', gale: 'Gale', storm: 'Thunderstorm', hurricane: 'Hurricane' };
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
// (M12) the way the weather goes, turned `angle` (rad: + veers, clockwise on the island's compass) from
// the trades'
export function towardOf( angle, out = { x: 0, y: 0 } ) {

	const c = Math.cos( angle ), s = Math.sin( angle );
	out.x = TRADES.x * c - TRADES.y * s;
	out.y = TRADES.x * s + TRADES.y * c;
	return out;

}

// the forecast's rows along storminess (0..1): calm a tenth of the time, then fair for about half,
// breezy, blustery, and the top twentieth a gale
const ALONG = [ [ 0, 'calm' ], [ 0.3, 'fair' ], [ 0.55, 'fair' ], [ 0.72, 'breezy' ], [ 0.88, 'blustery' ], [ 1, 'gale' ] ];
// the swell looks this far ahead (game hours) for the storm it comes from
const SWELL_LEAD = [ 3, 6 ];
// the most the wind turns from the trades, either way (rad: about 35 degrees)
export const VEER = 0.6;
// (M12) where a blow comes from, as the wind turned from the trades (rad: from the S, the W and the N),
// and its tracks: each peak of storminess's slow octave (on its lattice, every TRACK_SPAN game hours) is
// a blow, and takes one of these, most of them the trades'; between two, the track goes over between
// TRACK_BLEND of the way and the rest. A blow turns the wind to its track as it comes on (from a
// breeze, BLOW: fair is the trades' as it always was), so a southerly backs it round through the west
export const FROM = { south: - 2.7852, west: - 1.2144, north: 0.3564 };
export const TRACK_SPAN = 60;
const TRACKS = [ [ 0.52, 'trades' ], [ 0.68, 'south' ], [ 0.82, 'west' ], [ 1, 'front' ] ];
const TRACK_BLEND = [ 0.35, 0.65 ];
const BLOW = [ 0.55, 0.8 ];
// a front passes at its blow's height (a little either side, FRONT_JITTER game hours): the wind's
// backed to the south ahead of it, veers to the west over FRONT_SWING[ 0 .. 1 ] hours from then (a
// line of showers coming over with it, FRONT_LINE: as heavy as FRONT_RAIN), then on round to the north
// by FRONT_SWING[ 2 ]; behind it the sky clears (FRONT_CLEAR hours on, to FRONT_CLEAR_COVER)
const FRONT_JITTER = 6;
const FRONT_SWING = [ - 1.5, 0.5, 6 ];
const FRONT_LINE = [ - 2.5, - 0.75, 0.75, 2 ];
const FRONT_RAIN = 0.7;
const FRONT_CLEAR = [ 1.5, 3.5, 10, 16 ];
const FRONT_CLEAR_COVER = 0.4;
// how much of a blow's swell comes from the west, by how far its track is from a westerly (rad); the
// hours back it looks (the swell a westerly raised outlasts it: a front's brief one leaves a little)
const WEST_SPREAD = 1;
const WEST_PAST = [ 0, 1.5, 3, 4.5, 6 ];
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
// (M13) The hurricane. Now and then a blow on the lattice is a hurricane's: one in `oneIn`, about every
// 40 days (a candidate, and none on either of the two before it, so two never come within a week), never
// before day `fromDay` (a new player's first fortnight). A Category 1 (Saffir-Simpson: 33 to 42 m/s, a minute's sustained
// wind), steered down the trades as the easterlies steer real ones (turned a little either way), passing
// at its own speed, its eye over the island's middle or to one side of it (within `miss` rmax: its calm
// passes over within `over` rmax, a quarter of them).
//   - Its strongest wind is on the right of its track; on the left of it a strong gale, as on the weak
//     side of a real Category 1.
//   - Its wind is a vortex's: counter-clockwise (the northern hemisphere's) and turned in toward the eye
//     (`inflow`), calm in the eye (within 0.4 rmax), rising through its wall to `vmax` at rmax, and
//     broad beyond it (vmax ( rmax + a ) / ( r + a ), a = `outer` rmax: tropical-storm winds 150 to 200
//     km out, hurricane force 30 to 40). The storm's own motion adds to it (`motion`), so it's stronger
//     on the right of its track. Out past `reach` it fades, and the island's own weather comes back.
//   - Its rain: the eyewall's downpour and the rain shield about it (`core`), and the outer bands spiralling
//     in toward the eye (counter-clockwise, `band`: crossed one after another as it comes, a few hours
//     apart), thundering where they're heaviest; the eyewall seldom thunders (`wallThunder`). None in the
//     eye: it stops at the eyewall's inner edge.
//   - Its cloud spreads ahead of it (`cloud`), and greys the sky closer in; in the eye the sky opens.
//   - (step 3) The air in it is full of rain and, in its wall, the spray torn off the sea: their
//     extinction (`haze`, 1/m: you see about 3 / it, Koschmieder), the rain's as heavy rain's is (a
//     50 mm/h downpour about 800 m: V = 10.5 R^-0.66 km), the spray's from a strong gale's wind, under
//     100 m seen in its wall at the shore (App thins the spray inland).
//   - Its swell runs out ahead of it (out to `swellReach`), long and low days ahead (`period`), shorter and
//     higher close in (`swell`, on the open sea all round). (M13 step 2) Into the bay comes as much of its
//     waves (`surf`) as come in the way they travel (BAY): close in they're its wind's own sea, going the
//     way the wind blows, further off its swell, running out from the eye. The bay opens to the south, so
//     one coming down the trades leaves it in the island's lee until its wind blows in from the sea.
//   - (step 2) The storm surge (`surge`, m, SURGE): the sea drawn up under its low pressure, and piled into
//     the bay by its wind blowing in over the last hour, or drawn out of it by a wind blowing out. The sea's
//     level follows it (G.seaLevel).
//   - The water's murky from a few hours before its eye passes until a day after, clearing over three
//     more (`murk`).
//   - All of it + - x / and sqrt (correctly rounded everywhere) on the clock, as the rest is; only the
//     wind's direction takes atan2.
export const HURRICANE = {
	oneIn: 16, fromDay: 15,
	vmax: [ 32, 37 ], rmax: [ 20000, 32000 ], over: 0.3, outer: 5.6, motion: 0.6, inflow: [ 0.9397, 0.342 ],
	speed: [ 14000, 24000 ], turn: 0.5, miss: 1.2, jitter: 12,
	reach: [ 450000, 750000 ], cloud: [ 700000, 350000 ], grey: [ 600000, 250000 ],
	core: [ 1.6, 3.2 ], band: { gap: 60000, arms: 2, reach: [ 360000, 460000 ], rain: 0.9, thunder: 0.85, from: [ 2.5, 5 ] }, wallThunder: 0.12,
	haze: { rain: 0.000286, spray: 0.03, sprayWind: [ 22, 36 ] },
	swellReach: [ 1500000, 80000 ], swell: 3.5, surf: 1.5, period: [ 11, 16 ], murk: [ - 8, 0, 24, 96 ],
};
// (M13 step 2) the surge: the sea drawn up by the fall of its pressure (m a hPa: the inverse barometer),
// that fall at its eye (hPa a m/s of vmax: a Category 1's 980s), half of it at rmax; the wind's set-up on
// the bay's shelf (m per (m/s)² of wind blowing into the bay, over the `lag` hours before: its full wind
// straight in sets the sea up about 1.2 m, as a Category 1's does on a narrow shelf like the Keys'), the
// most an offshore wind draws it down, and the most it gets
export const SURGE = { ib: 0.0099, drop: 0.8, setup: 8.3e-4, lag: [ 0, 0.5, 1 ], low: - 0.7, high: 1.6 };
// the bay: the way waves travel into it (the island's own swell's, from the south: WORLD.swellDir), and
// the way a westerly's do, round its western arm (Waves.SWELL_WEST); a little gets in from anywhere; and
// how much of the confused sea about its eye does (coming from its walls all round)
const BAY = { south: [ - 0.1191, - 0.9929 ], west: [ 1, 0 ], floor: 0.15, confused: 0.6 };
// the hurricane's surf at its biggest, straight into the bay (m: the shore waves' amplitude), and its
// longest swell's period (s)
export const SURF_HURRICANE = HURRICANE.surf, PERIOD_HURRICANE = HURRICANE.period[ 1 ];
// the candidates' share of the lattice (with none of the two before: a hurricane one in `oneIn`)
const H_CAND = 0.072;
// m/s: tropical-storm force (34 kt) and hurricane force (64 kt), a minute's sustained wind
export const TS_WIND = 17.5, HURRICANE_WIND = 32.7;
// game hours before its tropical-storm winds that it's on the outlook, watched for and warned of (as the
// National Hurricane Center does: a watch 48 h ahead, a warning 36 h)
const H_NEWS = { outlook: 96, watch: 48, warning: 36 };
// (step 4) the island boards up (Joe and Marta shut and go home: `boarded`) this long before its
// tropical-storm winds, and opens again this long after they've gone (game hours)
const H_BOARD = [ 12, 6 ];
// (on your own, a hurricane picked at `since` comes straight at the island, its eye over it `lead` game
// hours on, passing just to the island's left, so the island's on the stronger side of its wall)
const H_PICKED = { lead: 6, vmax: 33, rmax: 24000, speed: 20000, miss: - 0.2 };

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

// (M12) the blow at lattice point i (storminess's slow octave peaks there): its track, and when a front
// passes
const trackOf = ( i ) => {

	const h = hash( i, 0x7ac3e11d );
	let k = 0;
	while ( h > TRACKS[ k ][ 0 ] ) k ++;
	return TRACKS[ k ][ 1 ];

};
const frontTime = ( i ) => i * TRACK_SPAN + ( hash( i, 0x0f2e7a39 ) - 0.5 ) * FRONT_JITTER;
// the way blow i comes from at T (rad from the trades: a blow down them, turned as the wind is, v)
function headingOf( i, T, v ) {

	const track = trackOf( i );
	if ( track === 'trades' ) return v;
	if ( track !== 'front' ) return FROM[ track ];
	// (a front: from the south ahead of it, veering through the west to the north as it passes)
	const t0 = frontTime( i );
	const p = 0.5 * sstep( t0 + FRONT_SWING[ 0 ], t0 + FRONT_SWING[ 1 ], T ) + 0.5 * sstep( t0 + FRONT_SWING[ 1 ], t0 + FRONT_SWING[ 2 ], T );
	return lerp( FROM.south, FROM.north, p );

}

// where the blow about T comes from (rad from the trades: theirs, turned as the wind is (v), or FROM's).
// The wind turns to it as the blow comes on (blowOf)
export function trackAt( T, v = veer( T ) ) {

	const x = T / TRACK_SPAN, i = Math.floor( x ), b = sstep( TRACK_BLEND[ 0 ], TRACK_BLEND[ 1 ], x - i );
	const a = headingOf( i, T, v );
	return b > 0 ? lerp( a, headingOf( i + 1, T, v ), b ) : a;

}

const blowOf = ( s ) => sstep( BLOW[ 0 ], BLOW[ 1 ], s );

// (M12) a front passing about T: its line of showers (0..1), and the clearing behind it (0..1), as
// strong as it's blowing (b: blowOf)
const _front = { line: 0, clear: 0 };
function frontAt( T, b ) {

	_front.line = _front.clear = 0;
	if ( b <= 0 ) return _front;
	const i = Math.round( T / TRACK_SPAN );
	if ( trackOf( i ) !== 'front' ) return _front;
	const dt = T - frontTime( i ), L = FRONT_LINE, C = FRONT_CLEAR;
	_front.line = sstep( L[ 0 ], L[ 1 ], dt ) * ( 1 - sstep( L[ 2 ], L[ 3 ], dt ) ) * b;
	_front.clear = sstep( C[ 0 ], C[ 1 ], dt ) * ( 1 - sstep( C[ 2 ], C[ 3 ], dt ) ) * b;
	return _front;

}

// how much of the blow about T is from the west (0..1: none down the trades, however they've turned)
const westOf = ( T ) => clamp01( 1 - Math.abs( trackAt( T, 0 ) - FROM.west ) / WEST_SPREAD ) * blowOf( storminess( T ) );

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
	return { id, wind: c.wind, windAngle: 0, coverage: c.coverage, overcast: c.overcast, swell: c.swell, windSea: windSeaOf( c.wind ), surf: Math.min( SURF_MAX, c.surf ), period: c.period, west: 0, visibility: c.visibility, rain: c.rain, thunder: c.thunder, front: 0, murk: MURK_PICK[ id ] || 0, hurricane: 0, eye: 0, surge: 0, rainHaze: 0, sprayHaze: 0, boarded: 0 };

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
// can choose the day's weather (its wind from the trades); (M13) a hurricane of your own, picked at
// island time `since`, passes over a fair day
export function weatherAt( T, pick = null, since = 0 ) {

	if ( pick === 'hurricane' ) return overHurricane( row( 'fair' ), T, pickedHurricane( since ) );
	if ( pick && CONDITIONS[ pick ] ) return row( pick );
	const w = dayWeatherAt( T ), h = hurricaneNear( T );
	return h ? overHurricane( w, T, h ) : w;

}

// the day's weather at island time T, as it would be with no hurricane about
export function dayWeatherAt( T ) {

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
	// (M12) the blow's track: the wind turns to it as it comes on; its swell from the west as much as the
	// storm it comes from is a westerly (the last few hours', or the one on its way)
	const b = blowOf( s );
	const v = veer( T ), windAngle = lerp( v, trackAt( T, v ), b ) * k;
	let past = 0;
	for ( const h of WEST_PAST ) past += westOf( T - h );
	const west = lerp( past / WEST_PAST.length, ( westOf( T + SWELL_LEAD[ 0 ] ) + westOf( T + SWELL_LEAD[ 1 ] ) ) * 0.5, far ) * k;
	const fr = frontAt( T, b );
	// (M9) the rain: where it's showery enough for the sky, heavier the greyer and stormier it is; the
	// heaviest, in unsettled air, a thunderstorm. Rain greys the sky and closes in the horizon (its
	// squalls' gusts are WeatherDriver's: they come and go within the hour's wind). (M12) A front brings
	// its line of showers, and dries out behind it
	const blow = sstep( 0.6, 0.97, s );
	const chance = Math.min( RAIN_CHANCE[ 3 ], RAIN_CHANCE[ 0 ] + ( RAIN_CHANCE[ 1 ] - RAIN_CHANCE[ 0 ] ) * grey + RAIN_CHANCE[ 2 ] * blow );
	const showery = sstep( 1 - chance - RAIN_EDGE / 2, 1 - chance + RAIN_EDGE / 2, showeriness( T ) ) * ( 0.5 + 0.5 * Math.max( grey, blow ) );
	const rain = Math.max( showery * ( 1 - fr.clear ), FRONT_RAIN * fr.line ) * k;
	const thunder = sstep( 0.45, 0.9, rain ) * sstep( 0.66, 0.9, unsettled( T ) * 0.7 + s * 0.3 );
	const wet = {
		coverage: Math.max( coverage, lerp( coverage, CONDITIONS.rain.coverage + 0.06 * thunder, rain ) ),
		overcast: Math.max( overcast, CONDITIONS.rain.overcast * rain + 0.2 * thunder ),
		visibility: Math.min( visibility, lerp( 1, CONDITIONS.rain.visibility, rain ) - 0.13 * thunder ) };
	// (behind a front: clear, and as far as you can see)
	if ( fr.clear > 0 ) {

		wet.coverage = lerp( wet.coverage, Math.min( wet.coverage, FRONT_CLEAR_COVER ), fr.clear );
		wet.overcast = lerp( wet.overcast, 0, fr.clear );
		wet.visibility = lerp( wet.visibility, Math.max( wet.visibility, CONDITIONS.calm.visibility ), fr.clear );

	}

	// a blow on its way (0..1): the storm a few hours on, more than now (the fish feed hard ahead of it)
	const front = clamp01( ( Math.max( storminess( T + FRONT_LEAD[ 0 ] ), storminess( T + FRONT_LEAD[ 1 ] ) ) - s ) * 12 ) * sstep( 0.45, 0.75, Math.max( storminess( T + FRONT_LEAD[ 1 ] ), s ) ) * k;
	const w = { id: 'fair', wind, windAngle, coverage: wet.coverage, overcast: wet.overcast, swell, windSea: windSeaOf( wind ), surf, period, west, visibility: wet.visibility, rain, thunder, front, murk: murkAt( T ), hurricane: 0, eye: 0, surge: 0, rainHaze: 0, sprayHaze: 0, boarded: 0 };
	w.id = nameOf( w );
	return w;

}

// ---- (M13) the hurricane (HURRICANE)

// one passing: its eye closest to the island's middle at tc (game hours), its strongest wind (m/s, the
// vortex's own) at rmax (m), its speed (m a game hour) along `track` (the trades' turned `turn`), and
// where its eye passes (d, m: to the island's left of its track, + , or its right, -)
function storm( tc, vmax, rmax, speed, turn, d ) {

	const track = towardOf( turn );
	// (left: the left of its track on the island's compass, x east and z south)
	return { tc, vmax, rmax, speed, turn, d, track, left: { x: track.y, y: - track.x } };

}

// the hurricane at lattice point i, if there's one (null)
const _hurricanes = new Map();
const candidate = ( i ) => hash( i, 0x4e77ac15 ) < H_CAND;
function hurricaneOf( i ) {

	let h = _hurricanes.get( i );
	if ( h !== undefined ) return h;
	h = null;
	const H = HURRICANE;
	if ( i * TRACK_SPAN >= ( H.fromDay - 1 ) * 24 + H.jitter && candidate( i ) && ! candidate( i - 1 ) && ! candidate( i - 2 ) ) {

		const u = ( k ) => hash( i, 0x3b9f7700 + k ), rmax = lerp( H.rmax[ 0 ], H.rmax[ 1 ], u( 2 ) );
		h = storm( i * TRACK_SPAN + ( u( 1 ) - 0.5 ) * 2 * H.jitter, lerp( H.vmax[ 0 ], H.vmax[ 1 ], u( 3 ) ), rmax, lerp( H.speed[ 0 ], H.speed[ 1 ], u( 4 ) ),
			( u( 5 ) - 0.5 ) * 2 * H.turn, ( u( 6 ) - 0.5 ) * 2 * H.miss * rmax );
		h.i = i;

	}

	if ( _hurricanes.size > 64 ) _hurricanes.clear();
	_hurricanes.set( i, h );
	return h;

}

// (your own: the same one for the same `since`)
let _picked = null;
function pickedHurricane( since ) {

	const P = H_PICKED;
	if ( ! _picked || _picked.since !== since ) {

		_picked = storm( since + P.lead, P.vmax, P.rmax, P.speed, 0, P.miss * P.rmax );
		_picked.since = since;

	}

	return _picked;

}

// the hurricanes on the lattice about T, in time (any whose reach could take in T)
function* hurricanesAbout( T ) {

	const i0 = Math.round( T / TRACK_SPAN );
	for ( let i = i0 - 2; i <= i0 + 3; i ++ ) {

		const h = hurricaneOf( i );
		if ( h ) yield h;

	}

}

// whether hurricane h touches the island at T: its swell, its murk after it
const touches = ( h, T ) => {

	const dt = T - h.tc, M = HURRICANE.murk;
	return ( dt > M[ 0 ] && dt < M[ 3 ] ) || Math.abs( dt ) * h.speed < HURRICANE.swellReach[ 0 ];

};

// the hurricane touching the island at T (the nearest in time), or null
function hurricaneNear( T ) {

	let best = null;
	for ( const h of hurricanesAbout( T ) ) if ( touches( h, T ) && ( ! best || Math.abs( T - h.tc ) < Math.abs( T - best.tc ) ) ) best = h;
	return best;

}

// its vortex's wind at r (m) from its eye (m/s): calm in the eye, rising through its wall to vmax at rmax,
// broad beyond, fading out past its reach
function vortexAt( h, r ) {

	const H = HURRICANE;
	if ( r <= h.rmax ) return h.vmax * sstep( 0.4 * h.rmax, h.rmax, r );
	const a = H.outer * h.rmax;
	return h.vmax * ( h.rmax + a ) / ( r + a ) * ( 1 - sstep( H.reach[ 0 ], H.reach[ 1 ], r ) );

}

// the game hours either side of its closest that its tropical-storm winds blow at the island
const tsHalf = ( h ) => {

	const rts = radiusOf( h, TS_WIND );
	return Math.sqrt( Math.max( 0, rts * rts - h.d * h.d ) ) / h.speed;

};

// how far from its eye its vortex's wind is `wind` (m), beyond rmax
const radiusOf = ( h, wind ) => {

	const a = HURRICANE.outer * h.rmax;
	return h.vmax * ( h.rmax + a ) / wind - a;

};

// its outer bands at ( pm, pn ) from its eye (m: along its track, and to its left), r away: 0..1, the
// heart of a band 1. They spiral in counter-clockwise (the phase of each: r / gap + arms x the way round,
// a pseudo-angle of + - x / alone, 0..4 counter-clockwise from ahead of it)
function bandAt( pm, pn, r ) {

	const B = HURRICANE.band, s = Math.abs( pm ) + Math.abs( pn ), t = s > 0 ? pn / s : 0;
	const q = pm >= 0 ? ( pn >= 0 ? t : 4 + t ) : 2 - t;
	const psi = r / B.gap + B.arms * q / 4, f = psi - Math.floor( psi );
	return sstep( 0, 0.1, f ) * ( 1 - sstep( 0.25, 0.4, f ) );

}

// what hurricane h brings the island's middle at T (out: filled and returned)
//   r, pm, pn: where the island is from its eye (m: along its track, ahead +, and to its left)
//   (step 2) waveX, waveZ: the way its waves travel at the island (unit: its wind's sea close in, its
//   swell from the eye further off), and how confused its sea is (0..1: from all round, about its eye)
//   wind (m/s) toward ( x, z ) (m/s, the vector: on the island's compass), share (0..1: how much of the
//   weather is its), eye (0..1: in its eye), rain, thunder, cover (0..1: how much of the cloud is its)
//   and its coverage, grey (and its overcast), visibility, near (0..1: how much of the sea its swell's),
//   swell, surf, period, murk
function stormAt( h, T, out ) {

	const H = HURRICANE, pm = - ( T - h.tc ) * h.speed, pn = h.d;
	const r = Math.max( 1, Math.sqrt( pm * pm + pn * pn ) );
	out.r = r;
	out.pm = pm;
	out.pn = pn;
	// the wind: the vortex's, turned in toward the eye, and the storm's motion (along its track: a, to its
	// left: b)
	const v = vortexAt( h, r ), px = pm / r, py = pn / r, [ c, s ] = H.inflow;
	const a = v * ( - c * py - s * px ) + H.motion * h.speed / 3600, b = v * ( c * px - s * py );
	out.wind = Math.sqrt( a * a + b * b );
	out.x = a * h.track.x + b * h.left.x;
	out.z = a * h.track.y + b * h.left.y;
	out.share = 1 - sstep( H.reach[ 0 ], H.reach[ 1 ], r );
	out.eye = 1 - sstep( 0.4 * h.rmax, 0.6 * h.rmax, r );
	// the rain: the eyewall's and the shield about it, the outer bands, none in the eye
	const B = H.band, core = 1 - sstep( H.core[ 0 ] * h.rmax, H.core[ 1 ] * h.rmax, r );
	const band = r < B.reach[ 1 ] ? bandAt( pm, pn, r ) * ( 1 - sstep( B.reach[ 0 ], B.reach[ 1 ], r ) ) : 0;
	const rain = out.rain = sstep( 0.45 * h.rmax, 0.65 * h.rmax, r ) * Math.max( core, B.rain * band );
	// (the outer bands thunder where they're heaviest; the eyewall seldom)
	const wall = ( 1 - out.eye ) * ( 1 - sstep( 1.2 * h.rmax, 2 * h.rmax, r ) );
	out.thunder = Math.max( B.thunder * sstep( 0.55, 0.85, B.rain * band ) * sstep( B.from[ 0 ] * h.rmax, B.from[ 1 ] * h.rmax, r ), H.wallThunder * wall ) * sstep( 0.5, 0.8, rain );
	// its cloud ahead of it, grey closer in; the sky open over the eye
	out.cover = sstep( H.cloud[ 0 ], H.cloud[ 1 ], r );
	out.coverage = lerp( 0.97, 0.3, out.eye );
	out.grey = sstep( H.grey[ 0 ], H.grey[ 1 ], r );
	out.overcast = lerp( 1, 0.35, out.eye );
	// the rain and the spray in its wind
	out.visibility = lerp( 1, CONDITIONS.rain.visibility, rain ) - 0.13 * out.thunder;
	// ((step 3) and its rain's and its spray's haze, 1/m: R = 50 mm/h in a downpour)
	out.rainHaze = rain > 0 ? H.haze.rain * Math.pow( 50 * rain, 0.66 ) : 0;
	out.sprayHaze = H.haze.spray * sstep( H.haze.sprayWind[ 0 ], H.haze.sprayWind[ 1 ], out.wind );
	// its swell, long and low far ahead, shorter and higher close in
	const near = sstep( H.swellReach[ 0 ], H.swellReach[ 1 ], r );
	out.near = near * near;
	out.period = lerp( H.period[ 0 ], H.period[ 1 ], sstep( 150000, 900000, r ) );
	// (its waves: its wind's own sea where it blows hard, its swell running out from the eye beyond)
	const sea = sstep( 12, 28, out.wind ) / Math.max( out.wind, 1e-6 );
	const wx = out.x * sea + ( px * h.track.x + py * h.left.x ) * ( 1 - sea * out.wind ), wz = out.z * sea + ( px * h.track.y + py * h.left.y ) * ( 1 - sea * out.wind );
	const wl = Math.sqrt( wx * wx + wz * wz ) || 1;
	out.waveX = wx / wl;
	out.waveZ = wz / wl;
	out.confused = 1 - sstep( 0.5 * h.rmax, 1.2 * h.rmax, r );
	// the water stirred up: from a few hours before its eye to a day after, clearing over three more
	const dt = T - h.tc, M = H.murk;
	out.murk = sstep( M[ 0 ], M[ 1 ], dt ) * ( 1 - sstep( M[ 2 ], M[ 3 ], dt ) );
	return out;

}

// the day's weather w with hurricane h over it at T (w: filled and returned)
const _now = {}, _ahead = {}, _lag = {}, _peak = {};

// (step 2) the surge hurricane h brings the island at T (m), s its stormAt there: the sea drawn up under
// its low pressure, and set up by its wind blowing into the bay over the hour before (drawn down by one
// blowing out)
function surgeOf( h, T, s ) {

	const S = SURGE, B = BAY.south;
	let on = 0;
	for ( const L of S.lag ) {

		const a = L === 0 ? s : stormAt( h, T - L, _lag );
		on += ( a.x * B[ 0 ] + a.z * B[ 1 ] ) * a.wind * a.share;

	}

	const setup = Math.max( S.low, S.setup * on / S.lag.length );
	return Math.min( S.high, setup + S.ib * S.drop * h.vmax * h.rmax / ( s.r + h.rmax ) * s.share );

}

// the highest it gets as h passes (m: for the shore's field, solved at it before it comes)
function peakSurge( h ) {

	if ( h.peak === undefined ) {

		h.peak = 0;
		for ( let t = - 24; t <= 24; t += 0.25 ) h.peak = Math.max( h.peak, surgeOf( h, h.tc + t, stormAt( h, h.tc + t, _peak ) ) );

	}

	return h.peak;

}
function overHurricane( w, T, h ) {

	const s = stormAt( h, T, _now ), k = s.share;
	// (a blow on its way: its wind a few hours on, more than now; the fish feed hard ahead of it)
	const on = stormAt( h, T + FRONT_LEAD[ 1 ] - 1, _ahead ), ahead = on.wind * on.share;
	const front = clamp01( ( ahead - s.wind * k ) / 8 ) * sstep( 12, 18, ahead );
	if ( k === 0 && s.cover === 0 && s.near === 0 && s.murk === 0 && front === 0 ) return w;
	if ( k > 0 ) {

		// its wind's direction, as its wind and the day's summed (turned from the day's: the shorter way
		// from it, so it's the day's exactly where it isn't the hurricane's), and its speed
		const d = towardOf( w.windAngle ), bx = d.x * w.wind * ( 1 - k ) + s.x * k, bz = d.y * w.wind * ( 1 - k ) + s.z * k;
		w.windAngle += Math.atan2( d.x * bz - d.y * bx, d.x * bx + d.y * bz );
		w.wind = lerp( w.wind, s.wind, k );
		w.windSea = windSeaOf( w.wind );

	}

	w.coverage = lerp( w.coverage, s.coverage, s.cover );
	w.overcast = lerp( w.overcast, s.overcast, s.grey );
	// (the day's rain giving way to its, and the day's thunder with it, as the day's own goes with its rain)
	const rain = w.rain * ( 1 - k );
	if ( k > 0 && w.thunder > 0 ) w.thunder *= sstep( 0.45, 0.9, rain ) / sstep( 0.45, 0.9, w.rain );
	w.rain = Math.max( rain, s.rain );
	w.thunder = Math.max( w.thunder, s.thunder );
	w.visibility = lerp( w.visibility, s.visibility, k );
	// (step 2) its swell on the open sea all round, over the day's; into the bay, as much of its waves as
	// come in the way they travel (the south's way in, and the west's round the bay's western arm), and its
	// period and their share from the west as far as they're the bigger
	const H = HURRICANE, B = BAY;
	// (those coming from the north, off the island, never get in: round the western arm only from the west)
	const south = Math.max( 0, s.waveX * B.south[ 0 ] + s.waveZ * B.south[ 1 ] ), west = Math.max( 0, s.waveX * B.west[ 0 ] + s.waveZ * B.west[ 1 ] ) * sstep( 0.5, 0, s.waveZ );
	// (about its eye a confused sea, from its walls all round)
	const into = lerp( Math.min( 1, Math.max( B.floor, south + west ) ), B.confused, s.confused );
	const surf = lerp( w.surf, Math.max( w.surf, H.surf * into ), s.near );
	const its = sstep( 0.02, 0.15, surf - w.surf );
	w.period = lerp( w.period, s.period, its );
	w.west = lerp( w.west * ( 1 - k ), south + west > 0 ? west / ( south + west ) * ( 1 - s.confused ) : 0, its );
	w.surf = surf;
	w.swell = lerp( w.swell, Math.max( w.swell, H.swell ), s.near );
	w.surge = surgeOf( h, T, s );
	w.front = Math.max( w.front, front );
	w.murk = Math.max( w.murk, s.murk );
	w.hurricane = k;
	w.eye = s.eye;
	w.rainHaze = s.rainHaze * k;
	w.sprayHaze = s.sprayHaze * k;
	// ((step 4) boarded up for it, from a while before its winds to a while after)
	const half = tsHalf( h );
	w.boarded = T >= h.tc - half - H_BOARD[ 0 ] && T < h.tc + half + H_BOARD[ 1 ] ? 1 : 0;
	// (its name inside its wall, eye and all, and wherever its wind's a hurricane's)
	w.id = k >= 0.5 && ( s.r <= h.rmax || w.wind >= HURRICANE_WIND ) ? 'hurricane' : nameOf( w );
	return w;

}

// (M13) the hurricane about the island at T, for what shows it (null: none near enough to touch it). On
// your own, a picked one (pick 'hurricane', picked at `since`). Its eye is at ( x, z ) from the island's
// middle (m) and r away, at T; (step 2) peak: the highest its surge gets (m)
export function hurricaneAt( T, pick = null, since = 0 ) {

	const h = pick === 'hurricane' ? pickedHurricane( since ) : pick ? null : hurricaneNear( T );
	if ( ! h ) return null;
	const pm = - ( T - h.tc ) * h.speed, pn = h.d;
	return { tc: h.tc, vmax: h.vmax, rmax: h.rmax, speed: h.speed, d: h.d, track: h.track, left: h.left, over: Math.abs( h.d ) < HURRICANE.over * h.rmax, peak: peakSurge( h ),
		r: Math.sqrt( pm * pm + pn * pn ), x: - ( pm * h.track.x + pn * h.left.x ), z: - ( pm * h.track.y + pn * h.left.y ) };

}

// (M13) what's said of the next hurricane at T, as the hurricane centre would say it: on the outlook four
// days before its tropical-storm winds reach the island, watched for two days before, warned of a day and
// a half before and until they've gone (null: none). onset, ends: its tropical-storm winds come and go
// (island time); eye: when its eye's closest; over: whether it passes over; from: where it comes from
// ('NNW')
export function hurricaneNews( T, pick = null, since = 0 ) {

	const list = pick === 'hurricane' ? [ pickedHurricane( since ) ] : pick ? [] : hurricanesAbout( T );
	for ( const h of list ) {

		const half = tsHalf( h ), onset = h.tc - half, ends = h.tc + half;
		if ( T >= ends || T < onset - H_NEWS.outlook ) continue;
		const stage = T >= onset - H_NEWS.warning ? 'warning' : T >= onset - H_NEWS.watch ? 'watch' : 'outlook';
		return { stage, onset, ends, eye: h.tc, over: Math.abs( h.d ) < HURRICANE.over * h.rmax, from: windFrom( h.track.x, h.track.y ) };

	}

	return null;

}

// (M9) how fast the weather comes down the trades (km a game hour): a front's bank is told this far up
// them for each hour it's ahead (WeatherDriver, SkyProClouds.front), and (M11) the showers drift at it
export const FRONT_KMH = 8;
// (M11) The showers about the island, for their curtains in the distance (Sky): cells of rain drifting
// down the trades with the weather, each bringing the rain the island has when it's over it (weatherAt
// then), so what you see coming is what comes, and what you saw go is what went.
//   - Along the trades, a slot every SHOWER_GAP in a frame drifting at FRONT_KMH; two cells a slot, set
//     off to either side (up to SHOWER_SIDE). Those that pass over the island rain whenever it does when
//     they're over it; those off to the side half the time (the showers are patchy), (M12) but a front's
//     line of showers is all there.
//   - (M12) Each slot comes the way the wind blows when it's over the island (towardOf( windAngle )
//     then), so a southerly's showers are seen coming up from the south, a front's line from the west.
//   - Each is { along, side, r, rain, x, z }: where it is now (m down its track from the island's middle,
//     upwind < 0; m to the left of it; and so x, z from the island's middle), its radius (m), and its
//     rain (0..1); (M12) and its thunder (0..1) and which it is (n: for good). Within `range` along.
//   - cache: a Map of each slot's weather (it's the slot's for good: keep one while the pick's the same)
//   - out: the array filled (its objects are filled again on the next call: (M12) each frame's, out to
//     60 km)
const SHOWER_GAP = 4000;
const SHOWER_SIDE = 14000;
const SHOWER_R = [ 1200, 3000 ];
export function showers( T, pick = null, range = 26000, out = [], cache = null, since = 0 ) {

	let count = 0;
	const v = FRONT_KMH * 1000, drift = T * v; // (how far the weather's come since day 1 began, m)
	const k0 = Math.ceil( ( - range - drift ) / SHOWER_GAP ), k1 = Math.floor( ( range - drift ) / SHOWER_GAP );
	for ( let k = k0; k <= k1; k ++ ) {

		// (over the island when its slot is: k * SHOWER_GAP + drift = 0)
		let slot = cache ? cache.get( k ) : undefined;
		if ( slot === undefined ) {

			const t = - k * SHOWER_GAP / v, w = weatherAt( t, pick, since );
			slot = towardOf( w.windAngle );
			slot.rain = w.rain;
			slot.thunder = w.thunder;
			slot.line = pick ? 0 : frontAt( t, blowOf( storminess( t ) ) ).line;
			if ( cache ) cache.set( k, slot );

		}

		const rain = slot.rain;
		if ( rain < 0.02 ) continue;
		for ( let j = 0; j < 2; j ++ ) {

			const n = k * 2 + j;
			const side = ( hash( n, 0x51ee7 ) - 0.5 ) * 2 * SHOWER_SIDE;
			const r = SHOWER_R[ 0 ] + ( SHOWER_R[ 1 ] - SHOWER_R[ 0 ] ) * hash( n, 0x2ad1 );
			const passes = Math.abs( side ) < r + 1000;
			if ( ! passes && hash( n, 0x7c3a ) > 0.5 + slot.line ) continue;
			// (those off to the side a little ahead or behind their slot)
			const along = k * SHOWER_GAP + drift + ( passes ? 0 : ( hash( n, 0x39b1 ) - 0.5 ) * SHOWER_GAP * 0.6 );
			const c = out[ count ] || ( out[ count ] = {} );
			count ++;
			c.along = along;
			c.side = side;
			c.r = r;
			c.rain = rain;
			c.thunder = slot.thunder;
			c.n = n;
			c.x = slot.x * along - slot.y * side;
			c.z = slot.y * along + slot.x * side;

		}

	}

	out.length = count;
	return out;

}

// (M12) Thunderstorms on the horizon: the showers about the island that are thundery (showers(): each
// its slot's thunder) strike where they are, out past where the island's own storm does (from
// DISTANT_NEAR of the island's middle, to where showers() reaches: STORM_RANGE), so their flashes are seen
// before the storm's here, and after it's gone. As strikeIn: in each real second, for each, a strike or
// none, from the second and which it is (n) alone (everyone on one clock sees the same), at a cell's
// share of a storm's rate (CELL_RATE), anywhere under it. out: this second's ({ ...strikeIn's, cell })
export const DISTANT_NEAR = 8000;
export const STORM_RANGE = 60000;
const CELL_RATE = 0.5;
export function distantStrikesIn( second, cells, out = [] ) {

	out.length = 0;
	const s = second >>> 0;
	for ( const c of cells ) {

		if ( ! ( c.thunder > 0 ) || Math.hypot( c.x, c.z ) < DISTANT_NEAR ) continue;
		const id = Math.imul( s, 0x2c1b3c6d ) ^ Math.imul( c.n | 0, 0x297a2d39 );
		if ( hash( id, 0x6d2b79f5 ) >= STRIKE_RATE * CELL_RATE * Math.min( 1, c.thunder ) ) continue;
		const u = ( k ) => hash( id, 0x1f123bb5 + k );
		const a = u( 1 ) * Math.PI * 2, r = c.r * 0.8 * Math.sqrt( u( 2 ) );
		const x = c.x + Math.cos( a ) * r, z = c.z + Math.sin( a ) * r;
		out.push( { at: s + u( 3 ), x, z, dist: Math.hypot( x, z ), ground: u( 4 ) < 0.34, seed: ( u( 5 ) * 4294967296 ) >>> 0, power: 0.45 + 0.55 * u( 6 ), cell: c.n } );

	}

	return out;

}

// what's coming: the next change of condition within `ahead` game hours ({ id, at: T }), or null. A
// picked condition holds (none); (M13) a picked hurricane passes
export function forecast( T, ahead = 12, pick = null, since = 0 ) {

	if ( pick && pick !== 'hurricane' && CONDITIONS[ pick ] ) return null;
	const now = weatherAt( T, pick, since ).id;
	for ( let t = 0.5; t <= ahead; t += 0.5 ) {

		const id = weatherAt( T + t, pick, since ).id;
		if ( id !== now ) return { id, at: T + t };

	}

	return null;

}

// the surf as a surf report gives it: the face height of the waves to the sets', in feet ('2-3 ft')
export function surfText( amplitude ) {

	const lo = Math.max( 1, Math.round( amplitude * 2 * 0.8 / FT ) ), hi = Math.max( lo + 1, Math.round( amplitude * 2 * 1.5 / FT ) );
	return `${ lo }–${ hi } ft`;

}

// (M12) where the swell's from, as a surf report gives it: the island's own from the south, a westerly's
// from the west, both while they cross
export const swellFrom = ( west ) => west >= 0.7 ? 'W' : west >= 0.3 ? 'S + W' : 'S';

// (M9) The lightning. In each real second (`second`: whole seconds since 1970, as the shared clock
// counts them) a strike or none, from the second alone and how thundery it is, so everyone on one clock
// sees the same strike at the same moment, wherever they are (the thunder reaches each of them in its
// own time). Where: from the island's middle, mostly the way the storm comes from (up its track, M12) until
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
