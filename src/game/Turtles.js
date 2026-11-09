import { mulberry32 } from '../util/Noise.js';
import { secondsBetween } from './IslandClock.js';
import { moonSky, horizonOf } from '../sky/Moon.js';

// (M15) The green turtles nesting on the north beach (world/terrain/NorthBeach.js's berm) and their hatchlings:
// who comes ashore which night, when and where, the way each goes up the beach and back, and what each is doing
// at any moment, from the island's clock. Pure (no three.js), and the same from the day alone (a hash), so
// everyone in a session sees the same turtles.
//   The island has no seasons, and green turtles and hawksbills nest in every month on many tropical beaches:
//   on most nights one or two come ashore (none on some, three on a few), after dark. A third of the crawls are
//   false crawls, as on real beaches: she comes up, finds the sand wrong, turns and goes back. A nest hatches
//   50 to 60 nights after it's laid, at night: its hatchlings boil up out of the sand and run down to the sea.
//   Each turtle's at her own pace in real seconds (the night's speed-up undone: IslandClock.secondsBetween), her
//   night of it shortened as the island's days are (its night's four minutes or so): up the beach in under a
//   minute, the nest dug, laid and hidden in a minute, back to the sea in half a minute.
//   femalesOf( day ) -> the night's females { id, day, arrive (hour), x (where she lands along the beach),
//     false (a false crawl), seed }
//   planCrawl( female, ground ) -> her way up and back { up: [ [ x, z ], … ], down: [ … ], nest: [ x, z ] | null,
//     upLength, downLength } (ground( x, z ): the beach's height), landing near f.x where it's sound
//   soundCrawl( plan, ground ) -> whether it's a crawl a turtle makes (out of the surf, up to above the waves)
//   femaleAt( female, plan, hour, day ) -> null (not ashore) or { phase, t, u, s, on: 'up'|'down', … }
//   hatchingsOf( day ) -> the nests hatching that night { id, laid, hour, count, seed }
//   hatchlingsAt( hatching, plan, hour, day ) -> each hatchling's [ x, z, heading, gait ] or null when it's gone
//   tracksOf( day, hour ) -> the females whose tracks are on the sand now, and how fresh ({ female, age })
// (M16) What's added to that, none of it changing what happens with nobody about:
//   Clutch: each hatchling's own way down the beach, a thin route with the time it's at each point, from the nest
//     to the sea: where it is, and so where its track's been drawn to; drawn off by a light on the way (lure)
//   Minding: her alarm at a light on her or someone close, and turning her back if it comes to that. Each game
//     minds whoever it knows is there, so a local departure from her night, the same in both games when they see
//     the same people; turnBack and femaleAt's `turned` are that departure
//   soundBeats( prev, st ): the moments her night makes a sound (NestingTurtles.sounds)
// (M17) And the moon (docs/m17/moon.md):
//   seaGlow( T, hour ): the sea's low horizon under the moon, of a moonless night's (Moon.horizonOf): a light has to be
//     that much brighter to draw a hatchling off (Clutch.lure's `sea`). Hatchlings are misoriented most near new moon
//     (Salmon and Witherington 1995; 1992's Florida cases, Witherington et al. 2014), less the more of it's lit
//     (Stanley et al. 2020), and normal orientation came back with a full moon (Berry et al. 2013). None of them says
//     how much brighter a lamp has to be, so it's the horizon's own brightness: 25 times under a full moon high
//   Minding.kept( hour, day ) / restore( list, ground ): a turned-back turtle's night in the save (App.saveClock's
//     `turtles`), so her tracks the next morning are hers, not the clock's

