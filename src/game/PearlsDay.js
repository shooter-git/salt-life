import { mulberry32 } from '../util/Noise.js';
import { secondsBetween } from './IslandClock.js';
import { CONDITIONS, hurricaneNews, islandTime, lastHurricane, weatherAt } from './Weather.js';

// (M16) The fish camp's day, from the island's clock and the weather, the same for everyone as the turtles' nights
// are: where the boat is (a pirogue, world/village/Pirogue.js; game/PearlsBoat.js draws her) and which of the camp's
// lights are lit. Pure (no three.js), for the tests under Node, and for the turtles, who turn back from a light.
//   The boat, as Grenada's open trolling pirogues are in the FAO's account of its fleet: two men in her, out at 4:00
//   and back at 11:00 to noon. Not on her rest day, nor when it's blowing past what a small open boat goes out in, nor
//   with a hurricane close: she's hauled up the beach for that, and for a gale, for a jetty's face on a windward shore
//   is no place to lie in one.
//   planOf( day, pick, since ) -> { stays, why, leave, back } (hours)
//   boatAt( hour, day, pick, since, out ) -> { kind: 'alongside' | 'going' | 'away' | 'coming' | 'hauled', x, z,
//     heading (radians, as Vessel's getYaw: atan2( forward x, forward z )), speed (m/s) }
//   lightsAt( hour, day, pick, since ) -> LAMPS each with its `on` 0..1      lightsOn( ... ) -> whether any is lit

export const BOAT = {
	berth: { x: 114.3, z: - 880, heading: Math.PI }, // along the jetty's west face, bow to the sea (she comes up to it head to wind)
	off: { x: 100, z: - 896, heading: Math.PI * 0.94 }, // where she lies off while something's in her berth
	haul: { x: 130.5, z: - 830, heading: 0.07 }, // up the beach, on her rollers, bow to the land
	leave: [ 4, 4.75 ], // h (FAO: "leave 4:00 am")
	back: [ 11, 12 ], // h (FAO: "return 11:00 - 12:00")
	stayWind: 13, // m/s: she doesn't go out past this (25 knots: an open boat 24 feet long)
	haulWind: CONDITIONS.gale.wind, // m/s: she's hauled up the beach
	after: 18, // game hours after a hurricane's winds have gone that she's back in the water
	restEvery: 7, // one day in this she doesn't go out
};

// the camp's lights: kerosene, warm and dim. x, z: where each is (FishCamp builds them there, test/north-pearl.mjs holds it to that)
export const LAMPS = [
	{ id: 'lantern', x: 97.6, z: - 836.48, range: 9 }, // the hurricane lantern under the lean-to
	{ id: 'window', x: 98, z: - 834.4, range: 5 }, // a lamp in the shed, through its window and its boards
	{ id: 'fire', x: 105.2, z: - 838.6, range: 9 }, // the fire pit, some nights
];
// when each is lit (h): at dusk, out late, by each day's own hash; and again before dawn for the boat's crew, on a day she goes
const EVENING = { lantern: [ 18.05, 21, 1.6 ], window: [ 18.3, 20.4, 1.2 ], fire: [ 18.6, 20.5, 0.8 ] };
const BEFORE_DAWN = { lantern: [ 3.7, 5.9 ], window: [ 3.6, 5.2 ] };
const RAMP = 0.08; // h: a lamp's lit (a match, the wick turned up)
const FIRE = { nights: 0.35, wind: 10, rain: 0.05 }; // how often, and not in this
// where the boat goes, from her berth out, each a line through these with its corners cut; her pace along it by how far
// from the berth (m/s): dead slow up to the jetty, 21 knots on the plane (a 45 to 75 hp outboard on a 24-foot hull)
const WAY_IN = [ [ 114.3, - 880 ], [ 114.3, - 877 ], [ 113.4, - 873.4 ], [ 109, - 871.2 ], [ 102, - 871.2 ], [ 97, - 877 ], [ 96, - 892 ], [ 97, - 930 ], [ 112, - 1040 ], [ 215, - 1400 ], [ 430, - 2000 ] ];
const WAY_OUT = [ [ 114.3, - 880 ], [ 114.2, - 892 ], [ 115, - 908 ], [ 124, - 965 ], [ 175, - 1130 ], [ 330, - 1560 ], [ 560, - 2100 ] ];
const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};
export const paceIn = ( s ) => 0.4 + 1.1 * ss( 0, 14, s ) + 2.6 * ss( 45, 140, s ) + 6.7 * ss( 150, 340, s );
export const paceOut = ( s ) => 0.5 + 1.0 * ss( 0, 12, s ) + 9.3 * ss( 35, 160, s );

