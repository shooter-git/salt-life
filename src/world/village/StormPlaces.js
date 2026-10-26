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
