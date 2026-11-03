import { mulberry32 } from '../util/Noise.js';
import { MANGROVE } from '../world/terrain/Mangrove.js';
import { SHELLS, SHELL_KINDS } from './Shells.js';

// (M15) Beachcombing: what the sea washes up, each day, where, and what it's worth. The trades blow onshore on
// the north side, and the North Equatorial Current carries the Atlantic's drift to the islands' windward
// beaches: so it's the north beach (the turtle beach, world/terrain/NorthBeach.js) the sea leaves things on,
// along its high-water line in the wrack, the bay's beach in the lee getting little. Each day's from the day
// alone (a hash), the same for everyone; the days after a hurricane, and after a big north sea, a lot more.
// A find lies for three days unless it's picked up (then it's buried, or the sea's taken it back). Pure (no
// three.js), for the tests under Node.
// (M16) And each shore its own, by what brings things to it:
//   - north: the windward beach, the ocean's drift, as above (its days' finds as they were in M15);
//   - bay: the lee: nothing's come far. What the bay's own bottom gives up (the sand flats' tests and shells), and what
//     the village and its boats have lost (sea glass, a lure off the pier, an old clay pipe's stem);
//   - strand: the bay's east side. The trades blow across the bay toward it, so what floats in the bay ends up here,
//     with the sand flats' shells: floats, a sponge, a sea fan torn off in a blow;
//   - rocks, westRocks: the rock down each side of the bay: no drift to speak of, the top shells and nerites of the
//     splash zone and the cowries from under the stones;
//   - cove: the pocket in the rock of the north coast, west of the north beach. Windward: the drift's jammed in it, and
//     it keeps what's heavy, so more of the reef's big shells; a glass float may lodge here unbroken;
//   - mangrove: the back of the stand on the west. Its roots comb out what floats (Honduras's and Florida's mangroves
//     hold more litter than their beaches), its own red-mangrove seedlings, the periwinkles that live on its roots.
//   FINDS: each kind: its name, what it is, its price, who buys it ('marta' | 'joe' | null); (the shells: game/Shells.js;
//     the hurricane's scrap too)
//   BEACHES: where along the line each beach's finds lie, how many a day, what they are (list; shells: their own count,
//     their own list) (world/Beachcombing.js finds the line)
//   findsOf( day, { north, lee, storm } ) -> the day's [ { id, day, beach, kind, u (0..1 along it), off (m, across
//     the line, + up the beach), yaw, seed } ] (north: how big the north sea was, 0..1; lee: how big the sea in the bay,
//     0..1; storm: a hurricane's wrack that day)
//   lying( day, days ) -> what's on the sand on `day` (finds of the last LIES days): days( d ) gives a day's
//     { north, lee, storm }
//   messageOf( seed ) -> a message in a bottle's note { from, text }
// (M16) What a hurricane tore off the village, lying in its wrack on the bay's beach (world/Beachcombing.js draws it):
//   wreckageAt( D ) -> [ { id, kind ('tin', 'plank', ...), day, u, off, yaw, seed, scrap (a FINDS kind, or null: it can't
//     be carried off) } ], at the damage D (StormDamage.damageAt), thinning as it's cleared; wreckStamp( D ): when it changes