const hash = ( ...k ) => mulberry32( k.reduce( ( a, b ) => ( Math.imul( a ^ ( b | 0 ), 2654435761 ) + 0x9e3779b9 ) | 0, 0x3a5f91c7 ) );

// a line with its corners cut (Chaikin's), and how long it takes at a pace: [ { x, z, s, t } ]
function wayOf( pts, pace ) {

	let p = pts;
	for ( let k = 0; k < 3; k ++ ) {

		const q = [ p[ 0 ] ];
		for ( let i = 0; i < p.length - 1; i ++ ) {

			const [ ax, az ] = p[ i ], [ bx, bz ] = p[ i + 1 ];
			if ( i > 0 ) q.push( [ ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25 ] );
			if ( i < p.length - 2 ) q.push( [ ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75 ] );

		}

		q.push( p[ p.length - 1 ] );
		p = q;

	}

	const out = [];
	let s = 0, t = 0;
	for ( let i = 0; i < p.length; i ++ ) {

		if ( i ) {

			const l = Math.hypot( p[ i ][ 0 ] - p[ i - 1 ][ 0 ], p[ i ][ 1 ] - p[ i - 1 ][ 1 ] );
			// (the time along it, in steps of no more than 10 m: the pace changes over tens of m)
			const n = Math.max( 1, Math.ceil( l / 10 ) );
			for ( let j = 0; j < n; j ++ ) t += l / n / pace( s + l * ( j + 0.5 ) / n );
			s += l;

		}

		out.push( { x: p[ i ][ 0 ], z: p[ i ][ 1 ], s, t } );

	}

	return out;

}

let _in = null, _out = null;
export const wayIn = () => _in || ( _in = wayOf( WAY_IN, paceIn ) );
export const wayOut = () => _out || ( _out = wayOf( WAY_OUT, paceOut ) );

// the point on a way `t` s from the berth
function along( way, t, pace, inward, out ) {

	let lo = 0, hi = way.length - 1;
	while ( hi - lo > 1 ) {

		const m = ( lo + hi ) >> 1;
		if ( way[ m ].t <= t ) lo = m;
		else hi = m;

	}

	const a = way[ lo ], b = way[ hi ], f = Math.min( 1, Math.max( 0, ( t - a.t ) / Math.max( 1e-6, b.t - a.t ) ) );
	out.x = a.x + ( b.x - a.x ) * f;
	out.z = a.z + ( b.z - a.z ) * f;
	const s = a.s + ( b.s - a.s ) * f, dx = b.x - a.x, dz = b.z - a.z;
	out.heading = inward ? Math.atan2( - dx, - dz ) : Math.atan2( dx, dz );
	out.speed = pace( s );
	return out;

}

