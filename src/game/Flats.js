import { FLATS } from '../world/terrain/Flats.js';
import { tideTurns, moonAt, SYNODIC } from './IslandClock.js';
import { hash } from './Weather.js';

// (M17) The flats' fish, as data: where each school is on the west's flats (world/terrain/Flats.js) at the island's
// time, by the tide and the moon, and what's happened to it (spooked, hooked). Worked out from the clock alone, as the
// weather and the far water's finds are (game/Finds.js), so everyone sees the same school in the same place, and only
// what changes is sent (a school spooked, a fish hooked: `state`, a small record). How they're drawn, seen, stalked
// and cast to is sight-fishing's (M17's stream 1); this is where they are.
//
// Each high water brings its own fish, from the sources (docs/m17/sources-tide-fish.md):
//   - bonefish, 3 to 6 schools of 3 to 20, onto the flat up its creeks from about 3 h into the flood, feeding over it
//     (tailing where it's shallow, mudding), and off again down the creeks by about 3 h into the ebb (Murchie and
//     others 2013, Cape Eleuthera's telemetry: almost never on the flats outside that); staging at the creeks' mouths
//     and along the edge before and after. Fewer in a blow. For some days about each new and full moon, a school of
//     hundreds gathering off the edge at dusk to spawn (Danylchuk 2011);
//   - permit, alone or in pairs, cruising the flat's edge on the flood and at high water, off it in deeper water at low;
//   - blacktip sharks in a small pack, and a lemon shark alone, cruising the flat at high water and the edge at low;
//   - barracuda, alone, lying over the grass and the potholes at any tide;
//   - tarpon, in the main creek's mouth and the potholes, rolling (more at dawn and dusk and in still air: they gulp
//     air, most where the water's short of it), and laid up on the edge in calm, sunny water;
//   - snook along the mangroves' edge and at the creeks' heads on the ebb, facing into the current.
// A school's anchor moves at the island's pace (an island hour is 100 s by day): up a creek in about an island hour,
// then drifting tens of metres over its feeding ground; the fish themselves swim about it in real time (world/Fish.js).
// Like the weather it's + - x / and integer hashes (with Math.sqrt, which IEEE rounds the same everywhere), so every
// device has the same fish.
//
//   flatsSchools( T, { wind, overcast, hour }, state, out ) -> [ { id, kind, n, x, z, dx, dz, mode, life } ]
//     id: the school's own (its high water's and its number); n: how many (what's been hooked taken off); ( x, z ): its
//     anchor; ( dx, dz ): the way it's going; mode: 'cruise' | 'feed' | 'tail' | 'mill' | 'roll' | 'laid' | 'hold';
//     life: 0..1 as it comes and goes
//   newFlatsState() -> { spooked: { id: T until }, hooked: { id: count } }   spook( state, id, T )   hook( state, id )
//   forgetFlats( state, T ): what's long past let go     tideStage( T ) -> { high: { T, k }, phi } (hours from high water)

export const FLATS_FISH = {
	quiet: 0.6, // island hours a spooked school's gone for (the flat goes quiet a while: about a minute by day)
	bonefish: { schools: [ 3, 6 ], n: [ 3, 20 ], on: [ - 3.2, 3.2 ], up: 1.1, stage: 5.2, roam: 26, blow: [ 9, 15 ] },
	spawn: { days: 3, from: 17, to: 21, n: [ 300, 900 ], off: 40 }, // (days either side of new and full moon; the hours)
	permit: { most: 2, chance: 0.75, on: [ - 4, 2.6 ], inside: 18, off: 30 },
	blacktipShark: { chance: 0.6, n: [ 2, 5 ], on: [ - 2.5, 2.5 ] },
	lemonShark: { chance: 0.35, on: [ - 3, 3 ] },
	barracuda: { n: [ 1, 3 ] },
	tarpon: { n: [ 1, 6 ], calm: 4, sunny: 0.3 },
	snook: { n: [ 2, 4 ], on: [ 0.5, 5.5 ] },
};

const F = FLATS_FISH;
const HIGH_GAP = 12.4206; // h: M2's period, high to high (the integer of each high water's, its `k`)
// where they feed, on the flat's sand and grass (x, z): each well in from its edge, off the creeks, the holes and the
// mangroves' mud, in a few tenths of a metre of water at mean and the same about it (test/flats.mjs)
export const FLATS_HOMES = [ [ - 622, - 214 ], [ - 520, - 4 ], [ - 712, - 52 ], [ - 744, - 176 ], [ - 524, - 132 ], [ - 544, - 296 ], [ - 608, - 68 ], [ - 696, - 272 ], [ - 668, - 132 ], [ - 616, - 288 ], [ - 596, - 148 ], [ - 552, - 228 ] ];
// where the mangroves' edge is, for the snook (x, z: off the stand, in its fringe's water)
export const FLATS_MANGROVE_EDGE = [ [ - 556, - 252 ], [ - 548, - 214 ], [ - 532, - 168 ], [ - 512, - 130 ], [ - 496, - 96 ] ];
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

