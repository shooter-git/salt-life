import { Vector3 } from '../../engine/index.js';
import { WORLD } from '../../world/WorldLayout.js';
import { TIDE_HIGHEST } from '../IslandClock.js';

// (M16) Where the boats you own are kept, each sized to her (the sportfisher overlaps the pier at the lobster boat's):
//   the lobster boat, on the east side of the pier head, as ever;
//   the center console on its west side, the same way round;
//   the sportfisher alongside its seaward face, bow east: the T-head's the only place on the pier with 15 m of edge and
//   4.5 m of water, and it's where a real one lies;
//   the kayak at the water's edge by the pier's foot, bow to the sea: nobody ties a kayak to a pier. She lies up the sand from
//   there, clear of the wash (ashore: world/boat/kayak/Shore.js, from this point; ashoreOf below, what's drawn of her).
// Each a { position, heading }, her origin at the waterline.
export const BERTHS = {
	kayak: { position: new Vector3( 44, 0, - 38 ), heading: 0, ashore: true }, // ((M16) on the open sand, in plain sight from where a new game starts)
	console: { position: new Vector3( 46.1, 0, 36.5 ), heading: 0 },
	lobster: { position: WORLD.boatDock.position, heading: WORLD.boatDock.heading },
	sportfisher: { position: new Vector3( 55, 0, 43.2 ), heading: Math.PI / 2 },
};

export const berthOf = ( id ) => BERTHS[ id ] || BERTHS.lobster;

// a boat kept on the sand: where she lies, up it from her berth till she's this far over the sea, and her slope.
// -> { position, heading, pitch } ((M17) over the tide's highest, as the kayak you're in is pulled up: kayak/Shore.js's
// DRY past IslandClock's TIDE_HIGHEST)
const CLEAR = TIDE_HIGHEST + 0.5;
export function ashoreOf( id, terrain, lift = 0.1 ) {

	const B = berthOf( id ), P = B.position;
	let z = P.z, n = 0;
	while ( terrain.heightAt( P.x, z ) < CLEAR && n ++ < 60 ) z -= 0.5;
	const y = terrain.heightAt( P.x, z ), rise = ( terrain.heightAt( P.x, z + 1.5 ) - terrain.heightAt( P.x, z - 1.5 ) ) / 3;
	return { position: new Vector3( P.x, y + lift, z ), heading: B.heading, pitch: - Math.atan( rise ) };

}
