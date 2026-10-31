import { Noise2D } from '../../util/Noise.js';

// (M15) The sea caves, cut by the sea into the island's basalt along faults, as the sea caves of Kauai's Na
// Pali coast and Painted Cave on Santa Cruz Island are: a narrow inlet cut into the slope, open to the sky, its
// walls near sheer, and at its head the cave: a tall cleft, wider low down and narrowing up to a crack, running
// in under the cliff, lower and narrower as it goes, to a pebble beach at its back; a gully cut through the rock
// platform in front of it, the fault's line, deep enough to swim or take a small boat in. One on the west
// cliffs, one under the north-west cliff by the lighthouse.
// Each in its own frame: x across it (to the right looking in), z out to sea from the waterline (inland z < 0:
// the inlet to -inset, the cave from there in, `depth` m of it), y the sea's height. TerrainData cuts its floor
// (the gully, the inlet, the cave, the beach) into the baked ground (carveAt), and Overhangs builds its rock (the
// inlet's walls, the cave cut into the rock at its head, and the rock over the slot the floor leaves, up to the
// slope's surface: kind 'seacave'), from the same plan (CAVES, tunnelAt).
//   carveAt( x, z ) -> { h, k }: the floor's height there (world m) and how much it's cut to it (0..1), or null
//     where no cave cuts it
//   frameOf( cave, x, z ) -> [ fx, fz ]   worldOf( cave, fx, fz ) -> [ x, z ]
//   tunnelAt( cave, fz ) -> { half, top, floor, wander, open } (m: its half-width low down, its top (Infinity
//     in the inlet, open to the sky), its floor; how far its line wanders off the frame's middle; whether it's
//     the inlet)

export const CAVES = [
	{ id: 'west', x: - 557.2, z: - 380.0, out: [ - 0.996, - 0.084 ], inset: 11, depth: 16, mouth: { half: 2.6, top: 6.5 }, back: { half: 1.5, top: 2.4 }, gully: 34, seed: 3 },
	{ id: 'northWest', x: - 330.0, z: - 773.0, out: [ - 0.343, - 0.939 ], inset: 9, depth: 18, mouth: { half: 3.0, top: 9.0 }, back: { half: 1.7, top: 2.8 }, gully: 30, seed: 9 },
];
export const CAVE = {
	floor: - 1.6, // m: the tunnel's and the gully's floor (the gully deepening to -2 at its outer end)
	beach: 0.5, // m: its pebble beach at the back
	beachLength: 5, // m: how far the beach runs out from its back (over the low tier's 2 m texels too)
	margin: 2.6, // m: the ground's cut wider than the tunnel by this (the low tier's 2 m texels under the rock)
};

const noise = new Noise2D( 211 );
const sstep = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

// a point's place in a cave's frame, and back
export function frameOf( c, x, z ) {

	const dx = x - c.x, dz = z - c.z, [ ox, oz ] = c.out;
	return [ dx * - oz + dz * ox, dx * ox + dz * oz ];

}

export function worldOf( c, fx, fz ) {

	const [ ox, oz ] = c.out;
	return [ c.x - oz * fx + ox * fz, c.z + ox * fx + oz * fz ];

}

// the inlet or the cave at fz (m out from the waterline: inland, < 0): its half-width low down, its top, its
// floor, its line's wander; the cave lowers and narrows as it goes in from its mouth (at -inset)
export function tunnelAt( c, fz ) {

	const m = - c.inset, back = m - c.depth, t = sstep( m, back, fz ), s = c.seed;
	return {
		half: ( c.mouth.half + ( c.back.half - c.mouth.half ) * t ) * ( 0.9 + 0.25 * noise.noise( fz / 5, s ) ),
		top: fz > m ? Infinity : c.mouth.top + ( c.back.top - c.mouth.top ) * Math.pow( t, 0.8 ),
		floor: fz < back + CAVE.beachLength ? CAVE.floor + ( CAVE.beach - CAVE.floor ) * sstep( back + CAVE.beachLength, back + 1, fz ) : CAVE.floor,
		wander: 1.1 * noise.fbm( fz / 9, s + 4, 2 ),
		open: fz > m,
	};

}

// the floor's height at world ( x, z ), and how much the ground's cut to it, where a cave or its gully cuts it
// (null where none does)
const OUT = { h: 0, k: 0 };
export function carveAt( x, z, out = OUT ) {

	let hit = false;
	out.k = 0;
	for ( const c of CAVES ) {

		const [ fx, fz ] = frameOf( c, x, z );
		if ( fz < - c.inset - c.depth - 1 || fz > c.gully + 6 || Math.abs( fx ) > 12 ) continue;
		let h, k;
		if ( fz <= 1 ) {

			// in the inlet or the cave: its floor, wider than it by the margin (under its walls' rock)
			const T = tunnelAt( c, fz );
			h = T.floor + 0.12 * noise.noise( x / 1.7, z / 1.7 );
			k = 1 - sstep( T.half + CAVE.margin - 0.5, T.half + CAVE.margin + 0.5, Math.abs( fx - T.wander ) );

		} else {

			// the gully out through the platform: as wide as the mouth, wandering, its floor deepening, its sides
			// ragged; dying out into the sea floor at its outer end
			const T = tunnelAt( c, 0 ), w = T.half + 0.6 + 1.2 * noise.fbm( fz / 7, c.seed + 9, 2 );
			const off = Math.abs( fx - T.wander * ( 1 - fz / c.gully ) - 1.2 * noise.fbm( fz / 13, c.seed + 2, 2 ) );
			h = CAVE.floor - 0.4 * fz / c.gully + 0.15 * noise.noise( x / 2.3, z / 2.3 );
			k = ( 1 - sstep( w - 0.6, w + 1.2, off ) ) * sstep( c.gully + 6, c.gully - 2, fz );

		}

		if ( k > out.k ) {

			out.h = h;
			out.k = k;
			hit = true;

		}

	}

	return hit ? out : null;

}
