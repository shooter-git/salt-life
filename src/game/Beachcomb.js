import { mulberry32 } from '../util/Noise.js';

// (M15) Beachcombing: what the sea washes up, each day, where, and what it's worth. The trades blow onshore on
// the north side, and the North Equatorial Current carries the Atlantic's drift to the islands' windward
// beaches: so it's the north beach (the turtle beach, world/terrain/NorthBeach.js) the sea leaves things on,
// along its high-water line in the wrack, the bay's beach in the lee getting little. Each day's from the day
// alone (a hash), the same for everyone; the days after a hurricane, and after a big north sea, a lot more.
// A find lies for three days unless it's picked up (then it's buried, or the sea's taken it back). Pure (no
// three.js), for the tests under Node.
//   FINDS: each kind: its name, what it is, its price, who buys it ('marta' | 'joe' | null), how common
//   BEACHES: where along the line each beach's finds lie (world/Beachcombing.js finds the line)
//   findsOf( day, { north, storm } ) -> the day's [ { id, day, beach, kind, u (0..1 along it), off (m, across
//     the line, + up the beach), yaw, seed } ] (north: how big the north sea was, 0..1; storm: a hurricane's
//     wrack that day)
//   lying( day, days ) -> what's on the sand on `day` (finds of the last LIES days): days( d ) gives a day's
//     { north, storm }
//   messageOf( seed ) -> a message in a bottle's note { from, text }

export const LIES = 3;
export const FINDS = {
	driftwood: { name: 'Driftwood', what: 'a bleached, sea-worn branch: a carver\'s piece', price: 6, who: 'marta', common: 24 },
	trawlFloat: { name: 'Trawl float', what: 'a hard plastic net float, lost off a trawler', price: 4, who: 'marta', common: 18 },
	potBuoy: { name: 'Pot buoy', what: 'a lobster pot\'s buoy, its line parted', price: 5, who: 'marta', common: 12 },
	seaHeart: { name: 'Sea heart', what: 'the seed of a monkey-ladder vine (Entada gigas), drifted from a river in Africa or the Amazon', price: 4, who: 'marta', common: 12 },
	hamburgerBean: { name: 'Hamburger bean', what: 'a Mucuna seed, banded like a bun', price: 3, who: 'marta', common: 10 },
	nickernut: { name: 'Grey nickernut', what: 'a hard grey seed of Caesalpinia bonduc', price: 2, who: 'marta', common: 10 },
	bottle: { name: 'Message in a bottle', what: 'a corked bottle with a note rolled inside', price: 0, who: null, common: 4 },
	glassFloat: { name: 'Glass float', what: 'an old blown-glass fishing float in its rope net, decades at sea', price: 45, who: 'marta', common: 2 },
	marysBean: { name: 'Mary\'s bean', what: 'a Merremia seed with a cross on it, the rarest sea bean', price: 25, who: 'marta', common: 1.4 },
	ambergris: { name: 'Ambergris', what: 'a waxy grey lump from a sperm whale\'s gut, worth its weight in silver', price: 280, who: 'joe', common: 0.35 },
};
export const KINDS = Object.keys( FINDS );
// along each beach's high-water line: x from, x to (m), and how many a day: a calm day's, more with the sea
export const BEACHES = {
	north: { x: [ 85, 215 ], line: 1.25, n: [ 3, 6 ], sea: 6, storm: 14 },
	bay: { x: [ - 125, 140 ], line: 1.15, n: [ 0, 2 ], sea: 0, storm: 5 },
};

const hash = ( ...k ) => mulberry32( k.reduce( ( a, b ) => ( Math.imul( a ^ ( b | 0 ), 2654435761 ) + 0x9e3779b9 ) | 0, 0x7f4a7c15 ) );
const TOTAL = KINDS.reduce( ( s, k ) => s + FINDS[ k ].common, 0 );

function kindOf( r ) {

	let p = r * TOTAL;
	for ( const k of KINDS ) if ( ( p -= FINDS[ k ].common ) <= 0 ) return k;
	return KINDS[ 0 ];

}

export function findsOf( day, { north = 0, storm = false } = {} ) {

	const out = [];
	for ( const [ b, B ] of Object.entries( BEACHES ) ) {

		const r = hash( day, b.length, 7 );
		let n = B.n[ 0 ] + Math.floor( r() * ( B.n[ 1 ] - B.n[ 0 ] + 1 ) ) + Math.round( B.sea * Math.min( 1, Math.max( 0, north ) ) * r() );
		if ( storm ) n += B.storm;
		for ( let k = 0; k < n; k ++ ) {

			const q = hash( day, b.length, 11, k );
			out.push( { id: `${ day }:${ b }:${ k }`, day, beach: b, kind: kindOf( q() ), u: q(), off: ( q() - 0.5 ) * 3, yaw: q() * Math.PI * 2, seed: Math.floor( q() * 1e9 ) } );

		}

	}

	return out;

}

export function lying( day, days = () => ( {} ) ) {

	const out = [];
	for ( let d = day - LIES + 1; d <= day; d ++ ) out.push( ...findsOf( d, days( d ) ) );
	return out;

}

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
