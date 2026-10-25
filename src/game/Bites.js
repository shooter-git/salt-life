import { FISH, FISH_IDS } from './FishTable.js';
import { BAITS, baitWeight } from './Bait.js';

// Where the bobber is and what lives there.
//   depth     water depth under the bobber (m)
//   reefDist  horizontal distance to the reef edge (m, < 0 inside it)
//   pierDist  horizontal distance to the pier (piles / head) (m)
// Returns weights per water type (they overlap: a spot can be both pier and bay). (Salt Life) The game
// adds flood, 0..1: how far the spot is in a boat's deck floodlights after dark (not a water type: it
// draws in the fish that gather under lights, and the bait, so they bite sooner), and (M9) weather: the
// weather now (Weather.weatherAt's; none, or a fair day's, changes nothing: weatherMood).
export function habitatAt( { depth, reefDist, pierDist } ) {

	const h = { shallows: 0, reef: 0, pier: 0, bay: 0, deep: 0 };
	if ( depth < 0.25 ) return h; // on the sand
	h.shallows = smooth( 3.5, 1.0, depth );
	h.reef = smooth( 12, - 6, reefDist ) * smooth( 0.8, 2.5, depth );
	h.pier = smooth( 9, 2, pierDist ) * smooth( 0.6, 2, depth );
	h.bay = smooth( 1.5, 4, depth ) * ( 1 - smooth( 18, 30, depth ) );
	h.deep = smooth( 16, 28, depth );
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
export function weatherMood( w ) {

	if ( ! w ) return null;
	const m = { front: ramp( 0, 1, w.front ), grey: ramp( 0.2, 0.6, w.overcast ), wind: ramp( 9.5, 15.5, w.wind ), rain: ramp( 0, 1, w.rain ),
		surf: ramp( 0.42, 0.58, w.surf ), heavy: Math.max( ramp( 0.5, 1, w.rain ), ramp( 0, 1, w.thunder ) ) };
	for ( const k in m ) if ( m[ k ] > 0 ) return m;
	return null;

}

// what the weather does to the bites, at its fullest (weatherMood's 1):
//   FRONT_SOONER   ahead of a blow the bites come this much sooner (biteDelay)
//   FRONT_BIGGER   and the big ones feed too: rollWeight's skew toward the small end eases by this much
//   GREY_DUSK      under a grey sky by day each fish bites this far toward how it does at dusk, when
//                  that's better (the jacks, snappers, tuna, tarpon and barracuda)
//   HEAVY_SLOWER   in a downpour or a thunderstorm the bites come this much slower again
//   ROUGH          what a big surf (the shallows, the pier) or a blow (the deep) does to a water type:
//                  it counts this much less, so it bites slower and the other waters' fish come more
export const FRONT_SOONER = 0.35;
export const FRONT_BIGGER = 0.3;
export const GREY_DUSK = 0.6;
export const HEAVY_SLOWER = 0.8;
export const ROUGH = { shallows: [ 'surf', 0.5 ], pier: [ 'surf', 0.35 ], deep: [ 'wind', 0.4 ] };

// the water types as the weather leaves them (m: weatherMood's)
function roughed( habitat, m ) {

	if ( ! m ) return habitat;
	const h = { ...habitat };
	for ( const k in ROUGH ) if ( h[ k ] ) h[ k ] *= 1 - ROUGH[ k ][ 1 ] * m[ ROUGH[ k ][ 0 ] ];
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
		let x = hw * f.rarity * act * baitWeight( bait, id );
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
// big bait, and (M9) ahead of a blow: weather, habitat.weather)
export function rollWeight( id, rng = Math.random, bait = null, weather = null ) {

	const [ a, b ] = FISH[ id ].kg;
	let skew = 2.2 * ( BAITS[ bait ] ? BAITS[ bait ].skew : 1 );
	const m = weatherMood( weather );
	if ( m && m.front > 0 ) skew *= 1 - FRONT_BIGGER * m.front;
	const t = Math.pow( rng(), skew );
	return a + ( b - a ) * t;

}

// Seconds until the next bite at this spot: richer water bites sooner (and live or cut bait). Infinity
// when barren.
export function biteDelay( habitat, hour, rng = Math.random, bait = null ) {

	let rich = 0;
	for ( const k in habitat ) if ( k !== 'flood' && k !== 'weather' ) rich += habitat[ k ];
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
		for ( const k in water ) if ( k !== 'flood' && k !== 'weather' ) left += water[ k ];
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
