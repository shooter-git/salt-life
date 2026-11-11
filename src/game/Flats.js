import { FLATS } from '../world/terrain/Flats.js';
import { tideTurns, tideAt, moonAt, SYNODIC } from './IslandClock.js';
import { hash } from './Weather.js';
import { FEED_RAYS, RAY_STEP } from './FlatsGround.js';

// (M17) The flats' fish, as data: where each school is on the west's flats (world/terrain/Flats.js) at the island's
// time, by the tide and the moon, and what's happened to it (spooked, hooked). Worked out from the clock alone, as the
// weather and the far water's finds are (game/Finds.js), so everyone sees the same school in the same place, and only
// what changes is sent (a school spooked, a fish hooked: `state`, a small record). How they're drawn, seen, stalked
// and cast to is sight-fishing's (M17's stream 1); this is where they are.
//
// Each high water brings its own fish, from the sources (docs/m17/sources-tide-fish.md):
//   - bonefish, 3 to 6 schools of 3 to 20, onto the flat up its creeks from about 3 h into the flood, feeding over it,
//     and off again down the creeks by about 3 h into the ebb (Murchie and others 2013, Cape Eleuthera's telemetry:
//     almost never on the flats outside that); staging at the creeks' mouths and along the edge before and after. Each
//     school keeps to water of the depth it likes as it feeds, up toward the shallows (a bar's top, the shore) as the
//     tide floods and back as it ebbs, as bonefish follow the tide's edge: tailing where it's a foot or so deep (the
//     Florida Museum: feeding often in under 30 cm), mudding where it's deeper. Fewer in a blow. For some days about
//     each new and full moon, a school of hundreds gathering off the edge at dusk to spawn (Danylchuk 2011);
//   - permit, alone or in pairs, off the flat's edge in deeper water at low, and up onto it on the flood and at high
//     water, into water of half a metre to most of a metre over its sand, where they tail on crabs;
//   - blacktip sharks in a small pack, and a lemon shark alone, cruising the flat at high water and the edge at low;
//   - barracuda, alone, lying in the potholes and just off the edge at any tide;
//   - tarpon, in the main creek's mouth and the potholes, rolling (more at dawn and dusk and in still air: they gulp
//     air, most where the water's short of it), and laid up just off the edge in calm, sunny water;
//   - snook in the creeks' deep upper reaches on the ebb, the mangrove creek's most of all, facing into the current.
// Each is put in water deep enough for it at every tide: the feeding grounds' ground is baked into FlatsGround.js
// (tools/flats/ground.mjs), the rest is the flat's own measures (its edge, its holes, its creeks' beds;
// tools/flats/depths.mjs measures them all).
// A school's anchor moves at the island's pace (an island hour is 100 s by day): up a creek in about an island hour,
// then drifting tens of metres over its feeding ground; the fish themselves swim about it in real time (world/Fish.js).
// Like the weather it's + - x / and integer hashes (with Math.sqrt, which IEEE rounds the same everywhere), so every
// device has the same fish.
//
//   flatsSchools( T, { wind, overcast, hour }, state, out ) -> [ { id, kind, n, x, z, dx, dz, mode, life } ]
//     id: the school's own (its high water's and its number); n: how many (what's been hooked taken off); ( x, z ): its
//     anchor; ( dx, dz ): the way it's going; mode: 'cruise' | 'feed' | 'tail' | 'mill' | 'roll' | 'laid' | 'hold';
//     life: 0..1 as it comes and goes
//   newFlatsState() -> { spooked: { id: T until }, hooked: { id: count }, at: { id: [ x, z ] spooked from } }
//   spook( state, id, T, x, z )   hook( state, id )
//   forgetFlats( state, T ): what's long past let go     tideStage( T ) -> { high: { T, k }, phi } (hours from high water)
//   (M17, the flats together) mergeFlats( out, records ), flatsWire( state ), cleanFlats( raw ): everyone's records as one,
//   and as they're sent (below)

