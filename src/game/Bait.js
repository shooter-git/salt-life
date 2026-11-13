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
// (M16) and frozen from Marta by the trip (price, per): ballyhoo for trolling, squid for anything and the deep. Lures
// (lure: your own gear, Gear.js' lures track, never used up; level: the track's level it comes with) go on the rig that
// works them: a jig (sinks) on a sinker, a plug (surface) cast on its own, a skirt towed. tow: a towed bait's speeds,
// knots (Presentation.towTaste): [ too slow, best from, best to, washed out ]. towed: it's only for that. Chum isn't for
// the hook: it goes over the side, and the fish come up the slick
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
	ballyhoo: { name: 'Frozen ballyhoo', short: 'ballyhoo', live: false, speed: 0.7, small: 0.2, skew: 0.7, steal: 0.02, towed: true, tow: [ 3, 5, 10, 15 ], price: 20, per: 12,
		likes: { mahi: 2.2, tuna: 1.8, yellowfin: 1.8, sailfish: 3, whiteMarlin: 3, blueMarlin: 2.4, wahoo: 1.6, barracuda: 1.6 } },
	squid: { name: 'Frozen squid', short: 'squid', live: false, speed: 0.8, small: 0.8, skew: 0.8, steal: 0.12, tow: [ 2.5, 4, 8, 12 ], price: 12, per: 6,
		likes: { swordfish: 4, mahi: 1.4, tuna: 1.8, yellowfin: 1.8, redSnapper: 2, silkSnapper: 2.4, muttonSnapper: 1.8, blackGrouper: 1.6, cuberaSnapper: 1.6 } },
	chum: { name: 'Chum', short: 'chum', live: false, speed: 1, small: 1, skew: 1, steal: 0, chum: true, price: 15, per: 1, likes: {} },
	jig: { name: 'Jig', short: 'jigs', live: false, speed: 0.85, small: 0.5, skew: 0.8, steal: 0, lure: true, level: 1, sinks: true,
		likes: { jack: 2.2, tuna: 2, yellowfin: 2, cuberaSnapper: 1.8, blackGrouper: 1.6, muttonSnapper: 1.6, barracuda: 1.4 } },
	plug: { name: 'Plug', short: 'plugs', live: false, speed: 0.9, small: 0.3, skew: 0.75, steal: 0, lure: true, level: 2, surface: true, tow: [ 1.5, 2.5, 8, 11 ],
		likes: { barracuda: 2.6, jack: 2.4, tarpon: 2, snook: 2.2, mahi: 1.6, wahoo: 1.4, blackGrouper: 1.2 } },
	skirt: { name: 'Trolling skirt', short: 'skirts', live: false, speed: 0.8, small: 0.1, skew: 0.65, steal: 0, lure: true, level: 3, towed: true, tow: [ 5, 7, 16, 24 ],
		likes: { wahoo: 2.8, mahi: 2, tuna: 2, yellowfin: 2, blueMarlin: 3, whiteMarlin: 1.6, sailfish: 1.2, barracuda: 1.4 } },
	// (M19) Bought by the lot from Joe and from Pearl (seller: whose; one without is Marta's until stream STALLS moves them:
	// docs/M19.md). Their figures are placeholders until STALLS' and FLY's sources set them (docs/m19/sources-boats-bait.md):
	// live shrimp by the dozen, $10 (judgement; the Keys' $8 to $15), sardines by the pound (Nassau's $5), conch cut from a
	// legal conch with a flared lip, hermit crabs for permit and bonefish
	liveShrimp: { name: 'Live shrimp', short: 'live shrimp', live: true, speed: 0.6, small: 1.1, skew: 0.9, steal: 0.12, price: 10, per: 12, seller: 'joe', kite: false,
		likes: { bonefish: 2.6, snook: 2.4, permit: 1.8, tarpon: 1.6, redfish: 2.2, trout: 2.4, muttonSnapper: 1.8, yellowtail: 1.6, grunt: 1.4 } },
	sardine: { name: 'Frozen sardines', short: 'sardines', live: false, speed: 0.7, small: 0.7, skew: 0.85, steal: 0.1, price: 5, per: 8, seller: 'joe',
		likes: { redSnapper: 2, muttonSnapper: 2, yellowtail: 1.8, blackGrouper: 1.8, grouper: 1.8, jack: 1.6, barracuda: 1.4 } },
	conch: { name: 'Cut conch', short: 'conch', live: false, speed: 0.75, small: 0.8, skew: 0.85, steal: 0.08, price: 6, per: 6, seller: 'pearl',
		likes: { bonefish: 2.2, muttonSnapper: 2.2, permit: 1.4, wrasse: 1.6, yellowtail: 1.4 } },
	hermitCrab: { name: 'Live hermit crab', short: 'hermit crabs', live: true, speed: 0.7, small: 0.5, skew: 0.85, steal: 0.06, price: 8, per: 6, seller: 'pearl', kite: false,
		likes: { permit: 3, bonefish: 2, wrasse: 1.6, muttonSnapper: 1.4 } },
	// (M19) The flies (stream FLY), your own gear as the lures are, with the Flies track's level they come with (fly: the
	// fly rod's alone; wt: the rod each is tied for, FLY_RODS; sink: m/s it goes down to the bottom between strips). Only the
	// fly rig takes them (Presentation's ONLY). A Gotcha on bead-chain eyes reaches the bottom of a 0.5 m flat in 2.5 s; a
	// Merkin on lead eyes sinks fast; a Toad's light and slow (docs/m19/sources-fly.md: the shrimp's derived, the rest judgement)
	flyShrimp: { name: 'Shrimp fly', short: 'shrimp flies', live: false, speed: 0.8, small: 0.6, skew: 0.85, steal: 0, lure: true, fly: true, level: 1, wt: 8, sink: 0.2,
		likes: { bonefish: 2.4, permit: 1.2, snook: 1.6, redfish: 1.6, trout: 1.6 } },
	flyCrab: { name: 'Crab fly', short: 'crab flies', live: false, speed: 0.85, small: 0.4, skew: 0.85, steal: 0, lure: true, fly: true, level: 2, wt: 10, sink: 0.35,
		likes: { permit: 2.6, bonefish: 1.4 } },
	flyTarpon: { name: 'Tarpon fly', short: 'tarpon flies', live: false, speed: 0.85, small: 0.2, skew: 0.75, steal: 0, lure: true, fly: true, level: 3, wt: 12, sink: 0.07,
		likes: { tarpon: 2.6, snook: 1.8, barracuda: 1.4 } },
};
export const BAIT_IDS = Object.keys( BAITS );

