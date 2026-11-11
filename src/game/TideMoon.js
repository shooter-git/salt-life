import { SYNODIC, TIDE, moonAt, timeText, tideTurns } from './IslandClock.js';
import { stageOf, tideBites, tidesOf, datumFeet, DATUMS } from '../world/shore/Tide.js';
import { spawning, FLATS_FISH } from './Flats.js';
import { FISH } from './FishTable.js';
import { depthWeight, FLOAT } from './Bites.js';
import { hatchingsOf, seaGlow } from './Turtles.js';
import { moonSky, nightOf } from '../sky/Moon.js';
import { FT } from './Units.js';

// (after M17) The tide and the moon as the clock tells them (game/TimeHUD.js): the night's moon drawn at its phase, a
// marker for the tide by the time, and the clock's panel's "Tide and moon": the day's tides, springs or neaps, the moon
// by name, whether tonight's dark or bright, and what they're doing in the game just now. Every number and every
// "just now" is worked out from the game's own rules, not copies of them: the tide's stages and bites by place
// (world/shore/Tide.js), the bonefish's spawning (Flats.spawning), the swordfish's depths by the moon (Bites.depthWeight
// on FishTable's), the hatchlings' sea glow (Turtles.seaGlow) and the sky's moon (sky/Moon.js). So the panel can't say
// one thing while the game does another. Pure (no DOM), for the tests under Node.
//   moonName( phase ) -> 'Waxing gibbous'           springsOf( T ) -> { kind: 'springs' | 'neaps' | 'between', toward }
//   moonFace( T, hour ) -> { lit, angle, up }        moonIcon( face ) -> '<svg ...>' (the clock's night icon)
//   tideMarker( T, locale ) -> { dir: 'up' | 'down' | 'slack', text: 'high 9:24 AM', label }
//   moonNext( T ) -> { full, days, when, text: 'full moon in 3 days' }
//   tonight( T, locale ) -> { word: 'dark' | 'moonlit' | 'bright', rest: ', the moon up all night' }
//   nowLines( T, locale ) -> [ "Slack water: the pier's fishing well", ... ]
//   tideMoon( T, locale ) -> all the panel's section says

// ---- the moon

// a principal phase (new, the quarters, full) is named within this many days of it, as an almanac names its day's moon
// and people call the night before and after a full moon's "the full moon"; between them, a crescent or a gibbous moon
export const NAMED_DAYS = 1;
const NAMES = [ 'New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent' ];
const frac = ( x ) => ( ( x % 1 ) + 1 ) % 1;

export function moonName( phase ) {

	const p = frac( phase ), q = Math.round( p * 4 );
	if ( Math.abs( p - q / 4 ) * SYNODIC <= NAMED_DAYS ) return NAMES[ ( q % 4 ) * 2 ];
	return NAMES[ Math.floor( p * 4 ) * 2 + 1 ];

}

// the next new or full moon after T: which, in how many days, and that said ('full moon in 3 days', 'new moon tonight';
// 'exactly full tomorrow' once it's called the full moon)
export function moonNext( T ) {

	const m = moonAt( T ), toFull = frac( 0.5 - m.phase ) * SYNODIC, toNew = frac( 1 - m.phase ) * SYNODIC;
	const full = toFull < toNew, days = Math.min( toFull, toNew ), at = T + days * 24;
	const d = Math.floor( at / 24 ) - Math.floor( T / 24 );
	const when = d === 0 ? ( at % 24 >= 18 ? 'tonight' : 'today' ) : d === 1 ? 'tomorrow' : `in ${ d } days`;
	// (named already, within NAMED_DAYS of it: exactly full, or new, when)
	const named = moonName( m.phase ) === ( full ? 'Full moon' : 'New moon' );
	return { full, days, when, text: named ? `exactly ${ full ? 'full' : 'new' } ${ when }` : `${ full ? 'full' : 'new' } moon ${ when }` };

}

