import { Matrix4, Vector3 } from '../../engine/index.js';

// (M13) Where the island weathers a hurricane: its shelter (the community hall, on high ground behind the
// plaza: Buildings.buildShelter) and Marta's hauling yard (the cradle she sets your boat on ashore:
// Buildings.buildCradle). Both well above what a surge and its surf reach (the shelter's ground about
// 5 m, the yard's about 3.3 m; the surge 1.6 m at most).
//   SHELTER: { x, z, yaw, w, d, porch }   CRADLE: { x, z, yaw, position, heading }
//   insideRoom( room, x, y, z ) -> bool   (room: Village.shelter.inside)
//   roomMatrix( room, m ) -> Matrix4: the world into its room's box, -1..1 (the shaders that keep out of it)

export const SHELTER = { x: 36.5, z: - 132.5, yaw: - 0.1, w: 11, d: 7.5, porch: 2.4 };
// (her heading 0: her bow toward the sea, as at the dock; her waterline's height on the cradle is set
// when it's built, from the ground under her keel: Village.cradle)
export const CRADLE = { x: 100, z: - 100, yaw: 0, position: new Vector3( 100, 4.75, - 100 ), heading: 0 };

// (M16) where the rest of your boats sit in her yard, each by her length: the lobster boat's is the cradle above. The kayak on
// the sand of the yard's edge; the sportfisher beside her, end-on to the slope where the ground's level over her 15 m
export const YARD = {
	lobster: CRADLE,
	kayak: { x: 92.5, z: - 96, yaw: 0 },
	console: { x: 88.5, z: - 98, yaw: 0 },
	sportfisher: { x: 112, z: - 113, yaw: 0 },
};
// (M17) and a second place for each, for a guest's boat hauled out while yours is on hers (together/Berths.js): drawn only on
// a screen where both are, on blocks of their own. The lobster boat's beside the cradle, the kayak's and the console's behind
// their own, the sportfisher's beside hers, each clear of the others on the yard's level ground
export const SPARE_YARD = {
	lobster: { x: 105.5, z: - 100, yaw: 0 },
	kayak: { x: 92.5, z: - 101, yaw: 0 },
	console: { x: 88.5, z: - 107, yaw: 0 },
	sportfisher: { x: 118.5, z: - 113, yaw: 0 },
};
// (M19) and a third, for a second guest's of the same kind: on the yard's level ground clear of the others (each within 0.15 m
// along her length, and 1.6 m or more from the next boat), behind or beside the rest
export const THIRD_YARD = {
	lobster: { x: 95, z: - 109, yaw: 0 },
	kayak: { x: 96.5, z: - 96, yaw: 0 },
	console: { x: 84, z: - 107, yaw: 0 },
	sportfisher: { x: 105.5, z: - 113, yaw: 0 },
};
// a boat's keel blocks hold her this far off the highest ground under her
const BLOCKS = 0.35;
// her pose on her blocks: { position (her waterline), heading }, her length and draft (m) from what she is
export function yardPose( id, terrain, draft, length ) {

	const c = YARD[ id ], cc = Math.cos( c.yaw ), cs = Math.sin( c.yaw );
	let under = - Infinity;
	for ( let k = - length / 2; k <= length / 2; k += 0.5 ) under = Math.max( under, terrain.heightAt( c.x + k * cs, c.z + k * cc ) );
	return { position: new Vector3( c.x, under + BLOCKS + draft, c.z ), heading: c.yaw };

}

export function insideRoom( room, x, y, z ) {

	if ( ! room || y < room.y0 || y > room.y1 ) return false;
	const dx = x - room.x, dz = z - room.z, c = Math.cos( room.yaw ), s = Math.sin( room.yaw );
	// (into its frame: x across its front, z toward it)
	const lx = dx * c - dz * s, lz = dx * s + dz * c;
	return Math.abs( lx ) < room.hx && Math.abs( lz ) < room.hz;

}

const _t = new Matrix4(), _r = new Matrix4(), _s = new Matrix4();
export function roomMatrix( room, m = new Matrix4() ) {

	if ( ! room ) return m.makeScale( 0, 0, 0 ).setPosition( 1e4, 1e4, 1e4 );
	const yMid = ( room.y0 + room.y1 ) / 2;
	_t.makeTranslation( room.x, yMid, room.z );
	_r.makeRotationY( room.yaw );
	_s.makeScale( room.hx, ( room.y1 - room.y0 ) / 2, room.hz );
	return m.multiplyMatrices( _t, _r ).multiply( _s ).invert();

}
