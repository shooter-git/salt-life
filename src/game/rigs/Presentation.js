import { FISH, FISH_IDS } from '../FishTable.js';
import { biteDelay, pickSpecies } from '../Bites.js';

// (M16) What's in the water on the end of your line, and what the fish make of it: no three.js, so the tests read it freely.
// Bites.js has the fish's own say (habitat.hook, by the table's ways, at and eats: docs/m16/fish.md). Here's the
// rest of it, round Bites: the water as the hook finds it (atHook), who strikes at what speed and looks at what leader
// (rigWeight, in pickOnRig), and how long the wait is (rigDelay, in waitOnRig).
//
// The hook (habitat.hook, and the rig on your line):
//   way      as the fish table knows it: 'float' | 'troll' | 'kite' | 'drop'
//   kind     'float' (a hook under a float) | 'bottom' (a sinker to the seabed, by hand: the 'float' way, deeper) |
//            'troll' (towed behind a running boat) | 'kite' (hung from a kite, splashing at the surface) | 'drop' (a
//            heavy lead to the deep seabed on an electric reel)
//   depth    how far the hook is under the surface, m
//   floorM   the water under it, m
//   knots    what it's towed at (troll)
//   lines    how many are out (troll)
//   lure     'jig' | 'plug' | 'skirt', or null: a bait's on
//   leader   'mono' | 'fluoro' | 'wire' | 'heavy'
//
// Who takes a towed bait, a kite's or a deep drop is the fish table's: its ways.
//
// Sources for the figures are in docs/m16/tackle.md.
export const RIGS = {
	float: { name: 'Float', stop: 5, needs: null },
	bottom: { name: 'Sinker', sink: 1.5, reach: 250, needs: null },
	troll: { name: 'Troll', needs: 'boat' },
	kite: { name: 'Kite', needs: 'boat' },
	drop: { name: 'Deep drop', sink: 2.5, reach: 900, needs: 'electricReel' },
	// ((M19) the fly rod's, stream FLY's: anywhere, wading and from the kayak too (anywhere). needs names the track, not a
	// stat, so Rigs.available finds it wanting until FLY reads the fly rods you have: gearStats' flyRods)
	fly: { name: 'Fly', needs: 'flyRod', anywhere: true },
};
export const RIG_IDS = Object.keys( RIGS );

export const KNOTS = 1.94384; // knots to a m/s

