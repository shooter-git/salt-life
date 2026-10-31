import { HullLines, sstep, lerp } from '../HullLines.js';

// (M16) The lines of a 12 ft sit-on-top fishing kayak, measured off the maker's plan and profile photographs of a
// Perception Pescador 12.0 (12 ft 0, 32.5 in: its outline read pixel by pixel at 40 stations; docs/m16/kayak.md):
// what's called sheer here is her gunwale, the top of the moulded hull where deck meets side. Rotomoulded, she has no
// transom to speak of: her stern comes to a blunt rounded point, her bow to a long fine one, raked 40 degrees.
//
// She floats at DRAFT above her keel with a paddler, 12 kg of gear and her own 29 kg aboard: about 120 kg.

export const LENGTH = 3.66;
export const DRAFT = 0.122; // m, keel to the design waterline at her deepest

// half-breadth at the gunwale, stern to bow, at every 2.5% of her length (the plan photograph, m)
const BREADTH = [ 0.03, 0.111, 0.158, 0.197, 0.231, 0.26, 0.287, 0.309, 0.33, 0.344, 0.358, 0.371, 0.381, 0.385, 0.393, 0.397, 0.397, 0.397, 0.397, 0.397, 0.397, 0.393, 0.389, 0.385, 0.377, 0.368, 0.36, 0.352, 0.338, 0.323, 0.309, 0.293, 0.272, 0.25, 0.225, 0.201, 0.172, 0.143, 0.111, 0.078, 0.016 ];
// the keel above her lowest point, by the same stations, measured up to the stem's foot (the profile photograph, m)
const ROCKER = [ 0.085, 0.07, 0.061, 0.057, 0.049, 0.045, 0.041, 0.037, 0.033, 0.033, 0.029, 0.025, 0.02, 0.016, 0.012, 0.008, 0.004, 0.004, 0, 0, 0, 0.004, 0.004, 0.008, 0.012, 0.016, 0.016, 0.02, 0.025, 0.029, 0.037, 0.041, 0.045, 0.049, 0.053, 0.061, 0.07, 0.078, 0.092, 0.11, 0.13 ];
// the gunwale above her lowest point (the profile's top edge, with the seat and the deck's crown taken out, m)
const GUNWALE = [ 0.335, 0.34, 0.335, 0.33, 0.325, 0.32, 0.315, 0.31, 0.306, 0.303, 0.3, 0.297, 0.295, 0.293, 0.291, 0.29, 0.289, 0.288, 0.288, 0.288, 0.288, 0.288, 0.288, 0.289, 0.29, 0.292, 0.294, 0.297, 0.3, 0.304, 0.308, 0.313, 0.318, 0.324, 0.33, 0.337, 0.344, 0.352, 0.36, 0.368, 0.375 ];

// a smooth reading of a table at every 2.5%
function table( T, t ) {

	const f = Math.min( T.length - 1.000001, Math.max( 0, t * ( T.length - 1 ) ) ), i = Math.floor( f ), u = f - i;
	const a = T[ Math.max( 0, i - 1 ) ], b = T[ i ], c = T[ i + 1 ], d = T[ Math.min( T.length - 1, i + 2 ) ];
	return b + 0.5 * u * ( c - a + u * ( 2 * a - 5 * b + 4 * c - d + u * ( 3 * ( b - c ) + d - a ) ) );

}

export class KayakLines extends HullLines {

	constructor() {

		super( { zAft: - 0.5 * LENGTH - 0.05, zBow: 0.5 * LENGTH - 0.05, deckY: 0.05, shell: 0.03, houseBack: 0, houseFront: 0, stemRake: 0.82, forefootR: 0.2, widest: 0.5 } );

	}

	sheerY( t ) {

		return table( GUNWALE, t ) - DRAFT;

	}

	sheerX( t ) {

		return table( BREADTH, t );

	}

	keelY( t ) {

		return table( ROCKER, t ) - DRAFT;

	}

	// where her soft chine turns: most of her breadth, low on her side, drawing in with the ends
	chineX( t ) {

		const s = this.sheerX( t ), mid = sstep( 0.04, 0.3, t ) * ( 1 - sstep( 0.62, 0.98, t ) );
		return s * lerp( 0.7, 0.9, mid );

	}

	chineY( t ) {

		const k = this.keelY( t );
		return k + lerp( 0.1, 0.062, sstep( 0.04, 0.3, t ) * ( 1 - sstep( 0.6, 0.98, t ) ) );

	}

	bilgeTangent( t ) {

		return lerp( 0.03, 0.075, sstep( 0.05, 0.3, t ) * ( 1 - 0.7 * sstep( 0.6, 0.95, t ) ) );

	}

	bottomConvexity() {

		return 0.03;

	}

	// sides that go up almost straight, a little fuller about the waterline, tucked in under the gunwale
	flare( t ) {

		return - 0.07 + 0.09 * sstep( 0.6, 1, t );

	}

	bowBlend( t ) {

		return t > 0.7 ? ( ( t - 0.7 ) / 0.3 ) ** 2 : 0;

	}

}
