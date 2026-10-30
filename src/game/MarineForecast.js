import { weatherAt, withEdge, seaHeight, towardOf, EDGE } from './Weather.js';
import { FT, KT } from './Units.js';

// (M15) The coastal waters forecast, as the weather radio at the helm reads it (Radio.js): NOAA Weather
// Radio's broadcast on WX1, read by its computer voice and looped, in the National Weather Service's words
// and order. From the island's weather alone (Weather.js), so it's the same for everyone and comes true:
//   - who it is and when it was issued; a hurricane's statement while one's on the outlook, watched for or
//     warned of (Weather.hurricaneNews); else a line on how the wind's going (a synopsis);
//   - for each zone (ZONES): the island's waters out 8 nautical miles (14 km: the far grounds, the bank and
//     the hump in them), then the waters beyond (the soft edge: Weather.withEdge's fresher trades, as
//     the Weather Service's offshore waters are rougher than its coastal ones);
//   - its headline (ADVISORY: small craft should exercise caution, a small craft advisory, a gale warning, a
//     hurricane's watch or warning), then each period (periodsFrom: today, tonight, tomorrow; this afternoon
//     after noon, the rest of tonight before dawn): the wind's direction to eight points and its speed in a
//     5-knot band ('Northwest winds 10 to 15 knots'), and how it changes through the period; the seas in feet
//     (the significant wave height of the sea that's drawn: Weather.seaHeight) and their dominant period; the
//     showers (isolated, scattered, likely) and the thunderstorms.
//   broadcast( T, { pick, since, news } ) -> [ sentence, ... ]   (each a caption, read in turn)

const NM = 1852; // m in a nautical mile
export const ZONES = [
	{ name: `the island's waters, out ${ Math.round( EDGE.from / NM ) } nautical miles`, edge: 0 },
	{ name: `the waters beyond ${ Math.round( EDGE.from / NM ) } nautical miles`, edge: 1 },
];
// the headlines (knots, and feet of sea): a small craft advisory from 20 knots or 7 feet (the Weather Service's
// Key West office's own words), a gale warning from 34 knots, a storm warning from 48; small craft should
// exercise caution from 15 knots or 6 feet (the phrase is Key West's; these two figures the usual practice,
// not found in its words)
export const ADVISORY = { caution: [ 15, 6 ], advisory: [ 20, 7 ], gale: 34, storm: 48 };
// a sample an hour (and the period's first) for each period, and how many periods are read
const PERIODS = 3;
// rain past this counts as a shower in an hour; thunder past this, a thunderstorm
const SHOWER = 0.15, THUNDER = 0.3;

const POINTS8 = [ 'north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest' ];
const upper = ( t ) => t.charAt( 0 ).toUpperCase() + t.slice( 1 );
const hourOf = ( T ) => ( ( T % 24 ) + 24 ) % 24;

// the hour as it's read ('9 a.m.', '12 noon', '12 midnight')
export function spokenHour( hour ) {

	const h = Math.floor( hourOf( hour ) );
	if ( h === 0 ) return '12 midnight';
	if ( h === 12 ) return '12 noon';
	return `${ h % 12 } ${ h < 12 ? 'a.m.' : 'p.m.' }`;

}

// the periods read from island time T: [ { name, t0, t1, night } ] (island time)
export function periodsFrom( T ) {

	const h = hourOf( T ), d = T - h;
	const list = h < 6 ? [ [ 'rest of tonight', T, d + 6, true ], [ 'today', d + 6, d + 18 ], [ 'tonight', d + 18, d + 30, true ], [ 'tomorrow', d + 30, d + 42 ] ]
		: h < 12 ? [ [ 'today', T, d + 18 ], [ 'tonight', d + 18, d + 30, true ], [ 'tomorrow', d + 30, d + 42 ], [ 'tomorrow night', d + 42, d + 54, true ] ]
			: h < 18 ? [ [ 'this afternoon', T, d + 18 ], [ 'tonight', d + 18, d + 30, true ], [ 'tomorrow', d + 30, d + 42 ], [ 'tomorrow night', d + 42, d + 54, true ] ]
				: [ [ 'tonight', T, d + 30, true ], [ 'tomorrow', d + 30, d + 42 ], [ 'tomorrow night', d + 42, d + 54, true ] ];
	return list.slice( 0, PERIODS ).map( ( [ name, t0, t1, night = false ] ) => ( { name, t0, t1, night } ) );

}

