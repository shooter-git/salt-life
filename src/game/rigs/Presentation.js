import { FISH } from '../FishTable.js';

// (M16) What's in the water on the end of your line, and what the fish make of it: data and arithmetic only, so the
// bites and the tests read it freely (Bites.js takes habitat.rig: rigWeight, rigDelay; Game.habitat: atHook).
//
// A rig:
//   kind     'float' (a hook under a float) | 'bottom' (a sinker to the seabed, by hand) | 'troll' (towed behind a
//            running boat) | 'kite' (hung from a kite, splashing at the surface) | 'drop' (a heavy lead to the deep
//            seabed on an electric reel)
//   hookM    how far the hook is under the surface, m
//   floorM   the water under it, m
//   knots    what it's towed at (troll)
//   lines    how many are out (troll)
//   lure     'jig' | 'plug' | 'skirt', or null: a bait's on
//   leader   'mono' | 'fluoro' | 'wire' | 'heavy'
//
// Sources for the figures are in docs/m16/tackle.md.
export const RIGS = {
	float: { name: 'Float', stop: 5, needs: null },
	bottom: { name: 'Sinker', sink: 1.5, reach: 250, needs: null },
	troll: { name: 'Troll', needs: 'boat' },
	kite: { name: 'Kite', needs: 'boat' },
	drop: { name: 'Deep drop', sink: 2.5, reach: 900, needs: 'electricReel' },
};
export const RIG_IDS = Object.keys( RIGS );

export const KNOTS = 1.94384; // knots to a m/s

// what can go on each (null: the frozen shrimp, always to hand)
const ONLY = {
	float: ( b ) => b === null || ( ! b.towed && ! b.chum && ( ! b.lure || b.surface ) ),
	bottom: ( b ) => b === null || ( ! b.towed && ! b.chum && ( ! b.lure || b.sinks ) ),
	troll: ( b ) => b !== null && ! b.chum && ( b.towed || b.tow ),
	kite: ( b ) => b !== null && b.live,
	drop: ( b ) => b !== null && ! b.chum && ! b.lure && ! b.live,
};
export const baitFits = ( kind, bait ) => ONLY[ kind ]( bait || null );

// how well a towed bait swims at this speed, 0..1: [ too slow, best from, best to, washed out ] in knots
// (a bait's or a lure's `tow`). Off the two ends nothing takes it: it sinks and hangs, or it's torn off the hook
export function towTaste( tow, knots ) {

	if ( ! tow || knots <= tow[ 0 ] || knots >= tow[ 3 ] ) return 0;
	if ( knots < tow[ 1 ] ) return ( knots - tow[ 0 ] ) / ( tow[ 1 ] - tow[ 0 ] );
	if ( knots > tow[ 2 ] ) return ( tow[ 3 ] - knots ) / ( tow[ 3 ] - tow[ 2 ] );
	return 1;

}

// the leader a sensible angler ties on, of those they own (Gear.js' leader track: 0 light mono, 1 fluorocarbon, 2 wire,
// 3 200 lb mono)
export function leaderFor( level, kind, knots = 0, lure = null ) {

	const has = ( n ) => level >= n;
	// (a long leader that can't be seen on a bait hung from a kite; heavy mono down deep; wire at a wahoo's speed)
	if ( kind === 'troll' ) return knots >= 11 && has( 2 ) ? 'wire' : has( 3 ) ? 'heavy' : has( 2 ) ? 'wire' : has( 1 ) ? 'fluoro' : 'mono';
	if ( kind === 'drop' ) return has( 3 ) ? 'heavy' : has( 2 ) ? 'wire' : has( 1 ) ? 'fluoro' : 'mono';
	if ( lure === 'plug' ) return has( 2 ) ? 'wire' : has( 1 ) ? 'fluoro' : 'mono';
	return has( 1 ) ? 'fluoro' : 'mono';

}

export const LEADERS = { mono: 'light mono', fluoro: 'fluorocarbon', wire: 'wire', heavy: '200 lb mono' };

// ---- what the fish make of it. Each of these can be said on the fish's own entry (FishTable): its own wins

// its taste for a rig, past which any fish of open water takes a towed bait or one on a kite, and little else does
const TASTE = {
	troll: { wahoo: 5, mahi: 3, tuna: 3, yellowfin: 3, sailfish: 2, whiteMarlin: 2, blueMarlin: 2, barracuda: 2.5, jack: 1.2, tarpon: 0.5, blackGrouper: 0.3, cuberaSnapper: 0.3 },
	kite: { sailfish: 9, whiteMarlin: 2, blueMarlin: 1, tuna: 3, yellowfin: 3, mahi: 2.5, wahoo: 2, barracuda: 1.5, tarpon: 1 },
	drop: { swordfish: 8, silkSnapper: 1.4 },
};
const TASTE_ELSE = { float: 1, bottom: 1, troll: 0.1, kite: 0.08, drop: 1 };

// where it feeds, m under the surface. Swordfish rise at night and lie deep by day
const COLUMN = { swordfish: [ 250, 750 ], blueMarlin: [ 0, 200 ], whiteMarlin: [ 0, 150 ], sailfish: [ 0, 100 ], wahoo: [ 0, 80 ], yellowfin: [ 0, 250 ] };
const COLUMN_NIGHT = { swordfish: [ 5, 150 ] };
const OPEN = [ 'blue', 'edge', 'weed', 'debris', 'birds' ], ROOTED = [ 'deep', 'ledge', 'reef', 'bay', 'pier', 'shallows', 'creek', 'wash' ];