// the moon as it hangs in the island's sky at T (hour: the hour of the day), for the clock's icon: how much of it's lit
// (the sky's: Moon.moonSky), which way its lit side faces (angle, degrees: 0 its right as you look at it, 90 up; toward
// the sun, so at the island's latitude a crescent lies tilted), and whether it's up (as its light is: Moon.throughAir)
const _sky = {};
export function moonFace( T, hour, out = {} ) {

	const m = moonSky( T, hour, 0, _sky ), d = m.dir, s = m.sun;
	// (up on its disc: the zenith, square to the way to it; near the zenith, its north)
	let ux = - d[ 1 ] * d[ 0 ], uy = 1 - d[ 1 ] * d[ 1 ], uz = - d[ 1 ] * d[ 2 ];
	let ul = Math.hypot( ux, uy, uz );
	if ( ul < 1e-3 ) {

		[ ux, uy, uz ] = m.north;
		ul = 1;

	}

	ux /= ul;
	uy /= ul;
	uz /= ul;
	// (its right, as you face it: the way to it across up)
	const rx = d[ 1 ] * uz - d[ 2 ] * uy, ry = d[ 2 ] * ux - d[ 0 ] * uz, rz = d[ 0 ] * uy - d[ 1 ] * ux;
	const sd = s[ 0 ] * d[ 0 ] + s[ 1 ] * d[ 1 ] + s[ 2 ] * d[ 2 ];
	const px = s[ 0 ] - sd * d[ 0 ], py = s[ 1 ] - sd * d[ 1 ], pz = s[ 2 ] - sd * d[ 2 ];
	out.angle = Math.atan2( px * ux + py * uy + pz * uz, px * rx + py * ry + pz * rz ) * 180 / Math.PI;
	out.lit = m.lit;
	out.phase = m.phase;
	out.up = d[ 1 ] > - 0.01;
	out.alt = Math.asin( Math.max( - 1, Math.min( 1, d[ 1 ] ) ) ) * 180 / Math.PI;
	return out;

}

// under this much lit it's drawn as a new moon (a dark disc and its rim: a crescent thinner than a hair at the icon's
// size), over this much as full
export const NEW_LIT = 0.03, FULL_LIT = 0.97;

// the clock's night icon: the moon at its phase and tilt (16 units square), its dark side faint as earthshine shows it,
// dimmed when it's down (the class is-down: TimeHUD's CSS)
export function moonIcon( face ) {

	const R = 5.8, k = face.lit;
	let lit;
	if ( k < NEW_LIT ) lit = `<circle cx="8" cy="8" r="${ R - 0.45 }" fill="none" stroke="currentColor" stroke-opacity="0.8" stroke-width="0.9"/>`;
	else if ( k > FULL_LIT ) lit = `<circle cx="8" cy="8" r="${ R }" fill="currentColor"/>`;
	else {

		// (lit to the right, its limb a half circle and its terminator a half ellipse, bulging toward the limb while it's a
		// crescent and away past the quarter; then turned so the lit side faces the sun)
		const w = ( R * Math.abs( 1 - 2 * k ) ).toFixed( 2 ), sweep = k < 0.5 ? 0 : 1;
		lit = `<path d="M8 ${ 8 - R }A${ R } ${ R } 0 0 1 8 ${ 8 + R }A${ w } ${ R } 0 0 ${ sweep } 8 ${ 8 - R }z" fill="currentColor" stroke="currentColor" stroke-width="0.4" stroke-linejoin="round" transform="rotate(${ Math.round( - face.angle ) } 8 8)"/>`;

	}

	return `<svg viewBox="0 0 16 16" aria-hidden="true" class="gm-moon${ face.up ? '' : ' is-down' }"><circle cx="8" cy="8" r="${ R }" fill="currentColor" fill-opacity="0.2"/>${ lit }</svg>`;

}

// ---- the tide

// the tide's age: how long after new and full moon its springs come (and its neaps after the quarters), from its own
// constituents: how far S2's phase lags M2's, over how much faster S2 turns (twice the moon's elongation, 720 degrees
// a month). Settlement Point's: 1.07 days
export const TIDE_AGE = ( TIDE.S2[ 1 ] - TIDE.M2[ 1 ] ) / 720 * SYNODIC;
// springs (or neaps) within this many days of their top (or bottom): four days of each in the half month, and
// "between" for the three or four days either way between them
export const SPRINGS_DAYS = 2;

// springs, neaps or between at T, and which it's making toward (the moon's distance: perigee, 1 at perigee)
export function springsOf( T ) {

	const m = moonAt( T ), p = frac( 2 * ( m.phase - TIDE_AGE / SYNODIC ) ); // (through the half month: 0 springs at their top, 0.5 neaps)
	const fromSprings = Math.min( p, 1 - p ) * SYNODIC / 2, fromNeaps = Math.abs( p - 0.5 ) * SYNODIC / 2;
	const kind = fromSprings <= SPRINGS_DAYS ? 'springs' : fromNeaps <= SPRINGS_DAYS ? 'neaps' : 'between';
	return { kind, toward: p < 0.5 ? 'neaps' : 'springs', fromSprings, fromNeaps, perigee: m.perigee };

}

