// Catchable fish: game data for the species the world already swims (world/fish/FishSpecies.js).
//
//   name      display name
//   sci       scientific name
//   lw        [ a, b ] length-weight relation W (g) = a * L (cm, total length) ^ b (FishBase-style values)
//   model     key in SPECIES (the swimming model / skin)
//   habitat   weights per water type (see Bites.habitatAt): shallows (sand, < 3 m), reef (over the
//             reef), pier (around the piles), bay (open water 3–20 m), deep (offshore, > 20 m)
//   kg        [ min, max ] weight; sizes follow a skewed distribution (most fish are small)
//   price     $ per kg at the fish stand
//   fight     0..1 how hard it pulls (surge strength and frequency in the catch mini-game)
//   stamina   seconds of good pressure it takes to tire a typical one
//   time      activity by time of day: 'day', 'dawnDusk', 'night' or 'any'
//   rarity    0..1, scales how often it bites relative to the others in the same water
//   lights    (optional) after dark it gathers under the pier's lamps: its pier weight counts this
//             many times more while they're lit (Bites.pickSpecies)
//   flood     (optional) after dark it gathers under a boat's deck floodlights: its weight counts
//             this many times more in their pool (Bites.pickSpecies)
// (Salt Life) and for the law and the speargun:
//   protected  never kept: one caught on a line is measured, logged and released (the island's
//              records count it); the speargun won't fire at one
//   spear      a fish spearfishers take (food fish, and the invasive lionfish); the others (the reef's
//              aquarium fish, the bait fish) are left alone
//   minCm      the smallest one a spearfisher may keep (total length): the speargun won't fire at a
//              smaller one
//   bounty     $ Joe pays for each one on top of its weight (the lionfish: every one taken helps the reef)
export const FISH = {
	silverside: { name: 'Hardhead silverside', sci: 'Atherinomorus stipes', lw: [ 0.0074, 3.1 ], model: 'silverside', habitat: { shallows: 1, pier: 0.6, bay: 0.2 }, kg: [ 0.02, 0.08 ], price: 3, fight: 0.05, stamina: 1.5, time: 'any', rarity: 0.2 },
	mullet: { name: 'Striped mullet', sci: 'Mugil cephalus', lw: [ 0.0112, 2.98 ], model: 'mullet', habitat: { shallows: 1, pier: 0.4 }, kg: [ 0.4, 2.2 ], price: 5, fight: 0.3, stamina: 5, time: 'day', rarity: 0.8 },
	needlefish: { name: 'Houndfish', sci: 'Tylosurus crocodilus', lw: [ 0.0012, 3.1 ], model: 'needlefish', habitat: { shallows: 0.7, bay: 0.5, pier: 0.3 }, kg: [ 0.5, 2.5 ], price: 4, fight: 0.45, stamina: 5, time: 'day', rarity: 0.5, flood: 2 },
	sergeant: { name: 'Sergeant major', sci: 'Abudefduf saxatilis', lw: [ 0.0234, 3.0 ], model: 'sergeant', habitat: { pier: 1, reef: 0.8 }, kg: [ 0.1, 0.35 ], price: 6, fight: 0.15, stamina: 2.5, time: 'day', rarity: 1 },
	grunt: { name: 'Bluestriped grunt', sci: 'Haemulon sciurus', lw: [ 0.0145, 3.06 ], model: 'grunt', habitat: { pier: 1, reef: 0.8, bay: 0.2 }, kg: [ 0.3, 1.2 ], price: 7, fight: 0.25, stamina: 4, time: 'any', rarity: 1, spear: true },
	yellowtail: { name: 'Yellowtail snapper', sci: 'Ocyurus chrysurus', lw: [ 0.0137, 2.98 ], model: 'yellowtail', habitat: { reef: 1, pier: 0.4, bay: 0.4 }, kg: [ 0.4, 1.6 ], price: 12, fight: 0.4, stamina: 5, time: 'dawnDusk', rarity: 0.9, spear: true, minCm: 30, flood: 3 },
	chromis: { name: 'Blue chromis', sci: 'Chromis cyanea', lw: [ 0.0209, 3.0 ], model: 'chromis', habitat: { reef: 1 }, kg: [ 0.03, 0.1 ], price: 4, fight: 0.05, stamina: 1.5, time: 'day', rarity: 0.4 },
	tang: { name: 'Blue tang', sci: 'Acanthurus coeruleus', lw: [ 0.0282, 2.95 ], model: 'tang', habitat: { reef: 1 }, kg: [ 0.2, 0.6 ], price: 8, fight: 0.2, stamina: 3, time: 'day', rarity: 0.6 },
	// (the hogfish rarely takes a bait: it's the spearfisher's fish)
	wrasse: { name: 'Hogfish', sci: 'Lachnolaimus maximus', lw: [ 0.0151, 3.07 ], model: 'hogfish', habitat: { reef: 0.8, bay: 0.3 }, kg: [ 0.5, 4 ], price: 16, fight: 0.35, stamina: 6, time: 'day', rarity: 0.2, spear: true, minCm: 41 },
	// (they graze the algae off the coral: protected across much of the Caribbean)
	parrot: { name: 'Stoplight parrotfish', sci: 'Sparisoma viride', lw: [ 0.0151, 3.06 ], model: 'parrot', habitat: { reef: 1 }, kg: [ 0.8, 4 ], price: 9, fight: 0.35, stamina: 6, time: 'day', rarity: 0.5, protected: true },
	angel: { name: 'Queen angelfish', sci: 'Holacanthus ciliaris', lw: [ 0.0302, 2.94 ], model: 'angel', habitat: { reef: 1 }, kg: [ 0.4, 1.6 ], price: 14, fight: 0.25, stamina: 4, time: 'day', rarity: 0.3 },
	jack: { name: 'Crevalle jack', sci: 'Caranx hippos', lw: [ 0.02, 2.93 ], model: 'jack', habitat: { shallows: 0.5, pier: 0.7, bay: 0.8 }, kg: [ 1, 9 ], price: 6, fight: 0.75, stamina: 12, time: 'dawnDusk', rarity: 0.5, spear: true, flood: 2 },
	barracuda: { name: 'Great barracuda', sci: 'Sphyraena barracuda', lw: [ 0.0051, 3.08 ], model: 'barracuda', habitat: { reef: 0.5, bay: 0.8, deep: 0.5 }, kg: [ 2, 16 ], price: 5, fight: 0.7, stamina: 11, time: 'any', rarity: 0.45, spear: true },
	// (critically endangered: no one may take one)
	grouper: { name: 'Nassau grouper', sci: 'Epinephelus striatus', lw: [ 0.0107, 3.07 ], model: 'grouper', habitat: { reef: 0.6, deep: 0.6 }, kg: [ 3, 14 ], price: 15, fight: 0.6, stamina: 12, time: 'any', rarity: 0.3, protected: true },
	redSnapper: { name: 'Red snapper', sci: 'Lutjanus campechanus', lw: [ 0.0137, 2.98 ], model: 'redSnapper', habitat: { deep: 1, bay: 0.2 }, kg: [ 1.5, 9 ], price: 18, fight: 0.5, stamina: 9, time: 'any', rarity: 0.7, spear: true, minCm: 41 },
	tuna: { name: 'Blackfin tuna', sci: 'Thunnus atlanticus', lw: [ 0.0145, 3.0 ], model: 'tuna', habitat: { deep: 1 }, kg: [ 3, 14 ], price: 16, fight: 0.85, stamina: 16, time: 'dawnDusk', rarity: 0.5, spear: true },
	mahi: { name: 'Mahi-mahi', sci: 'Coryphaena hippurus', lw: [ 0.0079, 3.0 ], model: 'mahi', habitat: { deep: 0.8 }, kg: [ 4, 18 ], price: 14, fight: 0.8, stamina: 15, time: 'day', rarity: 0.4, spear: true, minCm: 51 },
	// (catch and release only)
	tarpon: { name: 'Tarpon', sci: 'Megalops atlanticus', lw: [ 0.0077, 3.02 ], model: 'tarpon', habitat: { pier: 0.35, bay: 0.5, shallows: 0.15 }, kg: [ 10, 45 ], price: 4, fight: 1, stamina: 24, time: 'night', rarity: 0.2, protected: true, lights: 3 },
	blackGrouper: { name: 'Black grouper', sci: 'Mycteroperca bonaci', lw: [ 0.0115, 3.03 ], model: 'blackGrouper', habitat: { reef: 0.4, deep: 0.7 }, kg: [ 3, 25 ], price: 16, fight: 0.75, stamina: 14, time: 'any', rarity: 0.35, spear: true, minCm: 61 },
	muttonSnapper: { name: 'Mutton snapper', sci: 'Lutjanus analis', lw: [ 0.0157, 2.97 ], model: 'muttonSnapper', habitat: { reef: 0.6, bay: 0.4, deep: 0.3 }, kg: [ 1, 7 ], price: 14, fight: 0.55, stamina: 9, time: 'dawnDusk', rarity: 0.45, spear: true, minCm: 46 },
	// (an invader from the Pacific with no predators here: every one taken helps the reef)
	lionfish: { name: 'Red lionfish', sci: 'Pterois volitans', lw: [ 0.0119, 3.1 ], model: 'lionfish', habitat: { reef: 0.7, pier: 0.25, deep: 0.3 }, kg: [ 0.15, 1.1 ], price: 10, fight: 0.1, stamina: 2, time: 'any', rarity: 0.12, spear: true, bounty: 6 },
};