const EDGE_IN = edgeLine( F.permit.inside ), EDGE_OUT = edgeLine( - F.permit.off );
// the main creek's mouth (its line's first point), for the tarpon and the spawning bonefish
const MOUTH = FLATS.creeks[ 0 ].line[ 0 ];

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

export const newFlatsState = () => ( { spooked: {}, hooked: {} } );

// a school spooked at T: it bolts, and it's gone for a while
export function spook( state, id, T ) {

	state.spooked[ id ] = T + F.quiet;
	return state;

}

// one of a school hooked: it's one fewer for the rest of its visit
export function hook( state, id ) {

	state.hooked[ id ] = ( state.hooked[ id ] || 0 ) + 1;
	return state;

}

// what's long past let go (the schools of tides gone by)
export function forgetFlats( state, T ) {

	const k = Math.round( T / HIGH_GAP );
	for ( const id of Object.keys( state.spooked ) ) if ( state.spooked[ id ] < T ) delete state.spooked[ id ];
	for ( const id of Object.keys( state.hooked ) ) if ( Number( id.split( ':' )[ 1 ] ) < k - 2 ) delete state.hooked[ id ];
	return state;

}

const _p = { x: 0, z: 0, dx: 0, dz: 1 }, _q = { x: 0, z: 0, dx: 0, dz: 1 };
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

		const s = Math.imul( day, 131 ) + i, home = pick( FLATS_HOMES, hash( s, 0x0bac1 ) ), r = 12;
		const t = T / 3 + hash( s, 0x0bac2 ) * 50;
		add( `cuda:${ day }:${ i }`, 'barracuda', 1, home[ 0 ] + r * wobble( t, s ^ 0x55 ), home[ 1 ] + r * wobble( t, s ^ 0x66 ), wobble( t * 3, s ^ 0x77 ), wobble( t * 3 + 9, s ^ 0x77 ), 'hold', 1 );

	}

	const P = F.tarpon, calm = c.wind < P.calm, sunny = c.overcast < P.sunny && hour > 9 && hour < 16;
	const dusk = sstep( 4.5, 6, hour ) * ( 1 - sstep( 7.5, 9, hour ) ) + sstep( 16.5, 18, hour ) * ( 1 - sstep( 19.5, 20.5, hour ) );
	for ( let i = 0, n = between( P.n, hash( day, 0x7a4b0 ) ); i < n; i ++ ) {

		const s = Math.imul( day, 173 ) + i, hole = FLATS.holes[ Math.floor( hash( s, 0x7a4b1 ) * FLATS.holes.length ) ];
		const at = hash( s, 0x7a4b2 ) < 0.5 ? MOUTH : hole;
		const t = T / 2 + hash( s, 0x7a4b3 ) * 40, r = 10;
		if ( calm && sunny ) {

			// (laid up on the edge in calm, sunny water, as still as logs)
			along( EDGE_IN, hash( s, 0x7a4b4 ), _q );
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
		const home = pick( FLATS_HOMES, hash( s, 0xb0e5 ) );
		// (each school a little early or late)
		const p = phi + ( hash( s, 0xb0e6 ) - 0.5 ) * 0.8, id = `bone:${ k }:${ i }`;
		const life = sstep( - BF.stage - 0.5, - BF.stage, p ) * ( 1 - sstep( BF.stage, BF.stage + 0.5, p ) );
		if ( p < on0 ) {

			// staging at its creek's mouth, milling
			const t = T * 2 + i;
			add( id, 'bonefish', n, inRoute[ 0 ][ 0 ] + 8 * wobble( t, s ), inRoute[ 0 ][ 1 ] + 8 * wobble( t, s ^ 1 ), wobble( t, s ^ 2 ), wobble( t + 3, s ^ 2 ), 'mill', life );

		} else if ( p < on0 + BF.up ) {

			// up the creek and out over the flat to where it'll feed
			along( [ ...inRoute, home ], ( p - on0 ) / BF.up, _p );
			add( id, 'bonefish', n, _p.x, _p.z, _p.dx, _p.dz, 'cruise', life );

		} else if ( p < on1 - BF.up ) {

			// feeding over its ground, drifting: tailing in the shallowest of it (sight-fishing reads the water there)
			const t = ( p - on0 ) / 1.6 + i * 7.3, R = BF.roam;
			const x = home[ 0 ] + R * wobble( t, s ^ 3 ), z = home[ 1 ] + R * wobble( t, s ^ 4 );
			const x1 = home[ 0 ] + R * wobble( t + 0.05, s ^ 3 ), z1 = home[ 1 ] + R * wobble( t + 0.05, s ^ 4 ), l = Math.sqrt( ( x1 - x ) * ( x1 - x ) + ( z1 - z ) * ( z1 - z ) ) || 1;
			add( id, 'bonefish', n, x, z, ( x1 - x ) / l, ( z1 - z ) / l, hash( Math.floor( p * 3 ) + s, 0xb0e7 ) < 0.55 ? 'tail' : 'feed', life );

		} else if ( p < on1 ) {

			// back to a creek and down it
			along( [ home, ...outRoute.slice().reverse() ], ( p - on1 + BF.up ) / BF.up, _p );
			add( id, 'bonefish', n, _p.x, _p.z, _p.dx, _p.dz, 'cruise', life );

		} else {

			// off the flat, along the edge by its creek's mouth
			const t = T * 2 + i;
			add( id, 'bonefish', n, outRoute[ 0 ][ 0 ] + 10 * wobble( t, s ^ 5 ), outRoute[ 0 ][ 1 ] + 10 * wobble( t, s ^ 6 ), wobble( t, s ^ 7 ), wobble( t + 3, s ^ 7 ), 'mill', life );

		}

	}

	// the permit: along the edge on the flood and at high water, off it in deeper water at low
	const PM = F.permit;
	for ( let i = 0; i < PM.most; i ++ ) {

		const s = Math.imul( k, 613 ) + i * 17;
		if ( hash( s, 0x9e10 ) > PM.chance * ( i === 0 ? 1 : 0.5 ) ) continue;
		const n = hash( s, 0x9e11 ) < 0.6 ? 1 : 2, on = inWindow( phi, PM.on );
		const u = 0.5 + 0.45 * wobble( T / 1.5 + i * 3.1, s ^ 0x9e12 );
		along( on > 0.5 ? EDGE_IN : EDGE_OUT, u, _q );
		const u1 = 0.5 + 0.45 * wobble( T / 1.5 + i * 3.1 + 0.02, s ^ 0x9e12 ), back = u1 < u ? - 1 : 1;
		add( `permit:${ k }:${ i }`, 'permit', n, _q.x, _q.z, _q.dx * back, _q.dz * back, 'cruise', 1 );

	}

	// the sharks: a pack of blacktips and a lemon on the flat at high water, on its edge at low
	const BT = F.blacktipShark, LS = F.lemonShark;
	if ( hash( k, 0x5a1 ) < BT.chance ) {

		const s = Math.imul( k, 389 ), on = inWindow( phi, BT.on ) > 0.5, t = T / 1.2;
		if ( on ) {

			const home = pick( FLATS_HOMES, hash( s, 0x5a2 ) ), R = 40;
			add( `blacktip:${ k }`, 'blacktipShark', between( BT.n, hash( s, 0x5a3 ) ), home[ 0 ] + R * wobble( t, s ), home[ 1 ] + R * wobble( t, s ^ 1 ), wobble( t * 2, s ^ 2 ), wobble( t * 2 + 4, s ^ 2 ), 'cruise', 1 );

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

	// the snook: along the mangroves' edge and at the creeks' heads on the ebb, facing into its current (the ebb runs
	// out to the edge, so they face up the creeks, toward the mangroves)
	const SN = F.snook, ebb = inWindow( phi, SN.on, 0.6 );
	if ( ebb > 0 ) for ( let i = 0, n = between( SN.n, hash( k, 0x5e00 ) ); i < n; i ++ ) {

		const s = Math.imul( k, 59 ) + i;
		const r = hash( s, 0x5e01 ), head = r < 0.5 ? pick( FLATS_ROUTES, hash( s, 0x5e02 ) ).slice( - 1 )[ 0 ] : null;
		if ( head ) {

			const route = FLATS_ROUTES.find( ( q ) => q[ q.length - 1 ] === head ), b = route[ route.length - 2 ];
			const l = LEN( b, head ) || 1;
			add( `snook:${ k }:${ i }`, 'snook', 1, head[ 0 ], head[ 1 ], ( head[ 0 ] - b[ 0 ] ) / l, ( head[ 1 ] - b[ 1 ] ) / l, 'hold', ebb );

		} else {

			along( FLATS_MANGROVE_EDGE, hash( s, 0x5e03 ), _q );
			// (facing in to the mangroves: across the ebb that runs out along their edge)
			add( `snook:${ k }:${ i }`, 'snook', 1, _q.x, _q.z, _q.dz, - _q.dx, 'hold', ebb );

		}

	}

}
