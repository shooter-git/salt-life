// Plain-node tests of the island's weather (no GPU): the forecast from the island's time, its
// conditions, how it changes, and how it's read out.
import { CONDITIONS, WEATHER_IDS, WEATHER_NAMES, SURF_MAX, PERIOD_MAX, GROUNDSWELL_MAX, VEER, STRIKE_RATE, islandTime, storminess, cloudiness, veer, showeriness, unsettled, weatherAt, forecast, surfText, windFrom, strikeIn, murkAt, windBeyondFair, blowShare, showers as showersAbout, FRONT_KMH, FROM, TRACK_SPAN, trackAt, towardOf, swellFrom, distantStrikesIn, DISTANT_NEAR, STORM_RANGE, dayWeatherAt, hurricaneAt, hurricaneNews, HURRICANE, TS_WIND, HURRICANE_WIND, MURKY, SURGE, SURF_HURRICANE, PERIOD_HURRICANE } from '../src/game/Weather.js';
import { flashSeen, HEARD } from '../src/sky/Lightning.js';
import { knots } from '../src/game/Units.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const KEYS = [ 'wind', 'windAngle', 'coverage', 'overcast', 'swell', 'windSea', 'surf', 'period', 'west', 'visibility', 'rain', 'thunder', 'front' ];

// ---- the time, and the same weather for the same time
ok( islandTime( 1, 9.5 ) === 9.5 && islandTime( 3, 0 ) === 48 && islandTime( 0, 6 ) === 6, 'island time: game hours since day 1 began' );
ok( JSON.stringify( weatherAt( 1234.567 ) ) === JSON.stringify( weatherAt( 1234.567 ) ) && storminess( 999.9 ) === storminess( 999.9 ), 'the same time gives the same weather' );

// ---- fair is the island as it always was, and day 1 is fair
const today = { wind: 7, windAngle: 0, coverage: 0.49, overcast: 0, swell: 1, windSea: 1, surf: 0.34, period: 9, west: 0, visibility: 1, rain: 0, thunder: 0, front: 0 };
const fair = weatherAt( 100, 'fair' );
ok( fair.id === 'fair' && KEYS.every( ( k ) => fair[ k ] === today[ k ] ), 'fair: today\'s wind, cloud, sea, surf and haze exactly, and dry' );
let day1 = true;
for ( let T = 0; T < 24; T += 0.25 ) {

	const w = weatherAt( T );
	if ( w.id !== 'fair' || KEYS.some( ( k ) => w[ k ] !== today[ k ] ) ) day1 = false;

}

ok( day1, 'a new player\'s first day is fair' );

// ---- a pick holds the weather, and has nothing coming
ok( WEATHER_IDS.every( ( id ) => id === 'hurricane' || ( weatherAt( 500, id ).id === id && weatherAt( 500, id ).wind === CONDITIONS[ id ].wind && WEATHER_NAMES[ id ] ) ), 'each condition can be picked, and has a name' );
ok( forecast( 500, 12, 'gale' ) === null, 'a picked condition has no forecast' );
ok( Object.values( CONDITIONS ).every( ( c ) => Math.min( SURF_MAX, c.surf ) <= SURF_MAX ) && weatherAt( 500, 'gale' ).surf <= SURF_MAX, 'the surf never passes its cap' );

// ---- over a thousand days: it changes smoothly, and in the right measure
const DAYS = 1000;
const count = Object.fromEntries( WEATHER_IDS.map( ( id ) => [ id, 0 ] ) );
const jump = Object.fromEntries( KEYS.map( ( k ) => [ k, 0 ] ) );
let prev = dayWeatherAt( 24 ), n = 0, bounds = true;
for ( let T = 24 + 1 / 60; T < 24 * DAYS; T += 1 / 60 ) {

	const w = dayWeatherAt( T );
	for ( const k of KEYS ) jump[ k ] = Math.max( jump[ k ], Math.abs( w[ k ] - prev[ k ] ) );
	if ( w.wind < 2 || w.wind > 20.01 || w.windAngle < FROM.south - 1e-9 || w.windAngle > Math.max( VEER, FROM.north ) || w.west < 0 || w.west > 1 || w.coverage < 0.3 || w.coverage > 0.97 || w.surf > SURF_MAX || w.period < 7.5 || w.period > PERIOD_MAX || w.visibility < 0.4 || w.visibility > 1.11
		|| w.rain < 0 || w.rain > 1 || w.thunder < 0 || w.thunder > 1 || w.front < 0 || w.front > 1 ) bounds = false;
	if ( ( T * 60 | 0 ) % 30 === 0 ) { count[ w.id ] ++; n ++; }
	prev = w;

}

