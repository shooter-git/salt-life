import { weatherAt, lastHurricane } from './Weather.js';

// (M13 step 6) What a hurricane does to the island, and its mending: from the clock, as the weather is,
// so the same for everyone. Reckoned from the last hurricane whose winds reached the island
// (Weather.lastHurricane): its track at the island sampled once (the strongest wind so far, and how high
// the water's reached so far: the surge and its surf), and from that each piece's fate. Pure, for the
// tests under Node (test/storm-damage.mjs).
//
// What a Category 1 does, and when it's mended:
//   - tin: a sheet of corrugated roofing torn off where it's weakest (at an eave or a corner, where the
//     uplift's greatest), from about 31 m/s sustained (gusts of 40+); a blue tarp nailed over the hole a
//     day or so after, and a new sheet once the tin's come in on the boat, three to six days on (it
//     shows new, weathering in over a month).
//   - plank: a run of the pier's deck boards lifted off by the crests coming up under the deck (its
//     underside 2.0 m up; a crest's about 1.3x the surf's amplitude over the still water, on the surge);
//     the fishermen have them back in two to four days, in new timber.
//   - bay: a whole bay of the pier's walkway (its boards and stringers: the piles and caps stand) taken
//     by the biggest crests; rebuilt in four to seven days.
//   - palms: their older, lower fronds torn off as the wind rises past a gale (up to about half of a
//     crown in a Category 1); they grow back over three weeks (as quickly as everything here: the
//     hurricanes come every forty days, not every fifteen years).
//   - wrack: the sea's left a line of sargassum, seagrass and broken fronds where it reached up the beach
//     (surge + about 1.2x the surf), and sand and weed washed over the paths behind; the paths are swept
//     in a day or two, the beach's wrack dries and goes over a week or so. The gulls and sanderlings feed
//     along it while it's fresh.
// (M14) And the rest of what stands out in it:
//   - thatch: a patch of a palm-thatched roof stripped off its battens from an eave or a corner, from
//     about 28 m/s (well-tied thatch lets the wind through: it holds about as well as the tin); a tarp
//     over it, and new fronds cut and tied on two to seven days after, green-gold, drying to straw.
//   - stand: a sheet off Joe's roof (older sheets, nailed to the rafters: from 29 m/s); a tarp, and new
//     tin from the boat as the houses' is.
//   - sign: Marta's board off its posts (from 27 m/s), nailed back up a day or three after.
//   - net: a net left drying over a rack or a porch's rail, blown off it (from 24 m/s); hung back up,
//     washed and mended, in half a day to a day.
//   - flag: a flag shredded from its fly end (from 22 m/s: a flag frays in any full gale); a new one in
//     one to four days.
//   - dock: a run of the boards along Marta's berth on the pier's head, lifted by the crests as the
//     walkway's are; she has them back in one to three days (her living's alongside it).
//   - fender: a tyre fender off the berth's face, its chain parted by the sea slamming it (from 2.0 m
//     of water); new ones in half a day to two days.
// A piece blown off flies from the moment its wind's reached (wentAt: from the same track, the same for
// everyone): world/debris/FlyingSheets.js.
//
//   const D = damageAt( T, pick, since );   (D: { storm, wind, water, runup, after, strip, sand, wrack,
//                                             wrackH, wrackAge, paths, feed, prev })
// Hurricanes can come a week apart: the one before, still being mended, is reckoned too (D.prev: what
// the last hasn't touched is as that one left it, and the palms as stripped as either has them).
//   pieceState( D, 'tin', 3 ) -> { state: 0 whole | 1 gone | 2 tarp | 3 new, age (game hours in it),
//                                 went (the game hour it went), over (how far past its threshold),
//                                 storm (the hurricane that took it) }

const ss = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};
const lerp = ( a, b, t ) => a + ( b - a ) * t;

// game hours (repairs: after its winds have gone), m/s, m
export const DAMAGE = {
	back: 40 * 24, // how long after a hurricane its damage is still reckoned from it
	step: 0.25, // its track at the island, sampled every this many game hours
	reach: 1.3, // how high the water reaches: the surge + this x the surf's amplitude (a crest over the still water)
	runup: 1.2, // how far up the beach it came: the surge + this x the surf's amplitude
	tin: { wind: [ 31, 44 ], tarp: [ 12, 40 ], fixed: [ 72, 150 ] },
	plank: { water: [ 2.15, 3.0 ], fixed: [ 40, 96 ] },
	bay: { water: [ 2.5, 3.2 ], fixed: [ 96, 168 ] },
	palm: { wind: [ 24, 42 ], most: 0.5, more: [ 42, 56, 0.35 ], regrow: 21 * 24 },
	sand: { water: [ 2.1, 3.0 ], swept: [ 12, 40 ] },
	wrack: { water: [ 1.9, 2.8 ], paths: [ 6, 30 ], beach: [ 72, 240 ], feed: [ 30, 60 ] },
	// ((M14) salt: each kind's own draws, so a piece of one kind doesn't go with the same-numbered one of
	// another)
	thatch: { wind: [ 28, 42 ], tarp: [ 10, 36 ], fixed: [ 48, 168 ], salt: 101 },
	stand: { wind: [ 29, 40 ], tarp: [ 6, 20 ], fixed: [ 72, 150 ], salt: 102 },
	sign: { wind: [ 27, 38 ], fixed: [ 20, 60 ], salt: 103 },
	net: { wind: [ 24, 34 ], fixed: [ 10, 30 ], salt: 104 },
	flag: { wind: [ 22, 30 ], fixed: [ 30, 96 ], salt: 105 },
	dock: { water: [ 2.3, 3.1 ], fixed: [ 24, 72 ], salt: 106 },
	fender: { water: [ 2.0, 2.9 ], fixed: [ 12, 40 ], salt: 107 },
};
// the pieces' kinds, and what each is torn off by
const BY = { tin: 'wind', plank: 'water', bay: 'water', thatch: 'wind', stand: 'wind', sign: 'wind', net: 'wind', flag: 'wind', dock: 'water', fender: 'water' };
export const WHOLE = 0, GONE = 1, TARP = 2, NEW = 3;