// the speed it strikes a towed bait at, knots: most anything at what a bait swims at; a wahoo faster than that
const TOW_KNOTS = { wahoo: [ 9, 17 ], mahi: [ 4.5, 11 ], tuna: [ 5, 12 ], yellowfin: [ 5, 12 ] };
const TOW_KNOTS_ELSE = [ 3, 10 ];

// how shy of a leader it can see: wire keeps this share away, 200 lb mono a little over half of that, and
// fluorocarbon brings a little more in
const SHY = { tuna: 0.7, yellowfin: 0.7, mahi: 0.25, sailfish: 0.3, whiteMarlin: 0.2, muttonSnapper: 0.6, redSnapper: 0.5, silkSnapper: 0.3, graySnapper: 0.7, yellowtail: 0.8, permit: 0.8, bonefish: 0.8, snook: 0.5, pompano: 0.5 };
const TEETH = { wahoo: true, barracuda: true };
const BILL = { sailfish: true, whiteMarlin: true, blueMarlin: true, swordfish: true };
// what jumps in the fight
const LEAPS = { sailfish: true, whiteMarlin: true, blueMarlin: true, mahi: true, tarpon: true };

const inColumn = ( c, m ) => {

	const off = m < c[ 0 ] ? c[ 0 ] - m : m > c[ 1 ] ? m - c[ 1 ] : 0;
	return off <= 0 ? 1 : Math.max( 0.02, 1 - off / ( 20 + 0.25 * ( c[ 1 ] - c[ 0 ] ) ) );

};

// the column a fish feeds in, or null: anywhere (those tied to a bottom are read from the water: atHook)
export function columnOf( id, hour = 12 ) {

	const f = FISH[ id ];
	if ( ! f ) return null;
	const night = hour < 6 || hour > 19;
	if ( night && ( f.columnNight || COLUMN_NIGHT[ id ] ) ) return f.columnNight || COLUMN_NIGHT[ id ];
	if ( f.column || COLUMN[ id ] ) return f.column || COLUMN[ id ];
	const h = f.habitat || {};
	return OPEN.some( ( k ) => h[ k ] ) && ! ROOTED.some( ( k ) => h[ k ] ) ? [ 0, 150 ] : null;

}

// a species' bite weight on this rig, times this (no rig: as it was)
export function rigWeight( rig, id, hour = 12 ) {

	if ( ! rig ) return 1;
	const f = FISH[ id ] || {};
	let x = ( f.rigs && f.rigs[ rig.kind ] ) ?? ( TASTE[ rig.kind ] && TASTE[ rig.kind ][ id ] ) ?? TASTE_ELSE[ rig.kind ];
	const c = columnOf( id, hour );
	if ( c ) x *= inColumn( c, rig.hookM );
	if ( f.floor != null ) x *= inColumn( [ 0, f.floor ], Math.max( 0, rig.floorM - rig.hookM ) );
	if ( rig.kind === 'troll' ) {

		const k = f.knots || TOW_KNOTS[ id ] || TOW_KNOTS_ELSE, v = rig.knots || 0;
		x *= v < k[ 0 ] ? Math.max( 0, 1 - ( k[ 0 ] - v ) / 3 ) : v > k[ 1 ] ? Math.max( 0, 1 - ( v - k[ 1 ] ) / 3 ) : 1;

	}

	const shy = f.shy ?? SHY[ id ] ?? 0;
	if ( rig.leader === 'wire' ) x *= 1 - shy;
	else if ( rig.leader === 'heavy' ) x *= 1 - shy * 0.55;
	else if ( rig.leader === 'fluoro' ) x *= 1 + shy * 0.4;
	return x;

}

// how much longer a bite takes on this rig than on a float. A towed bait covers water but few come up to it: real
// days offshore are hours between strikes, here minutes; the more lines the sooner. Deep down it's a long wait
export function rigDelay( rig ) {

	if ( ! rig ) return 1;
	switch ( rig.kind ) {

		case 'troll': return 5 / Math.sqrt( Math.max( 1, rig.lines || 1 ) );
		case 'kite': return 3.5;
		case 'drop': return 3;
		case 'bottom': return 1;
		default: return 1;

	}

}

// the water types as the hook finds them: the fish of a bottom only near it, and those about what floats on top only
// near that. In place, and hands it back; the species' own column is rigWeight's
const nearFloor = ( gap ) => 1 - smooth( 8, 30, gap );
export function atHook( h, rig ) {

	if ( ! rig ) return h;
	const gap = Math.max( 0, rig.floorM - rig.hookM ), low = Math.max( 0.06, nearFloor( gap ) ), top = 1 - smooth( 20, 70, rig.hookM );
	for ( const k of [ 'deep', 'ledge' ] ) h[ k ] *= low;
	h.reef *= Math.max( 0.1, 1 - smooth( 12, 35, gap ) );
	for ( const k of [ 'weed', 'debris', 'birds' ] ) h[ k ] *= top;
	h.rig = rig;
	return h;

}

// how likely a fight's leader is to go at each run, by what it is and what's on it: { cut: teeth, wear: a bill }
export function leaderRisk( leader, id ) {

	const f = FISH[ id ] || {};
	const teeth = f.teeth ?? TEETH[ id ], bill = f.bill ?? BILL[ id ];
	return {
		cut: teeth && leader !== 'wire' ? ( leader === 'heavy' ? 0.1 : 0.3 ) : 0,
		wear: bill && leader !== 'heavy' && leader !== 'wire' ? 0.1 : 0,
	};

}

export const leapsOf = ( id ) => ( FISH[ id ] || {} ).leaps ?? !! LEAPS[ id ];

function smooth( e0, e1, x ) {

	const t = Math.min( 1, Math.max( 0, ( x - e0 ) / ( e1 - e0 ) ) );
	return t * t * ( 3 - 2 * t );

}
