import { findsAbout } from './Finds.js';

// (M15) The checks offshore. All the Spaces' checks play qa/script.json by the keys alone, a few minutes on a CPU's
// GPU: sailing 20 km takes the boat most of an hour. So F8, in a browser being driven (navigator.webdriver) and
// nowhere else, jumps her to the next of these, the last bringing you back as you were, and the checks' frames and
// budgets are read out there as they are in the bay. tools/far-sea.mjs goes to them by name too. No three.js.

export const CHECK_SPOTS = [
	{ id: 'bank', x: - 6200, z: 7400 }, // (a first place to make for: its reefs, its surf)
	{ id: 'far', x: 0, z: 20000 }, // (the open ocean, past the far grounds)
	{ id: 'home' },
];
// (for tools/far-sea.mjs too: each stop in the script is time on all four screens, and the checks have 25 minutes)
export const FAR_SPOTS = [
	{ id: 'dropoff', x: 64, z: 3500 }, // (where the shelf falls away, south of the bay)
	{ id: 'weedline', x: 64, z: 6000, find: true }, // (the nearest weedline to there, by its middle)
	{ id: 'edge', x: 0, z: 30000 }, // (past the soft edge)
	...CHECK_SPOTS.slice( 0, 2 ),
];

// where a spot is at the island's time T: { x, z }
export function checkSpotAt( spot, T, depthAt = null ) {

	if ( ! spot.find ) return { x: spot.x, z: spot.z };
	let best = null, d = Infinity;
	for ( const w of findsAbout( T, spot.x, spot.z, 6000, { weed: [], debris: [], bait: [] }, depthAt ).weed ) {

		const mx = ( w.x0 + w.x1 ) / 2, mz = ( w.z0 + w.z1 ) / 2, q = Math.hypot( mx - spot.x, mz - spot.z ) / Math.max( w.life, 0.05 );
		if ( q < d ) {

			d = q;
			best = { x: mx, z: mz };

		}

	}

	return best || { x: spot.x, z: spot.z };

}