const share = ( id ) => count[ id ] / n;
console.log( `     over ${ DAYS } days: ${ WEATHER_IDS.map( ( id ) => `${ id } ${ ( share( id ) * 100 ).toFixed( 1 ) }%` ).join( ', ' ) }` );
console.log( `     the most it moves in a game minute: ${ KEYS.map( ( k ) => `${ k } ${ jump[ k ].toFixed( 4 ) }` ).join( ', ' ) }` );
ok( bounds, 'every value stays within its conditions\' range' );
// ((M12) a front's wind swings round a quarter in two game hours: WeatherDriver turns the wind as fast)
ok( jump.windAngle < 0.022 && jump.west < 0.02 && jump.period < 0.05 && jump.swell < 0.01 && jump.surf < 0.004, 'no step in a game minute, midnight included' );
// (a shower comes on in a few game minutes, and brings its cloud, haze and squall: WeatherDriver eases them)
ok( jump.wind < 0.1 && jump.rain < 0.15 && jump.thunder < 0.35 && jump.coverage < 0.04 && jump.overcast < 0.15 && jump.visibility < 0.1 && jump.front < 0.03, 'a shower comes on over a few game minutes, never at once' );
ok( share( 'fair' ) + share( 'calm' ) > 0.4 && share( 'gale' ) > 0.02 && share( 'gale' ) < 0.09 && share( 'blustery' ) + share( 'gale' ) < 0.25 && WEATHER_IDS.every( ( id ) => id === 'hurricane' || share( id ) > 0.02 ), 'mostly fair, a gale now and then, every condition comes' );
ok( share( 'rain' ) + share( 'storm' ) > 0.07 && share( 'rain' ) + share( 'storm' ) < 0.2 && share( 'storm' ) < 0.05, 'rain about one hour in six, a thunderstorm one in twenty-five or so' );

// ---- the swell comes ahead of the gale, and the forecast sees it coming
let onsets = 0, early = 0, seen = 0, quiet = 0;
for ( let T = 30; T < 24 * 300; T += 0.5 ) {

	// (a gale's wind: in a thunderstorm the name is the storm's)
	if ( dayWeatherAt( T ).wind < 18 || dayWeatherAt( T - 0.5 ).wind >= 18 ) continue;
	onsets ++;
	const before = dayWeatherAt( T - 3 );
	if ( before.wind < 18 && before.swell >= 1.4 ) early ++;
	// (where no hurricane touches the hours the forecast looks over: it's the day's there)
	if ( hurricaneAt( T - 4 ) || hurricaneAt( T + 8 ) ) { quiet ++; continue; }
	const f = forecast( T - 4 );
	if ( f && f.at > T - 4 && f.at <= T ) seen ++;

}

console.log( `     ${ onsets } gales in 300 days: the swell up 3 h before ${ early }, a change forecast 4 h before ${ seen }` );
ok( onsets > 5 && early >= onsets * 0.8, 'the surf builds before a gale' );
let ahead = 0, own = 0, gales = 0, bigLong = true;
for ( let T = 30; T < 24 * 300; T += 0.5 ) {

	const w = dayWeatherAt( T );
	if ( w.surf > GROUNDSWELL_MAX + ( SURF_MAX - GROUNDSWELL_MAX ) * Math.min( 1, ( PERIOD_MAX - w.period ) / ( PERIOD_MAX - 9 ) ) + 1e-9 ) bigLong = false;
	if ( w.wind < 18 || dayWeatherAt( T - 0.5 ).wind >= 18 ) continue;
	gales ++;
	ahead += dayWeatherAt( T - 6 ).period;
	own += w.period;

}

console.log( `     the surf's period 6 h before a gale: ${ ( ahead / gales ).toFixed( 1 ) } s on average; in the gale: ${ ( own / gales ).toFixed( 1 ) } s` );
ok( gales > 5 && ahead / gales > own / gales + 0.7, 'the swell ahead of a gale comes longer than the gale\'s own' );
ok( bigLong, 'a long swell from afar is never as big as a gale\'s own' );
ok( seen === onsets - quiet, 'the forecast says something\'s coming before every gale' );
const f = forecast( 3000 );
ok( f === null || ( f.at > 3000 && f.id !== dayWeatherAt( 3000 ).id ), 'a forecast is a change still to come' );