// where a wind blowing toward ( x, y ) comes from, to eight points
function fromWords( x, y ) {

	const b = Math.atan2( - x, y ) / ( Math.PI * 2 ) * 8; // (Weather.windFrom's, to 8)
	return POINTS8[ ( ( Math.round( b ) % 8 ) + 8 ) % 8 ];

}

// a wind (knots) as its band is read: '10 to 15 knots' (the band about it), or null when it's light
function band( kt ) {

	if ( kt < 6 ) return null;
	const lo = 5 * Math.max( 1, Math.round( ( kt - 2.5 ) / 5 ) );
	return [ lo, lo + 5 ];

}

// the weather through a period in a zone: samples an hour, the zone's own (out past the far grounds, the soft
// edge's at full)
function sample( p, zone, pick, since ) {

	const out = [];
	for ( let t = p.t0; t < p.t1; t = Math.floor( t ) + 1 ) {

		const w = { ...weatherAt( t, pick, since ) };
		if ( zone.edge ) withEdge( w, EDGE.full, 0 );
		out.push( w );

	}

	return out;

}

// a period's words in a zone, and its strongest wind (kt) and highest seas (ft) for the headline
export function periodText( p, zone, pick = null, since = 0, first = false ) {

	const s = sample( p, zone, pick, since );
	// (the wind: its way from the mean of where it blows, by its speed; its band in each half)
	let vx = 0, vy = 0;
	for ( const w of s ) {

		const d = towardOf( w.windAngle );
		vx += d.x * w.wind;
		vy += d.y * w.wind;

	}

	const half = Math.max( 1, Math.floor( s.length / 2 ) ), mean = ( a ) => a.reduce( ( t, w ) => t + w.wind, 0 ) / a.length / KT;
	const early = band( mean( s.slice( 0, half ) ) ), late = band( mean( s.slice( half ) ) ) || early;
	const dir = upper( fromWords( vx, vy ) );
	const later = p.name === 'this afternoon' ? 'late this afternoon' : p.name === 'rest of tonight' ? 'toward dawn' : p.night ? 'after midnight' : 'in the afternoon';
	let wind;
	if ( ! early && ! late ) wind = 'Variable winds 5 knots or less.';
	else if ( ! early ) wind = `Variable winds 5 knots or less, becoming ${ dir.toLowerCase() } ${ late[ 0 ] } to ${ late[ 1 ] } knots ${ later }.`;
	else if ( late[ 0 ] !== early[ 0 ] ) wind = `${ dir } winds ${ early[ 0 ] } to ${ early[ 1 ] } knots, ${ late[ 0 ] > early[ 0 ] ? 'increasing' : 'diminishing' } to ${ late[ 0 ] } to ${ late[ 1 ] } knots ${ later }.`;
	else wind = `${ dir } winds ${ early[ 0 ] } to ${ early[ 1 ] } knots.`;
	// (the seas: the sea that's drawn, its significant height, in a foot's band; its period on the first)
	const ft = s.map( ( w ) => seaHeight( w.swell, w.windSea ) / FT );
	const lo = Math.min( ...ft ), hi = Math.max( ...ft );
	const a = Math.max( 1, Math.round( lo - 0.4 ) ), b = Math.max( a + 1, Math.round( hi + 0.4 ) );
	const seas = hi < 2.2 ? 'Seas 2 feet or less.' : `Seas ${ a } to ${ b } feet.`;
	const period = first ? ` Dominant period ${ Math.round( s[ 0 ].period ) } seconds.` : '';
	// (the showers: how many of its hours have one; a thunderstorm in any)
	const wet = s.filter( ( w ) => w.rain >= SHOWER ).length / s.length, thunder = s.some( ( w ) => w.thunder >= THUNDER );
	const what = thunder ? 'showers and thunderstorms' : 'showers';
	const rain = wet <= 0 ? '' : wet <= 0.25 ? ` Isolated ${ what }.` : wet <= 0.55 ? ` Scattered ${ what }.` : wet <= 0.8 ? ` ${ upper( what ) } likely.` : ` ${ upper( what ) }.`;
	const near = thunder ? ' Winds and seas higher in and near thunderstorms.' : '';
	const most = Math.max( ...s.map( ( w ) => w.wind / KT ) );
	return { text: `${ upper( p.name ) }: ${ wind } ${ seas }${ period }${ rain }${ near }`, kt: most, ft: hi };

}

