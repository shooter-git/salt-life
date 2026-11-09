// (M17) Sight-fishing's seeing and stalking, pure (no three.js): how plainly a fish on the flats shows to someone above
// the water, and what tells it they're there. Read by the glasses (rigs/Glasses.js: how much of the sea's glare is left
// through them), the flats' fish drawn (world/Fish.js: each faded by how plainly it shows, its shadow on the sand and
// its sign on the water drawn by world/fish/FlatsMarks.js) and their stalking (FlatsFishing.js). The sources are
// docs/m17/sources-tide-fish.md ("What spooks them", "Seeing them") and docs/m17/sight.md.
//
// Seeing. A fish under the water is seen by the light coming up from the bottom past it, against the sky's glare off
// the surface. Both go by the angle you look down (e = atan( eye / distance )): the surface reflects the sky by
// Fresnel's equations (seawater n = 1.34), most of it at a grazing look, and lets the bottom's light out by what it
// doesn't reflect. Polarized glasses take out the glare's s-polarized part, nearly all of it at Brewster's angle
// (37 degrees down) and little along the surface, so height is what shows you the water. Then:
//   - the bottom: white sand (about 0.55 of the light back) shows a fish and its shadow; turtle grass (0.1) hides both;
//   - the sun: high and behind you lights the bottom; under a cloud's shadow it's the sky's diffuse light alone (a
//     tenth of a clear day's, AMS), and the surface reflects the bright cloud: contrast collapses;
//   - the water: a ripple breaks up the image, and rain on it shows nothing;
//   - the fish: its back against the bottom (a bonefish is the grey ghost, a permit's back darker), its shadow on the
//     sand (the sun's light it takes away), its tail out of the water (seen against the water, best when it's glassy)
//     and its sign on the water (nervous water, a push, a wake: glassy water shows it furthest, a breeze hides it);
//   - and the threshold the eye needs, higher for something small and far (Blackwell's: a smaller target needs more
//     contrast, about as the inverse square of its size below a degree or so).
// Its constants are set so the ranges come out as guides give them (calibrated in test/sight.mjs): from a kayak's seat
// (0.81 m), close in, about 10 m; wading, standing (1.6 m), about 15; a casting deck or a bow (2.5 m) about 25; a roof
// (3.8 m) past 30. No study has measured spotting range by eye height (sources: "none found"), so these are guides'.
//
// Stalking. A fish notices you as the speargun's do, by how fast you come (world/Fish.js' WARY), and on the flats by:
//   - your height over the water (it sees you through Snell's window: a taller angler's seen further, the guides' "tall
//     stands spook fish");
//   - your shadow over it (long early and late, short at noon);
//   - a paddle knocking the hull (sound carries through the water: guides' dropped pliers, a hatch closing);
//   - the push of water ahead of a hull moving through shallow water;
//   - a lure landing on its head, and the line laid over its back.
// How far, by kind (FishTable's sight.wary), in calm and in a ripple (a breeze's chop hides you, glassy water doesn't).
//
//   fresnel( below )                    { R, Rs, Rp }: the sea's reflectance, unpolarized and each polarization
//   glareLeft( below )                  how much of the glare is left through the glasses: Rp / R
//   seenOnFlats( q )                    { body, shadow, tail, sign }, each 0..1: how plainly each shows
//   noticeRange( kind, q )              m: how far a fish of this kind notices someone coming
//   shadowLine( eye, sun, out )         the observer's shadow on the bottom: { dx, dz, len } from where they are
//   nearLine( ax, az, bx, bz, x, z )    m from ( x, z ) to the segment a to b (the line on the water, a shadow)
//   pushAhead( speed, depth )           m ahead of a moving hull that its push of water reaches
//   knockOf( force )                    the chance a paddle stroke this hard knocks the hull

import { FISH } from './FishTable.js';

export const N_WATER = 1.34;
const BREWSTER = Math.atan( N_WATER ); // from the vertical: 53.3 degrees, 36.7 below the horizon

