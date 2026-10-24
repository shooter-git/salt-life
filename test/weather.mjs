// Plain-node tests of the island's weather (no GPU): the forecast from the island's time, its
// conditions, how it changes, and how it's read out.
import { CONDITIONS, WEATHER_IDS, WEATHER_NAMES, SURF_MAX, PERIOD_MAX, GROUNDSWELL_MAX, VEER, islandTime, storminess, cloudiness, veer, weatherAt, forecast, surfText, windFrom } from '../src/game/Weather.js';
import { knots } from '../src/game/Units.js';

let fails = 0;
const ok = ( c, msg ) => {

	if ( ! c ) { fails ++; console.log( 'FAIL', msg ); } else console.log( 'ok  ', msg );

};
const KEYS = [ 'wind', 'windAngle', 'coverage', 'overcast', 'swell', 'windSea', 'surf', 'period', 'visibility' ];

// ---- the time, and the same weather for the same time
ok( islandTime( 1, 9.5 ) === 9.5 && islandTime( 3, 0 ) === 48 && islandTime( 0, 6 ) === 6, 'island time: game hours since day 1 began' );
ok( JSON.stringify( weatherAt( 1234.567 ) ) === JSON.stringify( weatherAt( 1234.567 ) ) && storminess( 999.9 ) === storminess( 999.9 ), 'the same time gives the same weather' );

// ---- fair is the island as it always was, and day 1 is fair
const today = { wind: 7, windAngle: 0, coverage: 0.49, overcast: 0, swell: 1, windSea: 1, surf: 0.34, period: 9, visibility: 1 };
const fair = weatherAt( 100, 'fair' );
ok( fair.id === 'fair' && KEYS.every( ( k ) => fair[ k ] === today[ k ] ), 'fair: today\'s wind, cloud, sea, surf and haze exactly' );
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
	if ( w.wind < 2 || w.wind > 20.01 || Math.abs( w.windAngle ) > VEER || w.coverage < 0.3 || w.coverage > 0.93 || w.surf > SURF_MAX || w.period < 7.5 || w.period > PERIOD_MAX || w.visibility < 0.5 || w.visibility > 1.11 ) bounds = false;
	if ( ( T * 60 | 0 ) % 30 === 0 ) { count[ w.id ] ++; n ++; }
	prev = w;

}

const share = ( id ) => count[ id ] / n;
console.log( `     over ${ DAYS } days: ${ WEATHER_IDS.map( ( id ) => `${ id } ${ ( share( id ) * 100 ).toFixed( 1 ) }%` ).join( ', ' ) }` );
console.log( `     the most it moves in a game minute: ${ KEYS.map( ( k ) => `${ k } ${ jump[ k ].toFixed( 4 ) }` ).join( ', ' ) }` );
ok( bounds, 'every value stays within its conditions\' range' );
ok( jump.wind < 0.1 && jump.windAngle < 0.003 && jump.period < 0.05 && jump.coverage < 0.005 && jump.overcast < 0.005 && jump.swell < 0.01 && jump.surf < 0.004 && jump.visibility < 0.004, 'no step in a game minute, midnight included' );
ok( share( 'fair' ) + share( 'calm' ) > 0.4 && share( 'gale' ) > 0.02 && share( 'gale' ) < 0.09 && share( 'blustery' ) + share( 'gale' ) < 0.25 && WEATHER_IDS.every( ( id ) => share( id ) > 0.02 ), 'mostly fair, a gale now and then, every condition comes' );

// ---- the swell comes ahead of the gale, and the forecast sees it coming
let onsets = 0, early = 0, seen = 0;
for ( let T = 30; T < 24 * 300; T += 0.5 ) {

	if ( weatherAt( T ).id !== 'gale' || weatherAt( T - 0.5 ).id === 'gale' ) continue;
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
	if ( w.id !== 'gale' || weatherAt( T - 0.5 ).id === 'gale' ) continue;
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

console.log( fails ? `${ fails } FAILED` : 'all passed' );
process.exit( fails ? 1 : 0 );
