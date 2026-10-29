import { FISH, FISH_IDS } from './FishTable.js';
import { BAITS, baitWeight } from './Bait.js';
import { NORTH } from './Weather.js';

// Where the bobber is and what lives there.
//   depth     water depth under the bobber (m)
//   reefDist  horizontal distance to the reef edge (m, < 0 inside it)
//   pierDist  horizontal distance to the pier (piles / head) (m)
//   (M15) and out past the island, each optional:
//   slope     how steeply the bottom falls away there (rise over run)
//   patch     0..1: patch reefs on the bottom out there (the bank's top)
//   weed, debris, birds   0..1: how near a weedline, a piece of floating debris, or a school with birds
//             working it (game/Finds.js) the spot is
//   (M15) and about the island:
//   windward  0..1: how much the spot's on the island's windward side, its north shore, facing the trades
//   beach     0..1: sand under the spot (the beaches' wash; the bay's floor and the flats too)
//   creek     0..1: the mangroves' creek, their pool, and the water off their edge (terrain/Mangrove.js)
//   windReef  0..1: the windward reef off the north-west point (WORLD.northReef): reef water, as the bay's
// Returns weights per water type (they overlap: a spot can be both pier and bay). The shallows, the reef,
// the pier, the bay, and:
//   deep    the shelf's deep water, 20 to 150 m (and the top of the slope below it): the snappers and
//           groupers on its bottom, within a bait's reach
//   (M15) edge   where the bottom falls away steeply, 40 to 900 m down: the drop-off off the shelf, the
//                hump's flanks, the canyon's walls and the bank's (the front between the green water and
//                the blue lies over the drop-off): the tuna's
//         ledge  a flat bottom 150 to 300 m down (the north's ledge, the canyon's floor): the deep
//                snappers'
//         blue   the open ocean, past 150 to 400 m: few fish, and those the wanderers (mahi, tuna)
//         weed, debris, birds: where they gather (the mahi under the weed and the debris, the tuna
//                under the birds), and the bites come sooner
//         wash   a sandy beach's surf zone, 0.3 to 3 m down: the pompano's, the permit's and the snook's,
//                more than twice as much on the windward north beach (and its weather: weatherMood's north)
//         creek  the mangroves' (the west's): their creek, their pool and the water off their edge, 0.4 m
//                down and more: the snook's, the mangrove snapper's, the tarpon's, young barracuda's and
//                jacks'; sheltered, no sea or wind roughs it (it fishes when the rest is blown out)
// (M15) The game adds side too, as it does flood (not a water type): the spot's windward share, for the sea
// that roughs its water (the north shore's or the bay's surf: roughed); and big, 0..1: how much it's on the
// windward reef, whose fish run bigger and whose big fish bite more (BIG: pickSpecies, rollWeight).
// (Salt Life) The game adds flood, 0..1: how far the spot is in a boat's deck floodlights after dark (not
// a water type: it draws in the fish that gather under lights, and the bait, so they bite sooner), and
// (M9) weather: the weather now (Weather.weatherAt's; none, or a fair day's, changes nothing: weatherMood).
export const BLUE = 0.35; // (the open ocean's fish, sparse: its weight; a spot's floor is the same: biteDelay)
export function habitatAt( { depth, reefDist, pierDist, slope = 0, patch = 0, weed = 0, debris = 0, birds = 0, windward = 0, beach = 0, creek = 0, windReef = 0 } ) {

	const h = { shallows: 0, reef: 0, pier: 0, bay: 0, deep: 0, edge: 0, ledge: 0, blue: 0, weed: 0, debris: 0, birds: 0, wash: 0, creek: 0 };
	if ( depth < 0.25 ) return h; // on the sand
	h.shallows = smooth( 3.5, 1.0, depth );
	h.reef = Math.max( smooth( 12, - 6, reefDist ), patch, windReef ) * smooth( 0.8, 2.5, depth );
	h.pier = smooth( 9, 2, pierDist ) * smooth( 0.6, 2, depth );
	h.bay = smooth( 1.5, 4, depth ) * ( 1 - smooth( 18, 30, depth ) );
	h.deep = smooth( 16, 28, depth ) * ( 1 - smooth( 110, 200, depth ) );
	h.edge = smooth( 0.12, 0.35, slope ) * smooth( 40, 80, depth ) * ( 1 - smooth( 500, 900, depth ) );
	h.ledge = smooth( 140, 180, depth ) * ( 1 - smooth( 280, 340, depth ) ) * ( 1 - smooth( 0.08, 0.2, slope ) );
	h.blue = BLUE * smooth( 150, 400, depth );
	h.weed = weed * smooth( 8, 30, depth );
	h.debris = debris * smooth( 8, 30, depth );
	h.birds = birds * smooth( 8, 30, depth );
	const band = beach * smooth( 0.25, 0.7, depth ) * ( 1 - smooth( 2.5, 4.5, depth ) );
	h.wash = band * ( 0.7 + 1.1 * windward );
	// (a windward beach's surf zone isn't the calm sand's: the mullet and the bonefish keep to the bay's)
	h.shallows *= 1 - 0.6 * band * windward;
	h.creek = creek * smooth( 0.4, 1.0, depth );
	// (its mud isn't the sand flats' water: the creek's own fish take most of their place)
	h.shallows *= 1 - 0.7 * h.creek;
	h.bay *= 1 - 0.5 * h.creek;
	return h;

}