// ((the weather's read a few times an island's hour at most: it's the same to the half hour for a boat's plans)
const _plans = new Map();
export function planOf( day, pick = null, since = 0 ) {

	const key = `${ day }:${ pick || '' }:${ since }`;
	let p = _plans.get( key );
	if ( p ) return p;
	const r = hash( day, 61 ), lo = ( [ a, b ] ) => a + ( b - a ) * r();
	const leave = lo( BOAT.leave ), back = lo( BOAT.back ), T = islandTime( day, leave );
	// (they look at the sky before they go, and at what it's doing by mid-morning: the forecast's on the radio)
	const w = weatherAt( T, pick, since ), w2 = weatherAt( T + 5, pick, since ), news = hurricaneNews( T, pick, since );
	let why = null;
	if ( news && news.stage !== 'outlook' ) why = 'hurricane';
	else if ( Math.max( w.wind, w2.wind ) >= BOAT.stayWind || w.thunder > 0.2 ) why = 'weather';
	else if ( day % BOAT.restEvery === 0 ) why = 'rest';
	p = { day, leave, back, stays: why !== null, why };
	if ( _plans.size > 12 ) _plans.clear();
	_plans.set( key, p );
	return p;

}

// up the beach now: from a hurricane's watch till a while after it's gone, and in a gale
export function hauledAt( T, pick = null, since = 0 ) {

	const q = Math.floor( T * 2 ) / 2, news = hurricaneNews( q, pick, since );
	if ( news && news.stage !== 'outlook' ) return true;
	const h = lastHurricane( q, BOAT.after + 1, pick, since );
	if ( h && q - h.ends < BOAT.after ) return true;
	return weatherAt( q, pick, since ).wind >= BOAT.haulWind;

}

export function boatAt( hour, day, pick = null, since = 0, out = {} ) {

	const T = islandTime( day, hour );
	out.speed = 0;
	if ( hauledAt( T, pick, since ) ) {

		Object.assign( out, BOAT.haul, { kind: 'hauled' } );
		return out;

	}

	const p = planOf( day, pick, since );
	if ( ! p.stays && hour >= p.leave ) {

		const gone = secondsBetween( p.leave, day, hour, day ), W = wayOut(), I = wayIn();
		if ( gone < W[ W.length - 1 ].t ) {

			out.kind = 'going';
			return along( W, gone, paceOut, false, out );

		}

		if ( hour < p.back ) {

			const toGo = secondsBetween( hour, day, p.back, day );
			if ( toGo > I[ I.length - 1 ].t ) {

				out.kind = 'away';
				out.x = I[ I.length - 1 ].x;
				out.z = I[ I.length - 1 ].z;
				out.heading = 0;
				return out;

			}

			out.kind = 'coming';
			return along( I, toGo, paceIn, true, out );

		}

	}

	Object.assign( out, BOAT.berth, { kind: 'alongside' } );
	return out;

}

// ---- the lights
const lit = ( h, a, b ) => ss( a, a + RAMP, h ) * ( 1 - ss( b - RAMP, b, h ) );

export function lightsAt( hour, day, pick = null, since = 0, out = LAMPS.map( ( l ) => ( { ...l, on: 0 } ) ) ) {

	const T = islandTime( day, hour ), w = weatherAt( Math.floor( T * 2 ) / 2, pick, since ), news = hurricaneNews( T, pick, since );
	// (boarded up and gone, for a hurricane close; and nobody sits out in a gale)
	const gone = ( news && news.stage === 'warning' ) || w.wind >= BOAT.haulWind || w.hurricane > 0.05;
	const plan = planOf( day, pick, since ), r = hash( day, 67 );
	for ( const l of out ) {

		const e = EVENING[ l.id ], late = r();
		let on = gone ? 0 : lit( hour, e[ 0 ], e[ 1 ] + e[ 2 ] * late );
		const d = BEFORE_DAWN[ l.id ];
		if ( d && ! gone && ! plan.stays ) on = Math.max( on, lit( hour, d[ 0 ], d[ 1 ] ) );
		if ( l.id === 'fire' && ( r() >= FIRE.nights || w.rain > FIRE.rain || w.wind > FIRE.wind ) ) on = 0;
		l.on = on;

	}

	return out;

}

export const lightsOn = ( hour, day, pick = null, since = 0 ) => lightsAt( hour, day, pick, since ).some( ( l ) => l.on > 0 );