// the tide's stage past this at a turn (stageOf's `turn`, the middle of its fade: within about 50 minutes of one) is
// slack water: the clock's marker says so
export const SLACK = 0.5;

// the clock's tide marker at T: rising or falling and the next turn ('high 9:24 AM'), or slack water near a turn
export function tideMarker( T, locale = undefined, stage = stageOf( T, {} ) ) {

	if ( stage.turn >= SLACK ) {

		const high = stage.high >= stage.low, which = high ? 'high' : 'low';
		return { dir: 'slack', high, text: `slack at ${ which }`, label: `Slack water at ${ which } tide` };

	}

	const up = stage.rate > 0, which = up ? 'high' : 'low', at = stage.next ? timeText( stage.next.T % 24, locale, 1 ) : '';
	return { dir: up ? 'up' : 'down', high: up, text: `${ which } ${ at }`, label: `Tide ${ up ? 'rising' : 'falling' }, ${ which } at ${ at }` };

}

// ---- tonight

// tonight: from dark (7 PM) to the first of the dawn (5 AM) of the night that's on, or that's coming once it's past 5 AM;
// sampled every quarter hour. Bright once its light on level ground is a fifth of a full moon's high in the sky (a
// gibbous moon's, at the opposition surge's steep end: Moon.phaseLight), moonlit from a thirtieth (a quarter moon's
// part way up), dark under that
export const NIGHT = [ 19, 29 ], BRIGHT = 0.2, MOONLIT = 0.03;
const STEP = 0.25, _n = {};

export function tonight( T, locale = undefined ) {

	const day = Math.floor( T / 24 ), hour = T - day * 24;
	const eve = ( hour < NIGHT[ 1 ] - 24 ? day - 1 : day ) * 24, from = Math.max( T, eve + NIGHT[ 0 ] ), to = eve + NIGHT[ 1 ];
	let rise = null, set = null, peak = 0, upN = 0, n = 0, first = null, last = null, py = 0;
	for ( let t = from; t <= to + 1e-9; t += STEP ) {

		nightOf( t, t % 24, _n );
		const y = _n.up + 0.01, up = y > 0;
		if ( n && up !== ( py > 0 ) ) {

			const at = t - STEP + STEP * py / ( py - y );
			if ( up && rise === null ) rise = at;
			if ( ! up && set === null ) set = at;

		}

		if ( up ) {

			upN ++;
			peak = Math.max( peak, _n.full );

		}

		if ( first === null ) first = up;
		last = up;
		py = y;
		n ++;

	}

	const word = upN === 0 || peak < MOONLIT ? 'dark' : peak >= BRIGHT ? 'bright' : 'moonlit';
	const at = ( t ) => timeText( t % 24, locale, 5 );
	let rest;
	if ( upN === 0 ) rest = moonAt( eve + 24 ).lit < NEW_LIT ? ', a new moon' : ', no moon up';
	else if ( first && last && set === null ) rest = word === 'dark' ? ', only a thin moon' : ', the moon up all night';
	else if ( first && set !== null ) rest = word === 'dark' ? `, only a thin moon until ${ at( set ) }` : ` until the moon sets at ${ at( set ) }, then dark`;
	else if ( rise !== null && ( set === null || set < rise ) ) return { word: 'dark', then: word, rest: ` until the moon rises at ${ at( rise ) }${ word === 'dark' ? '' : `, then ${ word }` }` };
	else rest = `, the moon up from ${ at( rise ) } until ${ at( set ) }`;
	return { word, then: word, rest };

}

// ---- right now

// bites this much faster than they always came there (Tide.tideBites: 1): fishing well
export const WELL = 1.25;
const NOWHERE = { mouth: 0, channel: 0, edge: 0, flat: 0 };
// [ Tide.TIDE_BITES' place, as it's said, plural ]
const PLACES = [ [ 'pier', 'the pier', false ], [ 'flat', 'the flats', true ], [ 'mouth', 'the creek mouths', true ], [ 'edge', 'the flats\' edge', false ], [ 'channel', 'the creeks', true ] ];