export const FLATS_FISH = {
	quiet: 0.6, // island hours a spooked school's gone for (the flat goes quiet a while: about a minute by day)
	// (depth: the water a feeding school keeps to, m; tail: a bonefish's tail's out in this or less; along: how much the
	// depth it keeps to drifts, m; side: how far it drifts across its ray, m)
	bonefish: { schools: [ 3, 6 ], n: [ 3, 20 ], on: [ - 3.2, 3.2 ], up: 1.1, stage: 5.2, depth: [ 0.2, 0.5 ], tail: 0.42, along: 0.06, side: 12, blow: [ 9, 15 ] },
	spawn: { days: 3, from: 17, to: 21, n: [ 300, 900 ], off: 40 }, // (days either side of new and full moon; the hours)
	permit: { most: 2, chance: 0.75, on: [ - 4, 2.6 ], depth: [ 0.45, 0.85 ], off: 30 },
	blacktipShark: { chance: 0.6, n: [ 2, 5 ], on: [ - 2.5, 2.5 ], depth: 0.75 },
	lemonShark: { chance: 0.35, on: [ - 3, 3 ] },
	barracuda: { n: [ 1, 3 ], holes: 0.6 }, // (of them in the potholes; the rest just off the edge)
	tarpon: { n: [ 1, 6 ], calm: 4, sunny: 0.3, laid: 8 }, // (laid up this far off the edge, m: a couple of metres down)
	snook: { n: [ 2, 4 ], on: [ 0.5, 5.5 ], bed: - 1.1, reach: 0.25, mangrove: 0.5 }, // (in a creek where its bed's this deep or deeper, its upper `reach` of that; the mangrove creek's this often)
};

const F = FLATS_FISH;
const HIGH_GAP = 12.4206; // h: M2's period, high to high (the integer of each high water's, its `k`)
// where they feed, on the flat's sand and grass (x, z): each well in from its edge, off the creeks, the holes and the
// mangroves' mud, in a few tenths of a metre of water at mean and the same about it (test/flats.mjs). Each has its ray
// in FlatsGround.js, up which a school follows the tide (tools/flats/ground.mjs makes them from these)
export const FLATS_HOMES = [ [ - 622, - 214 ], [ - 520, - 4 ], [ - 712, - 52 ], [ - 744, - 176 ], [ - 524, - 132 ], [ - 544, - 296 ], [ - 608, - 68 ], [ - 696, - 272 ], [ - 668, - 132 ], [ - 616, - 288 ], [ - 596, - 148 ], [ - 552, - 228 ] ];
const LEN = ( a, b ) => Math.sqrt( ( b[ 0 ] - a[ 0 ] ) * ( b[ 0 ] - a[ 0 ] ) + ( b[ 1 ] - a[ 1 ] ) * ( b[ 1 ] - a[ 1 ] ) );

// the creeks' ways in, mouth to head: each of the three from the edge, and the branches by way of their own creek
// to where they leave it (a branch's first point is on its creek's line)
export const FLATS_ROUTES = ( () => {

	const C = FLATS.creeks, out = [];
	for ( let i = 0; i < C.length; i ++ ) {

		const line = C[ i ].line;
		// (a branch: from the edge up its creek to where it leaves it, then up it)
		const from = C.findIndex( ( c, j ) => j !== i && c.line.some( ( p ) => p[ 0 ] === line[ 0 ][ 0 ] && p[ 1 ] === line[ 0 ][ 1 ] ) );
		if ( from < 0 ) out.push( line.map( ( p ) => [ p[ 0 ], p[ 1 ] ] ) );
		else {

			const main = C[ from ].line, at = main.findIndex( ( p ) => p[ 0 ] === line[ 0 ][ 0 ] && p[ 1 ] === line[ 0 ][ 1 ] );
			out.push( [ ...main.slice( 0, at ), ...line ].map( ( p ) => [ p[ 0 ], p[ 1 ] ] ) );

		}

	}

	return out;

} )();

// the flat's edge brought in (+) or out (-) by d m, its points every so far (for the permit and the sharks): from the
// edge's own points, each moved along the mean of its legs' normals
function edgeLine( d ) {

	const E = FLATS.edge.slice( 1, - 1 ), out = [];
	for ( let i = 0; i < E.length; i ++ ) {

		const a = E[ Math.max( 0, i - 1 ) ], b = E[ Math.min( E.length - 1, i + 1 ) ];
		const tx = b[ 0 ] - a[ 0 ], tz = b[ 1 ] - a[ 1 ], l = Math.sqrt( tx * tx + tz * tz );
		// (walking the edge north to south the flat's on the left: its inward normal is ( tz, -tx ))
		out.push( [ E[ i ][ 0 ] + tz / l * d, E[ i ][ 1 ] - tx / l * d ] );

	}

	return out;

}

// (the sharks' on the flat, in from its edge; the permit's and the sharks' off it, in deeper water; where the tarpon
// lie up and the barracuda lie, just off it, a couple of metres down at a spring low)
const EDGE_IN = edgeLine( 18 ), EDGE_OUT = edgeLine( - F.permit.off ), LAID = edgeLine( - F.tarpon.laid );
// the main creek's mouth (its line's first point), for the tarpon and the spawning bonefish
const MOUTH = FLATS.creeks[ 0 ].line[ 0 ];

