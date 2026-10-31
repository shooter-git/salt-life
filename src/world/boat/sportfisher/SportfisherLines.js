import { HullLines, sstep, lerp } from '../HullLines.js';

// (M16) Lines of a 48 ft convertible sportfisher, after the Viking 48 and Hatteras 48 (docs/m16/sportfisher.md): 48 ft 9 in
// overall, 16 ft beam, 4 ft 7 in to the bottom of her skeg, a modified-vee hull with hard chines: a Carolina bow, flared
// and hollow, its sheer sweeping up to a stem head raked far out over the water, and flat, 13 degree sections aft that
// let her plane. Frame as HullLines'.

// Where her decks and bulkheads are (boat frame, m). Nothing here's stretched from another boat: these are a real 48's,
// worked from her photographs against her length.
export const SF = {
	zAft: - 6.35, zBow: 8.5,
	cockpit: 0.5, // cockpit sole: self-bailing, about 18 in over the water
	mezz: 0.9, // the mezzanine at the head of the cockpit, two steps up
	salon: 1.02,
	lower: 0.15, // the sole of the cabins forward, a companionway below the salon
	bridge: 3.1, // the flybridge's sole
	tower: 7.0, // the tower's platform: a standing eye about 28 ft up (real towers on a 43 to 50 put you 25 to 30 ft up)
	mezzZ: - 3.35, // the mezzanine's aft edge
	houseAft: - 2.4, // the salon's aft bulkhead
	salonFront: 1.55, // the salon's forward bulkhead: the companionway goes down through it
	houseFront: 3.55, // the windshield's foot on the foredeck
	roofY: 3.0, // the salon's ceiling
	bridgeAft: - 3.25, // the flybridge's overhang over the mezzanine
	bridgeFront: 2.1,
	hardtopAft: - 1.6, hardtopFront: 1.75, hardtopY: 5.3, hardtopX: 1.55,
	gunwale: 0.26, // the width of her covering boards, the cockpit's sides
	sideDeck: 0.46, // the house stands in from her sheer by this
	lowerForward: 5.35, // the forward stateroom's bulkhead in the bow
	skeg: - 1.4,
};

export class SportfisherLines extends HullLines {

	constructor() {

		super( { zAft: SF.zAft, zBow: SF.zBow, deckY: SF.cockpit, shell: 0.07, houseBack: SF.houseAft, houseFront: SF.houseFront, stemRake: 0.74, forefootR: 1.5, widest: 2.55 } );

	}

	// a long, hollow sweep: nearly level aft, rising hard into the bow
	sheerY( t ) {

		return 1.24 + 0.12 * t + 1.28 * Math.pow( t, 2.6 );

	}

	// her widest at the bridge, drawn in a little to the transom, then a fine convex entry
	sheerX( t ) {

		if ( t <= 0.42 ) {

			const a = 1 - t / 0.42;
			return 2.44 - 0.24 * a * a;

		}

		const s = ( t - 0.42 ) / 0.58;
		return 2.44 * ( 1 - Math.pow( s, 2.2 ) );

	}

	keelY( t ) {

		if ( t <= 0.55 ) return - 0.5 - 0.28 * Math.sin( Math.PI * 0.5 * t / 0.55 );
		return - 0.78 + 0.53 * Math.pow( sstep( 0.55, 1, t ), 1.5 );

	}

	// the chine: hard, carried at the water aft, lifting clear of it by a third of her length from the bow
	chineX( t ) {

		if ( t <= 0.42 ) {

			const a = 1 - t / 0.42;
			return 2.3 - 0.16 * a * a;

		}

		const s = ( t - 0.42 ) / 0.58;
		return 2.3 * Math.pow( Math.max( 0, 1 - Math.pow( s, 1.6 ) ), 1.2 );

	}

	chineY( t ) {

		return lerp( - 0.03, - 0.12, sstep( 0, 0.45, t ) ) + 1.25 * Math.pow( sstep( 0.5, 1, t ), 1.6 );

	}

	// (a small radius: a chine, not the lobster boat's round bilge)
	bilgeTangent( t ) {

		return lerp( 0.07, 0.11, sstep( 0.3, 0.8, t ) );

	}

	// (a near straight run from keel to chine)
	bottomConvexity( t ) {

		return 0.006;

	}

	// the topsides: straight aft with a touch of tumblehome, the flare coming in forward of the bridge
	flare( t ) {

		return lerp( - 0.008, 0.13, sstep( 0.35, 0.85, t ) ) * ( 1 - 0.3 * sstep( 0.92, 1, t ) );

	}

}
