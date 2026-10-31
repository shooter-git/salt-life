import { Vector3 } from '../../engine/index.js';
import { WORLD } from '../../world/WorldLayout.js';

// (M16) Where the boats you own are kept, each sized to her (the sportfisher overlaps the pier at the lobster boat's):
//   the lobster boat, on the east side of the pier head, as ever;
//   the center console on its west side, the same way round;
//   the sportfisher alongside its seaward face, bow east: the T-head's the only place on the pier with 15 m of edge and
//   4.5 m of water, and it's where a real one lies;
//   the kayak in the shallows just off the sand by the pier's foot (0.3 m of water), bow to the sea: too low to reach
//   from a deck 2.3 m up, so she's waded out to.
// Each a { position, heading }, her origin at the waterline.
export const BERTHS = {
	kayak: { position: new Vector3( 59.5, 0, - 38 ), heading: 0 },
	console: { position: new Vector3( 46.1, 0, 36.5 ), heading: 0 },
	lobster: { position: WORLD.boatDock.position, heading: WORLD.boatDock.heading },
	sportfisher: { position: new Vector3( 55, 0, 43.2 ), heading: Math.PI / 2 },
};

export const berthOf = ( id ) => BERTHS[ id ] || BERTHS.lobster;