export const BEACH_X = [ 88, 218 ]; // m: where along the turtle beach they land (terrain/NorthBeach.js)
export const NEST = {
	arrive: [ 19.75, 21.25 ], // h: after dark (the night's short, four minutes or so: each is back in the sea by dawn)
	perNight: [ 0.18, 0.4, 0.32, 0.1 ], // how often 0, 1, 2, 3 come ashore a night
	falseCrawl: 0.33, // of the crawls
	incubation: [ 50, 60 ], // nights from laying to hatching
	hatchHour: [ 21.0, 0.5 ], // when a nest boils over (the sand's cooled)
	clutch: [ 70, 110 ], // hatchlings that reach the surface
	trackDays: 1.4, // days a track stays on the backshore (the wind and the next night's crawls)
};
// her night's phases, real seconds (the crawls' from their lengths: CRAWL)
export const PHASES = { emerge: 5, choose: 5, pit: 14, chamber: 10, lay: 16, cover: 18, enter: 4, abort: 4 };
// her crawl: a stroke (the front flippers together: green turtles' gait) every `stroke` s, `reach` m a stroke
// in a bout of strokes, then a rest; down the beach a little quicker
export const CRAWL = { stroke: 1.0, reach: 0.42, bout: [ 6, 10 ], rest: [ 1.2, 2.4 ], downK: 1.3 };
// hatchlings: their crawl (an alternating gait, quick) and how they set off
// (spread: M16, a fan about 66 degrees across: 62 to 76 measured of green turtle hatchlings in low light, Malaysia)
export const HATCHLING = {
	speed: [ 0.14, 0.26 ], burst: [ 6, 28 ], spread: 0.68, length: 0.055,
	trackFade: [ 32, 36 ], // h after the midday before they hatched: into the next morning, gone by noon
	limit: 600, // s: however it's been led, none's still on the sand after this
};
// (M16) what troubles her, and how much it takes to turn her back (docs/m16/north.md, "The turtles, minded").
// `wary`: someone moving within this, ahead of her and behind her (m); `still`: someone standing still. The
// turtle-watching codes: 15 m while she's coming up and digging her pit, 2 m behind her at the egg chamber, and
// laying she doesn't mind at all. Each adds to her alarm while it lasts, and at 1 she goes: so a walk past isn't
// a turn back, nor a beam swept over her
export const MINDING = {
	wary: { emerge: [ 15, 7 ], up: [ 15, 7 ], choose: [ 15, 7 ], pit: [ 15, 7 ], chamber: [ 5, 2 ] },
	still: { emerge: [ 3, 1.5 ], up: [ 3, 1.5 ], choose: [ 3, 1.5 ], pit: [ 3, 1.5 ], chamber: [ 1.5, 0.8 ] },
	walk: 3, // m/s: someone walking; quicker's worse
	moving: 0.3, // m/s: under this they're standing still
	person: 0.7, // alarm a second, someone walking right on her; less as they're further off
	standing: 0.5, // alarm a second, someone standing right on her
	lightFrom: 0.03, // a light under this on her (LocalLights' units: intensity / m^2) she doesn't mind
	lightFull: 0.4, // and at this it's all it can be
	light: 0.8, // alarm a second, at its most
	behind: 0.5, // a light from behind her counts for this much of one in her eyes
	chamberLight: 0.5, // and scooping the chamber she's further gone
	decay: 0.08, // alarm a second, lost while nothing's troubling her
	startle: 1.5, // s: she stops, her head up, and turns
};
// (M16) a light on the sand and the hatchlings: at `from` it pulls as much as the sea's horizon does (45 degrees
// off their way), and they're following it once it's a third of that
// ((M17) on a moonless night; under the moon the horizon's brighter: seaGlow)
export const LURE = { from: 0.02, onto: 0.35, reach: 0.8, tick: 0.4 };

const _moon = {};
// (M17) the sea's horizon at T (hour of the day: hour), of a moonless night's
export const seaGlow = ( T, hour ) => horizonOf( moonSky( T, hour, 0, _moon ) );

const hash = ( ...k ) => mulberry32( k.reduce( ( a, b ) => ( Math.imul( a ^ ( b | 0 ), 2654435761 ) + 0x9e3779b9 ) | 0, 0x2545f491 ) );
const between = ( r, [ a, b ] ) => a + ( b - a ) * r();

export function femalesOf( day ) {

	const r = hash( day, 41 ), p = r();
	let n = 0, acc = 0;
	for ( ; n < NEST.perNight.length - 1; n ++ ) if ( p < ( acc += NEST.perNight[ n ] ) ) break;
	const out = [];
	for ( let k = 0; k < n; k ++ ) {

		const q = hash( day, 43, k );
		// (spread along the beach: never two landing within 25 m of each other)
		let x = between( q, BEACH_X );
		for ( let tries = 0; tries < 8 && out.some( ( f ) => Math.abs( f.x - x ) < 25 ); tries ++ ) x = between( q, BEACH_X );
		out.push( { id: `${ day }:${ k }`, day, k, arrive: between( q, NEST.arrive ), x, false: q() < NEST.falseCrawl, seed: Math.floor( q() * 1e9 ) } );

	}

	return out;

}

// ---- her way up the beach and back
const STEP = 0.5;

function uphill( ground, x, z, e = 2 ) {

	const gx = ground( x + e, z ) - ground( x - e, z ), gz = ground( x, z + e ) - ground( x, z - e ), l = Math.hypot( gx, gz ) || 1;
	return [ gx / l, gz / l ];

}

// a crawl that's sound: out of the surf and up the beach, through no water past its first 4 m, to a nest
// above the waves' reach (1.2 m: the berm's crest is near 2), and back down to the sea
export function soundCrawl( p, ground ) {

	const wet = ( q ) => {

		let s = 0;
		for ( let i = 1; i < q.length; i ++ ) {

			s += Math.hypot( q[ i ][ 0 ] - q[ i - 1 ][ 0 ], q[ i ][ 1 ] - q[ i - 1 ][ 1 ] );
			if ( s > 4 && ground( q[ i ][ 0 ], q[ i ][ 1 ] ) < - 0.1 && i < q.length - 6 ) return true;

		}

		return false;

	};
	const top = ground( ...p.up[ p.up.length - 1 ] );
	return p.upLength > ( p.nest ? 8 : 3 ) && p.upLength < 36 && p.downLength < 45 && top > ( p.nest ? 1.2 : 0.5 ) && ! wet( p.up ) && ! wet( p.down );

}

// her way, landing at f.x or, where that's no good, as near it as there's a sound one (7 m steps along the beach)
export function planCrawl( f, ground ) {

	let p;
	for ( const dx of [ 0, 7, - 7, 14, - 14, 21, - 21, 28, - 28 ] ) {

		p = crawlFrom( { ...f, x: f.x + dx }, ground );
		if ( soundCrawl( p, ground ) ) return p;

	}

	return p;

}

