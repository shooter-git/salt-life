import { Vector3 } from '../../../engine/index.js';
import { box, rod, cylinder, tube } from '../GeoKit.js';
import { DECK } from './ConsoleHull.js';

// (M16) The stern's fittings: the engine bracket's plates and the dive ladder, a stainless folding one over the platform's
// after edge on her port side, away from the door: four rungs into the water, or folded back flat on the mat.

const V = ( x, y, z ) => new Vector3( x, y, z );
const STAINLESS = { color: 0xd4d7da, rough: 0.2, metal: 1 };
const TREAD = { color: 0x17181a, rough: 0.7 };

// where you come to it in the water (boat frame): the prompt's and the climb's point
export const LADDER = { x: 0.62, z: DECK.platform.zEnd - 0.08, top: DECK.platform.y };

export function buildLadder( kit ) {

	const P = DECK.platform, L = LADDER, y = P.y + 0.014, hw = 0.17, RUNGS = 4, DROP = 0.3;

	// its foot on the platform: always there, it comes with the bracket (a fitted ladder hangs from it)
	kit.fitting = 'ladderDown';
	for ( const s of [ 1, - 1 ] ) {

		kit.add( 'fittings', tube( [ V( L.x + s * hw, y + 0.34, P.zEnd + 0.32 ), V( L.x + s * hw, y + 0.5, P.zEnd + 0.1 ), V( L.x + s * hw, y + 0.4, P.zEnd - 0.04 ), V( L.x + s * hw, y, P.zEnd - 0.06 ), V( L.x + s * hw, y - RUNGS * DROP - 0.05, P.zEnd - 0.12 ) ], 0.014, 14, 6 ), STAINLESS );

	}

	for ( let i = 0; i < RUNGS; i ++ ) {

		const ry = y - 0.08 - i * DROP, rz = P.zEnd - 0.07 - 0.015 * i;
		kit.add( 'fittings', box( hw * 2, 0.018, 0.05 ).translate( L.x, ry, rz ), TREAD );

	}

	kit.fitting = 'ladderUp';
	// folded: two rails and the rungs flat over the mat, its grab hoops at the edge
	for ( const s of [ 1, - 1 ] ) {

		kit.add( 'fittings', rod( V( L.x + s * hw, y + 0.018, P.zEnd + 0.02 ), V( L.x + s * hw, y + 0.018, P.zEnd + 0.56 ), 0.012, 6 ), STAINLESS );
		kit.add( 'fittings', box( 0.03, 0.02, 0.05 ).translate( L.x + s * hw, y + 0.008, P.zEnd + 0.04 ), STAINLESS );

	}

	for ( let i = 0; i < RUNGS; i ++ ) {

		kit.add( 'fittings', box( hw * 2, 0.012, 0.04 ).translate( L.x, y + 0.02, P.zEnd + 0.1 + i * 0.13 ), TREAD );

	}

	kit.fitting = null;

	// the engines' rigging hoses, a black loop from a well in the mat to each
	for ( const x of [ - 0.38, 0, 0.38 ] ) {

		kit.fitting = x ? 'twin' : 'single';
		kit.add( 'fittings', tube( [ V( x, P.y + 0.012, P.zEnd + 0.26 ), V( x, P.y + 0.2, P.zEnd + 0.2 ), V( x, P.y + 0.26, P.zEnd + 0.04 ), V( x, P.y + 0.14, P.zEnd - 0.1 ) ], 0.022, 10, 6 ), TREAD );
		kit.add( 'fittings', cylinder( 0.045, 0.045, 0.008, 12 ).translate( x, P.y + 0.016, P.zEnd + 0.26 ), { color: 0xe6e1d3, rough: 0.4 } );

	}

	kit.fitting = null;

	// the bracket's stainless plate on its after face (the engines' tilt tubes go through it)
	for ( const x of [ - 0.38, 0, 0.38 ] ) {

		kit.add( 'fittings', box( 0.28, 0.22, 0.02 ).translate( x, P.y - 0.14, P.zEnd - 0.006 ), { color: 0x9ea3a8, rough: 0.3, metal: 1 } );
		kit.add( 'fittings', cylinder( 0.022, 0.022, 0.34, 8 ).rotateZ( Math.PI / 2 ).translate( x, P.y - 0.06, P.zEnd - 0.03 ), STAINLESS );

	}

}