export const SIGHT = {
	// the bottom, how much light it sends back (white oolitic sand, turtle grass, the mangroves' mud)
	bottom: { sand: 0.55, grass: 0.1, mud: 0.22 },
	// and how busy it is: a pattern on it masks what's over it (the eye needs this much more contrast: turtle grass's
	// blades and patches, the mud's pocks; white sand's plain)
	clutter: [ [ 0.1, 1.8 ], [ 0.22, 1.3 ], [ 0.55, 1 ] ],
	diffuse: 0.12, // the sky's share of a clear day's light on the bottom (AMS: under about a tenth with a high sun)
	cloud: 2.4, // a white cloud's radiance reflected, times a blue sky's near the horizon
	up: 1.1, // the bottom's light out through the surface, relative to the sky's glare (radiance divided by n squared)
	attenuate: 0.16, // per m of water, down and up again (clear Bahamas water, a few per cent a metre in the blue-green)
	c0: 0.046, // the threshold contrast for a big target, searched for (a few times the lab's 0.01 to 0.02: not knowing where to look)
	size0: 0.006, // rad: below this a target needs more contrast, as the inverse square of its size (Blackwell)
	shadow: 0.16, // a fish's shadow's contrast on the bottom, of the sun's light, as the ripples' caustics break it up
	chop: 7, // m/s of wind: a ripple's blur, the image's contrast halved past here
	glint: 0.9, // the sun's glitter ahead, with the sun low in front of you
	tail: { c: 0.3, chop: [ 3, 11 ] }, // a tail out of the water against the water's own sheen; the wind that hides it
	sign: { c: 0.1, chop: [ 1.5, 6.5 ] }, // the school's sign on the surface (nervous water, a push); glassy to a breeze
};

// the sea's reflectance looking `below` radians under the horizon: Fresnel's for air to seawater
export function fresnel( below ) {

	const e = Math.min( Math.PI / 2, Math.max( 1e-4, Math.abs( below ) ) );
	const ci = Math.sin( e ), si = Math.cos( e ), st = si / N_WATER, ct = Math.sqrt( Math.max( 0, 1 - st * st ) );
	const rs = ( ( ci - N_WATER * ct ) / ( ci + N_WATER * ct ) ) ** 2, rp = ( ( N_WATER * ci - ct ) / ( N_WATER * ci + ct ) ) ** 2;
	return { R: ( rs + rp ) / 2, Rs: rs, Rp: rp };

}

// how much of the sea's glare is left through polarized glasses, looking `below` radians down: the reflection's
// p-polarized part alone (the glasses take the s), of the whole. Nearly all of it along the surface, none at Brewster's
// angle; a real lens lets a few per cent of the rest through (the floor)
export function glareLeft( below ) {

	const f = fresnel( below );
	return Math.max( 0.03, f.Rp / Math.max( f.R, 1e-6 ) );

}

const clutterOf = ( albedo ) => {

	const C = SIGHT.clutter;
	if ( albedo <= C[ 0 ][ 0 ] ) return C[ 0 ][ 1 ];
	for ( let i = 1; i < C.length; i ++ ) if ( albedo <= C[ i ][ 0 ] ) return C[ i - 1 ][ 1 ] + ( C[ i ][ 1 ] - C[ i - 1 ][ 1 ] ) * ( albedo - C[ i - 1 ][ 0 ] ) / ( C[ i ][ 0 ] - C[ i - 1 ][ 0 ] );
	return C[ C.length - 1 ][ 1 ];

};

const smooth = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// a contrast's chance of being seen, for a target `size` radians across, over a bottom this busy
function detect( C, size, clutter = 1 ) {

	const th = SIGHT.c0 * clutter * ( 1 + ( SIGHT.size0 / Math.max( size, 1e-5 ) ) ** 2 );
	return smooth( th, th * 2.2, C );

}