function crawlFrom( f, ground ) {

	const r = mulberry32( f.seed );
	// where she comes out: down from the slope's foot over the beach (it faces north) to where it's 0.3 m deep
	// (from the land side: the bars out in the flat aren't the beach)
	let x = f.x, z = - 790;
	while ( z > - 900 && ground( x, z ) > 2.4 ) z -= 0.5;
	while ( z > - 900 && ground( x, z ) > - 0.3 ) z -= 0.5;
	const up = [ [ x, z ] ];
	let [ dx, dz ] = uphill( ground, x, z + 3 );
	const wobble = ( r() - 0.5 ) * 0.5, curl = ( r() - 0.5 ) * 0.02;
	// up the beach face, over the crest, into the backshore: till the slope begins (or, a false crawl, partway)
	const stopAt = f.false ? 0.6 + r() * 0.9 : 1.15 + r() * 0.5;
	let past = 0, a = Math.atan2( dx, dz ) + wobble * 0.3;
	for ( let n = 0; n < 160; n ++ ) {

		a += curl + ( r() - 0.5 ) * 0.06;
		const [ ux, uz ] = uphill( ground, x, z );
		// (bending back toward the way uphill, so she doesn't walk along the beach)
		const want = Math.atan2( ux, uz );
		a += Math.atan2( Math.sin( want - a ), Math.cos( want - a ) ) * 0.08;
		const nx = x + Math.sin( a ) * STEP, nz = z + Math.cos( a ) * STEP;
		const h = ground( nx, nz ), ahead = ground( nx + Math.sin( a ) * 1.5, nz + Math.cos( a ) * 1.5 );
		// (the slope's foot: the plants, the rock: no further; in the surf, the flat's edge's no stop)
		if ( up.length > 6 && ( ahead - h > 0.45 || h > 2.6 ) ) break;
		x = nx; z = nz;
		up.push( [ x, z ] );
		if ( h > stopAt ) past += STEP;
		if ( past > ( f.false ? 0.5 : 1 + r() * 2.5 ) ) break;

	}

	// the nest: where she stopped (none on a false crawl); then round, and down a different way to the sea
	const nest = f.false ? null : [ x, z ];
	const down = downFrom( x, z, a, r, ground );
	const len = ( p ) => p.reduce( ( s, q, i ) => i ? s + Math.hypot( q[ 0 ] - p[ i - 1 ][ 0 ], q[ 1 ] - p[ i - 1 ][ 1 ] ) : 0, 0 );
	return { up, down, nest, upLength: len( up ), downLength: len( down ) };

}

// round from where she is, heading a0, and down the beach to the sea
function downFrom( x, z, a0, r, ground ) {

	const down = [ [ x, z ] ];
	const side = r() < 0.5 ? - 1 : 1, rTurn = 1.2 + r() * 1.2;
	for ( let k = 1; k <= 8; k ++ ) {

		const b = a0 + side * Math.PI * k / 8;
		x += Math.sin( b ) * rTurn * Math.PI / 8;
		z += Math.cos( b ) * rTurn * Math.PI / 8;
		down.push( [ x, z ] );

	}

	let a = a0 + side * Math.PI;
	for ( let n = 0; n < 200; n ++ ) {

		const [ ux, uz ] = uphill( ground, x, z );
		const want = Math.atan2( - ux, - uz );
		a += Math.atan2( Math.sin( want - a ), Math.cos( want - a ) ) * 0.1 + ( r() - 0.5 ) * 0.05;
		x += Math.sin( a ) * STEP;
		z += Math.cos( a ) * STEP;
		down.push( [ x, z ] );
		if ( ground( x, z ) < - 0.3 ) break;

	}

	return down;

}

// a point along a polyline, s m from its start, and the way it's going there: [ x, z, heading ]
export function along( p, s ) {

	for ( let i = 1; i < p.length; i ++ ) {

		const dx = p[ i ][ 0 ] - p[ i - 1 ][ 0 ], dz = p[ i ][ 1 ] - p[ i - 1 ][ 1 ], l = Math.hypot( dx, dz );
		if ( s <= l || i === p.length - 1 ) {

			const u = l > 0 ? Math.min( 1, Math.max( 0, s / l ) ) : 0;
			return [ p[ i - 1 ][ 0 ] + dx * u, p[ i - 1 ][ 1 ] + dz * u, Math.atan2( dx, dz ) ];

		}

		s -= l;

	}

	return [ p[ 0 ][ 0 ], p[ 0 ][ 1 ], 0 ];

}

// how far she's crawled after t s of crawling (strokes in bouts, a rest between; each stroke a lurch forward
// and a stop): [ m, the stroke's phase 0..1 (or -1 resting) ]
function crawled( t, seed, k = 1 ) {

	const r = mulberry32( seed ), stroke = CRAWL.stroke / k;
	let s = 0, time = 0;
	for ( ;; ) {

		const n = Math.round( between( r, CRAWL.bout ) ), bout = n * stroke;
		if ( t < time + bout ) {

			const u = ( t - time ) / stroke, i = Math.floor( u ), f = u - i;
			// (the lurch: quick in the middle of the stroke, still at its ends)
			return [ s + ( i + f - Math.sin( f * Math.PI * 2 ) / ( Math.PI * 2 ) ) * CRAWL.reach, f ];

		}

		time += bout;
		s += n * CRAWL.reach;
		const rest = between( r, CRAWL.rest ) / k;
		if ( t < time + rest ) return [ s, - 1 ];
		time += rest;

	}

}

// how long a crawl of len m takes
function crawlTime( len, seed, k = 1 ) {

	let lo = 0, hi = 600;
	for ( let i = 0; i < 40; i ++ ) {

		const mid = ( lo + hi ) / 2;
		if ( crawled( mid, seed, k )[ 0 ] < len ) lo = mid;
		else hi = mid;

	}

	return hi;

}