export const LIES = 3;
export const FINDS = {
	driftwood: { name: 'Driftwood', what: 'a bleached, sea-worn branch: a carver\'s piece', price: 6, who: 'marta' },
	trawlFloat: { name: 'Trawl float', what: 'a hard plastic net float, lost off a trawler', price: 4, who: 'marta' },
	potBuoy: { name: 'Pot buoy', what: 'a lobster pot\'s buoy, its line parted', price: 5, who: 'marta' },
	seaHeart: { name: 'Sea heart', what: 'the seed of a monkey-ladder vine (Entada gigas), drifted from a river in Africa or the Amazon', price: 4, who: 'marta' },
	hamburgerBean: { name: 'Hamburger bean', what: 'a Mucuna seed, banded like a bun', price: 3, who: 'marta' },
	nickernut: { name: 'Grey nickernut', what: 'a hard grey seed of Caesalpinia bonduc', price: 2, who: 'marta' },
	bottle: { name: 'Message in a bottle', what: 'a corked bottle with a note rolled inside', price: 0, who: null },
	glassFloat: { name: 'Glass float', what: 'an old blown-glass fishing float in its rope net, decades at sea', price: 45, who: 'marta' },
	marysBean: { name: 'Mary\'s bean', what: 'a Merremia seed with a cross on it, the rarest sea bean', price: 25, who: 'marta' },
	ambergris: { name: 'Ambergris', what: 'a waxy grey lump from a sperm whale\'s gut, worth its weight in silver', price: 280, who: 'joe' },
	// ((M16) the lee's, and the other shores')
	sandDollar: { name: 'Sand dollar', what: 'the bleached test of a six-keyhole sand dollar, off the bay\'s sand', price: 3, who: 'marta' },
	urchinTest: { name: 'Sea egg test', what: 'the empty shell of a sea egg (Tripneustes), an urchin of the seagrass, bleached and light as paper', price: 2, who: 'marta' },
	seaGlass: { name: 'Sea glass', what: 'a bit of the village\'s bottle, tumbled frosted by the bay', price: 2, who: 'marta' },
	pipeStem: { name: 'Clay pipe stem', what: 'a piece of an old white clay pipe, dropped in the harbour two hundred years back', price: 8, who: 'marta' },
	lostLure: { name: 'Lost lure', what: 'someone\'s plug off the pier, its hooks rusted', price: 3, who: 'marta' },
	sponge: { name: 'Sponge', what: 'a sheep\'s wool sponge torn loose and dried in the sun', price: 4, who: 'marta' },
	seaFan: { name: 'Sea fan', what: 'a purple sea fan (Gorgonia ventalina) torn off the reef, its holdfast still on it', price: 5, who: 'marta' },
	propagule: { name: 'Mangrove seedling', what: 'a red mangrove\'s pencil-long seedling: it floats for a year and roots where it lands', price: 0, who: null },
	// ((M16) the hurricane's wreck, for Marta as scrap: a sound sheet goes on someone's lean-to)
	scrapTin: { name: 'Sheet of roofing tin', what: 'torn off a roof in the hurricane, bent but sound', price: 4, who: 'marta' },
	scrapPlank: { name: 'Good plank', what: 'a board off the pier or a porch, still worth the nails', price: 2, who: 'marta' },
	scrapShutter: { name: 'Shutter', what: 'a house\'s shutter, off its hinges', price: 5, who: 'marta' },
	scrapDoor: { name: 'Door', what: 'a plank door, its hinges torn out; someone\'s missing it', price: 9, who: 'marta' },
	scrapPot: { name: 'Fish pot', what: 'a fisherman\'s pot, swept off the beach and stove in on one side', price: 8, who: 'marta' },
};
for ( const k of SHELL_KINDS ) {

	const S = SHELLS[ k ];
	FINDS[ k ] = { name: S.name, what: `${ S.what } (${ S.sci })`, price: S.price, who: S.who, shell: true };

}

