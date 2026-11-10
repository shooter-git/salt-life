// (M17) The flats' sounds as numbers (pure: SoundScape plays them; test/flats-sounds.mjs; the listening page, tools/sounds/):
// a tail's slap where its ring is drawn, a spooked school's rush where it bolts, and the kayak's own water by her speed on still
// water. Chosen by ear, the levels too (MIX's tailSplash, schoolBolt, kayakPush): docs/m17/sounds.md.

// a tail's slap: heard within `heard` m, at its level `ref` m off; one ring in so many heard (the rest wave silently), none
// sooner than `gap` s after another; a tail this far out (m) at its full level; its slices for a bonefish's (the koi's) and a
// permit's (a fish landing, heavier)
export const TAIL = { heard: 30, ref: 10, chance: 0.4, gap: 0.25, out: 0.1, bonefish: [ 0, 8 ], permit: [ 8, 10 ] };
// a school bolting: heard within `heard` m, at its level `ref` m off for a school of `school`; louder or quieter by its count
// (as power), within `least` and `most` dB
export const BOLT = { heard: 120, ref: 15, school: 12, least: - 6, most: 2 };
// the kayak's push: from nothing drifting to her level between `from` m/s, at it at her hull speed (`top`, 4.4 knots: Paddle.js),
// and gone in a breeze (`calm`: m/s of wind, all of it to none), where the chop's slaps are her water
export const PUSH = { from: [ 0.2, 0.6 ], top: 2.26, calm: [ 3, 8 ] };

const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );
const smooth = ( a, b, x ) => {

	const t = clamp( ( x - a ) / ( b - a ), 0, 1 );
	return t * t * ( 3 - 2 * t );

};

// still water's share at `wind` m/s: 1 in a calm, 0 in a breeze
export const stillOf = ( wind ) => 1 - smooth( PUSH.calm[ 0 ], PUSH.calm[ 1 ], wind );

// the push's share of its level at `speed` m/s through the water: the bow's sound's power about as the speed cubed (5 dB under
// the top at 3 knots, 10 at 2), on still water
export const pushShare = ( speed, wind = 0 ) => smooth( PUSH.from[ 0 ], PUSH.from[ 1 ], speed ) * Math.pow( clamp( speed, 0.05, PUSH.top ) / PUSH.top, 1.5 ) * stillOf( wind );

// and its rate: a little brighter faster
export const pushRate = ( speed ) => 0.92 + 0.12 * clamp( speed / PUSH.top, 0, 1 );

// a tail's level against MIX.tailSplash (dB): by how much of it's out of the water (m), a permit's heavier
export const tailDb = ( out, permit = false ) => ( permit ? 3 : 0 ) - 6 * ( 1 - clamp( out / TAIL.out, 0.3, 1 ) );

// which slice: r in 0..1
export const tailSlice = ( permit, r ) => {

	const [ a, b ] = permit ? TAIL.permit : TAIL.bonefish;
	return a + Math.min( b - a - 1, Math.floor( r * ( b - a ) ) );

};

// a bolt's level against MIX.schoolBolt (dB), by the school's count
export const boltDb = ( n ) => clamp( 10 * Math.log10( Math.max( 1, n ) / BOLT.school ), BOLT.least, BOLT.most );