// her night, phase by phase: [ name, start s, length s ]
export function timeline( f, plan ) {

	const P = PHASES, out = [];
	let t = 0;
	const add = ( name, len ) => {

		out.push( [ name, t, len ] );
		t += len;

	};

	add( 'emerge', P.emerge );
	add( 'up', crawlTime( plan.upLength, f.seed ) );
	if ( f.false ) add( 'abort', P.abort );
	else {

		add( 'choose', P.choose );
		add( 'pit', P.pit );
		add( 'chamber', P.chamber );
		add( 'lay', P.lay );
		add( 'cover', P.cover );

	}

	add( 'down', crawlTime( plan.downLength, f.seed + 1, CRAWL.downK ) );
	add( 'enter', P.enter );
	return out;

}

// what she's doing at ( hour, day ): null before she's ashore and after she's gone. phase, t (s into it), u
// (0..1 of it), where she is ( x, z, heading; s: m along her way up or down while she's crawling), her stroke's
// phase (-1 resting), how far into her pit she's dug (0..1), how far out of the sea she is (out 0..1)
// (M16) turned: her turning back (turnBack), if she has, from when she did
export function femaleAt( f, plan, hour, day, line = timeline( f, plan ), turned = null ) {

	const t = secondsBetween( f.arrive, f.day, hour, day );
	if ( t < 0 ) return null;
	if ( turned && t >= turned.t ) return turnedAt( f, turned, t - turned.t );
	const ph = line.find( ( p ) => t < p[ 1 ] + p[ 2 ] );
	if ( ! ph ) return null;
	const [ phase, t0, len ] = ph, tt = t - t0, u = tt / len;
	const st = { phase, t: tt, u, stroke: - 1, dig: 0, out: 1 };
	const dug = { pit: u, chamber: 1, lay: 1, cover: 1 - u * 0.6 }[ phase ];
	if ( dug !== undefined ) st.dig = dug;
	if ( phase === 'emerge' ) {

		[ st.x, st.z, st.heading ] = along( plan.up, 0 );
		st.out = u;

	} else if ( phase === 'up' ) {

		const [ s, k ] = crawled( tt, f.seed );
		st.s = Math.min( s, plan.upLength );
		[ st.x, st.z, st.heading ] = along( plan.up, st.s );
		st.stroke = k;

	} else if ( phase === 'down' || phase === 'enter' ) {

		const [ s, k ] = phase === 'down' ? crawled( tt, f.seed + 1, CRAWL.downK ) : [ plan.downLength, - 1 ];
		st.s = Math.min( s, plan.downLength );
		[ st.x, st.z, st.heading ] = along( plan.down, st.s );
		st.stroke = k;
		if ( phase === 'enter' ) st.out = 1 - u;

	} else {

		// at the nest (or where she gave up): still, and turning in place while she covers it
		[ st.x, st.z, st.heading ] = along( plan.up, plan.upLength );
		if ( phase === 'cover' ) st.heading += Math.sin( u * Math.PI ) * 0.5;

	}

	return st;

}

// ---- the nests hatching tonight: the nests laid 50 to 60 nights ago, each on its own night
export function hatchingsOf( day ) {

	const out = [];
	for ( let laid = day - NEST.incubation[ 1 ]; laid <= day - NEST.incubation[ 0 ]; laid ++ ) for ( const f of femalesOf( laid ) ) {

		if ( f.false ) continue;
		const r = hash( f.seed, 97 );
		if ( laid + Math.round( between( r, NEST.incubation ) ) !== day ) continue;
		const h = between( r, [ NEST.hatchHour[ 0 ], NEST.hatchHour[ 1 ] + 24 ] );
		out.push( { id: f.id, laid, female: f, hour: h % 24, day: h >= 24 ? day + 1 : day, count: Math.round( between( r, NEST.clutch ) ), seed: Math.floor( r() * 1e9 ) } );

	}

	return out;

}

// ---- (M16) each hatchling's way: a route of k + 1 points ( x, z, t: s after the nest began to hatch ) from the nest
// to the sea, made first at a step and thinned to the points it bends at, so that its track's a thin ribbon of k
// lengths and it's on that track. Toward the sea's bright horizon (the nearest of the water), each in its
// own direction in a fan, wandering; none straight. The same in every game until a light draws one off (lure)
const ROUTE_STEP = 0.35; // m
const GAIT = 0.5; // s: its crawl's bouts and pauses, as how far ahead of or behind its route's time it runs
export const TRACK_LAG = 0.3; // s: the track's drawn to this far behind its route's time, so under it or just behind