// 1 at the species' favourite time, less at others; hour 0..24
export function activity( pref, hour ) {

	const dawn = Math.exp( - ( ( hour - 6.5 ) ** 2 ) / 2.5 ), dusk = Math.exp( - ( ( hour - 18.5 ) ** 2 ) / 2.5 );
	const night = hour < 5.5 || hour > 19.5 ? 1 : 0;
	const day = hour > 7 && hour < 18 ? 1 : 0.35;
	switch ( pref ) {

		case 'day': return 0.25 + 0.75 * day * ( 1 - night );
		case 'dawnDusk': return 0.3 + 0.7 * Math.max( dawn, dusk ) + 0.1 * day;
		case 'night': return 0.15 + 0.85 * Math.max( night, dusk * 0.8 );
		default: return 0.8 + 0.2 * Math.max( dawn, dusk );

	}

}

// the pier's lamps, 0..1 by the hour: lit from 7 to 8 pm, out from 5 to 6 am
export function lampsLit( hour ) {

	return hour >= 20 || hour < 5 ? 1 : hour > 19 ? hour - 19 : hour < 6 ? 6 - hour : 0;

}

// (M9) The weather on the fish: what they feel of it (habitat.weather), each 0..1, and none of it on a
// fair day (null then: the island as it always was):
//   front  a blow on its way in the next few hours (Weather's front): they feed hard ahead of it
//   grey   a grey sky, and the rain's: by day the light is as at dusk, when the predators hunt
//   wind   a blow out on the open sea, past a breeze: the wind lines the mahi and tuna hunt along
//   rain   rain on the water
//   surf   a big surf, past a breezy day's: the shallows and round the pier stirred up murky
//   heavy  a downpour or a thunderstorm: the fish go down and wait for it to pass
//   (M15) the north shore's sea (Weather's north), for the island's windward side (habitat.side):
//   north     a surf day there (3 to 5 ft: NORTH.day): the wash's fish feeding in it
//   northBig  past its big (NORTH.big, 4 to 7 ft): blown out, its shallows stirred up as the bay's are in
//             a big surf, and the wash too rough to fish; the bay in the island's lee fishes
export function weatherMood( w ) {

	if ( ! w ) return null;
	const m = { front: ramp( 0, 1, w.front ), grey: ramp( 0.2, 0.6, w.overcast ), wind: ramp( 9.5, 15.5, w.wind ), rain: ramp( 0, 1, w.rain ),
		surf: ramp( 0.42, 0.58, w.surf ), heavy: Math.max( ramp( 0.5, 1, w.rain ), ramp( 0, 1, w.thunder ) ),
		north: ramp( NORTH.fair + 0.07, NORTH.day, w.north ), northBig: ramp( NORTH.big - 0.05, NORTH.big + 0.1, w.north ) };
	for ( const k in m ) if ( m[ k ] > 0 ) return m;
	return null;

}