// a zone's headline from its periods' worst (and a hurricane's watch or warning), or ''
export function headline( kt, ft, news = null ) {

	if ( news && news.stage === 'warning' ) return 'A hurricane warning is in effect.';
	if ( news && news.stage === 'watch' ) return 'A hurricane watch is in effect.';
	if ( kt >= ADVISORY.storm ) return 'A storm warning is in effect.';
	if ( kt >= ADVISORY.gale ) return 'A gale warning is in effect.';
	if ( kt >= ADVISORY.advisory[ 0 ] || ft >= ADVISORY.advisory[ 1 ] ) return 'A small craft advisory is in effect.';
	if ( kt >= ADVISORY.caution[ 0 ] || ft >= ADVISORY.caution[ 1 ] ) return 'Small craft should exercise caution.';
	return '';

}

// what's said of a hurricane on its way (Weather.hurricaneNews's), at T
function hurricaneText( news, T ) {

	const cat = news.cat ? `A category ${ news.cat } hurricane` : 'A hurricane';
	const from = POINTS8[ Math.round( Math.max( 0, [ 'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW' ].indexOf( news.from ) ) / 2 ) % 8 ];
	const hours = news.onset - T;
	if ( news.stage === 'outlook' ) return `${ cat } is being watched far out to the ${ from }. It may affect the island and its waters in the days ahead.`;
	const when = hours > 30 ? 'within two days' : hours > 18 ? 'within a day and a half' : hours > 1 ? `within ${ Math.ceil( hours ) } hours` : 'now';
	const stage = news.stage === 'watch' ? 'A hurricane watch is in effect for the island and its waters.' : 'A hurricane warning is in effect for the island and its waters.';
	return `${ stage } ${ cat } is approaching from the ${ from }. Tropical storm force winds are expected ${ when }. Small craft should remain in port.`;

}

// how the wind's going, as a synopsis says it: building, easing, or holding (in its strength's words)
function synopsis( T, pick, since ) {

	const now = weatherAt( T, pick, since ).wind / KT;
	let most = now, least = now;
	for ( let t = T + 1; t <= T + 24; t ++ ) {

		const kt = weatherAt( t, pick, since ).wind / KT;
		most = Math.max( most, kt );
		least = Math.min( least, kt );

	}

	const strength = ( kt ) => kt < 8 ? 'light' : kt < 16 ? 'moderate' : kt < 22 ? 'fresh' : 'strong';
	if ( most >= now + 7 ) return `Winds and seas will build over the next day, to ${ strength( most ) } winds.`;
	if ( least <= now - 7 ) return 'Winds and seas will subside over the next day.';
	return `${ upper( strength( now ) ) } winds will continue through tomorrow.`;

}

// the broadcast at island time T, as its sentences
export function broadcast( T, { pick = null, since = 0, news = null } = {} ) {

	const lines = [ 'This is NOAA Weather Radio, with the forecast for the island and its coastal waters.', `The coastal waters forecast, issued at ${ spokenHour( T ).replace( /\.$/, '' ) }.` ];
	lines.push( news ? hurricaneText( news, T ) : synopsis( T, pick, since ) );
	const periods = periodsFrom( T );
	for ( const zone of ZONES ) {

		const texts = periods.map( ( p, i ) => periodText( p, zone, pick, since, i === 0 ) );
		lines.push( `For ${ zone.name }.` );
		// (the headline from the first two periods: what's here and coming)
		const head = headline( Math.max( texts[ 0 ].kt, texts[ 1 ] ? texts[ 1 ].kt : 0 ), Math.max( texts[ 0 ].ft, texts[ 1 ] ? texts[ 1 ].ft : 0 ), news && news.stage !== 'outlook' ? news : null );
		if ( head ) lines.push( head );
		for ( const t of texts ) lines.push( t.text );

	}

	return lines;

}