// a hash of a string and two integers, 0..1
function hash01( key, a, b ) {

	let h = 0x811c9dc5;
	for ( let i = 0; i < key.length; i ++ ) h = Math.imul( h ^ key.charCodeAt( i ), 0x01000193 );
	h = Math.imul( h ^ ( a + 0x9e37 ), 0x01000193 );
	h = Math.imul( h ^ ( b + 0x7f4a ), 0x01000193 );
	h ^= h >>> 15;
	h = Math.imul( h, 0x2c1b3c6d );
	h ^= h >>> 12;
	return ( h >>> 0 ) / 4294967296;

}

// its track at the island: from a while before its winds to a while after, the strongest wind so far,
// the highest the water's reached so far, how far up the beach, and when that was
const _tracks = new Map();
function trackOf( h, pick, since ) {

	let t = _tracks.get( h.key );
	if ( t ) return t;
	const S = DAMAGE.step, t0 = h.onset - 12, n = Math.ceil( ( h.ends + 12 - t0 ) / S ) + 1;
	t = { t0, n, wind: new Float32Array( n ), water: new Float32Array( n ), runup: new Float32Array( n ), peakAt: t0 };
	let wind = 0, water = - 1, runup = - 1;
	for ( let k = 0; k < n; k ++ ) {

		const w = weatherAt( t0 + k * S, pick, since );
		wind = Math.max( wind, w.wind );
		water = Math.max( water, w.surge + DAMAGE.reach * w.surf );
		const r = w.surge + DAMAGE.runup * w.surf;
		if ( r > runup ) {

			runup = r;
			t.peakAt = t0 + k * S;

		}

		t.wind[ k ] = wind;
		t.water[ k ] = water;
		t.runup[ k ] = runup;

	}

	if ( _tracks.size > 16 ) _tracks.clear();
	_tracks.set( h.key, t );
	return t;

}

const NONE = { storm: null, track: null, wind: 0, water: - 1, runup: - 1, after: 1e9, strip: 0, sand: 0, wrack: 0, wrackH: 0, wrackAge: 1, paths: 0, feed: 0, prev: null };

// the damage at island time T (game hours), as the weather goes (pick, since: Weather's); out: filled
// and returned
export function damageAt( T, pick = null, since = 0, out = {} ) {

	const h = lastHurricane( T, DAMAGE.back, pick, since );
	if ( ! h ) return Object.assign( out, NONE );
	of( h, T, pick, since, out );
	// (the one before, if it's still being mended)
	const p = lastHurricane( h.onset - 1e-6, DAMAGE.back - ( T - h.onset ), pick, since );
	out.prev = p ? of( p, T, pick, since, out.prev || {} ) : null;
	if ( out.prev ) {

		out.prev.prev = null;
		out.strip = Math.max( out.strip, out.prev.strip );

	}

	return out;

}