// what the weather does to the bites, at its fullest (weatherMood's 1):
//   FRONT_SOONER   ahead of a blow the bites come this much sooner (biteDelay)
//   FRONT_BIGGER   and the big ones feed too: rollWeight's skew toward the small end eases by this much
//   GREY_DUSK      under a grey sky by day each fish bites this far toward how it does at dusk, when
//                  that's better (the jacks, snappers, tuna, tarpon and barracuda)
//   HEAVY_SLOWER   in a downpour or a thunderstorm the bites come this much slower again
//   ROUGH          what a big surf (the shallows, the pier) or a blow (the deep, (M15) the ledge: the boat
//                  drifts too fast to hold a bait on the bottom) does to a water type: it counts this much
//                  less, so it bites slower and the other waters' fish come more
export const FRONT_SOONER = 0.35;
export const FRONT_BIGGER = 0.3;
export const GREY_DUSK = 0.6;
export const HEAVY_SLOWER = 0.8;
//   (M15) a big surf on the windward side is the north shore's sea, past its big (northBig), not the bay's;
//                  and there it stirs up the open water off the shore too (the bay type: WASH.open)
//   WASH           what the sea does to the wash: a surf day (the bay's big surf, the north's 3 to 5 ft) makes
//                  it count `day` more (the surf turning up the crabs and clams the pompano dig for), fading
//                  as it's blown out (northBig), when it counts `blown` less
export const ROUGH = { shallows: [ 'surf', 0.5 ], pier: [ 'surf', 0.35 ], deep: [ 'wind', 0.4 ], ledge: [ 'wind', 0.4 ] };
export const WASH = { day: 0.9, blown: 0.85, open: 0.5 };
// (M15) the windward reef's (habitat.big): its fish's weights skew this much less to the small end
// (rollWeight), and the big kinds (`kg` past `from` at their biggest) bite up to `more` again as often; and a big
// north sea roughs its water as it does the north shore's (`blown`)
export const BIG = { skew: 0.5, from: 4, more: 1.5, blown: 0.4 };
// (not water types: what the game adds to a spot's habitat)
const NOT_WATER = { flood: true, weather: true, side: true, big: true };

// the water types as the weather leaves them (m: weatherMood's)
function roughed( habitat, m ) {

	if ( ! m ) return habitat;
	const h = { ...habitat }, side = habitat.side || 0;
	const big = m.surf + ( m.northBig - m.surf ) * side;
	for ( const k in ROUGH ) if ( h[ k ] ) h[ k ] *= 1 - ROUGH[ k ][ 1 ] * ( ROUGH[ k ][ 0 ] === 'surf' ? big : m[ ROUGH[ k ][ 0 ] ] );
	const blown = m.northBig * side;
	if ( h.wash ) h.wash *= ( 1 + WASH.day * ( m.surf + ( m.north * ( 1 - m.northBig ) - m.surf ) * side ) ) * ( 1 - WASH.blown * blown );
	if ( h.bay ) h.bay *= 1 - WASH.open * blown;
	if ( h.reef && habitat.big ) h.reef *= 1 - BIG.blown * m.northBig * habitat.big;
	return h;

}

// how much a species' own taste in weather (FishTable's weather) counts for it now: each of its keys
// times (1 + its value x how much of that there is)
function weatherWeight( pref, m ) {

	let x = 1;
	for ( const k in pref ) x *= Math.max( 0, 1 + pref[ k ] * ( m[ k ] || 0 ) );
	return x;

}

// by day, 0..1 (the grey sky's dusk light only counts while the sun's up)
const daylight = ( hour ) => smooth( 5.5, 7, hour ) * ( 1 - smooth( 18, 19.5, hour ) );