// how plainly a fish on the flats shows, each 0..1 (body: the fish under the water; shadow: its shadow on the bottom;
// tail: its tail out of the water, when it has one up; sign: its school's sign on the surface, when it makes one)
//   q: { h (eye above the water, m), d (horizontal distance, m), L (the fish's length, m), depth (water over the bottom
//        there, m), bottom (its albedo: SIGHT.bottom's), back (the fish's contrast against white sand: FishTable's
//        sight.back), glasses, sun (its height, sin of its elevation; 0 down), behind (the cosine of the angle between
//        where you look and away from the sun: 1 with it at your back, -1 in your face), shade (0..1: a cloud's shadow
//        over the fish), overcast (0..1), wind (m/s), rain (0..1), night (0..1), tailUp (m of its tail out: 0 none),
//        sign (0..1: how much of a sign its school makes: cruising in shallow water 1, still 0) }
const _out = { body: 0, shadow: 0, tail: 0, sign: 0 };
export function seenOnFlats( q, out = _out ) {

	const S = SIGHT, d = Math.max( q.d, 0.3 ), h = Math.max( q.h, 0.05 ), e = Math.atan2( h, d );
	const r = Math.hypot( d, h ), size = q.L / r;
	const day = ( 1 - smooth( 0.25, 0.6, q.night || 0 ) ) * smooth( 0, 0.1, q.sun );
	const f = fresnel( e ), R = q.glasses ? glareLeft( e ) * f.R : f.R;
	// the light on the bottom: the sun's (its height, less a cloud's shadow), the sky's; and out through the surface
	const shade = Math.min( 1, Math.max( 0, q.shade || 0 ) ), over = Math.min( 1, Math.max( 0, q.overcast || 0 ) );
	const direct = Math.max( 0, q.sun ) * ( 1 - shade ) * ( 1 - 0.85 * over ), sky = S.diffuse * ( 1 + 1.5 * over );
	const k = Math.exp( - 2 * S.attenuate * Math.max( 0, q.depth ) ), out1 = ( 1 - f.R ) * S.up * k;
	const up = q.bottom * ( direct + sky ) * out1;
	// the glare: the sky reflected (a cloud's brighter), and the sun's glitter with it low ahead of you
	const glare = R * ( 1 + ( S.cloud - 1 ) * Math.max( shade, over ) ) * S.diffuse * 2 + S.glint * smooth( - 0.2, - 0.9, q.behind ) * ( 1 - smooth( 0.35, 0.75, q.sun ) ) * ( 1 - shade ) * ( q.glasses ? 0.5 : 1 ) * S.diffuse;
	// the image through the surface: a ripple's blur, rain's pocks
	const wind = Math.max( 0, q.wind || 0 ), clear = 1 / ( 1 + ( wind / S.chop ) ** 2 ), rain = 1 - Math.min( 1, ( q.rain || 0 ) * 1.6 );
	const back = Math.max( 0, q.back ), busy = clutterOf( q.bottom );
	out.body = day * rain * detect( up * back * clear / ( up + glare ), size, busy );
	// its shadow: the sun's light it takes off the bottom, on sand under a sun high enough to throw one
	const sh = q.bottom * direct * out1 * S.shadow * smooth( 0.25, 0.55, q.sun );
	out.shadow = day * rain * detect( sh * clear / ( up + glare ), size, busy );
	// its tail against the water (seen above the surface: no glare in the way, only the water's own ruffle)
	const tailK = ( 1 - smooth( S.tail.chop[ 0 ], S.tail.chop[ 1 ], wind ) ) * ( 1 - 0.8 * Math.min( 1, q.rain || 0 ) );
	out.tail = q.tailUp > 0 ? day * tailK * detect( S.tail.c, Math.min( q.tailUp, q.L * 0.3 ) / r ) : 0;
	// its school's sign: nervous water, a push, a wake; seen in the sheen of a low look, lost in a breeze's chop
	const signK = ( 1 - smooth( S.sign.chop[ 0 ], S.sign.chop[ 1 ], wind ) ) * ( 1 - Math.min( 1, ( q.rain || 0 ) * 2 ) );
	const W = q.L * 6; // (a school's patch of water, several fish across: seen foreshortened)
	out.sign = q.sign > 0 ? ( 0.35 + 0.65 * day ) * signK * detect( S.sign.c * q.sign, Math.sqrt( W * Math.sin( e ) / r * W / r ) ) : 0;
	return out;

}

