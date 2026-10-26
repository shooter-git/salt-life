// Plain-node tests of the island's weather (no GPU): the forecast from the island's time, its
// conditions, how it changes, and how it's read out.
import { CONDITIONS, WEATHER_IDS, WEATHER_NAMES, SURF_MAX, PERIOD_MAX, GROUNDSWELL_MAX, VEER, STRIKE_RATE, islandTime, storminess, cloudiness, veer, showeriness, unsettled, weatherAt, forecast, surfText, windFrom, strikeIn, murkAt, windBeyondFair, blowShare, showers as showersAbout, FRONT_KMH } from '../src/game/Weather.js';
import { knots } from '../src/game/Units.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const KEYS = [ 'wind', 'windAngle', 'coverage', 'overcast', 'swell', 'windSea', 'surf', 'period', 'visibility', 'rain', 'thunder', 'front' ];

// ---- the time, and the same weather for the same time
ok( islandTime( 1, 9.5 ) === 9.5 && islandTime( 3, 0 ) === 48 && islandTime( 0, 6 ) === 6, 'island time: game hours since day 1 began' );
ok( JSON.stringify( weatherAt( 1234.567 ) ) === JSON.stringify( weatherAt( 1234.567 ) ) && storminess( 999.9 ) === storminess( 999.9 ), 'the same time gives the same weather' );

// ---- fair is the island as it always was, and day 1 is fair
const today = { wind: 7, windAngle: 0, coverage: 0.49, overcast: 0, swell: 1, windSea: 1, surf: 0.34, period: 9, visibility: 1, rain: 0, thunder: 0, front: 0 };
const fair = weatherAt( 100, 'fair' );
ok( fair.id === 'fair' && KEYS.every( ( k ) => fair[ k ] === today[ k ] ), 'fair: today\'s wind, cloud, sea, surf and haze exactly, and dry' );
let day1 = true;
for ( let T = 0; T < 24; T += 0.25 ) {

	const w = weatherAt( T );
	if ( w.id !== 'fair' || KEYS.some( ( k ) => w[ k ] !== today[ k ] ) ) day1 = false;

}

ok( day1, 'a new player\'s first day is fair' );

// ---- a pick holds the weather, and has nothing coming
ok( WEATHER_IDS.every( ( id ) => weatherAt( 500, id ).id === id && weatherAt( 500, id ).wind === CONDITIONS[ id ].wind && WEATHER_NAMES[ id ] ), 'each condition can be picked, and has a name' );
ok( forecast( 500, 12, 'gale' ) === null, 'a picked condition has no forecast' );
ok( Object.values( CONDITIONS ).every( ( c ) => Math.min( SURF_MAX, c.surf ) <= SURF_MAX ) && weatherAt( 500, 'gale' ).surf <= SURF_MAX, 'the surf never passes its cap' );

// ---- over a thousand days: it changes smoothly, and in the right measure
const DAYS = 1000;
const count = Object.fromEntries( WEATHER_IDS.map( ( id ) => [ id, 0 ] ) );
const jump = Object.fromEntries( KEYS.map( ( k ) => [ k, 0 ] ) );
let prev = weatherAt( 24 ), n = 0, bounds = true;
for ( let T = 24 + 1 / 60; T < 24 * DAYS; T += 1 / 60 ) {

	const w = weatherAt( T );
	for ( const k of KEYS ) jump[ k ] = Math.max( jump[ k ], Math.abs( w[ k ] - prev[ k ] ) );
	if ( w.wind < 2 || w.wind > 20.01 || Math.abs( w.windAngle ) > VEER || w.coverage < 0.3 || w.coverage > 0.97 || w.surf > SURF_MAX || w.period < 7.5 || w.period > PERIOD_MAX || w.visibility < 0.4 || w.visibility > 1.11
		|| w.rain < 0 || w.rain > 1 || w.thunder < 0 || w.thunder > 1 || w.front < 0 || w.front > 1 ) bounds = false;
	if ( ( T * 60 | 0 ) % 30 === 0 ) { count[ w.id ] ++; n ++; }
	prev = w;

}