export const KINDS = Object.keys( FINDS );
// along each beach's high-water line: x from, x to (m), or the shore's own line (path, seaward from it: sea); how
// high up it is (m); how many a day: a calm day's, more with the sea (of `lee`'s sea, for the lee's shores); what they
// are (its own commons), its shells
const OCEAN = { driftwood: 24, trawlFloat: 18, potBuoy: 12, seaHeart: 12, hamburgerBean: 10, nickernut: 10, bottle: 4, glassFloat: 2, marysBean: 1.4, ambergris: 0.35 };
export const BEACHES = {
	north: { x: [ 85, 215 ], line: 1.25, n: [ 3, 6 ], sea: 6, storm: 14, list: OCEAN, salt: 5,
		s: [ 0, 1 ], sStorm: 3, shells: { queenConch: 1, kingHelmet: 0.7, flamingoTongue: 0.45, triton: 0.28, measledCowrie: 0.4 } },
	bay: { x: [ - 125, 140 ], line: 1.15, n: [ 0, 2 ], sea: 2, lee: true, storm: 5, salt: 3,
		list: { sandDollar: 10, urchinTest: 8, seaGlass: 12, lostLure: 3, pipeStem: 0.9, driftwood: 2, sponge: 1 },
		s: [ 1, 2 ], sStorm: 3, shells: { sunriseTellin: 10, fightingConch: 8, nettedOlive: 3, turkeyWing: 2, queenConch: 1.6, musicVolute: 0.35 } },
	strand: { path: [ [ 184, 5 ], [ 182, 25 ], [ 182, 40 ], [ 184, 55 ], [ 186, 70 ], [ 184.5, 85 ] ], sea: [ - 1, 0 ], line: 0.9, n: [ 0, 2 ], seaN: 2, lee: true, storm: 4, salt: 16, spread: 1.6,
		list: { driftwood: 6, trawlFloat: 4, sponge: 3, seaFan: 2.4, seaGlass: 3, potBuoy: 1.5 },
		s: [ 0, 2 ], sStorm: 2, shells: { turkeyWing: 6, fightingConch: 5, sunriseTellin: 4, queenConch: 2, kingHelmet: 0.5, musicVolute: 0.3 } },
	rocks: { path: [ [ 197, 105 ], [ 198, 115 ], [ 201, 130 ], [ 209, 146 ], [ 217, 160 ], [ 206, 175 ] ], sea: [ - 1, 0 ], line: 0.8, n: [ 0, 1 ], seaN: 1, lee: true, storm: 3, salt: 17, spread: 0.8,
		list: { driftwood: 2, trawlFloat: 2, seaFan: 1 },
		s: [ 1, 2 ], sStorm: 2, shells: { bleedingTooth: 9, topShell: 8, turkeyWing: 3, yellowCowrie: 3, measledCowrie: 1.2, flamingoTongue: 0.25 } },
	westRocks: { path: [ [ - 179, 10 ], [ - 179, 20 ], [ - 185.5, 40 ], [ - 186, 60 ], [ - 184.5, 80 ], [ - 194.5, 100 ], [ - 198.5, 120 ], [ - 208.5, 140 ], [ - 219, 160 ], [ - 233, 180 ] ], sea: [ 1, 0 ], line: 0.8, n: [ 0, 1 ], seaN: 1, lee: true, storm: 3, salt: 18, spread: 0.8,
		list: { driftwood: 2, potBuoy: 1, seaFan: 1 },
		s: [ 1, 2 ], sStorm: 2, shells: { topShell: 8, bleedingTooth: 7, yellowCowrie: 3, measledCowrie: 1.5, flamingoTongue: 0.25 } },
	cove: { path: [ [ - 39, - 846 ], [ - 34, - 840 ], [ - 29, - 834 ], [ - 24, - 832 ], [ - 19, - 836 ] ], sea: [ 0, - 1 ], line: 0.85, n: [ 0, 1 ], seaN: 2, storm: 3, salt: 19, spread: 0.8,
		list: { driftwood: 6, trawlFloat: 5, glassFloat: 0.5, seaHeart: 2, potBuoy: 2 },
		s: [ 0, 1 ], sStorm: 2, shells: { topShell: 4, bleedingTooth: 4, measledCowrie: 1, kingHelmet: 0.7, flamingoTongue: 0.4, triton: 0.35 } },
	mangrove: { path: MANGROVE.shore, sea: [ - 0.82, 0.57 ], inland: 50, line: 0.25, n: [ 0, 2 ], seaN: 1, lee: true, storm: 3, salt: 20, spread: 1,
		list: { propagule: 12, trawlFloat: 3, driftwood: 3, potBuoy: 1.5, bottle: 0.25 },
		s: [ 0, 1 ], sStorm: 1, shells: { periwinkle: 10 } },
};