// the sight entry of a kind: FishTable's (the catch table's flats fish), or the sharks' own (not the catch table's:
// nobody keeps one, and one on a rod bites through the line)
export const SHARK_SIGHT = {
	blacktipShark: { back: 0.32, wary: 0.6, lead: [ 0.5, 4 ], head: 0, speed: 1.6, bites: true, eats: { shrimp: 0.25, cutMullet: 0.55, mullet: 0.45, silverside: 0.35, jig: 0.08, plug: 0.06 }, picky: 0.5 },
	lemonShark: { back: 0.36, wary: 0.4, lead: [ 0.5, 3.5 ], head: 0, speed: 1.2, bites: true, eats: { shrimp: 0.3, cutMullet: 0.65, mullet: 0.5, silverside: 0.35, jig: 0.06, plug: 0.04 }, picky: 0.3 },
};
export const sightOf = ( kind ) => ( FISH[ kind ] && FISH[ kind ].sight ) || SHARK_SIGHT[ kind ] || null;

// how far (m) a fish of this kind notices someone coming at `speed` m/s (toward it), their eye `eye` m over the water
// (the taller they are over it, the further it sees them, through the edge of its window), in `wind` m/s (a chop hides
// them, glassy water doesn't), over `depth` m of water (a fish in a foot of water is the warier). A bonefish's: about 5 m
// from someone keeping still on a calm day (guides: still waders have them swim within a rod's length), 9 at a slow
// paddle, 15 and more coming fast
export const NOTICE = { still: 5, speed: [ [ 0, 0.55 ], [ 0.3, 0.7 ], [ 1, 1.4 ], [ 2, 2.3 ], [ 3.5, 3.2 ] ] };
export function noticeRange( kind, { speed = 0, eye = 1.6, wind = 5, depth = 0.5 } = {} ) {

	const S = sightOf( kind ), W = NOTICE.speed;
	let k = W[ W.length - 1 ][ 1 ];
	for ( let i = 1; i < W.length; i ++ ) if ( speed <= W[ i ][ 0 ] ) {

		const [ s0, k0 ] = W[ i - 1 ], [ s1, k1 ] = W[ i ];
		k = k0 + ( k1 - k0 ) * Math.max( 0, speed - s0 ) / ( s1 - s0 );
		break;

	}

	const tall = Math.sqrt( Math.max( 0.3, eye ) / 1.6 ), calm = 1.25 - 0.45 * smooth( 2, 8, wind ), shallow = 1.2 - 0.4 * smooth( 0.3, 1.5, depth );
	return NOTICE.still * ( S ? S.wary : 1 ) * k * tall * calm * shallow;

}

// the observer's shadow on the bottom, from where they stand: the way it falls (away from the sun) and how long it is,
// for something `tall` m over the water (a person standing 1.8, sitting in a kayak 0.9; a hull's own). None at night
// or with the sun under 4 degrees
export function shadowLine( tall, sun, out = { dx: 0, dz: 0, len: 0 } ) {

	const up = sun.y, flat = Math.hypot( sun.x, sun.z );
	if ( up < 0.07 || flat < 1e-6 ) {

		out.len = 0;
		return out;

	}

	out.dx = - sun.x / flat;
	out.dz = - sun.z / flat;
	out.len = Math.min( 30, tall * flat / up );
	return out;

}

// m from ( x, z ) to the segment from a to b
export function nearLine( ax, az, bx, bz, x, z ) {

	const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez;
	const t = l2 > 1e-9 ? Math.min( 1, Math.max( 0, ( ( x - ax ) * ex + ( z - az ) * ez ) / l2 ) ) : 0;
	return Math.hypot( x - ax - ex * t, z - az - ez * t );

}

// how far ahead (m) a hull moving at `speed` m/s through `depth` m of water pushes it: a few seconds' travel in a foot
// or two of water (the bow's pressure wave runs ahead at the shallow-water wave speed, sqrt( g h ), faster than she
// goes), none past a metre and a half or below a drift
export function pushAhead( speed, depth ) {

	return smooth( 0.35, 0.9, speed ) * ( 1 - smooth( 0.8, 1.6, depth ) ) * ( 2 + 5 * speed );

}