// each feeding ground's ray (FlatsGround.js): its legs ( [ from, length ] m along it), its length, its ground (m) every
// RAY_STEP m from its deep end (the last sample at its end), and `top`: going up it, a school wanting the water so deep
// stops at the first ground that high. The highest of the ground from its deep end, rising at least RISE m a m, so that
// as the tide floods over a bar's top a school goes on across the trough beyond it over some minutes, not at once
const RISE = 0.003;
const RAYS = FEED_RAYS.map( ( { p, g, off } ) => {

	const legs = [];
	let len = 0;
	for ( let i = 1; i < p.length; i ++ ) {

		const l = LEN( p[ i - 1 ], p[ i ] );
		legs.push( [ len, l ] );
		len += l;

	}

	const ground = g.map( ( h ) => h / 100 ), top = [];
	let most = - Infinity;
	for ( const h of ground ) top.push( most = Math.max( most + RISE * RAY_STEP, h ) );
	return { p, off, legs, len, ground, top };

} );
// (the rays the permit come up: those from the deeper grounds, near the edge)
const PERMIT_RAYS = RAYS.filter( ( R ) => R.ground[ 0 ] <= - 0.75 && R.off );
const sAt = ( R, j ) => Math.min( j * RAY_STEP, R.len );

// the ground s m up ray R
function groundOn( R, s ) {

	const n = R.ground.length, j = Math.min( n - 2, Math.max( 0, Math.floor( s / RAY_STEP ) ) );
	const s0 = sAt( R, j ), s1 = sAt( R, j + 1 ), t = s1 > s0 ? Math.min( 1, Math.max( 0, ( s - s0 ) / ( s1 - s0 ) ) ) : 0;
	return R.ground[ j ] + ( R.ground[ j + 1 ] - R.ground[ j ] ) * t;

}

// how far up ray R the ground first comes up to y (m): 0 if its deep end's higher, its length if it never does
function upTo( R, y ) {

	const top = R.top, n = top.length;
	if ( y <= top[ 0 ] ) return 0;
	for ( let j = 1; j < n; j ++ ) {

		if ( top[ j ] < y ) continue;
		const a = R.ground[ j - 1 ], b = R.ground[ j ], s0 = sAt( R, j - 1 ), s1 = sAt( R, j );
		return s0 + ( s1 - s0 ) * ( b > a ? Math.min( 1, Math.max( 0, ( y - a ) / ( b - a ) ) ) : 1 );

	}

	return R.len;

}

// the point s m up ray R, and the way up it there (out: x, z, dx, dz)
function onRay( R, s, out ) {

	const { p, legs } = R;
	let i = 0;
	while ( i < legs.length - 1 && ( s > legs[ i ][ 0 ] + legs[ i ][ 1 ] || legs[ i ][ 1 ] <= 0 ) ) i ++;
	const [ s0, l ] = legs[ i ], a = p[ i ], b = p[ i + 1 ], t = l > 0 ? Math.min( 1, Math.max( 0, ( s - s0 ) / l ) ) : 0;
	out.x = a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t;
	out.z = a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t;
	out.dx = l > 0 ? ( b[ 0 ] - a[ 0 ] ) / l : 0;
	out.dz = l > 0 ? ( b[ 1 ] - a[ 1 ] ) / l : 1;
	return out;

}

// a fish keeping to water `depth` m deep on ray R at T: up it to where the ground's that far under the sea, the depth
// it keeps to drifting by `along` m (up and down the ray, far where it's level, hardly at all up a beach) and itself
// `side` m across the ray where it's level (less where it's steep: across a beach is up it) by t (the wobble's clock)
// and seed; out: x, z, and the water's depth on the ray there (depth)
function keepTo( R, T, depth, along, side, t, seed, out ) {

	const sea = tideAt( T );
	const s = upTo( R, sea - depth - along * wobble( t, seed ) );
	onRay( R, s, out );
	const slope = Math.abs( groundOn( R, s + RAY_STEP ) - groundOn( R, s - RAY_STEP ) ) / ( 2 * RAY_STEP );
	const w = side * wobble( t * 0.7, seed ^ 0x5d ) * Math.min( 1, 0.01 / ( slope + 1e-4 ) );
	out.x -= out.dz * w;
	out.z += out.dx * w;
	out.depth = sea - groundOn( R, s );
	return out;

}

// where the snook lie on the ebb: in the creeks' upper reaches still deep enough for them (each creek's bed falls
// from its head to its mouth: the `reach` of it below its last point that deep), and which way is up it there
const SNOOK_LIES = FLATS.creeks.map( ( C, ci ) => {

	const [ b0, b1 ] = C.bed, k1 = b1 <= F.snook.bed ? 1 : ( F.snook.bed - b0 ) / ( b1 - b0 );
	return k1 > 0.1 ? { line: C.line, k: [ Math.max( 0.1, k1 - F.snook.reach ), k1 ], mangrove: ci === 0 } : null;

} ).filter( Boolean );