const hash = ( ...k ) => mulberry32( k.reduce( ( a, b ) => ( Math.imul( a ^ ( b | 0 ), 2654435761 ) + 0x9e3779b9 ) | 0, 0x7f4a7c15 ) );

function pick( list, r ) {

	let total = 0;
	for ( const k in list ) total += list[ k ];
	let p = r * total, last = null;
	for ( const k in list ) {

		last = k;
		if ( ( p -= list[ k ] ) <= 0 ) return k;

	}

	return last;

}

export function findsOf( day, { north = 0, lee = 0, storm = false } = {} ) {

	const out = [];
	for ( const [ b, B ] of Object.entries( BEACHES ) ) {

		const r = hash( day, B.salt, 7 ), sea = Math.min( 1, Math.max( 0, B.lee ? lee : north ) );
		let n = B.n[ 0 ] + Math.floor( r() * ( B.n[ 1 ] - B.n[ 0 ] + 1 ) ) + Math.round( ( B.path ? B.seaN : B.sea ) * sea * r() );
		if ( storm ) n += B.storm;
		for ( let k = 0; k < n; k ++ ) {

			const q = hash( day, B.salt, 11, k );
			out.push( { id: `${ day }:${ b }:${ k }`, day, beach: b, kind: pick( B.list, q() ), u: q(), off: ( q() - 0.5 ) * ( B.spread ?? 3 ), yaw: q() * Math.PI * 2, seed: Math.floor( q() * 1e9 ) } );

		}

		// (its shells: their own stream; the sea turning more of them out, a hurricane's most of all)
		const R = hash( day, B.salt, 23 );
		let m = B.s[ 0 ] + Math.floor( R() * ( B.s[ 1 ] - B.s[ 0 ] + 1 ) ) + ( R() < sea * 0.6 ? 1 : 0 );
		if ( storm ) m += B.sStorm;
		for ( let k = 0; k < m; k ++ ) {

			const q = hash( day, B.salt, 29, k );
			out.push( { id: `${ day }:${ b }:s${ k }`, day, beach: b, kind: pick( B.shells, q() ), u: q(), off: ( q() - 0.5 ) * ( B.spread ?? 3 ), yaw: q() * Math.PI * 2, seed: Math.floor( q() * 1e9 ) } );

		}

	}

	return out;

}

export function lying( day, days = () => ( {} ) ) {

	const out = [];
	for ( let d = day - LIES + 1; d <= day; d ++ ) out.push( ...findsOf( d, days( d ) ) );
	return out;

}