// the chance a paddle stroke `force` (0..1: light to flat out) knocks the hull: a careful stroke hardly ever, a hard
// one now and then
export const knockOf = ( force ) => 0.015 + 0.12 * Math.max( 0, Math.min( 1, force ) ) ** 2;
export const KNOCK_HEARD = 22; // m: how far a fish hears a knock on the hull through the water
export const ENGINE_HEARD = 120; // m: and an engine running (guides: an idling engine spooks them for hundreds of yards)

// a bait or lure landing: the splash it makes, how far off a fish hears it (m), by what it is (a shrimp's a soft plop,
// a plug a loud one: Bait.js' ids, null the frozen shrimp)
export const SPLASH = { shrimp: 0.6, jig: 1.2, plug: 2.2, live: 1.0 };
export const splashOf = ( bait ) => SPLASH[ bait === 'jig' || bait === 'plug' ? bait : bait && bait !== 'shrimp' && bait !== 'cutMullet' ? 'live' : 'shrimp' ];

// what tells a school someone's there now, or null: 'speed' (they came on too fast for how near they are), 'push' (the
// push of water ahead of a hull coming at it), 'shadow' (their shadow on the bottom over it), 'knock' (a paddle knocking
// the hull, heard through the water)
//   school: { x, z, r (its spread, m), depth }   o: { x, z, vx, vz (their way over the ground, m/s), eye (their eye over
//   the water), tall (how high they or their hull stand over it, for the shadow), knock (a knock on the hull this
//   moment, 0 none), engine (an engine running aboard), hull (a hull pushing water: a kayak or a boat, not someone
//   wading) }; and 'engine'
//   sun: the sun's direction (to it)   cond: { wind, shade (a cloud's shadow over them: no shadow of theirs to throw) }
const _sh = { dx: 0, dz: 0, len: 0 };
export function scareOf( kind, school, o, sun, cond = {} ) {

	const dx = school.x - o.x, dz = school.z - o.z, dist = Math.hypot( dx, dz ), d = Math.max( 0, dist - school.r );
	const speed = Math.hypot( o.vx, o.vz ), toward = dist > 1e-3 ? Math.max( 0, ( o.vx * dx + o.vz * dz ) / dist ) : speed;
	// (coming at it counts in full, going by half: it's seen either way)
	const v = toward + 0.5 * Math.max( 0, speed - toward );
	if ( d < noticeRange( kind, { speed: v, eye: o.eye, wind: cond.wind, depth: school.depth } ) ) return 'speed';
	if ( o.hull && toward > 0.3 && dist > 1e-3 && toward / speed > 0.9 && d < pushAhead( speed, school.depth ) ) return 'push';
	const wary = sightOf( kind ) ? sightOf( kind ).wary : 1;
	if ( o.engine && d < ENGINE_HEARD * wary ) return 'engine';
	if ( o.knock > 0 && d < KNOCK_HEARD * wary ) return 'knock';
	if ( ( cond.shade || 0 ) < 0.5 && sun ) {

		shadowLine( o.tall, sun, _sh );
		if ( _sh.len > 0.5 && nearLine( o.x, o.z, o.x + _sh.dx * _sh.len, o.z + _sh.dz * _sh.len, school.x, school.z ) < school.r + 0.6 ) return 'shadow';

	}

	return null;

}

// a cast landing at `at` with the line laid on the water from the rod's tip `tip` to it: whether it lands on the head of
// a fish at ( x, z ) of this kind ('cast'), or lays the line over its back ('line': across it, short of the bait), or
// neither (null). bait: Bait.js' id (a plug's splash spooks further off)
export function castScare( kind, x, z, at, tip, bait = null ) {

	const S = sightOf( kind );
	if ( ! S ) return null;
	const loud = splashOf( bait ), d = Math.hypot( x - at.x, z - at.z );
	if ( S.head > 0 && d < S.head * Math.sqrt( loud / SPLASH.shrimp ) ) return 'cast';
	if ( S.head > 0 && d > 1.2 && nearLine( tip.x, tip.z, at.x, at.z, x, z ) < 0.5 ) return 'line';
	return null;

}