// a thin route of fine points: top-down, the point furthest off its chord, longer chords first among equals
function thin( fine, n, k ) {

	const keep = [ 0, n - 1 ];
	const worst = ( a, b ) => {

		const ax = fine[ a * 3 ], az = fine[ a * 3 + 1 ], dx = fine[ b * 3 ] - ax, dz = fine[ b * 3 + 1 ] - az, l = Math.hypot( dx, dz ) || 1;
		let e = - 1, at = - 1;
		for ( let i = a + 1; i < b; i ++ ) {

			const q = Math.abs( ( fine[ i * 3 ] - ax ) * dz - ( fine[ i * 3 + 1 ] - az ) * dx ) / l;
			if ( q > e ) {

				e = q;
				at = i;

			}

		}

		return [ e + l * 0.015, at ];

	};
	const out = new Float32Array( ( k + 1 ) * 3 );
	const seg = [ [ 0, n - 1, ...worst( 0, n - 1 ) ] ];
	while ( keep.length < k + 1 ) {

		let b = - 1, be = - 1;
		for ( let i = 0; i < seg.length; i ++ ) if ( seg[ i ][ 3 ] >= 0 && seg[ i ][ 2 ] > be ) {

			be = seg[ i ][ 2 ];
			b = i;

		}

		if ( b < 0 ) break;
		const [ a0, b0, , at ] = seg[ b ];
		keep.push( at );
		seg.splice( b, 1, [ a0, at, ...worst( a0, at ) ], [ at, b0, ...worst( at, b0 ) ] );

	}

	keep.sort( ( a, b ) => a - b );
	for ( let i = 0; i <= k; i ++ ) {

		const q = keep[ Math.min( i, keep.length - 1 ) ] * 3;
		out[ i * 3 ] = fine[ q ];
		out[ i * 3 + 1 ] = fine[ q + 1 ];
		out[ i * 3 + 2 ] = fine[ q + 2 ];

	}

	return out;

}

// a light's strength where a thing is (its units: intensity / m^2, 0 outside its range and its cone)
export function lightAt( l, x, y, z ) {

	const dx = x - l.x, dy = y - l.y, dz = z - l.z, d2 = dx * dx + dy * dy + dz * dz;
	if ( d2 > l.range * l.range ) return 0;
	let e = l.intensity / Math.max( d2, 1 );
	if ( l.dir ) {

		const d = Math.sqrt( d2 ) || 1, c = ( dx * l.dir[ 0 ] + dy * l.dir[ 1 ] + dz * l.dir[ 2 ] ) / d;
		const u = Math.min( 1, Math.max( 0, ( c - l.cosOuter ) / ( l.cosInner - l.cosOuter ) ) );
		e *= u * u * ( 3 - 2 * u );

	}

	return e;

}

// the way to the sea's bright, low horizon from a nest: toward the nearest of the water, however she came up
function seaFrom( x, z, ground ) {

	const far = [];
	for ( let k = - 9; k <= 9; k ++ ) {

		const a = Math.PI + k * Math.PI / 18;
		let d = 2;
		while ( d < 60 && ground( x + Math.sin( a ) * d, z + Math.cos( a ) * d ) > 0 ) d += 0.5;
		far.push( d );

	}

	let best = 1e9, at = 0;
	for ( let k = 1; k < far.length - 1; k ++ ) {

		const q = far[ k - 1 ] + far[ k ] + far[ k + 1 ];
		if ( q < best ) {

			best = q;
			at = k - 9;

		}

	}

	return Math.PI + at * Math.PI / 18;

}

export class Clutch {

	// h: of hatchingsOf; plan: of its female; k: the lengths in each one's route
	constructor( h, plan, ground, k = 24 ) {

		this.h = h;
		this.ground = ground;
		this.k = k;
		this.count = h.count;
		this.nest = plan.nest;
		const [ nx, nz ] = plan.nest;
		this.sea = seaFrom( nx, nz, ground );
		this.start = new Float32Array( h.count );
		this.routes = new Array( h.count );
		this.lured = new Uint8Array( h.count );
		this.seaLight = 1; // ((M17) the sea's horizon by the moon: lure's `sea`)
		this.at_ = new Array( h.count ); // each one's where-it-is now, reused
		const fine = this._fine();
		for ( let i = 0; i < h.count; i ++ ) {

			const m = this._mover( i );
			this.start[ i ] = m.start;
			const a = m.bear, n = this._walk( fine, 0, nx + Math.sin( a ) * 0.1, nz + Math.cos( a ) * 0.1, m.start, m, null );
			this.routes[ i ] = thin( fine, n, k );
			this.at_[ i ] = [ 0, 0, 0, 0 ];

		}

	}

	_fine() {

		return Clutch.buffer || ( Clutch.buffer = new Float32Array( 400 * 3 ) );

	}

	// how this one goes: from the hatching and its number alone
	_mover( i ) {

		const r = hash( this.h.seed, i );
		const start = between( r, HATCHLING.burst ) * ( 0.4 + 0.6 * r() );
		const v = between( r, HATCHLING.speed );
		const bear = this.sea + ( r() - 0.5 ) * 2 * HATCHLING.spread;
		return { start, v, bear, w1: r() * 6.3, w2: r() * 6.3, curl: ( r() - 0.5 ) * 0.03, wig: r() * 6.3, width: r() };

	}

	// its way from ( x, z ) at t, into fine from point n: to the sea, or to a light it's being drawn to and round it
	// till the light's gone; returns how many there are now
	_walk( fine, n, x, z, t, m, lights ) {

		const g = this.ground;
		let s = n * ROUTE_STEP, circling = 0;
		fine[ n * 3 ] = x;
		fine[ n * 3 + 1 ] = z;
		fine[ n * 3 + 2 ] = t;
		n ++;
		while ( n < 400 ) {

			// (it holds its bearing at first, then heads more straight for the sea's edge)
			const toward = m.bear + Math.atan2( Math.sin( this.sea - m.bear ), Math.cos( this.sea - m.bear ) ) * Math.min( 0.45, s * 0.03 );
			let a = toward + Math.sin( s * 0.42 + m.w1 ) * 0.2 + Math.sin( s * 1.15 + m.w2 ) * 0.11 + m.curl * s;
			if ( lights ) {

				const L = this._pull( x, z, lights );
				if ( L ) {

					if ( L.d < LURE.reach || circling ) {

						// (at the light: round and round under it; they do, till they're spent)
						a = Math.atan2( L.dx, L.dz ) + Math.PI / 2 + 0.3 * Math.sin( s * 2 + m.w1 );
						if ( ++ circling > 60 ) break;

					} else {

						const sx = Math.sin( a ), sz = Math.cos( a );
						a = Math.atan2( sx + L.dx / L.d * L.w, sz + L.dz / L.d * L.w );

					}

				}

			}

			x += Math.sin( a ) * ROUTE_STEP;
			z += Math.cos( a ) * ROUTE_STEP;
			s += ROUTE_STEP;
			t += ROUTE_STEP / m.v;
			fine[ n * 3 ] = x;
			fine[ n * 3 + 1 ] = z;
			fine[ n * 3 + 2 ] = t;
			n ++;
			if ( g( x, z ) < - 0.05 ) break;

		}

		return n;

	}

