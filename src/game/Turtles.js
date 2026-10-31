import { mulberry32 } from '../util/Noise.js';
import { secondsBetween } from './IslandClock.js';

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
export const HATCHLING = { speed: [ 0.18, 0.32 ], burst: [ 6, 28 ], spread: 0.45, length: 0.055 };

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
	const down = [ [ x, z ] ];
	const side = r() < 0.5 ? - 1 : 1, rTurn = 1.2 + r() * 1.2;
	const a0 = a;
	for ( let k = 1; k <= 8; k ++ ) {

		const b = a0 + side * Math.PI * k / 8;
		x += Math.sin( b ) * rTurn * Math.PI / 8;
		z += Math.cos( b ) * rTurn * Math.PI / 8;
		down.push( [ x, z ] );

	}

	a = a0 + side * Math.PI;
	for ( let n = 0; n < 200; n ++ ) {

		const [ ux, uz ] = uphill( ground, x, z );
		const want = Math.atan2( - ux, - uz );
		a += Math.atan2( Math.sin( want - a ), Math.cos( want - a ) ) * 0.1 + ( r() - 0.5 ) * 0.05;
		x += Math.sin( a ) * STEP;
		z += Math.cos( a ) * STEP;
		down.push( [ x, z ] );
		if ( ground( x, z ) < - 0.3 ) break;

	}

	const len = ( p ) => p.reduce( ( s, q, i ) => i ? s + Math.hypot( q[ 0 ] - p[ i - 1 ][ 0 ], q[ 1 ] - p[ i - 1 ][ 1 ] ) : 0, 0 );
	return { up, down, nest, upLength: len( up ), downLength: len( down ) };

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
export function femaleAt( f, plan, hour, day, line = timeline( f, plan ) ) {

	const t = secondsBetween( f.arrive, f.day, hour, day );
	if ( t < 0 ) return null;
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

// each hatchling of a hatching nest at ( hour, day ): [ x, z, heading, gait phase ] while it's on the sand
// (out of the nest, not yet in the sea), else null. They come up over HATCHLING.burst s, most together, and
// head down the beach toward the sea's bright horizon, spread about the way down and wandering a little
export function hatchlingsAt( h, plan, hour, day, ground ) {

	const t = secondsBetween( h.hour, h.day, hour, day );
	if ( t < 0 || t > 400 ) return [];
	const [ nx, nz ] = plan.nest, [ ux, uz ] = uphill( ground, nx, nz, 3 ), down = Math.atan2( - ux, - uz );
	const out = [];
	for ( let i = 0; i < h.count; i ++ ) {

		const r = hash( h.seed, i ), start = between( r, HATCHLING.burst ) * ( 0.4 + 0.6 * r() );
		if ( t < start ) {

			out.push( null );
			continue;

		}

		const v = between( r, HATCHLING.speed ), aim = down + ( r() - 0.5 ) * 2 * HATCHLING.spread, wig = r() * 6.3, tt = t - start;
		// (stopping now and then: about a fifth of the time)
		const go = tt * 0.8 + Math.sin( tt * 0.9 + wig ) * 0.6;
		const d = Math.max( 0, go * v ), a = aim + Math.sin( tt * 0.7 + wig ) * 0.25;
		const x = nx + Math.sin( aim ) * d + Math.cos( aim ) * Math.sin( d * 0.8 + wig ) * 0.3, z = nz + Math.cos( aim ) * d - Math.sin( aim ) * Math.sin( d * 0.8 + wig ) * 0.3;
		out.push( ground( x, z ) < - 0.05 ? null : [ x, z, a, ( tt * 3.2 + wig ) % 1 ] );

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