// ---- the rain: showers on a fair day now and then, more under a grey sky, most in a blow
let fairShowers = 0, fairN = 0, galeWet = 0, galeN = 0, greyWet = 0, greyN = 0, showers = 0, wasWet = false, thunderDry = 0, fronts = 0, frontBefore = 0;
for ( let T = 30; T < 24 * 600; T += 0.25 ) {

	const w = dayWeatherAt( T ), s = storminess( T ), c = cloudiness( T );
	if ( s > 0.3 && s < 0.55 && c < 0.45 ) { fairN ++; if ( w.rain > 0.05 ) fairShowers ++; }
	if ( c > 0.75 && s < 0.55 ) { greyN ++; if ( w.rain > 0.05 ) greyWet ++; }
	if ( s > 0.95 ) { galeN ++; if ( w.rain > 0.05 ) galeWet ++; }
	if ( w.thunder > 0.05 && w.rain < 0.5 ) thunderDry ++;
	const wet = w.rain > 0.2;
	if ( wet && ! wasWet ) showers ++;
	wasWet = wet;
	if ( w.wind >= 18 && dayWeatherAt( T - 0.25 ).wind < 18 ) {

		fronts ++;
		if ( dayWeatherAt( T - 2.5 ).front > 0.3 || dayWeatherAt( T - 3.5 ).front > 0.3 ) frontBefore ++;

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
	for ( let T = 0; T < 30; T += 0.25 ) if ( murkAt( T ) !== 0 || dayWeatherAt( T ).murk !== 0 ) none = false;
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

		if ( dayWeatherAt( T ).id === 'gale' && dayWeatherAt( T - 1 ).id !== 'gale' ) {

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
ok( swellFrom( 0 ) === 'S' && swellFrom( 0.5 ) === 'S + W' && swellFrom( 1 ) === 'W', '(M12) and where its swell\'s from' );
ok( cloudiness( 77 ) >= 0 && cloudiness( 77 ) <= 1 && storminess( 77 ) >= 0 && storminess( 77 ) <= 1, 'the fields stay in 0..1' );

// ---- (M12) thunderstorms on the horizon: the thundery showers about the island strike where they are,
// past where the island's own storm does; seen far off, the storm's own cloud lit, next to no light here,
// and no thunder past 20 km or so
{

	const cell = ( x, z, thunder, n ) => ( { x, z, r: 2000, rain: 1, thunder, n } );
	const far = [ cell( 30000, 0, 1, 7 ) ], near = [ cell( 4000, 0, 1, 8 ) ], dry = [ cell( 30000, 0, 0, 9 ) ];
	let hits = 0, nearHits = 0, dryHits = 0, inside = true, same = true;
	for ( let k = 0; k < N; k ++ ) {

		const a = distantStrikesIn( S0 + k, far );
		nearHits += distantStrikesIn( S0 + k, near ).length;
		dryHits += distantStrikesIn( S0 + k, dry ).length;
		if ( JSON.stringify( a ) !== JSON.stringify( distantStrikesIn( S0 + k, far ) ) ) same = false;
		for ( const s of a ) {

			hits ++;
			if ( Math.hypot( s.x - 30000, s.z ) > 1600 || s.at < S0 + k || s.at >= S0 + k + 1 ) inside = false;

		}

	}

	ok( same && inside && nearHits === 0 && dryHits === 0, 'a thundery shower on the horizon strikes under itself, the same for everyone; none from one near the island (its own storm\'s) or a dry one' );
	ok( Math.abs( hits / N - STRIKE_RATE / 2 ) < 0.01, `a storm cell on the horizon strikes about every ${ ( N / Math.max( 1, hits ) ).toFixed( 0 ) } s` );
	// (a stormy night: the flashes on the horizon before the storm gets here)
	let seenAhead = 0, nights = 0;
	for ( let T = 48; T < 24 * 300; T += 0.5 ) {

		if ( weatherAt( T ).thunder > 0 || ! ( weatherAt( T + 2 ).thunder > 0.5 ) ) continue;
		nights ++;
		const cells = showersAbout( T, null, STORM_RANGE );
		let n = 0;
		for ( let k = 0; k < 120; k ++ ) n += distantStrikesIn( S0 + k, cells ).length;
		if ( n > 0 ) seenAhead ++;
		T += 6;

	}

	ok( nights > 10 && seenAhead > nights * 0.8, `before a thunderstorm gets here, its lightning's seen on the horizon (${ seenAhead } of ${ nights })` );
	const close = flashSeen( 2500, 1, true ), mid = flashSeen( 12000, 1, true ), away = flashSeen( 40000, 1, true ), hazy = flashSeen( 40000, 1, true, 0.4 );
	ok( close.glow === 1 && close.fill === 1 && close.spread === 7 && close.far === 0, 'a strike a few km off is as it was: its glow lights the island as much' );
	ok( away.fill < 0.02 && away.glow > 0.1 && away.spread > 100 && away.far === 1 && mid.fill < mid.glow && hazy.glow < away.glow * 0.5, `one on the horizon: its own cloud lit, tight about it (${ ( 2 * Math.atan( 1 / Math.sqrt( away.spread / 2 ) ) * 57.3 ).toFixed( 0 ) }°), dimmed by the air between, next to no light here` );
	ok( HEARD > 15000 && HEARD < 25000, `its thunder heard to ${ HEARD / 1000 } km, no farther` );

}

// ---- (M12) each blow its own track
{

	const from = ( a ) => {

		const t = towardOf( a );
		return windFrom( t.x, t.y );

	};
	ok( from( 0 ) === 'NNW' && from( FROM.south ) === 'S' && from( FROM.west ) === 'W' && from( FROM.north ) === 'N', 'the tracks: down the trades (NNW), from the S, the W and the N' );
	// (over a thousand days: short of a breeze the wind is the trades', as it always was; a blow's mostly
	// down them, some from the south or the west; a westerly's swell from the west, no other's)
	let off = 0, blows = 0, blowOff = 0, southerly = 0, westerly = 0, westSwell = 0, westWithout = 0, tradesWest = 0;
	for ( let T = 30; T < 24 * DAYS; T += 0.5 ) {

		const w = dayWeatherAt( T );
		if ( storminess( T ) < 0.55 && Math.abs( w.windAngle - veer( T ) ) > 1e-9 ) off ++;
		if ( w.west > 0.5 ) {

			westSwell ++;
			let seen = false;
			for ( let h = - 7; h <= 7 && ! seen; h += 0.5 ) seen = Math.abs( trackAt( T + h, 0 ) - FROM.west ) < 1;
			if ( ! seen ) westWithout ++;

		}

		let trades = true;
		for ( let h = - 7; h <= 7 && trades; h += 0.5 ) trades = trackAt( T + h, 0 ) === 0;
		if ( trades && w.west > 0 ) tradesWest ++;
		if ( w.wind < 11 ) continue;
		blows ++;
		const f = from( w.windAngle );
		if ( Math.abs( w.windAngle ) > VEER ) blowOff ++;
		if ( [ 'S', 'SSW', 'SSE' ].includes( f ) ) southerly ++;
		if ( [ 'W', 'WSW', 'WNW' ].includes( f ) ) westerly ++;

	}

	ok( off === 0, 'short of a breeze, the wind is the trades\' (turned as they always were)' );
	ok( blowOff > blows * 0.2 && blowOff < blows * 0.5 && southerly > blows * 0.05 && westerly > blows * 0.03, `a blow's mostly down the trades: ${ pc( blowOff, blows ) } from elsewhere (${ pc( southerly, blows ) } southerly, ${ pc( westerly, blows ) } westerly)` );
	ok( westSwell > 0 && westWithout === 0 && tradesWest === 0, `a swell from the west only from a westerly blow, of the last few hours or on its way (${ pc( westSwell, 2 * 24 * DAYS ) } of the time)` );
	// (a front: from the south ahead of it, through the west with its line of showers, round to the north,
	// and clearing behind it)
	let fronts = 0, swung = 0, line = 0, cleared = 0;
	for ( let i = 1; i < 24 * DAYS / TRACK_SPAN; i ++ ) {

		const T0 = i * TRACK_SPAN, a = dayWeatherAt( T0 - 5 ), m = dayWeatherAt( T0 + 1 ), b = dayWeatherAt( T0 + 9.5 );
		if ( ! ( a.windAngle < - 2 && m.windAngle > - 1.9 && m.windAngle < - 0.5 && b.windAngle > - 0.6 ) ) continue;
		fronts ++;
		let veering = true, rain = 0, before = 0, after = 0;
		for ( let t = T0 - 1; t <= T0 + 9; t += 0.25 ) if ( dayWeatherAt( t + 0.25 ).windAngle < dayWeatherAt( t ).windAngle - 0.02 ) veering = false;
		for ( let t = T0 - 4; t <= T0 + 4; t += 0.25 ) rain = Math.max( rain, dayWeatherAt( t ).rain );
		for ( let t = 4; t <= 8; t += 0.5 ) {

			before += dayWeatherAt( T0 - t ).coverage;
			after += dayWeatherAt( T0 + 2 + t ).coverage;

		}

		if ( veering ) swung ++;
		if ( rain > 0.5 ) line ++;
		if ( after < before - 0.5 ) cleared ++;

	}

	ok( fronts > 10 && swung === fronts && line === fronts && cleared > fronts * 0.8, `${ fronts } fronts in ${ DAYS } days, each veering the wind round from the south to the north behind a line of showers, and clearing` );

}

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
	// ((M12) each slot comes the way the wind blows when it's over the island: a southerly's showers are
	// seen coming up from the south)
	ok( passing.every( ( c ) => {

		const t = towardOf( weatherAt( T - c.along / v ).windAngle );
		return Math.abs( c.x - ( t.x * c.along - t.y * c.side ) ) < 1e-6 && Math.abs( c.z - ( t.y * c.along + t.x * c.side ) ) < 1e-6;

	} ), 'each comes the way the wind blows when it\'s over the island' );
	let Ts = 48;
	const southerly = ( t ) => weatherAt( t ).windAngle < - 2.3 && showersAbout( t ).some( ( c ) => c.along < - 4000 && weatherAt( t - c.along / v ).windAngle < - 2.3 );
	while ( ! southerly( Ts ) && Ts < 24 * DAYS ) Ts += 0.5;
	const coming = showersAbout( Ts ).filter( ( c ) => c.along < - 4000 && weatherAt( Ts - c.along / v ).windAngle < - 2.3 );
	ok( coming.length > 0 && coming.every( ( c ) => c.z > Math.abs( c.along ) * 0.7 - Math.abs( c.side ) ), `a southerly (day ${ Math.floor( Ts / 24 ) + 1 }): its showers seen coming up from the south` );
	ok( showersAbout( 10 ).length === 0, 'day 1 is fair: none' );
	ok( showersAbout( T, 'fair' ).length === 0 && showersAbout( T, 'rain' ).length > 10 && showersAbout( T, 'rain' ).every( ( c ) => c.rain === CONDITIONS.rain.rain ), 'a picked weather: none for fair, a sky full of its rain for rain' );

}

// ---- (M13) the hurricane: now and then, never in a new player's first fortnight; a Category 1 passing
// down the trades, its eye over the island or to one side, its bands, its warnings, the murk after it
{

	const H_DAYS = 3000, list = [];
	for ( let T = 0; T < 24 * H_DAYS; T += 1 ) {

		const h = hurricaneAt( T );
		if ( h && ( ! list.length || list[ list.length - 1 ].tc !== h.tc ) ) list.push( h );

	}

	const gaps = list.slice( 1 ).map( ( h, i ) => ( h.tc - list[ i ].tc ) / 24 ), mean = gaps.reduce( ( a, b ) => a + b, 0 ) / gaps.length;
	ok( list.length > 50 && list[ 0 ].tc >= ( HURRICANE.fromDay - 1 ) * 24 && mean > 30 && mean < 45 && Math.min( ...gaps ) > 7, `a hurricane about every ${ mean.toFixed( 0 ) } days (${ list.length } in ${ H_DAYS }), the first's eye on day ${ Math.floor( list[ 0 ].tc / 24 ) + 1 }, never two within a week` );
	// (where none touches the island, the day's weather exactly)
	let same = true;
	for ( let T = 30; T < 24 * 400; T += 0.37 ) if ( ! hurricaneAt( T ) && JSON.stringify( weatherAt( T ) ) !== JSON.stringify( dayWeatherAt( T ) ) ) same = false;
	ok( same, 'where no hurricane touches the island, the day\'s weather exactly' );

	// each passage, every two game minutes from four days before its eye to four and a half after
	const wrap = ( a ) => a - Math.round( a / ( 2 * Math.PI ) ) * 2 * Math.PI;
	let cat1 = true, force = 0, weakest = 1e9, eyes = 0, overs = 0, eyeCalm = true, eyeLong = [ 1e9, 0 ], flipped = 0, sides = 0, backs = 0, veers = 0, smooth = true, named = true, thunderDry = 0;
	let banded = 0, wallLoud = 0, watchOn = 0, warnOn = 0, outlooked = 0, gone = true, murky = 0, capped = true, stepMax = { wind: 0, rain: 0, angle: 0, surge: 0 };
	const surges = { left: [], right: [], over: [] }, quietBay = [], peaked = [];
	const N = 40;
	for ( const h of list.slice( 0, N ) ) {

		const dt = 1 / 30, over = h.over, rAt = ( T ) => Math.hypot( ( T - h.tc ) * h.speed, h.d );
		let surgeHi = - 1e9, surgeLo = 1e9, quiet = 1e9, peak = 0, prev = null, eyeIn = null, eyeOut = null, turned = 0, onset = null, ends = null, bands = 0, inBand = false, sawWatch = null, sawWarn = null, sawOutlook = null, after = true;
		for ( let t = - 96; t <= 108; t += dt ) {

			const T = h.tc + t, w = weatherAt( T ), n = hurricaneNews( T );
			peak = Math.max( peak, w.wind );
			if ( w.wind >= TS_WIND && onset === null && w.hurricane > 0.5 ) onset = T;
			if ( w.wind >= TS_WIND && w.hurricane > 0.5 ) ends = T;
			if ( w.surf > SURF_HURRICANE || w.period > PERIOD_HURRICANE || w.swell > HURRICANE.swell || w.surge < SURGE.low || w.surge > SURGE.high ) capped = false;
			surgeHi = Math.max( surgeHi, w.surge );
			surgeLo = Math.min( surgeLo, w.surge );
			// (the bay in the lee while its wind blows out of it, at its worst)
			if ( Math.abs( t ) < 0.5 && h.d < - 0.9 * h.rmax ) quiet = Math.min( quiet, - w.surf );
			if ( w.thunder > 0.05 && w.rain < 0.5 ) thunderDry ++;
			if ( ( w.id === 'hurricane' ) !== ( w.hurricane >= 0.5 && ( w.wind >= HURRICANE_WIND || rAt( T ) <= h.rmax ) ) ) named = false;
			// (its outer bands, crossed one after another as it comes: they thunder; the eyewall seldom)
			const r = rAt( T );
			if ( r > 3.5 * h.rmax && t < 0 ) {

				const wet = w.rain > 0.5;
				if ( wet && ! inBand ) bands ++;
				inBand = wet;

			}

			if ( r < 1.5 * h.rmax && w.eye < 0.1 && w.thunder > HURRICANE.wallThunder + 1e-9 ) wallLoud ++;
			if ( w.eye >= 0.9 ) {

				if ( eyeIn === null ) eyeIn = T;
				eyeOut = T;
				if ( w.wind > 8 || w.rain > 0.05 ) eyeCalm = false;

			}

			if ( prev ) {

				const da = wrap( w.windAngle - prev.windAngle );
				turned += da;
				stepMax.wind = Math.max( stepMax.wind, Math.abs( w.wind - prev.wind ) );
				stepMax.rain = Math.max( stepMax.rain, Math.abs( w.rain - prev.rain ) );
				stepMax.surge = Math.max( stepMax.surge, Math.abs( w.surge - prev.surge ) );
				if ( Math.min( w.wind, prev.wind ) > 8 ) stepMax.angle = Math.max( stepMax.angle, Math.abs( da ) );

			}

			if ( n && n.stage === 'outlook' && sawOutlook === null ) sawOutlook = T;
			if ( n && n.stage === 'watch' && sawWatch === null ) sawWatch = T;
			if ( n && n.stage === 'warning' && sawWarn === null ) sawWarn = T;
			if ( t > 0.5 && t < 24 && w.murk < MURKY ) murky ++;
			prev = w;

		}

		for ( let T = ends + 1; T < h.tc + 108; T += 0.5 ) {

			const n = hurricaneNews( T );
			if ( n && n.eye === h.tc ) after = false;

		}

		if ( peak > 42.5 ) cat1 = false;
		// (its surge: piled into the bay with the island on its left, drawn out of it on its right)
		( over ? surges.over : h.d > 0.6 * h.rmax ? surges.left : h.d < - 0.6 * h.rmax ? surges.right : [] ).push( [ surgeHi, surgeLo ] );
		if ( quiet < 1e9 ) quietBay.push( - quiet );
		peaked.push( Math.abs( h.peak - Math.max( 0, surgeHi ) ) );
		if ( peak >= HURRICANE_WIND ) force ++;
		weakest = Math.min( weakest, peak );
		if ( bands >= 2 ) banded ++;
		if ( over ) {

			overs ++;
			if ( eyeIn !== null ) {

				eyes ++;
				eyeLong[ 0 ] = Math.min( eyeLong[ 0 ], eyeOut - eyeIn );
				eyeLong[ 1 ] = Math.max( eyeLong[ 1 ], eyeOut - eyeIn );
				// (the wind from across the compass on its far side)
				if ( Math.abs( wrap( weatherAt( eyeOut + 0.75 ).windAngle - weatherAt( eyeIn - 0.75 ).windAngle ) ) > 2 ) flipped ++;

			}

		} else if ( Math.abs( h.d ) > 0.6 * h.rmax ) {

			// (to the left of its track the wind backs right round the compass as it passes; to the right
			// it veers through the worst of it)
			sides ++;
			let worst = 0;
			for ( let t = - 6; t < 6; t += 1 / 30 ) worst += wrap( weatherAt( h.tc + t + 1 / 30 ).windAngle - weatherAt( h.tc + t ).windAngle );
			if ( h.d > 0 ? worst < - 1.5 : worst > 1.5 ) h.d > 0 ? backs ++ : veers ++;

		}

		// (its warnings, as a hurricane centre's: from its tropical-storm winds' onset)
		// (said of it: four days ahead of when its winds come, as near as it's said; then two, and a day and a
		// half, and until they've gone)
		const said = hurricaneNews( h.tc - 1 ), at = ( t ) => hurricaneNews( said.onset + t );
		if ( Math.abs( said.onset - onset ) < 2 && at( - 95 ).stage === 'outlook' && at( - 49 ).stage === 'outlook' ) outlooked ++;
		if ( sawWatch !== null && Math.abs( onset - sawWatch - 48 ) < 3 && at( - 47 ).stage === 'watch' ) watchOn ++;
		if ( sawWarn !== null && Math.abs( onset - sawWarn - 36 ) < 3 && at( - 35 ).stage === 'warning' && at( 1 ).stage === 'warning' ) warnOn ++;
		if ( ! after ) gone = false;

	}

	console.log( `     ${ N } hurricanes: ${ force } at hurricane force (the weakest side's ${ weakest.toFixed( 1 ) } m/s); ${ eyes } of ${ overs } over the island in their eye (${ eyeLong[ 0 ].toFixed( 1 ) } to ${ eyeLong[ 1 ].toFixed( 1 ) } h of calm); ${ backs } + ${ veers } of ${ sides } by them backing or veering` );
	console.log( `     the most a value moves in two game minutes: wind ${ stepMax.wind.toFixed( 2 ) } m/s, rain ${ stepMax.rain.toFixed( 3 ) }, the wind's direction ${ stepMax.angle.toFixed( 3 ) } rad (out of the eye)` );
	ok( cat1 && force >= N * 0.6 && weakest > 24, 'a Category 1: hurricane force on most passages, a strong gale on the weak side of the rest, never past 42 m/s' );
	ok( eyes === overs && overs > N * 0.2 && eyeCalm && eyeLong[ 0 ] > 0.4 && eyeLong[ 1 ] < 3, 'when its eye passes over, an hour or so of calm, dry air in it' );
	ok( flipped === eyes, 'and its wind from across the compass on the far side of the eye' );
	ok( sides > 5 && backs + veers === sides && backs > 0 && veers > 0, 'passing to one side, the wind backs through the worst of it (the island on its left) or veers (on its right)' );
	ok( stepMax.wind < 3 && stepMax.rain < 0.3 && stepMax.angle < 0.25, 'its wind, rain and wind\'s direction change over minutes, not at once (the driver eases them)' );
	ok( named, 'named a hurricane in its wall and its eye, and wherever its wind\'s a hurricane\'s' );
	ok( banded >= N * 0.8 && wallLoud === 0 && thunderDry === 0, 'its outer bands come over one after another, thundering; its eyewall seldom thunders; thunder only in heavy rain' );
	ok( outlooked === N && watchOn === N && warnOn === N && gone, 'on the outlook four days before its winds, watched for two days, warned of a day and a half, and nothing said once they\'ve gone' );
	ok( murky === 0, 'the water\'s murky for a day after its eye' );
	const fmt = ( a ) => a.map( ( [ hi, lo ] ) => `${ hi.toFixed( 2 ) }/${ lo.toFixed( 2 ) }` ).join( ' ' );
	console.log( `     (step 2) its surge, highest/lowest (m): on its left ${ fmt( surges.left ) }; on its right ${ fmt( surges.right ) }; its eye over ${ fmt( surges.over ) }` );
	console.log( `     the bay's surf at the worst with the island on its right (the wind blowing out): ${ quietBay.map( ( v ) => v.toFixed( 2 ) ).join( ' ' ) } m; the surge moves at most ${ ( stepMax.surge * 100 ).toFixed( 1 ) } cm in two game minutes` );
	ok( capped, '(step 2) its surf, swell, period and surge within their bounds' );
	ok( surges.left.length > 3 && surges.left.every( ( [ hi ] ) => hi > 0.4 ) && surges.right.length > 3 && surges.right.every( ( [ hi, lo ] ) => hi < 0.3 && lo < - 0.3 ) && surges.over.every( ( [ hi, lo ] ) => hi > 0.15 && lo < 0 ), 'its surge piles the sea into the bay on its left, draws it out on its right; over its eye, up then down' );
	ok( quietBay.length >= 2 && quietBay.every( ( v ) => v < 0.9 ), 'the bay in the lee while its wind blows out of it' );
	console.log( `     its highest, known before it comes, within ${ ( Math.max( ...peaked ) * 100 ).toFixed( 1 ) } cm` );
	ok( stepMax.surge < 0.05 && peaked.every( ( d ) => d < 0.03 ), 'the surge comes and goes over hours (a metre a game hour at most); its highest is known before it comes' );

	// on your own: one picked comes straight over, its eye passing over in a few game hours
	const since = 2000.25, P = ( t ) => weatherAt( since + t, 'hurricane', since );
	let pickEye = false, pickPeak = 0;
	for ( let t = 0; t < 12; t += 0.05 ) {

		pickPeak = Math.max( pickPeak, P( t ).wind );
		if ( P( t ).eye > 0.99 && P( t ).wind < 6 ) pickEye = true;

	}

	const later = P( 110 ), fair = weatherAt( since + 110, 'fair' );
	ok( P( 0 ).wind >= TS_WIND && P( 0 ).hurricane === 1 && pickEye && pickPeak >= HURRICANE_WIND && hurricaneNews( since, 'hurricane', since ).stage === 'warning', 'a picked hurricane comes straight in: its gales, its wall, its eye' );
	ok( KEYS.every( ( k ) => later[ k ] === fair[ k ] ) && later.id === 'fair' && hurricaneNews( since + 110, 'hurricane', since ) === null, 'and once it\'s gone, a fair day again exactly' );
	ok( forecast( since, 12, 'hurricane', since ) !== null && forecast( since, 12, 'gale' ) === null && hurricaneNews( since, 'gale' ) === null, 'it passes, so it has a forecast (a held pick still has none)' );

	// (step 3) how far you see in it: its rain's and its spray's haze (3 / their extinction, m)
	const seen = ( w, inland = 0 ) => {

		const k = w.rainHaze + w.sprayHaze * ( 1 - 0.55 * inland );
		return k > 0 ? 3 / k : Infinity;

	};
	let wall = Infinity, wallIn = Infinity, band = [ Infinity, 0 ], eyeSeen = Infinity, clear = true;
	for ( let t = 0; t < 14; t += 0.05 ) {

		const w = P( t );
		if ( w.wind > HURRICANE_WIND && w.rain > 0.9 ) {

			wall = Math.min( wall, seen( w ) );
			wallIn = Math.min( wallIn, seen( w, 1 ) );

		}

		if ( w.wind < 22 && w.wind > 15 && w.rain > 0.8 ) band = [ Math.min( band[ 0 ], seen( w ) ), Math.max( band[ 1 ], seen( w ) ) ];
		if ( w.eye > 0.99 ) eyeSeen = Math.min( eyeSeen, seen( w ) );

	}

	for ( let T = 30; T < 24 * 60; T += 0.5 ) if ( ! hurricaneAt( T ) && ( dayWeatherAt( T ).rainHaze !== 0 || dayWeatherAt( T ).sprayHaze !== 0 ) ) clear = false;
	console.log( `     (step 3) seen in its wall ${ wall.toFixed( 0 ) } m at the shore, ${ wallIn.toFixed( 0 ) } m inland; under its rain ${ band[ 0 ].toFixed( 0 ) } to ${ band[ 1 ].toFixed( 0 ) } m; in its eye ${ eyeSeen > 1e5 ? 'clear' : eyeSeen.toFixed( 0 ) + ' m' }` );
	// (step 4) the island boarded up for it: from a while before its winds until a while after
	const n0 = hurricaneNews( since, 'hurricane', since );
	let boardedRight = true;
	for ( let T = since - 30; T < n0.ends + 20; T += 0.25 ) {

		const want = T >= n0.onset - 12 && T < n0.ends + 6;
		if ( ( P( T - since ).boarded === 1 ) !== want ) boardedRight = false;

	}

	ok( boardedRight && dayWeatherAt( 3000 ).boarded === 0, '(step 4) boarded up from 12 game hours before its winds until 6 after; never on another day' );
	ok( wall < 100 && wallIn > wall * 1.5 && wallIn < 300 && band[ 0 ] > 400 && band[ 1 ] < 2000 && eyeSeen > 5000 && clear, 'in its wall under 100 m seen at the shore, more inland; under its rain the better part of a km; its eye clear; no haze of it on another day' );

}

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