// Weighted pick of the species that bites here; null when nothing lives here.
// rng: () => [0, 1); (Salt Life) bait: what's on the hook (Bait.js; null: shrimp)
export function pickSpecies( habitat, hour, rng = Math.random, bait = null ) {

	let total = 0;
	const w = [];
	const lit = lampsLit( hour );
	// (M9) the weather: the water it leaves, the light under a grey sky, and who's about in it
	const m = weatherMood( habitat.weather ), water = roughed( habitat, m ), grey = m ? m.grey * GREY_DUSK * daylight( hour ) : 0;
	for ( const id of FISH_IDS ) {

		const f = FISH[ id ];
		let hw = 0;
		for ( const k in f.habitat ) hw += f.habitat[ k ] * water[ k ];
		// (Salt Life) some gather under the pier's lamps after dark
		if ( f.lights && f.habitat.pier ) hw += f.lights * f.habitat.pier * water.pier * lit;
		// and under a boat's deck floodlights
		if ( f.flood && habitat.flood ) hw *= 1 + f.flood * habitat.flood;
		let act = activity( f.time, hour );
		if ( grey > 0 ) act += Math.max( 0, activity( f.time, 18.5 ) - act ) * grey;
		// ((M15) under the birds, what's busting the bait is feeding now, whatever the hour)
		if ( habitat.birds && f.habitat.birds ) act += ( 1 - act ) * habitat.birds;
		let x = hw * f.rarity * act * baitWeight( bait, id );
		// ((M15) on the windward reef the big ones bite more)
		if ( habitat.big && f.kg[ 1 ] >= BIG.from ) x *= 1 + BIG.more * habitat.big;
		if ( m && f.weather ) x *= weatherWeight( f.weather, m );
		w.push( x );
		total += x;

	}

	if ( total < 1e-4 ) return null;
	let r = rng() * total, last = null;
	for ( let i = 0; i < w.length; i ++ ) {

		if ( w[ i ] <= 0 ) continue; // (Salt Life: never one that doesn't bite: the spiny lobster)
		r -= w[ i ];
		last = FISH_IDS[ i ];
		if ( r <= 0 ) return last;

	}

	return last;

}

// Weight in kg: skewed toward the small end (most fish are small, trophies are rare; less so on a
// big bait, and (M9) ahead of a blow: weather, habitat.weather; (M15) and on the windward reef: big)
export function rollWeight( id, rng = Math.random, bait = null, weather = null, big = 0 ) {

	const [ a, b ] = FISH[ id ].kg;
	let skew = 2.2 * ( BAITS[ bait ] ? BAITS[ bait ].skew : 1 ) * ( 1 - BIG.skew * big );
	const m = weatherMood( weather );
	if ( m && m.front > 0 ) skew *= 1 - FRONT_BIGGER * m.front;
	const t = Math.pow( rng(), skew );
	return a + ( b - a ) * t;

}

// Seconds until the next bite at this spot: richer water bites sooner (and live or cut bait). Infinity
// when barren.
export function biteDelay( habitat, hour, rng = Math.random, bait = null ) {

	let rich = 0;
	for ( const k in habitat ) if ( ! NOT_WATER[ k ] ) rich += habitat[ k ];
	if ( rich < 0.05 ) return Infinity;
	// open water between the named habitats still has fish: never much slower than a poor spot; (Salt
	// Life) a boat's floodlights draw the bait in, and what feeds on it
	const all = rich;
	rich = Math.max( rich, 0.35 ) + ( habitat.flood || 0 );
	const light = hour > 6 && hour < 19 ? 1 : 0.8;
	let mean = 8 / ( Math.min( rich, 1.6 ) * light ) * ( BAITS[ bait ] ? BAITS[ bait ].speed : 1 );
	// (M9) the weather: sooner ahead of a blow, slower in a downpour, and slower for the share of the
	// spot's water a big surf or a blow has stirred up
	const m = weatherMood( habitat.weather );
	if ( m ) {

		const water = roughed( habitat, m );
		let left = 0;
		for ( const k in water ) if ( ! NOT_WATER[ k ] ) left += water[ k ];
		mean *= ( 1 - FRONT_SOONER * m.front ) * ( 1 + HEAVY_SLOWER * m.heavy ) * all / left;

	}

	return 2 + - Math.log( 1 - rng() * 0.98 ) * mean * 0.6;

}

// 0 at a, 1 at b and past it (a missing value: 0)
function ramp( a, b, x ) {

	return Math.min( 1, Math.max( 0, ( ( x || 0 ) - a ) / ( b - a ) ) );

}

function smooth( e0, e1, x ) {

	const t = Math.min( 1, Math.max( 0, ( x - e0 ) / ( e1 - e0 ) ) );
	return t * t * ( 3 - 2 * t );

}