// ---- (M16) a hurricane's wreck in its wrack: what it tore off the village (the sheets off the roofs, the pier's boards,
// shutters and a door, the fish pots from the beach), thrown back up by the sea with the weed. More the higher its sea
// came. Each lies until it's cleared, a day and a bit to ten after the storm, as the sheets on the ground are
// (FlyingSheets' FLIGHT.clear) and the wrack (StormDamage). Some's sound enough to carry to Marta: a sheet of tin goes
// on someone's lean-to, the fishermen want their pots back
export const WRECK = {
	kinds: { tin: 7, plank: 7, pot: 3, shutter: 3, crate: 2, door: 1.2, chair: 1 },
	scrap: { tin: 'scrapTin', plank: 'scrapPlank', pot: 'scrapPot', shutter: 'scrapShutter', door: 'scrapDoor' },
	sound: { tin: 0.6, plank: 0.5, pot: 0.5, shutter: 0.8, door: 1 }, // the share of them worth carrying off
	count: [ 16, 30 ], // pieces, as high as its sea came (StormDamage's wrackH, m: from 1.6 to 3.2)
	clear: [ 30, 240 ], // game hours after the storm's gone
	x: [ - 135, 145 ],
};
const keyHash = ( s ) => {

	let h = 0x811c9dc5;
	for ( let i = 0; i < s.length; i ++ ) h = Math.imul( h ^ s.charCodeAt( i ), 0x01000193 );
	return h | 0;

};
let _wk = null, _wl = null;
function wreckOf( key, H, ends ) {

	if ( _wk === key ) return _wl;
	const W = WRECK, kh = keyHash( key ), t = Math.min( 1, Math.max( 0, ( H - 1.6 ) / 1.6 ) ), n = Math.round( W.count[ 0 ] + ( W.count[ 1 ] - W.count[ 0 ] ) * t );
	const lastDay = Math.ceil( ( ends + W.clear[ 1 ] ) / 24 ) + 1, list = [];
	for ( let k = 0; k < n; k ++ ) {

		const q = hash( kh, 31, k ), kind = pick( W.kinds, q() ), sound = q() < ( W.sound[ kind ] ?? 0 ), clearAt = W.clear[ 0 ] + ( W.clear[ 1 ] - W.clear[ 0 ] ) * Math.pow( q(), 1.3 );
		// (the id starts with the last day it could lie: what you've picked up's remembered till then)
		list.push( { id: `${ lastDay }:wreck${ kh & 0xffff }:${ k }`, kind, u: q(), off: ( q() - 0.5 ) * 1.6, yaw: q() * Math.PI * 2, seed: Math.floor( q() * 1e9 ), scrap: sound ? W.scrap[ kind ] : null, clearAt, H } );

	}

	_wk = key;
	_wl = list;
	return list;

}

const hasWreck = ( D ) => !! D && !! D.storm && D.wrack > 0.01 && D.wrackH > 1.6;
export function wreckageAt( D ) {

	if ( ! hasWreck( D ) ) return [];
	const day = Math.floor( ( D.storm.ends + D.after ) / 24 );
	return wreckOf( `${ D.storm.key }:${ D.wrackH.toFixed( 2 ) }`, D.wrackH, D.storm.ends ).filter( ( w ) => D.after < w.clearAt ).map( ( w ) => ( { ...w, day } ) );

}

// (what wreckageAt gives changes when this does)
export const wreckStamp = ( D ) => hasWreck( D ) ? `${ D.storm.key }:${ D.wrackH.toFixed( 2 ) }:${ Math.floor( D.after / 3 ) }` : '';

// the notes in the bottles: written by people at sea and on the islands upwind
const MESSAGES = [
	{ from: 'a sloop at sea', text: 'Day 41 out from the Canaries, all well aboard. The trades have been kind and the flying fish land on deck every night. Whoever finds this: we made it, or we\'re close.' },
	{ from: 'a class of eight-year-olds', text: 'Hello! We are Class Four and we are doing a project on the ocean currents. Please tell someone where you found this bottle. We think it will go to Africa.' },
	{ from: 'a fisherman', text: 'The old coaster on the windward reef: the big snappers lie off her bow at dusk. Don\'t tell anyone.' },
	{ from: 'someone on a honeymoon', text: 'Thrown off the stern on the last night of our honeymoon. We have never been happier. Whoever you are, we hope you are too.' },
	{ from: 'a grandson', text: 'Grandad\'s ashes went to sea off the reef today. He fished these waters for sixty years. Catch one for him.' },
	{ from: 'a drift study', text: 'DRIFT BOTTLE No. 2731. This bottle was released to study the surface currents. Please note where and when it was found, and pass it on to the harbour master.' },
	{ from: 'a lighthouse keeper', text: 'Third winter at the light. The gannets are back and the coffee\'s running low. If a boat passes, wave.' },
	{ from: 'a boy with a plan', text: 'If this bottle reaches land before Saturday I will ask her to the dance. If it doesn\'t I will ask her anyway.' },
];

export function messageOf( seed ) {

	return MESSAGES[ Math.abs( seed | 0 ) % MESSAGES.length ];

}