const share = ( id ) => count[ id ] / n;
console.log( `     over ${ DAYS } days: ${ WEATHER_IDS.map( ( id ) => `${ id } ${ ( share( id ) * 100 ).toFixed( 1 ) }%` ).join( ', ' ) }` );
console.log( `     the most it moves in a game minute: ${ KEYS.map( ( k ) => `${ k } ${ jump[ k ].toFixed( 4 ) }` ).join( ', ' ) }` );
ok( bounds, 'every value stays within its conditions\' range' );
ok( jump.windAngle < 0.003 && jump.period < 0.05 && jump.swell < 0.01 && jump.surf < 0.004, 'no step in a game minute, midnight included' );
// (a shower comes on in a few game minutes, and brings its cloud, haze and squall: WeatherDriver eases them)
ok( jump.wind < 0.1 && jump.rain < 0.15 && jump.thunder < 0.35 && jump.coverage < 0.04 && jump.overcast < 0.15 && jump.visibility < 0.1 && jump.front < 0.03, 'a shower comes on over a few game minutes, never at once' );
ok( share( 'fair' ) + share( 'calm' ) > 0.4 && share( 'gale' ) > 0.02 && share( 'gale' ) < 0.09 && share( 'blustery' ) + share( 'gale' ) < 0.25 && WEATHER_IDS.every( ( id ) => share( id ) > 0.02 ), 'mostly fair, a gale now and then, every condition comes' );
ok( share( 'rain' ) + share( 'storm' ) > 0.07 && share( 'rain' ) + share( 'storm' ) < 0.2 && share( 'storm' ) < 0.05, 'rain about one hour in six, a thunderstorm one in twenty-five or so' );

// ---- the swell comes ahead of the gale, and the forecast sees it coming
let onsets = 0, early = 0, seen = 0;
for ( let T = 30; T < 24 * 300; T += 0.5 ) {

	// (a gale's wind: in a thunderstorm the name is the storm's)
	if ( weatherAt( T ).wind < 18 || weatherAt( T - 0.5 ).wind >= 18 ) continue;
	onsets ++;
	const before = weatherAt( T - 3 );
	if ( before.wind < 18 && before.swell >= 1.4 ) early ++;
	const f = forecast( T - 4 );
	if ( f && f.at > T - 4 && f.at <= T ) seen ++;

}

console.log( `     ${ onsets } gales in 300 days: the swell up 3 h before ${ early }, a change forecast 4 h before ${ seen }` );
ok( onsets > 5 && early >= onsets * 0.8, 'the surf builds before a gale' );
let ahead = 0, own = 0, gales = 0, bigLong = true;
for ( let T = 30; T < 24 * 300; T += 0.5 ) {

	const w = weatherAt( T );
	if ( w.surf > GROUNDSWELL_MAX + ( SURF_MAX - GROUNDSWELL_MAX ) * Math.min( 1, ( PERIOD_MAX - w.period ) / ( PERIOD_MAX - 9 ) ) + 1e-9 ) bigLong = false;
	if ( w.wind < 18 || weatherAt( T - 0.5 ).wind >= 18 ) continue;
	gales ++;
	ahead += weatherAt( T - 6 ).period;
	own += w.period;

}

console.log( `     the surf's period 6 h before a gale: ${ ( ahead / gales ).toFixed( 1 ) } s on average; in the gale: ${ ( own / gales ).toFixed( 1 ) } s` );
ok( gales > 5 && ahead / gales > own / gales + 0.7, 'the swell ahead of a gale comes longer than the gale\'s own' );
ok( bigLong, 'a long swell from afar is never as big as a gale\'s own' );
ok( seen === onsets, 'the forecast says something\'s coming before every gale' );
const f = forecast( 3000 );
ok( f === null || ( f.at > 3000 && f.id !== weatherAt( 3000 ).id ), 'a forecast is a change still to come' );