	// what's drawing it from the sea at ( x, z ): the brightest light on it, if it's enough
	_pull( x, z, lights ) {

		const y = this.ground( x, z ) + 0.05;
		let best = 0, b = null;
		for ( const l of lights ) {

			const e = lightAt( l, x, y, z );
			if ( e > best ) {

				best = e;
				b = l;

			}

		}

		const w = best / ( LURE.from * this.seaLight );
		return w < LURE.onto ? null : { dx: b.x - x, dz: b.z - z, d: Math.hypot( b.x - x, b.z - z ), w };

	}

	_gait( i, t ) {

		const r = this.routes[ i ], last = r[ this.k * 3 + 2 ];
		return t + GAIT * Math.sin( t * 0.9 + i * 1.7 ) * Math.min( 1, Math.max( 0, t - this.start[ i ] ), Math.max( 0, last - t ) );

	}

	// where this one's route has it at time t: [ x, z, a ] filled in, or null not yet out or gone into the sea
	_on( i, t, o ) {

		const r = this.routes[ i ];
		const k = this.k;
		if ( t < r[ 2 ] || t > r[ k * 3 + 2 ] ) return null;
		let a = 0;
		while ( a < k - 1 && r[ ( a + 1 ) * 3 + 2 ] < t ) a ++;
		const dt = r[ ( a + 1 ) * 3 + 2 ] - r[ a * 3 + 2 ], u = dt > 0 ? ( t - r[ a * 3 + 2 ] ) / dt : 0;
		const dx = r[ ( a + 1 ) * 3 ] - r[ a * 3 ], dz = r[ ( a + 1 ) * 3 + 1 ] - r[ a * 3 + 1 ];
		o[ 0 ] = r[ a * 3 ] + dx * u;
		o[ 1 ] = r[ a * 3 + 1 ] + dz * u;
		o[ 2 ] = dx || dz ? Math.atan2( dx, dz ) : o[ 2 ];
		return o;

	}

	// each hatchling at t ( s after the hatching began ): [ x, z, heading, gait phase ], or null
	at( t ) {

		const out = new Array( this.count );
		for ( let i = 0; i < this.count; i ++ ) {

			const o = t > HATCHLING.limit ? null : this._on( i, this._gait( i, t ), this.at_[ i ] );
			if ( ! o ) {

				out[ i ] = null;
				continue;

			}

			const tt = t - this.start[ i ];
			o[ 2 ] += Math.sin( tt * 0.7 + i ) * 0.25;
			o[ 3 ] = ( tt * 3.2 + i * 0.37 ) % 1;
			out[ i ] = o;

		}

		return out;

	}

	// the lights on the beach now, at t: each hatchling on the sand that one's drawing is led off to it from where
	// it is, its route rewritten ahead of it; one no longer drawn goes back to the sea. The way it's come stays as
	// it was: its track shows it. Returns whether any route changed. ((M17) sea: how bright the sea's horizon is, of a
	// moonless night's: seaGlow)
	lure( t, lights, sea = 1 ) {

		let changed = false;
		this.seaLight = sea;
		const fine = this._fine(), o = [ 0, 0, 0, 0 ];
		for ( let i = 0; i < this.count; i ++ ) {

			if ( t > HATCHLING.limit - 30 && ! this.lured[ i ] ) continue;
			const w = this._gait( i, t );
			if ( ! this._on( i, w, o ) ) continue;
			const now = this._pull( o[ 0 ], o[ 1 ], lights );
			if ( ! now && ! this.lured[ i ] ) continue;
			// (its way so far, then on from here)
			const r = this.routes[ i ], k = this.k;
			let n = 0;
			for ( let a = 0; a <= k && r[ a * 3 + 2 ] < w; a ++ ) {

				if ( n && r[ a * 3 + 2 ] === fine[ ( n - 1 ) * 3 + 2 ] ) continue;
				fine[ n * 3 ] = r[ a * 3 ];
				fine[ n * 3 + 1 ] = r[ a * 3 + 1 ];
				fine[ n * 3 + 2 ] = r[ a * 3 + 2 ];
				n ++;

			}

			n = this._walk( fine, n, o[ 0 ], o[ 1 ], w, this._mover( i ), now && t < HATCHLING.limit - 30 ? lights : null );
			this.routes[ i ] = thin( fine, n, k );
			this.lured[ i ] = now ? 1 : 0;
			changed = true;

		}

		return changed;

	}

	// where the scramble is at t and how much of it there is: [ x, z, 0..1 of them on the sand ] or null, none
	scramble( pts ) {

		let x = 0, z = 0, n = 0;
		for ( const q of pts ) if ( q ) {

			x += q[ 0 ];
			z += q[ 1 ];
			n ++;

		}

		return n ? [ x / n, z / n, n / this.count ] : null;

	}

}