export const FISH_IDS = Object.keys( FISH );

// $ value of a fish; trophy-sized ones fetch a bit more per kg. Nothing for a protected one: it's
// let go
export function fishValue( id, kg ) {

	const f = FISH[ id ];
	if ( f.protected ) return 0;
	const t = ( kg - f.kg[ 0 ] ) / Math.max( f.kg[ 1 ] - f.kg[ 0 ], 1e-6 );
	return Math.max( 1, Math.round( f.price * kg * ( 1 + 0.25 * Math.max( 0, t - 0.7 ) / 0.3 ) ) + ( f.bounty || 0 ) );

}

// a trophy: in the top fifth of its kind's size range (about one fish in ten: Bites.rollWeight)
export function isTrophy( id, kg ) {

	const [ a, b ] = FISH[ id ].kg;
	return ( kg - a ) / Math.max( b - a, 1e-6 ) >= 0.8;

}

// total length (cm) of a fish of `kg`, from its species' length-weight relation
export function fishLengthCm( id, kg ) {

	const [ a, b ] = FISH[ id ].lw;
	return Math.pow( Math.max( kg, 0.001 ) * 1000 / a, 1 / b );

}

// weight (kg) of a fish `cm` long (total length): the length-weight relation the other way, for a
// speared fish, weighed by the size it swam at
export function fishWeightKg( id, cm ) {

	const [ a, b ] = FISH[ id ].lw;
	return a * Math.pow( Math.max( cm, 0.1 ), b ) / 1000;

}

// may a spearfisher take this one? 'ok', or why not: 'protected', 'notTarget' (not a fish anyone
// spears) or 'small' (under its minimum size)
export function spearRule( id, cm ) {

	const f = FISH[ id ];
	if ( ! f ) return 'notTarget';
	if ( f.protected ) return 'protected';
	if ( ! f.spear ) return 'notTarget';
	if ( f.minCm && cm < f.minCm ) return 'small';
	return 'ok';

}