// a point along a route (polyline) u of the way (0..1), and the way it's going there
function along( route, u, out ) {

	let total = 0;
	for ( let i = 1; i < route.length; i ++ ) total += LEN( route[ i - 1 ], route[ i ] );
	let s = Math.min( 1, Math.max( 0, u ) ) * total;
	for ( let i = 1; i < route.length; i ++ ) {

		const a = route[ i - 1 ], b = route[ i ], l = LEN( a, b );
		if ( s <= l || i === route.length - 1 ) {

			const t = l > 0 ? Math.min( 1, s / l ) : 0;
			out.x = a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t;
			out.z = a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t;
			out.dx = l > 0 ? ( b[ 0 ] - a[ 0 ] ) / l : 0;
			out.dz = l > 0 ? ( b[ 1 ] - a[ 1 ] ) / l : 1;
			return out;

		}

		s -= l;

	}

	return out;

}

// smooth 1D value noise in -1..1 (Weather's, eased between lattice points)
function wobble( x, seed ) {

	const i = Math.floor( x ), f = x - i, u = f * f * ( 3 - 2 * f );
	const a = hash( i, seed ), b = hash( i + 1, seed );
	return ( a + ( b - a ) * u ) * 2 - 1;

}

const pick = ( list, r ) => list[ Math.min( list.length - 1, Math.floor( r * list.length ) ) ];
const between = ( [ a, b ], r ) => a + Math.floor( r * ( b - a + 1 ) );
const sstep = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};
// how much of a window [ a, b ] (hours from high water) phi's in, faded over `f` at each end
const inWindow = ( phi, [ a, b ], f = 0.4 ) => sstep( a - f, a + f, phi ) * ( 1 - sstep( b - f, b + f, phi ) );

// where the tide is at T: the high water nearest it ({ T, k: its own integer }) and how many hours from it (phi < 0 on
// the flood, > 0 on the ebb)
const _turns = [];
export function tideStage( T ) {

	tideTurns( T - 7, T + 7, _turns );
	let best = null;
	for ( const t of _turns ) if ( t.high && ( ! best || Math.abs( t.T - T ) < Math.abs( best.T - T ) ) ) best = t;
	if ( ! best ) return { high: { T, k: Math.round( T / HIGH_GAP ) }, phi: 0 };
	return { high: { T: best.T, k: Math.round( best.T / HIGH_GAP ) }, phi: T - best.T };

}

// ((M17, the flats together) at: where each was spooked from, so it bolts away from there on everyone's game)
export const newFlatsState = () => ( { spooked: {}, hooked: {}, at: {} } );

// a school spooked at T (from ( x, z ), if it's known): it bolts, and it's gone for a while ((M17, the flats together) till a
// hundredth of an island hour, a second of play by day, as it's sent: so it's back at the same moment on every game)
export function spook( state, id, T, x, z ) {

	state.spooked[ id ] = Math.max( state.spooked[ id ] ?? - Infinity, Math.round( ( T + F.quiet ) * 100 ) / 100 );
	if ( Number.isFinite( x ) && Number.isFinite( z ) && state.at ) state.at[ id ] = [ Math.round( x * 10 ) / 10, Math.round( z * 10 ) / 10 ];
	return state;

}

// one of a school hooked: it's one fewer for the rest of its visit
export function hook( state, id ) {

	state.hooked[ id ] = ( state.hooked[ id ] || 0 ) + 1;
	return state;

}

// (M17, the flats together) a school's id, and when its visit's over: a high water's (`bone`, `permit`, `blacktip`, `lemon`,
// `snook`: its integer k, its fish about for seven hours either side of it), an island day's (`cuda`, `tarpon`), a lunation's
// (`spawn`). null for anything else
const ID = /^(bone|permit|blacktip|lemon|snook|cuda|tarpon|spawn):(-?\d{1,7})(?::(\d{1,3}))?$/;
const BY_DAY = { cuda: true, tarpon: true };
export const flatsId = ( id ) => typeof id === 'string' && ID.test( id );
function visitOver( id, T ) {

	const m = ID.exec( id );
	if ( ! m ) return true;
	const n = Number( m[ 2 ] );
	if ( m[ 1 ] === 'spawn' ) return n < Math.floor( ( T / 24 ) / ( SYNODIC / 2 ) + 0.5 );
	if ( BY_DAY[ m[ 1 ] ] ) return n < Math.floor( T / 24 );
	return n < Math.round( T / HIGH_GAP ) - 2;

}