// what hurricane h's done by T
function of( h, T, pick, since, out ) {

	const tr = trackOf( h, pick, since ), D = DAMAGE;
	const k = Math.min( tr.n - 1, Math.max( 0, Math.floor( ( T - tr.t0 ) / D.step ) ) );
	const started = T >= tr.t0;
	// ((M14) the wind and the water between the samples, so each piece goes at its own moment: wentAt)
	const f = Math.min( 1, Math.max( 0, ( T - tr.t0 ) / D.step - k ) ), k1 = Math.min( tr.n - 1, k + 1 );
	out.storm = h;
	out.track = tr;
	out.wind = started ? lerp( tr.wind[ k ], tr.wind[ k1 ], f ) : 0;
	out.water = started ? lerp( tr.water[ k ], tr.water[ k1 ], f ) : - 1;
	out.runup = started ? tr.runup[ k ] : - 1;
	out.after = T - h.ends;
	const after = Math.max( 0, out.after );
	// the palms: stripped as the wind rises, growing back once it's gone
	// ((M14) and a Category 2's or 3's strips them bare but for their crowns: more past a 1's wind)
	out.strip = ( D.palm.most * ss( D.palm.wind[ 0 ], D.palm.wind[ 1 ], out.wind ) + D.palm.more[ 2 ] * ss( D.palm.more[ 0 ], D.palm.more[ 1 ], out.wind ) ) * ( 1 - Math.min( 1, after / D.palm.regrow ) );
	// what the sea left as it fell back from its highest: a line of wrack up the beach, sand and weed
	// over the paths behind it
	const left = ss( tr.peakAt, tr.peakAt + 3, T );
	out.wrackH = tr.runup[ tr.n - 1 ];
	out.wrack = left * ss( D.wrack.water[ 0 ], D.wrack.water[ 1 ], out.runup ) * ( 1 - ss( D.wrack.beach[ 0 ], D.wrack.beach[ 1 ], after ) );
	out.paths = left * ss( D.wrack.water[ 0 ], D.wrack.water[ 1 ], out.runup ) * ( 1 - ss( D.wrack.paths[ 0 ], D.wrack.paths[ 1 ], after ) );
	out.sand = left * ss( D.sand.water[ 0 ], D.sand.water[ 1 ], out.runup ) * ( 1 - ss( D.sand.swept[ 0 ], D.sand.swept[ 1 ], after ) );
	out.wrackAge = Math.min( 1, after / D.wrack.beach[ 0 ] );
	// (fresh: the sandhoppers and kelp flies in it the birds come for)
	out.feed = out.wrack * ( 1 - ss( D.wrack.feed[ 0 ], D.wrack.feed[ 1 ], after ) );
	return out;

}

// a piece of the island's at the damage D: kind 'tin', 'plank' or 'bay' ((M14) or 'thatch', 'stand',
// 'sign', 'net', 'flag', 'dock', 'fender'), its id (the same for everyone: Village numbers them); out:
// { state, age, went, over, storm } filled and returned (state WHOLE, GONE, TARP or NEW; age: game hours
// since it went into that state)
export function pieceState( D, kind, id, out = {} ) {

	out.state = WHOLE;
	out.age = 1e9;
	out.went = - 1e9;
	out.over = 0;
	out.storm = null;
	if ( ! D.storm ) return out;
	stateOf( D, kind, id, out );
	// (untouched by the last: as the one before it left it)
	if ( out.state === WHOLE && D.prev ) stateOf( D.prev, kind, id, out );
	return out;

}

function stateOf( D, kind, id, out ) {

	const P = DAMAGE[ kind ], key = D.storm.key, salt = P.salt || 0;
	const by = BY[ kind ], lim = P[ by ], v = by === 'wind' ? D.wind : D.water;
	const at = lerp( lim[ 0 ], lim[ 1 ], hash01( key, id, kind.length + salt ) );
	if ( v < at ) return out;
	out.storm = D.storm;
	out.over = v - at;
	out.went = wentAt( D.track, by, at );
	const after = D.after;
	const fixed = lerp( P.fixed[ 0 ], P.fixed[ 1 ], hash01( key, id, 7 + kind.length + salt ) );
	const tarp = P.tarp ? lerp( P.tarp[ 0 ], P.tarp[ 1 ], hash01( key, id, 13 + salt ) ) : Infinity;
	if ( after >= fixed ) {

		out.state = NEW;
		out.age = after - fixed;

	} else if ( after >= tarp ) {

		out.state = TARP;
		out.age = after - tarp;

	} else out.state = GONE;
	return out;

}

// ((M14) when a piece still whole will go in the hurricane D's reckoned from (its whole track's known
// ahead), or null if it won't: so it can be shown going the moment it does, between reckonings)
export function goesAt( D, kind, id ) {

	if ( ! D.storm || ! D.track ) return null;
	const P = DAMAGE[ kind ], by = BY[ kind ], lim = P[ by ], a = D.track[ by ];
	const at = lerp( lim[ 0 ], lim[ 1 ], hash01( D.storm.key, id, kind.length + ( P.salt || 0 ) ) );
	return a[ D.track.n - 1 ] >= at ? wentAt( D.track, by, at ) : null;

}

// ((M14) the game hour its wind or water first reached v: the track's so-far maxima rise, so the first
// sample past it, by halving, and between it and the one before, as of() reads them)
function wentAt( tr, by, v ) {

	if ( ! tr ) return - 1e9;
	const a = tr[ by ];
	let lo = 0, hi = tr.n - 1;
	while ( lo < hi ) {

		const mid = ( lo + hi ) >> 1;
		if ( a[ mid ] >= v ) hi = mid;
		else lo = mid + 1;

	}

	const f = lo > 0 && a[ lo ] > a[ lo - 1 ] ? ( v - a[ lo - 1 ] ) / ( a[ lo ] - a[ lo - 1 ] ) : 1;
	return tr.t0 + ( lo - 1 + Math.min( 1, Math.max( 0, f ) ) ) * DAMAGE.step;

}