// ---- the rain: showers on a fair day now and then, more under a grey sky, most in a blow
let fairShowers = 0, fairN = 0, galeWet = 0, galeN = 0, greyWet = 0, greyN = 0, showers = 0, wasWet = false, thunderDry = 0, fronts = 0, frontBefore = 0;
for ( let T = 30; T < 24 * 600; T += 0.25 ) {

	const w = weatherAt( T ), s = storminess( T ), c = cloudiness( T );
	if ( s > 0.3 && s < 0.55 && c < 0.45 ) { fairN ++; if ( w.rain > 0.05 ) fairShowers ++; }
	if ( c > 0.75 && s < 0.55 ) { greyN ++; if ( w.rain > 0.05 ) greyWet ++; }
	if ( s > 0.95 ) { galeN ++; if ( w.rain > 0.05 ) galeWet ++; }
	if ( w.thunder > 0.05 && w.rain < 0.5 ) thunderDry ++;
	const wet = w.rain > 0.2;
	if ( wet && ! wasWet ) showers ++;
	wasWet = wet;
	if ( w.wind >= 18 && weatherAt( T - 0.25 ).wind < 18 ) {

		fronts ++;
		if ( weatherAt( T - 2.5 ).front > 0.3 || weatherAt( T - 3.5 ).front > 0.3 ) frontBefore ++;

	}

}

const pc = ( a, b ) => ( a / Math.max( b, 1 ) * 100 ).toFixed( 0 ) + '%';
console.log( `     wet: ${ pc( fairShowers, fairN ) } of a clear fair day, ${ pc( greyWet, greyN ) } under a grey sky, ${ pc( galeWet, galeN ) } of a gale; ${ showers } showers in 600 days` );
ok( fairShowers / fairN > 0.01 && fairShowers / fairN < 0.12 && greyWet / greyN > fairShowers / fairN * 2 && galeWet / galeN > 0.4, 'a passing shower on a fair day now and then, more under a grey sky, most of a gale' );
ok( thunderDry === 0, 'thunder only in heavy rain' );
console.log( `     ${ fronts } gales: the fish felt it coming 2-3 h before ${ frontBefore }` );
ok( fronts > 5 && frontBefore >= fronts * 0.7, 'a blow on its way is felt a few hours ahead (the fish feed ahead of a front)' );
const storm = weatherAt( 500, 'storm' ), rain = weatherAt( 500, 'rain' );
ok( storm.id === 'storm' && storm.rain === 1 && storm.thunder === 1 && rain.id === 'rain' && rain.thunder === 0 && rain.rain > 0.5, 'rain and a thunderstorm can be picked' );
ok( showeriness( 77 ) >= 0 && showeriness( 77 ) <= 1 && unsettled( 77 ) >= 0 && unsettled( 77 ) <= 1, 'the rain\'s fields stay in 0..1' );

// ---- the lightning: the same strike for everyone in the same second, as often as the thunder says
const S0 = 1761300000;
ok( JSON.stringify( strikeIn( S0 + 17, 1 ) ) === JSON.stringify( strikeIn( S0 + 17, 1 ) ), 'the same second gives the same strike' );
let hits = 0, ground = 0, near = 0, upwind = 0, inSecond = true, none = 0, halfHits = 0;
const N = 20000;
for ( let k = 0; k < N; k ++ ) {

	if ( strikeIn( S0 + k, 0 ) ) none ++;
	if ( strikeIn( S0 + k, 0.5 ) ) halfHits ++;
	const s = strikeIn( S0 + k, 1, { x: 0.35, y: 0.94 } );
	if ( ! s ) continue;
	hits ++;
	if ( s.ground ) ground ++;
	if ( s.dist < 1500 ) near ++;
	if ( s.at < S0 + k || s.at >= S0 + k + 1 ) inSecond = false;
	if ( ( s.x * 0.35 + s.z * 0.94 ) / s.dist < 0 ) upwind ++;

}