// what's long past let go: a spook's quiet over, a school's visit over ((M17, the flats together) a barracuda's and a tarpon's
// by their island day, the spawning school's by its lunation: they were read as high waters, and a fish hooked from one
// came back the next time this ran)
export function forgetFlats( state, T ) {

	for ( const id of Object.keys( state.spooked ) ) if ( ! ( state.spooked[ id ] >= T ) ) {

		delete state.spooked[ id ];
		if ( state.at ) delete state.at[ id ];

	}

	for ( const id of Object.keys( state.hooked ) ) if ( visitOver( id, T ) ) delete state.hooked[ id ];
	if ( state.at ) for ( const id of Object.keys( state.at ) ) if ( state.spooked[ id ] === undefined ) delete state.at[ id ];
	return state;

}

// (M17, the flats together: docs/m17/flats-together.md) Each player's own record of what they've done to the flats' fish (a
// state as above) is theirs alone to write; everyone's game runs on all of them together:
//   mergeFlats( out, records ) -> out: a school's gone until the latest anyone's spooked it till (and from where that
//     spook was), one fewer for each fish anyone's hooked from it
//   flatsWire( state ) -> { s: { id: [ until, x, z ] }, h: { id: n } }   what's sent (until to a hundredth of an island
//     hour, as spook keeps it; where from to a tenth of a metre)
//   cleanFlats( raw ) -> a state: what came from someone else's game, anything malformed dropped
export const FLATS_WIRE = { most: 120 }; // entries a record keeps (a spook's quiet is minutes, a visit hours: a handful)
export function mergeFlats( out, records ) {

	for ( const k of [ 'spooked', 'hooked', 'at' ] ) {

		if ( ! out[ k ] ) out[ k ] = {};
		for ( const id of Object.keys( out[ k ] ) ) delete out[ k ][ id ];

	}

	for ( const r of records ) {

		if ( ! r ) continue;
		for ( const [ id, until ] of Object.entries( r.spooked ) ) if ( ! ( out.spooked[ id ] >= until ) ) {

			out.spooked[ id ] = until;
			if ( r.at && r.at[ id ] ) out.at[ id ] = r.at[ id ];
			else delete out.at[ id ];

		}

		for ( const [ id, n ] of Object.entries( r.hooked ) ) out.hooked[ id ] = ( out.hooked[ id ] || 0 ) + n;

	}

	return out;

}

export function flatsWire( state ) {

	const s = {}, h = {};
	for ( const [ id, until ] of Object.entries( state.spooked ) ) {

		const at = state.at && state.at[ id ];
		s[ id ] = at ? [ Math.round( until * 100 ) / 100, at[ 0 ], at[ 1 ] ] : [ Math.round( until * 100 ) / 100 ];

	}

	for ( const [ id, n ] of Object.entries( state.hooked ) ) h[ id ] = n;
	return { s, h };

}

export function cleanFlats( raw ) {

	const out = newFlatsState();
	if ( ! raw || typeof raw !== 'object' ) return out;
	let n = 0;
	const s = raw.s && typeof raw.s === 'object' ? raw.s : {}, h = raw.h && typeof raw.h === 'object' ? raw.h : {};
	for ( const [ id, v ] of Object.entries( s ) ) {

		if ( n >= FLATS_WIRE.most || ! flatsId( id ) || ! Array.isArray( v ) || ! Number.isFinite( v[ 0 ] ) ) continue;
		out.spooked[ id ] = v[ 0 ];
		if ( Number.isFinite( v[ 1 ] ) && Number.isFinite( v[ 2 ] ) && Math.abs( v[ 1 ] ) < 1e5 && Math.abs( v[ 2 ] ) < 1e5 ) out.at[ id ] = [ v[ 1 ], v[ 2 ] ];
		n ++;

	}

	for ( const [ id, v ] of Object.entries( h ) ) {

		if ( n >= FLATS_WIRE.most || ! flatsId( id ) || ! Number.isInteger( v ) || v < 1 || v > 1000 ) continue;
		out.hooked[ id ] = v;
		n ++;

	}

	return out;

}

const _p = { x: 0, z: 0, dx: 0, dz: 1 }, _q = { x: 0, z: 0, dx: 0, dz: 1 }, _f = { x: 0, z: 0, dx: 0, dz: 1, depth: 0 };
const NONE = { wind: 7, overcast: 0, hour: 12 };