export const SMALL_KG = 0.7;
export const KEEPER_KG = 0.45; // a netted mullet this heavy goes in the cooler; a smaller one is bait
export const CUT_KG = 0.2; // a chunk of cut bait

// what can be put on the hook now, of these kinds (state: GameState): any of the bucket's or the freezer's, and the
// lures you've bought
// ((M19) a fly, the flies you've bought: the Flies track's level)
export const onHand = ( k, state ) => ( BAITS[ k ].fly ? ( state.upgrades.flies | 0 ) >= BAITS[ k ].level : BAITS[ k ].lure ? ( state.upgrades.lures | 0 ) >= BAITS[ k ].level : state.bait[ k ] > 0 );

// the bait a netted fish of this species makes (live, in the bucket), or null
export const baitOf = ( species ) => ( BAITS[ species ] && BAITS[ species ].live ? species : null );

// how many chunks a mullet of `kg` cuts into
export const chunksOf = ( kg ) => Math.max( 2, Math.min( 8, Math.round( kg / CUT_KG ) ) );

// a species' bite weight on this bait (null: shrimp), times this
export function baitWeight( bait, id ) {

	// ((M16) a fish's own taste, ahead of the bait's: FishTable's eats)
	const e = FISH[ id ].eats, own = e && e[ bait || 'shrimp' ];
	if ( own !== undefined ) return own;
	const b = BAITS[ bait ];
	if ( ! b ) return 1;
	if ( b.likes[ id ] ) return b.likes[ id ];
	return FISH[ id ].kg[ 1 ] < SMALL_KG ? b.small : 1;

}
