import { MathUtils } from '../engine/index.js';

// (M16) Marta's dock holding more than yours. Everyone's boat lies at the same berth on their own device (the pier
// head's, by her type: game/fleet), so someone else's at the dock would sit in yours, or on one you've left parked
// there. On your screen each of theirs lies at a spare berth along the pier's stem, either side, and goes back to her
// own pose as she leaves. The spare's kept for as long as she's about the dock, whoever else comes or goes.
//   atDock( x, z ) -> is that the pier head's water?
//   spareBerth( i, beam ) -> { x, z, heading }   (the i-th, for a boat that wide)
//   berthShare( d ) -> 1 at her berth .. 0 gone: d m from where she lay
//   laidAt( out, p, from, berth, turn, k )   (her position in out: p, moved as she's held at the berth by k)

const PIER = { x: 55, half: 1.3, gap: 0.6 }; // (WORLD.pier's stem)
const HEAD = { x: 55, z: 36, r: 30 }; // the water about the pier head
const SPARES = [ [ 1, 18 ], [ - 1, 18 ], [ 1, 2 ], [ - 1, 2 ] ]; // [ side (+x), z ], the deepest first
const HOLD = 10, GONE = 40; // m: she's let go from the berth between these as she leaves

export const SPARE_BERTHS = SPARES.length;
export const atDock = ( x, z ) => Math.hypot( x - HEAD.x, z - HEAD.z ) < HEAD.r;

export function spareBerth( i, beam ) {

	const [ side, z ] = SPARES[ i ];
	return { x: PIER.x + side * ( PIER.half + PIER.gap + beam / 2 ), z, heading: 0 };

}

export const berthShare = ( d ) => 1 - MathUtils.smoothstep( d, HOLD, GONE );

export function laidAt( out, p, from, berth, turn, k ) {

	const dx = p.x - from.x, dz = p.z - from.z, s = Math.sin( turn ), c = Math.cos( turn );
	out.x = p.x + ( berth.x + dx * c + dz * s - p.x ) * k;
	out.y = p.y;
	out.z = p.z + ( berth.z - dx * s + dz * c - p.z ) * k;
	return out;

}