// what can go on each (null: the frozen shrimp, always to hand)
const ONLY = {
	float: ( b ) => b === null || ( ! b.towed && ! b.chum && ( ! b.lure || b.surface ) ),
	bottom: ( b ) => b === null || ( ! b.towed && ! b.chum && ( ! b.lure || b.sinks ) ),
	troll: ( b ) => b !== null && ! b.chum && ( b.towed || b.tow ),
	kite: ( b ) => b !== null && b.live && b.kite !== false, // ((M19) a live fish: not a shrimp or a crab, kite: false)
	drop: ( b ) => b !== null && ! b.chum && ! b.lure && ! b.live,
	// ((M19) a fly, and nothing but)
	fly: ( b ) => b !== null && !! b.fly,
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

// the leader a sensible angler ties on for the rig, of those they own (Gear.js' leader track: 0 light mono, 1 fluorocarbon,
// 2 wire, 3 200 lb mono), if you haven't tied on one of your own (leaderOn)
export function leaderFor( level, kind, knots = 0, lure = null ) {

	const has = ( n ) => level >= n;
	// (a long leader that can't be seen on a bait hung from a kite; heavy mono down deep; wire at a wahoo's speed)
	if ( kind === 'troll' ) return knots >= 11 && has( 2 ) ? 'wire' : has( 3 ) ? 'heavy' : has( 2 ) ? 'wire' : has( 1 ) ? 'fluoro' : 'mono';
	if ( kind === 'drop' ) return has( 3 ) ? 'heavy' : has( 2 ) ? 'wire' : has( 1 ) ? 'fluoro' : 'mono';
	if ( lure === 'plug' ) return has( 2 ) ? 'wire' : has( 1 ) ? 'fluoro' : 'mono';
	return has( 1 ) ? 'fluoro' : 'mono';

}

export const LEADERS = { mono: 'light mono', fluoro: 'fluorocarbon', wire: 'wire', heavy: '200 lb mono' };
export const LEADER_IDS = Object.keys( LEADERS ); // (in the track's order)
// what's on the line: the one you tied on (GameState.leaderPick) on any rig, while it's one you own; else the sensible one
export function leaderOn( pick, level, kind, knots = 0, lure = null ) {

	const i = LEADER_IDS.indexOf( pick );
	return i >= 0 && i <= level ? pick : leaderFor( level, kind, knots, lure );

}

// the hook for a rig
export const hookOf = ( kind, depth, floorM, extra = {} ) => ( { way: kind === 'bottom' ? 'float' : kind, kind, depth, floorM, lure: null, knots: 0, lines: 1, leader: 'mono', ...extra } );

// ---- what the fish make of it, past the table's ways and at (Bites.hookWeight). knots, shy, teeth, bill and leaps can be
// said on the fish's own entry: its own wins

// the speed it strikes a towed bait at, knots: most anything at what a bait swims at; a wahoo faster than that, and those
// of the bays, the creeks and the reef only to a plug towed slowly, a kayak's speed among them
const TOW_KNOTS = { wahoo: [ 9, 17 ], mahi: [ 4.5, 11 ], tuna: [ 5, 12 ], yellowfin: [ 5, 12 ], barracuda: [ 2.5, 12 ], jack: [ 2, 9 ], needlefish: [ 2, 8 ], tarpon: [ 2, 6 ], snook: [ 2, 5.5 ], redfish: [ 1.5, 4.5 ], trout: [ 1.5, 4.5 ], blackGrouper: [ 3, 7 ], cuberaSnapper: [ 3, 7 ], muttonSnapper: [ 3, 7 ], grouper: [ 3, 7 ] };
const TOW_KNOTS_ELSE = [ 3, 10 ];

// how shy of a leader it can see: wire keeps this share away, 200 lb mono a little over half of that, and
// fluorocarbon brings a little more in
const SHY = { tuna: 0.7, yellowfin: 0.7, mahi: 0.25, sailfish: 0.3, whiteMarlin: 0.2, muttonSnapper: 0.6, redSnapper: 0.5, silkSnapper: 0.3, graySnapper: 0.7, yellowtail: 0.8, permit: 0.8, bonefish: 0.8, snook: 0.5, pompano: 0.5 };
const TEETH = { wahoo: true, barracuda: true };
const BILL = { sailfish: true, whiteMarlin: true, blueMarlin: true, swordfish: true };
// what jumps in the fight
const LEAPS = { sailfish: true, whiteMarlin: true, blueMarlin: true, mahi: true, tarpon: true };

// a species' weight on this hook, times this, past what Bites made of it (no hook: as it was)
// (M19) teasers in the spread (the sportfisher's: daisy chains and dredges): the billfish raised to the baits the more. No
// study measures it; captains say noticeably (docs/m19/sources-big-game.md). Judgement
export const TEASE = 1.3;

export function rigWeight( rig, id ) {

	if ( ! rig ) return 1;
	const f = FISH[ id ] || {};
	let x = rig.kind === 'drop' && id === 'silkSnapper' ? 1.4 : 1; // (the deep drop's snapper above all)
	if ( rig.kind === 'troll' ) {

		const k = f.knots || TOW_KNOTS[ id ] || TOW_KNOTS_ELSE, v = rig.knots || 0;
		x *= v < k[ 0 ] ? Math.max( 0, 1 - ( k[ 0 ] - v ) / 3 ) : v > k[ 1 ] ? Math.max( 0, 1 - ( v - k[ 1 ] ) / 3 ) : 1;
		if ( rig.teasers && f.release > 0 ) x *= TEASE; // ((M19) a billfish, raised by the teasers)

	}

	const shy = f.shy ?? SHY[ id ] ?? 0;
	if ( rig.leader === 'wire' ) x *= 1 - shy;
	else if ( rig.leader === 'heavy' ) x *= 1 - shy * 0.55;
	else if ( rig.leader === 'fluoro' ) x *= 1 + shy * 0.4;
	return x;

}

// pickSpecies with rigWeight on it, by turning away what it offers in that proportion. h: atHook's
export function pickOnRig( h, hour, rng = Math.random, bait = null ) {

	const rig = h.hook;
	if ( ! rig ) return pickSpecies( h, hour, rng, bait );
	let top = 0;
	for ( const id of FISH_IDS ) top = Math.max( top, rigWeight( rig, id ) );
	if ( top <= 0 ) return null;
	for ( let i = 0; i < 40; i ++ ) {

		const id = pickSpecies( h, hour, rng, bait );
		if ( ! id ) return null;
		if ( rng() * top < rigWeight( rig, id ) ) return id;

	}

	return null;

}

// biteDelay on this rig
export const waitOnRig = ( h, hour, rng = Math.random, bait = null ) => biteDelay( h, hour, rng, bait ) * rigDelay( h.hook );

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
	const gap = Math.max( 0, rig.floorM - rig.depth ), low = Math.max( 0.06, nearFloor( gap ) ), top = 1 - smooth( 20, 70, rig.depth );
	for ( const k of [ 'deep', 'ledge' ] ) h[ k ] *= low;
	h.reef *= Math.max( 0.1, 1 - smooth( 12, 35, gap ) );
	for ( const k of [ 'weed', 'debris', 'birds' ] ) h[ k ] *= top;
	h.hook = rig;
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