// how fast the bites come at each place at the tide's stage, by Tide.tideBites: [ [ place, x ] ], best first
export function tideBitesNow( stage ) {

	return PLACES.map( ( [ k ] ) => [ k, k === 'pier' ? tideBites( NOWHERE, stage, 1 ) : tideBites( { ...NOWHERE, [ k ]: 1 }, stage ) ] ).sort( ( a, b ) => b[ 1 ] - a[ 1 ] );

}

const said = ( k ) => PLACES.find( ( p ) => p[ 0 ] === k );
const list = ( a ) => a.length < 2 ? a.join( '' ) : `${ a.slice( 0, - 1 ).join( ', ' ) } and ${ a[ a.length - 1 ] }`;

// the tide's line: where it's fishing well and why ('On the ebb: the creek mouths, the flats' edge and the creeks are
// fishing well'), or, with nowhere, when somewhere next will be
function tideLine( T, stage, locale ) {

	const lead = stage.turn >= SLACK ? 'Slack water' : stage.rate > 0 ? 'On the flood' : 'On the ebb';
	const well = tideBitesNow( stage ).filter( ( [ , x ] ) => x >= WELL ).slice( 0, 3 ).map( ( [ k ] ) => said( k ) );
	if ( well.length ) return `${ lead }: ${ list( well.map( ( p ) => p[ 1 ] ) ) }${ well.length === 1 && ! well[ 0 ][ 2 ] ? '\'s' : ' are' } fishing well`;
	// (nowhere just now: the next place to, within the tide's next turn and a bit)
	const s = {};
	for ( let t = T + 1 / 6; t < T + 7; t += 1 / 6 ) {

		const best = tideBitesNow( stageOf( t, s ) )[ 0 ];
		if ( best[ 1 ] >= WELL ) {

			const p = said( best[ 0 ] );
			return `${ lead }: ${ p[ 1 ] } ${ p[ 2 ] ? 'fish' : 'fishes' } well from about ${ timeText( t % 24, locale, 5 ) }`;

		}

	}

	return '';

}

// the low water nearest T, while it's about low water (the stage's `low`), if it's a minus tide: under chart datum
// (mean lower low water, Tide.DATUMS), as a spring's lows are, the more so with the moon near; more of the flats bared
// than at most lows
function lowLine( T, stage ) {

	if ( stage.low < 0.5 ) return '';
	let low = null;
	for ( const t of tideTurns( T - 7, T + 7 ) ) if ( ! t.high && ( ! low || Math.abs( t.T - T ) < Math.abs( low.T - T ) ) ) low = t;
	const ft = low ? datumFeet( low.height ) : '0';
	if ( ! ( Number( ft ) < 0 ) ) return '';
	return `A minus tide, ${ ft } ft: more of the flats bared than at most lows`;

}

// the bonefish's spawning: on now, or the next dusk they gather within a few days (Flats.spawning, at a quarter hour's step)
export function spawnNext( T, days = 3 ) {

	if ( spawning( T ) ) return { now: true, T };
	for ( let t = Math.ceil( T * 4 ) / 4; t < T + days * 24; t += 0.25 ) if ( spawning( t ) ) return { now: false, T: t };
	return null;

}

function spawnLine( T, locale ) {

	const s = spawnNext( T );
	if ( ! s ) return '';
	const S = FLATS_FISH.spawn, at = ( h ) => timeText( h, locale, 30 );
	// (each said in two lines or less at a phone's width, upright: the moon they gather by is the Moon part's and Effects')
	if ( s.now ) return `Bonefish gathered off the flats' edge to spawn, until about ${ at( S.to ) }`;
	const d = Math.floor( s.T / 24 ) - Math.floor( T / 24 );
	if ( d > 2 ) return '';
	if ( d === 0 ) return `Bonefish gather to spawn off the flats' edge tonight, from about ${ at( s.T % 24 ) }`;
	return `Bonefish gather to spawn off the flats' edge at dusk: ${ d === 1 ? 'tomorrow' : 'in 2 days' }`;

}

// the swordfish tonight: how far up toward a float (Bites.FLOAT) they come under tonight's moon, of a dark night's
// (Bites.depthWeight on the swordfish's depths, at midnight, by how much of the moon's lit as the game reckons it then)
export function swordfishShare( T ) {

	const day = Math.floor( T / 24 ), hour = T - day * 24, mid = ( hour < 12 ? day : day + 1 ) * 24;
	const at = FISH.swordfish.at, lit = moonAt( mid ).lit;
	return depthWeight( at, FLOAT.depth, 0, lit ) / depthWeight( at, FLOAT.depth, 0, 0 );

}