// each hatchling of a hatching nest at ( hour, day ): [ x, z, heading, gait phase ] while it's on the sand (out of
// the nest, not yet in the sea), else null. Nobody near: the same for everyone
let lastClutch = null;
export function hatchlingsAt( h, plan, hour, day, ground ) {

	const t = secondsBetween( h.hour, h.day, hour, day );
	if ( t < 0 || t > HATCHLING.limit ) return [];
	if ( ! lastClutch || lastClutch.h.id !== h.id || lastClutch.ground !== ground ) lastClutch = new Clutch( h, plan, ground );
	return lastClutch.at( t );

}

// how far its tracks have faded, 0..1 (1 gone), from when it hatched: there into the next morning, gone by noon
export function hatchTrackFade( h, hour, day ) {

	const night = h.hour > 12 ? h.day : h.day - 1;
	const hours = ( day - night ) * 24 + hour;
	const t = Math.min( 1, Math.max( 0, ( hours - HATCHLING.trackFade[ 0 ] ) / ( HATCHLING.trackFade[ 1 ] - HATCHLING.trackFade[ 0 ] ) ) );
	return t * t * ( 3 - 2 * t );

}

// ---- (M16) turning back
// her heading's front, 0..1: 1 straight ahead of her, 0 straight behind
const fore = ( st, dx, dz, d ) => ( 1 + ( dx * Math.sin( st.heading ) + dz * Math.cos( st.heading ) ) / ( d || 1 ) ) / 2;

// how fast her alarm's rising, a second, in this state, with these about. people: [ { x, z, speed } ];
// lights: [ { x, y, z, intensity, range, dir: [ x, y, z ] | null, cosInner, cosOuter } ]; y: her head's height.
// 0 for ever once she's laying: she doesn't stop until she's covered it
export function alarmRate( st, people, lights, y ) {

	const W = MINDING.wary[ st.phase ];
	if ( ! W ) return 0;
	const S = MINDING.still[ st.phase ];
	let rate = 0;
	for ( const p of people ) {

		const dx = p.x - st.x, dz = p.z - st.z, d = Math.hypot( dx, dz ), k = fore( st, dx, dz, d );
		if ( p.speed > MINDING.moving ) {

			const R = W[ 1 ] + ( W[ 0 ] - W[ 1 ] ) * k;
			if ( d < R ) rate += MINDING.person * ( 1 - d / R ) * Math.pow( p.speed / MINDING.walk, 1.5 );

		} else {

			const R = S[ 1 ] + ( S[ 0 ] - S[ 1 ] ) * k;
			if ( d < R ) rate += MINDING.standing * ( 1 - d / R );

		}

	}

	for ( const l of lights ) {

		const e = lightAt( l, st.x, y, st.z );
		if ( e < MINDING.lightFrom ) continue;
		const dx = l.x - st.x, dz = l.z - st.z, k = fore( st, dx, dz, Math.hypot( dx, dz ) );
		const facing = MINDING.behind + ( 1 - MINDING.behind ) * k;
		rate += Math.min( 1, e / MINDING.lightFull ) * MINDING.light * facing * ( st.phase === 'chamber' ? MINDING.chamberLight : 1 );

	}

	return rate;

}

// her turning back from where she is at t (s after she came ashore), state st: a way from here to the sea, and
// the rest of her night. Seeded by her alone, so two games that do it about together have about the same way
export function turnBack( f, st, t, ground ) {

	const down = downFrom( st.x, st.z, st.heading, hash( f.seed, 71 ), ground );
	let downLength = 0;
	for ( let i = 1; i < down.length; i ++ ) downLength += Math.hypot( down[ i ][ 0 ] - down[ i - 1 ][ 0 ], down[ i ][ 1 ] - down[ i - 1 ][ 1 ] );
	const crawl = crawlTime( downLength, f.seed + 1, CRAWL.downK );
	return { t, x: st.x, z: st.z, heading: st.heading, s: st.phase === 'up' ? st.s : st.phase === 'emerge' ? 0 : null, dig: st.dig, out: st.out, from: st.phase, down, downLength, crawl };

}

function turnedAt( f, tu, t ) {

	const P = PHASES;
	const st = { turned: true, stroke: - 1, dig: 0, out: 1 };
	if ( t < MINDING.startle ) {

		st.phase = 'abort';
		st.t = t;
		st.u = t / MINDING.startle;
		st.x = tu.x;
		st.z = tu.z;
		st.heading = tu.heading;
		st.dig = tu.dig * ( 1 - st.u );
		st.out = tu.out;
		return st;

	}

	t -= MINDING.startle;
	if ( t < tu.crawl ) {

		const [ s, k ] = crawled( t, f.seed + 1, CRAWL.downK );
		st.phase = 'down';
		st.t = t;
		st.u = t / tu.crawl;
		st.s = Math.min( s, tu.downLength );
		[ st.x, st.z, st.heading ] = along( tu.down, st.s );
		st.stroke = k;
		return st;

	}

	t -= tu.crawl;
	if ( t >= P.enter ) return null;
	st.phase = 'enter';
	st.t = t;
	st.u = t / P.enter;
	st.s = tu.downLength;
	[ st.x, st.z, st.heading ] = along( tu.down, st.s );
	st.out = 1 - st.u;
	return st;

}

// everyone's alarm for the females, in one game
export class Minding {

