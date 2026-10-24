import { FISH } from './FishTable.js';

// (Salt Life) Bait: what the cast net brings up, kept alive in the bait bucket (Gear.js baitWell), and
// what goes on the hook. Live bait (a silverside, a sergeant major, a grunt or a small mullet, hooked
// through the lips) and cut bait (a mullet from the cooler, cut into chunks) bring the predators in,
// bite sooner and bring bigger fish; the frozen shrimp you start with (never runs out) is what the
// little fish take.
//   name     on the hook
//   short    in the purse and the toasts (many of them)
//   live     still swimming
//   speed    the bite delay on it (Bites.biteDelay), times this
//   small    a little fish's bite weight (the heaviest of its kind under SMALL_KG), times this: a big
//            bait is too much for them
//   likes    species -> its bite weight, times this
//   skew     how far toward the big end the weights go (Bites.rollWeight's exponent, times this)
//   steal    the chance each nibble takes it off the hook
export const BAITS = {
	silverside: { name: 'Live silverside', short: 'silversides', live: true, speed: 0.7, small: 0.7, skew: 0.9, steal: 0.06,
		likes: { needlefish: 2.4, jack: 2.2, yellowtail: 2, barracuda: 1.8, tarpon: 1.8, mahi: 1.8, tuna: 2.2, muttonSnapper: 1.4 } },
	sergeant: { name: 'Live sergeant major', short: 'sergeant majors', live: true, speed: 0.65, small: 0.3, skew: 0.8, steal: 0.04,
		likes: { blackGrouper: 2.6, grouper: 2.6, muttonSnapper: 2.2, redSnapper: 2, barracuda: 1.8, jack: 1.6 } },
	grunt: { name: 'Live grunt', short: 'grunts', live: true, speed: 0.6, small: 0.2, skew: 0.75, steal: 0.03,
		likes: { blackGrouper: 3, grouper: 3, redSnapper: 2.6, muttonSnapper: 2.2, barracuda: 1.8, jack: 1.4 } },
	mullet: { name: 'Live mullet', short: 'mullet', live: true, speed: 0.55, small: 0.12, skew: 0.65, steal: 0.02,
		likes: { tarpon: 4, jack: 2.6, barracuda: 3, blackGrouper: 2.4, grouper: 2.4, redSnapper: 1.8, mahi: 2.2, tuna: 1.6, muttonSnapper: 1.6 } },
	cutMullet: { name: 'Cut mullet', short: 'cut mullet', live: false, speed: 0.55, small: 0.9, skew: 0.9, steal: 0.14,
		likes: { redSnapper: 2.2, muttonSnapper: 2.2, yellowtail: 1.6, grunt: 1.4, jack: 1.5, blackGrouper: 1.6, barracuda: 1.3 } },
};
export const BAIT_IDS = Object.keys( BAITS );

export const SMALL_KG = 0.7;
export const KEEPER_KG = 0.45; // a netted mullet this heavy goes in the cooler; a smaller one is bait
export const CUT_KG = 0.2; // a chunk of cut bait

// the bait a netted fish of this species makes (live, in the bucket), or null
export const baitOf = ( species ) => ( BAITS[ species ] && BAITS[ species ].live ? species : null );

// how many chunks a mullet of `kg` cuts into
export const chunksOf = ( kg ) => Math.max( 2, Math.min( 8, Math.round( kg / CUT_KG ) ) );

// a species' bite weight on this bait (null: shrimp), times this
export function baitWeight( bait, id ) {

	const b = BAITS[ bait ];
	if ( ! b ) return 1;
	if ( b.likes[ id ] ) return b.likes[ id ];
	return FISH[ id ].kg[ 1 ] < SMALL_KG ? b.small : 1;

}