// (said when it's well off a dark night's, or as good as one)
export const SWORD = { deeper: 0.7, dark: 0.97 };
function swordLine( T ) {

	const share = swordfishShare( T );
	if ( share <= SWORD.deeper ) return `Swordfish deeper under tonight's moon: about ${ Math.round( share * 10 ) * 10 }% of dark-night bites on a float`;
	if ( share >= SWORD.dark ) return 'A dark night for the swordfish: up near the top, in a float\'s reach';
	return '';

}

// a nest on the north beach hatching tonight (Turtles.hatchingsOf) on a dark night: the sea's horizon then (seaGlow: of a
// moonless night's) under GLOW, where a light on the sand pulls them hardest
export const GLOW = 2;
function hatchLine( T ) {

	const day = Math.floor( T / 24 ) + 1, hour = T - ( day - 1 ) * 24;
	let soon = null;
	for ( const h of hatchingsOf( hour < 12 ? day - 1 : day ) ) {

		const t = ( h.day - 1 ) * 24 + h.hour;
		if ( t > T - 0.2 && t < T + 12 && ( soon === null || t < soon ) ) soon = t;

	}

	if ( soon === null || seaGlow( soon, soon % 24 ) >= GLOW ) return '';
	return 'Hatchlings on the north beach this dark night: a light on the sand draws them off';

}

// what the tide and the moon are doing in the game just now (or tonight), the nearest first: at most `most`
export function nowLines( T, locale = undefined, most = 3, stage = stageOf( T, {} ) ) {

	const hour = ( ( T % 24 ) + 24 ) % 24, evening = hour >= 17 || hour < NIGHT[ 1 ] - 24;
	const lines = [ tideLine( T, stage, locale ), lowLine( T, stage ), spawnLine( T, locale ) ];
	if ( evening ) lines.push( hatchLine( T ), swordLine( T ) );
	return lines.filter( Boolean ).slice( 0, most );

}

// ---- the panel's section, all of it

export function tideMoon( T, locale = undefined ) {

	const day = Math.floor( T / 24 ) + 1, hour = T - ( day - 1 ) * 24, stage = stageOf( T, {} );
	const turns = tidesOf( day ), next = turns.find( ( t ) => t.T > T );
	const tides = turns.map( ( t ) => ( { high: t.high, time: timeText( t.T % 24, locale, 1 ), feet: datumFeet( t.height ), past: t.T <= T, next: t === next } ) );
	const range = turns.length ? ( Math.max( ...turns.map( ( t ) => t.height ) ) - Math.min( ...turns.map( ( t ) => t.height ) ) ) / FT : 0;
	const m = moonAt( T ), sp = springsOf( T );
	return {
		marker: tideMarker( T, locale, stage ),
		next: stage.next ? { high: stage.next.high, time: timeText( stage.next.T % 24, locale, 1 ), feet: datumFeet( stage.next.height ), in: stage.next.T - T } : null,
		tides,
		springs: { ...sp, range: range.toFixed( 1 ) },
		moon: { name: moonName( m.phase ), lit: Math.round( m.lit * 100 ), next: moonNext( T ), face: moonFace( T, hour ) },
		tonight: tonight( T, locale ),
		now: nowLines( T, locale, 3, stage ),
	};

}

// what the tide and the moon do in the game, as the panel says it: each said from the game's own rules (test/tide-moon.mjs
// holds them to Tide.TIDE_BITES and the rest)
export const WHAT_THEY_DO = [
	'The flats fish on the <b>flood</b> and about <b>high water</b>; their <b>edge</b>, <b>creeks</b> and a creek\'s <b>mouth</b> on the <b>ebb</b>; the pier at the <b>turn</b>.',
	`<b>Springs</b>, ${ TIDE_AGE < 1.5 ? 'a day' : `${ Math.round( TIDE_AGE ) } days` } after new and full moon, rise highest and fall lowest: a spring low bares more of the flats.`,
	'<b>Swordfish</b> come up near the top on dark nights, and stay deeper under a bright moon.',
	`<b>Bonefish</b> gather to spawn off the flats' edge at dusk, up to ${ FLATS_FISH.spawn.days } days either side of new and full moon.`,
	'On a <b>dark night</b> a light on the beach draws <b>hatchlings</b> off their way to the sea.',
];