export function flatsSchools( T, conditions = NONE, state = null, out = [] ) {

	out.length = 0;
	const c = { ...NONE, ...conditions }, hour = ( ( c.hour % 24 ) + 24 ) % 24;
	const add = ( id, kind, n, x, z, dx, dz, mode, life ) => {

		if ( life <= 0.001 ) return;
		if ( state ) {

			if ( state.spooked[ id ] !== undefined && state.spooked[ id ] > T ) return;
			n -= state.hooked[ id ] || 0;
			if ( n <= 0 ) return;

		}

		out.push( { id, kind, n, x, z, dx, dz, mode, life } );

	};

	// the high waters about T, each with its own fish (the last one's leaving as the next one's coming)
	const { high } = tideStage( T );
	for ( let k = high.k - 1; k <= high.k + 1; k ++ ) {

		const H = tideTurns( k * HIGH_GAP - 4, k * HIGH_GAP + 4 ).filter( ( t ) => t.high )[ 0 ];
		if ( ! H || Math.round( H.T / HIGH_GAP ) !== k ) continue;
		const phi = T - H.T;
		if ( Math.abs( phi ) > 7 ) continue;
		highWater( k, phi, T, c, add );

	}

	// the barracuda and the tarpon, at any tide: each island day's own
	const day = Math.floor( T / 24 );
	const B = F.barracuda;
	for ( let i = 0, n = between( B.n, hash( day, 0x0bac0da ) ); i < n; i ++ ) {

		// (in a pothole, over its deep middle; or lying just off the edge)
		const s = Math.imul( day, 131 ) + i, t = T / 3 + hash( s, 0x0bac2 ) * 50;
		let x, z;
		if ( hash( s, 0x0bac1 ) < B.holes ) {

			const [ hx, hz, hr ] = pick( FLATS.holes, hash( s, 0x0bac3 ) ), r = hr * 0.4;
			x = hx + r * wobble( t, s ^ 0x55 );
			z = hz + r * wobble( t, s ^ 0x66 );

		} else {

			along( LAID, 0.5 + 0.45 * wobble( t / 4, s ^ 0x0bac4 ), _q );
			x = _q.x;
			z = _q.z;

		}

		add( `cuda:${ day }:${ i }`, 'barracuda', 1, x, z, wobble( t * 3, s ^ 0x77 ), wobble( t * 3 + 9, s ^ 0x77 ), 'hold', 1 );

	}

	const P = F.tarpon, calm = c.wind < P.calm, sunny = c.overcast < P.sunny && hour > 9 && hour < 16;
	const dusk = sstep( 4.5, 6, hour ) * ( 1 - sstep( 7.5, 9, hour ) ) + sstep( 16.5, 18, hour ) * ( 1 - sstep( 19.5, 20.5, hour ) );
	for ( let i = 0, n = between( P.n, hash( day, 0x7a4b0 ) ); i < n; i ++ ) {

		const s = Math.imul( day, 173 ) + i, hole = FLATS.holes[ Math.floor( hash( s, 0x7a4b1 ) * FLATS.holes.length ) ];
		const mouth = hash( s, 0x7a4b2 ) < 0.5, at = mouth ? MOUTH : hole;
		// (about the creek's mouth, or within a pothole: its deep middle)
		const t = T / 2 + hash( s, 0x7a4b3 ) * 40, r = mouth ? 10 : hole[ 2 ] * 0.5;
		if ( calm && sunny ) {

			// (laid up just off the edge in calm, sunny water, as still as logs)
			along( LAID, hash( s, 0x7a4b4 ), _q );
			add( `tarpon:${ day }:${ i }`, 'tarpon', 1, _q.x, _q.z, _q.dx, _q.dz, 'laid', 1 );

		} else add( `tarpon:${ day }:${ i }`, 'tarpon', 1, at[ 0 ] + r * wobble( t, s ^ 0x11 ), at[ 1 ] + r * wobble( t, s ^ 0x22 ), wobble( t * 2, s ^ 0x33 ), wobble( t * 2 + 5, s ^ 0x33 ), calm || dusk > 0.3 ? 'roll' : 'cruise', 1 );

	}

	// the bonefish gathering to spawn: about new and full moon, off the edge at dusk
	const m = moonAt( T ), fromSyzygy = Math.min( m.phase, Math.abs( m.phase - 0.5 ), 1 - m.phase ) * SYNODIC, S = F.spawn;
	if ( fromSyzygy < S.days && hour > S.from && hour < S.to ) {

		const lunation = Math.floor( ( T / 24 ) / ( SYNODIC / 2 ) + 0.5 ), life = sstep( S.from, S.from + 0.7, hour ) * ( 1 - sstep( S.to - 0.7, S.to, hour ) );
		along( EDGE_OUT, 0.45 + 0.1 * wobble( T / 2, lunation ), _q );
		add( `spawn:${ lunation }`, 'bonefish', between( S.n, hash( lunation, 0x5ba3 ) ), _q.x, _q.z, _q.dx, _q.dz, 'mill', life );

	}

	return out;

}