console.log( `     a full thunderstorm: a strike every ${ ( N / hits ).toFixed( 1 ) } s, ${ pc( ground, hits ) } to the ground, ${ pc( near, hits ) } within 1.5 km` );
ok( none === 0 && Math.abs( hits / N - STRIKE_RATE ) < 0.01 && Math.abs( halfHits / N - STRIKE_RATE / 2 ) < 0.01, 'no thunder, no lightning; strikes as often as the thunder says' );
ok( inSecond && ground > hits * 0.25 && ground < hits * 0.45 && near > hits * 0.05 && near < hits * 0.25, 'a third come down as bolts, a few of them near' );
let upEarly = 0, coming = 0;
for ( let k = 0; k < N; k ++ ) {

	const s = strikeIn( S0 + k, 0.15, { x: 0.35, y: 0.94 } );
	if ( ! s ) continue;
	coming ++;
	if ( ( s.x * 0.35 + s.z * 0.94 ) / s.dist < 0 ) upEarly ++;

}

ok( upEarly > coming * 0.95 && upwind < hits * 0.8, 'a storm coming in strikes from where it comes from, overhead all round' );

// ---- (M10) the water's murk after a blow: none on day 1 or without a blow in the last day, murky
// through a gale and for hours after, clear again within a day; a held pick has its own
{

	let none = true, clearAfter = true, quiet = 0, gales = 0, murkyThrough = 0, murky = 0, n = 0;
	for ( let T = 0; T < 30; T += 0.25 ) if ( murkAt( T ) !== 0 || weatherAt( T ).murk !== 0 ) none = false;
	for ( let T = 30; T < 24 * 1000; T += 1 ) {

		n ++;
		if ( murkAt( T ) > 0.5 ) murky ++;
		// no blow (storminess under a stiff breeze's) in the last day and a half: clear water
		let blew = false;
		for ( let L = 0; L <= 36; L += 0.5 ) if ( storminess( T - L ) >= 0.8 ) blew = true;
		if ( ! blew ) {

			quiet ++;
			if ( murkAt( T ) !== 0 ) clearAfter = false;

		}

		if ( weatherAt( T ).id === 'gale' && weatherAt( T - 1 ).id !== 'gale' ) {

			gales ++;
			if ( murkAt( T + 3 ) > 0.6 && murkAt( T + 6 ) > 0.6 ) murkyThrough ++;

		}

	}

	console.log( `     murky water (over half) ${ ( murky / n * 100 ).toFixed( 0 ) }% of the time; ${ murkyThrough } of ${ gales } gales leave it murky for hours` );
	ok( none, 'day 1\'s water is clear' );
	ok( quiet > 100 && clearAfter, 'with no blow in the last day and a half the water\'s clear' );
	ok( gales > 5 && murkyThrough >= gales * 0.9, 'a gale leaves the water murky for hours' );
	ok( murky / n > 0.04 && murky / n < 0.25, 'murky water now and then, not most days' );
	ok( weatherAt( 500, 'gale' ).murk > 0.5 && weatherAt( 500, 'fair' ).murk === 0 && weatherAt( 500, 'calm' ).murk === 0, 'a held gale\'s water is murky; a held fair day\'s, clear' );

}

// ---- (M10) the wind past a fair day's, for the cast, the float and the line
ok( windBeyondFair( 7 ) === 0 && windBeyondFair( 2.5 ) === 0 && windBeyondFair( 20 ) === 13 && blowShare( 7 ) === 0 && blowShare( 20 ) === 1 && blowShare( 30 ) === 1, 'the wind past a fair day\'s: none on a fair day, all of it in a gale' );

