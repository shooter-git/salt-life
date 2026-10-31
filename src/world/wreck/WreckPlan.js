import { WORLD } from '../WorldLayout.js';

// (M15) Where the wreck on the windward reef lies: a small steel coaster, 40 m, that ran onto the reef's crest
// bow first, heading in for the island, and broke in two. Its bow section is wedged on the crest, listing to
// port, its forecastle out of the water; its stern section tore off and slid down the fore reef, turned and
// heeled to starboard, its stern 10 m down. Pure (no three.js): the reef's layout keeps its corals out of the
// hull (inWreck), the fish find it (wreckSpots), Wreck.js builds it.
//   WRECK: the ship's measures; SECTIONS: each piece's ship-frame span and how it lies (where its fore end is
//     along the reef's seaward line, its keel's depth at each end, its list, a turn)
//   toWorld( section, x, y, z ) -> [ wx, wy, wz ]   (ship frame: x aft to fore, y up from the keel, z to starboard)
//   inWreck( x, z, pad ) -> whether ( x, z ) is under the hull (pad m round it)

export const WRECK = {
	length: 40, beam: 7.6, depth: 3.7, // m: overall, at its widest, keel to main deck amidships
	breakAt: 17, // m from the stern: where it broke
};

const R = WORLD.northReef;
const UP = ( () => {

	const l = Math.hypot( 0.35, 0.94 );
	return { x: - 0.35 / l, z: - 0.94 / l }; // (seaward from the reef's middle: up the trades' sea)

} )();

// each piece: its span along the ship (x0..x1), where its forward end and its aft end lie along the reef's
// seaward line (m out from its middle), its keel's height at each (m, the sea level 0), its list (rad, + to
// starboard), a turn off its line (rad) and a step to one side (m)
export const SECTIONS = {
	bow: { x0: WRECK.breakAt, x1: WRECK.length, fore: 14, aft: 37, keelFore: - 1.6, keelAft: - 3.3, list: - 0.21, turn: 0.03, side: 0 },
	stern: { x0: 0, x1: WRECK.breakAt, fore: 40.5, aft: 57, keelFore: - 4.1, keelAft: - 10.2, list: 0.24, turn: - 0.2, side: 2.2 },
};

// a piece's frame in the world: its fore end's point, its fore-to-aft way (unit, x z), across it, its pitch
function frameOf( s ) {

	const len = s.aft - s.fore, c = Math.cos( s.turn ), si = Math.sin( s.turn );
	// (its fore-to-aft way: seaward, turned)
	const ax = UP.x * c - UP.z * si, az = UP.x * si + UP.z * c;
	const fx = R.center.x + UP.x * s.fore - UP.z * s.side, fz = R.center.z + UP.z * s.fore + UP.x * s.side;
	return { fx, fz, ax, az, len, pitch: Math.atan2( s.keelFore - s.keelAft, len ) };

}

const FRAMES = { bow: frameOf( SECTIONS.bow ), stern: frameOf( SECTIONS.stern ) };

// a point of a piece, in the ship's frame, to the world: its fore end at ( x1, keel ), the ship's x running
// aft along its way (and down its pitch), z to starboard, heeled by its list about its keel's line
export function toWorld( name, x, y, z ) {

	const s = SECTIONS[ name ], F = FRAMES[ name ];
	// (heeled: about the ship's x axis, through the keel)
	const cl = Math.cos( s.list ), sl = Math.sin( s.list );
	const yh = y * cl - z * sl, zh = y * sl + z * cl;
	// (pitched: about the fore end, the keel's line falling aft)
	const back = s.x1 - x, cp = Math.cos( F.pitch ), sp = Math.sin( F.pitch );
	const along = back * cp + yh * sp, up = - back * sp + yh * cp;
	// (the ship's starboard, heading in for the island: its way in is -( ax, az ); starboard is to its right)
	const stx = F.az, stz = - F.ax;
	return [ F.fx + F.ax * along + stx * zh, s.keelFore + up, F.fz + F.az * along + stz * zh ];

}

// its heading in the world (rad, three's yaw of the ship's +x: fore), for the colliders
export const yawOf = ( name ) => Math.atan2( FRAMES[ name ].az, - FRAMES[ name ].ax );

// is ( x, z ) under the hull (pad m round it)? Each piece as a rectangle along its way
export function inWreck( x, z, pad = 1 ) {

	for ( const name of [ 'bow', 'stern' ] ) {

		const s = SECTIONS[ name ], F = FRAMES[ name ];
		const dx = x - F.fx, dz = z - F.fz;
		const along = dx * F.ax + dz * F.az, across = Math.abs( dx * F.az - dz * F.ax );
		if ( along > - pad && along < F.len + pad && across < WRECK.beam / 2 + pad ) return true;

	}

	return false;

}

// spots about it for the fish: along each piece's sides, a couple of metres off its plating (never over its
// deck: they'd swim through the steel), [ [ x, z ], … ]
export function wreckSpots() {

	const out = [];
	for ( const name of [ 'bow', 'stern' ] ) {

		const s = SECTIONS[ name ];
		for ( let x = s.x0 + 1; x < s.x1 - 0.5; x += 3 ) for ( const z of [ - WRECK.beam / 2 - 2, WRECK.beam / 2 + 2 ] ) {

			const [ wx, , wz ] = toWorld( name, x, 0, z );
			out.push( [ wx, wz ] );

		}

	}

	return out;

}