// the fish high water k brings, phi hours from it
function highWater( k, phi, T, c, add ) {

	const BF = F.bonefish;
	// (fewer schools in a blow: their tails and their wakes are lost in the chop, and they keep to deeper water)
	const blow = sstep( BF.blow[ 0 ], BF.blow[ 1 ], c.wind );
	const schools = Math.round( between( BF.schools, hash( k, 0xb0e0 ) ) * ( 1 - 0.6 * blow ) );
	const [ on0, on1 ] = BF.on;
	for ( let i = 0; i < schools; i ++ ) {

		const s = Math.imul( k, 977 ) + i * 31;
		const n = BF.n[ 0 ] + Math.floor( ( BF.n[ 1 ] - BF.n[ 0 ] + 1 ) * hash( s, 0xb0e1 ) * hash( s, 0xb0e2 ) );
		const inRoute = pick( FLATS_ROUTES, hash( s, 0xb0e3 ) ), outRoute = pick( FLATS_ROUTES, hash( s, 0xb0e4 ) );
		const R = pick( RAYS, hash( s, 0xb0e5 ) ), depth = BF.depth[ 0 ] + ( BF.depth[ 1 ] - BF.depth[ 0 ] ) * hash( s, 0xb0e8 );
		// (each school a little early or late)
		const p = phi + ( hash( s, 0xb0e6 ) - 0.5 ) * 0.8, id = `bone:${ k }:${ i }`;
		const life = sstep( - BF.stage - 0.5, - BF.stage, p ) * ( 1 - sstep( BF.stage, BF.stage + 0.5, p ) );
		// (where it feeds at p': on its ray in water `depth` deep, drifting about it; from its arriving to its leaving)
		const feeding = ( pp, out ) => keepTo( R, T + pp - p, depth, BF.along, BF.side, ( pp - on0 ) / 1.6 + i * 7.3, s ^ 3, out );
		if ( p < on0 ) {

			// staging at its creek's mouth, milling
			const t = T * 2 + i;
			add( id, 'bonefish', n, inRoute[ 0 ][ 0 ] + 8 * wobble( t, s ), inRoute[ 0 ][ 1 ] + 8 * wobble( t, s ^ 1 ), wobble( t, s ^ 2 ), wobble( t + 3, s ^ 2 ), 'mill', life );

		} else if ( p < on0 + BF.up ) {

			// up the creek and out over the flat to where it'll feed
			feeding( on0 + BF.up, _f );
			along( [ ...inRoute, [ _f.x, _f.z ] ], ( p - on0 ) / BF.up, _p );
			add( id, 'bonefish', n, _p.x, _p.z, _p.dx, _p.dz, 'cruise', life );

		} else if ( p < on1 - BF.up ) {

			// feeding, in the water it likes: tailing where that's shallow enough for its tail to be out (sight-fishing
			// reads the water there), mudding where it's deeper
			feeding( p, _f );
			const x = _f.x, z = _f.z, d = _f.depth;
			feeding( p + 0.05, _f );
			const dx = _f.x - x, dz = _f.z - z, l = Math.sqrt( dx * dx + dz * dz ) || 1;
			const tail = d >= 0.08 && d <= BF.tail && hash( Math.floor( p * 3 ) + s, 0xb0e7 ) < 0.85;
			add( id, 'bonefish', n, x, z, dx / l, dz / l, tail ? 'tail' : 'feed', life );

		} else if ( p < on1 ) {

			// back to a creek and down it
			feeding( on1 - BF.up, _f );
			along( [ [ _f.x, _f.z ], ...outRoute.slice().reverse() ], ( p - on1 + BF.up ) / BF.up, _p );
			add( id, 'bonefish', n, _p.x, _p.z, _p.dx, _p.dz, 'cruise', life );

		} else {

			// off the flat, along the edge by its creek's mouth
			const t = T * 2 + i;
			add( id, 'bonefish', n, outRoute[ 0 ][ 0 ] + 10 * wobble( t, s ^ 5 ), outRoute[ 0 ][ 1 ] + 10 * wobble( t, s ^ 6 ), wobble( t, s ^ 7 ), wobble( t + 3, s ^ 7 ), 'mill', life );

		}

	}

	// the permit: off the edge in deeper water at low, cruising along it; up onto the flat on the flood and at high
	// water, each into water of the depth it likes over the sand, by one of the rays from the deeper grounds (coming
	// and going between the two as the tide turns)
	const PM = F.permit;
	for ( let i = 0; i < PM.most; i ++ ) {

		const s = Math.imul( k, 613 ) + i * 17;
		if ( hash( s, 0x9e10 ) > PM.chance * ( i === 0 ? 1 : 0.5 ) ) continue;
		const n = hash( s, 0x9e11 ) < 0.6 ? 1 : 2, on = inWindow( phi, PM.on ), t = T / 6 + i * 3.1;
		const R = pick( PERMIT_RAYS, hash( s, 0x9e13 ) ), depth = PM.depth[ 0 ] + ( PM.depth[ 1 ] - PM.depth[ 0 ] ) * hash( s, 0x9e14 );
		const at = ( tt, out ) => {

			// (off the edge in deeper water by its ray's deep end, cruising about it)
			out.x = R.off[ 0 ] + 20 * wobble( tt, s ^ 0x9e12 );
			out.z = R.off[ 1 ] + 20 * wobble( tt, s ^ 0x9e16 );
			if ( on <= 0 ) return out;
			keepTo( R, T + ( tt - t ) * 6, depth, 0.05, 5, tt * 4, s ^ 0x9e15, _f );
			out.x += ( _f.x - out.x ) * on;
			out.z += ( _f.z - out.z ) * on;
			return out;

		};
		at( t, _q );
		const x = _q.x, z = _q.z;
		at( t + 0.005, _q );
		const dx = _q.x - x, dz = _q.z - z, l = Math.sqrt( dx * dx + dz * dz ) || 1;
		add( `permit:${ k }:${ i }`, 'permit', n, x, z, dx / l, dz / l, 'cruise', 1 );

	}

	// the sharks: a pack of blacktips and a lemon on the flat at high water, on its edge at low
	const BT = F.blacktipShark, LS = F.lemonShark;
	if ( hash( k, 0x5a1 ) < BT.chance ) {

		const s = Math.imul( k, 389 ), on = inWindow( phi, BT.on ) > 0.5, t = T / 1.2;
		if ( on ) {

			// (over the flat in water of most of a metre, up and down a feeding ground's ray as the tide goes)
			const R = pick( RAYS, hash( s, 0x5a2 ) );
			keepTo( R, T, BT.depth, 0.15, 30, t, s, _f );
			const x = _f.x, z = _f.z;
			keepTo( R, T + 0.05, BT.depth, 0.15, 30, t + 0.05 / 1.2, s, _f );
			const dx = _f.x - x, dz = _f.z - z, l = Math.sqrt( dx * dx + dz * dz ) || 1;
			add( `blacktip:${ k }`, 'blacktipShark', between( BT.n, hash( s, 0x5a3 ) ), x, z, dx / l, dz / l, 'cruise', 1 );

		} else {

			along( EDGE_OUT, 0.5 + 0.45 * wobble( t, s ^ 3 ), _q );
			add( `blacktip:${ k }`, 'blacktipShark', between( BT.n, hash( s, 0x5a3 ) ), _q.x, _q.z, _q.dx, _q.dz, 'cruise', 1 );

		}

	}

	if ( hash( k, 0x1e3 ) < LS.chance ) {

		const s = Math.imul( k, 241 ), on = inWindow( phi, LS.on ) > 0.5, t = T / 1.5;
		along( on ? EDGE_IN : EDGE_OUT, 0.5 + 0.45 * wobble( t, s ), _q );
		add( `lemon:${ k }`, 'lemonShark', 1, _q.x, _q.z, _q.dx, _q.dz, 'cruise', 1 );

	}

	// the snook: on the ebb in the creeks' upper reaches while they're still deep, the mangrove creek's most of all
	// (where it comes out of the stand), facing up the creek into the ebb running out of it
	const SN = F.snook, ebb = inWindow( phi, SN.on, 0.6 );
	if ( ebb > 0 ) for ( let i = 0, n = between( SN.n, hash( k, 0x5e00 ) ); i < n; i ++ ) {

		const s = Math.imul( k, 59 ) + i;
		const lie = hash( s, 0x5e01 ) < SN.mangrove ? SNOOK_LIES.find( ( L ) => L.mangrove ) : pick( SNOOK_LIES.filter( ( L ) => ! L.mangrove ), hash( s, 0x5e02 ) );
		const u = lie.k[ 0 ] + ( lie.k[ 1 ] - lie.k[ 0 ] ) * hash( s, 0x5e03 );
		along( lie.line, u, _q );
		add( `snook:${ k }:${ i }`, 'snook', 1, _q.x, _q.z, _q.dx, _q.dz, 'hold', ebb );

	}

}