	constructor() {

		this.alarm = new Map();
		this.turned = new Map(); // female id -> turnBack's

	}

	// one more `seconds` of her night, she being as st says at t s after she came ashore; returns her turning back
	// if it's come to that now
	tick( f, st, t, seconds, people, lights, ground ) {

		if ( this.turned.has( f.id ) ) return this.turned.get( f.id );
		const rate = alarmRate( st, people, lights, ground( st.x, st.z ) + 0.35 );
		const a = Math.max( 0, ( this.alarm.get( f.id ) || 0 ) + ( rate - ( rate > 0 ? 0 : MINDING.decay ) ) * seconds );
		if ( a >= 1 ) {

			const tu = turnBack( f, st, t, ground );
			this.turned.set( f.id, tu );
			this.alarm.delete( f.id );
			return tu;

		}

		if ( a > 0 ) this.alarm.set( f.id, a );
		else this.alarm.delete( f.id );
		return null;

	}

	// (M17) the turned-back turtles whose tracks are still on the sand at ( hour, day ), as the save keeps them: each
	// [ id, t, x, z, heading, phase, s, dig, out ], where and how she turned, which makes her way down again (turnBack:
	// seeded by her alone); null, none
	kept( hour, day ) {

		if ( ! this.turned.size ) return null;
		const live = new Set( tracksOf( day, hour ).map( ( q ) => q.female.id ) ), out = [];
		for ( const [ id, tu ] of this.turned ) if ( live.has( id ) ) out.push( [ id, tu.t, tu.x, tu.z, tu.heading, tu.from, tu.s, tu.dig, tu.out ] );
		return out.length ? out : null;

	}

	// and back from the save: her turning made again where she turned
	restore( list, ground ) {

		if ( ! Array.isArray( list ) ) return;
		for ( const q of list ) {

			if ( ! Array.isArray( q ) || q.length < 9 ) continue;
			const [ id, t, x, z, heading, phase, s, dig, out ] = q;
			const [ day, k ] = String( id ).split( ':' ).map( Number );
			const f = Number.isInteger( day ) ? femalesOf( day ).find( ( g ) => g.k === k ) : null;
			if ( ! f || ! [ t, x, z, heading, dig, out ].every( Number.isFinite ) || ! MINDING.wary[ phase ] ) continue;
			this.turned.set( f.id, turnBack( f, { x, z, heading, phase, s: Number.isFinite( s ) ? s : 0, dig, out }, t, ground ) );

		}

	}

	// forget those whose tracks have gone
	forget( live ) {

		for ( const id of this.turned.keys() ) if ( ! live.has( id ) ) this.turned.delete( id );
		for ( const id of this.alarm.keys() ) if ( ! live.has( id ) ) this.alarm.delete( id );

	}

}

// ---- (M16) the moments her night makes a sound (NestingTurtles.sounds has what's done with them). Her breaths at
// the top of each of pose's head lifts; a stroke as her front flippers bite; sand as each throw lets go
export const BREATH = { emerge: [ 2, 0.8 ], enter: [ 2, 0.8 ], abort: [ 2, 1 ], up: [ 2.2, 0.8 ], down: [ 2.2, 0.8 ], pit: [ 3.1, 0.9 ], chamber: [ 4, 0.7 ], lay: [ 5, 0.6 ], cover: [ 3, 1 ] };
const beat = ( prev, st, per, off, from = 0 ) => {

	if ( ! prev || prev.phase !== st.phase ) return false;
	const n = Math.floor( st.t / per - off );
	return n > Math.floor( prev.t / per - off ) && st.t >= from;

};

// prev: her state last time (of femaleAt), st: now. Returns [ [ name, strength 0..1 ], … ]
export function soundBeats( prev, st ) {

	const out = [];
	if ( ! st ) return out;
	const b = BREATH[ st.phase ];
	if ( b && beat( prev, st, b[ 0 ], 0.25 ) && st.stroke < 0 ) out.push( [ 'breath', b[ 1 ] ] );
	if ( st.stroke >= 0 && prev && prev.phase === st.phase && ( prev.stroke < 0 || st.stroke < prev.stroke ) ) out.push( [ 'crawlStroke', st.phase === 'up' ? 0.75 : 0.6 ] );
	if ( st.phase === 'pit' && beat( prev, st, 1.1, 0.4 ) ) out.push( [ 'sandThrown', 0.8 ] );
	if ( st.phase === 'chamber' && beat( prev, st, 1.2, 0.5 ) ) out.push( [ 'sandThrown', 0.45 ] );
	if ( st.phase === 'cover' ) {

		if ( st.u < 0.4 ) {

			if ( beat( prev, st, 0.8, 0.5 ) ) out.push( [ 'sandThrown', 0.5 ] );

		} else if ( beat( prev, st, 0.95, 0.42 ) ) out.push( [ 'sandThrown', 1 ] );

	}

	return out;

}

// the females whose tracks are on the sand at ( hour, day ): last night's and tonight's, once they've made them,
// fading over NEST.trackDays
export function tracksOf( day, hour ) {

	const out = [];
	for ( let d = day - Math.ceil( NEST.trackDays ); d <= day; d ++ ) for ( const f of femalesOf( d ) ) {

		const age = secondsBetween( f.arrive, f.day, hour, day ) / ( secondsBetween( 0, 0, 0, 1 ) );
		if ( age > 0 && age < NEST.trackDays ) out.push( { female: f, age } );

	}

	return out;

}