// ---- read out as a marine forecast would
ok( knots( 7 ) === '14 kt' && knots( 20 ) === '39 kt', 'wind in knots' );
const l = Math.hypot( 0.35, 0.94 );
ok( windFrom( 0.35 / l, 0.94 / l ) === 'NNW' && windFrom( 0, - 1 ) === 'S' && windFrom( 1, 0 ) === 'W' && windFrom( - 1, 0 ) === 'E' && windFrom( 0, 1 ) === 'N', 'where the wind comes from, on the island\'s compass (the trades: NNW)' );
let lo = 0, hi = 0;
for ( let T = 24; T < 24 * 300; T += 0.5 ) {

	lo = Math.min( lo, veer( T ) );
	hi = Math.max( hi, veer( T ) );

}

ok( lo < - VEER * 0.8 && hi > VEER * 0.8, `the wind turns both ways from the trades (${ ( lo * 57.3 ).toFixed( 0 ) }° to ${ ( hi * 57.3 ).toFixed( 0 ) }°)` );
ok( surfText( 0.34 ) === '2–3 ft' && surfText( 0.24 ) === '1–2 ft' && surfText( SURF_MAX ) === '3–6 ft', 'surf as a report gives it' );
ok( cloudiness( 77 ) >= 0 && cloudiness( 77 ) <= 1 && storminess( 77 ) >= 0 && storminess( 77 ) <= 1, 'the fields stay in 0..1' );

// ---- (M11) the showers about the island, for their curtains in the distance
{

	const v = FRONT_KMH * 1000;
	// (a rainy hour: rain over the island now)
	let T = 48;
	while ( weatherAt( T ).rain < 0.3 ) T += 0.25;
	const cells = showersAbout( T );
	ok( cells.length > 0 && cells.length < 40 && cells.every( ( c ) => Math.abs( c.along ) <= 26000 && c.r >= 1200 && c.r <= 3000 && c.rain > 0 ), `a rainy hour: ${ cells.length } showers within 26 km up and down the trades` );
	const passing = cells.filter( ( c ) => Math.abs( c.side ) < c.r + 1000 );
	ok( passing.length > 0 && passing.every( ( c ) => c.rain === weatherAt( T - c.along / v ).rain ), 'each that passes over the island brings the rain it has when it\'s over it' );
	const over = passing.filter( ( c ) => Math.abs( c.along ) <= 2000 );
	ok( over.length > 0, 'and one is over the island while it rains here' );
	const later = showersAbout( T + 0.25 );
	ok( cells.every( ( c ) => later.some( ( l ) => l.side === c.side && Math.abs( l.along - ( c.along + 0.25 * v ) ) < 1e-6 ) || c.along + 0.25 * v > 26000 ), 'they drift down the trades with the weather (8 km a game hour)' );
	// (upwind: what's coming; the island's rain an hour on is the rain of the one an hour's drift upwind)
	const ahead = passing.filter( ( c ) => c.along < - 4000 );
	ok( ahead.every( ( c ) => c.rain === weatherAt( T + - c.along / v ).rain ), 'those upwind are the rain that\'s coming' );
	const cache = new Map();
	ok( JSON.stringify( showersAbout( T, null, 26000, [], cache ) ) === JSON.stringify( cells ) && cache.size > 0 && JSON.stringify( showersAbout( T, null, 26000, [], cache ) ) === JSON.stringify( cells ), 'the same with a cache of each slot\'s rain' );
	// (a dry spell: no rain for the 6.5 game hours either side)
	let D = 48;
	const dry = ( t ) => { for ( let h = - 3.3; h <= 3.3; h += 0.1 ) if ( weatherAt( t + h ).rain >= 0.02 ) return false; return true; };
	while ( ! dry( D ) ) D += 0.5;
	ok( showersAbout( D ).length === 0, `a dry spell (day ${ Math.floor( D / 24 ) + 1 }): no showers about` );
	ok( showersAbout( 10 ).length === 0, 'day 1 is fair: none' );
	ok( showersAbout( T, 'fair' ).length === 0 && showersAbout( T, 'rain' ).length > 10 && showersAbout( T, 'rain' ).every( ( c ) => c.rain === CONDITIONS.rain.rain ), 'a picked weather: none for fair, a sky full of its rain for rain' );

}

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
