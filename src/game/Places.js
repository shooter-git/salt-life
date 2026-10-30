import { SEABED } from '../world/terrain/SeabedModel.js';

// (M15) The places a fish is caught, the island's and the far water's, each its own: for Joe's orders that want
// a place's fish (Orders.js), the island's records for each place (together/), and the first catch at each in
// your log (GameState's places). Where a spot is, from its water (Bites.habitatAt's, with the game's side and
// big: Game.habitat) and where it lies. The first that fits:
//   creek       the west's mangroves: their creek, their pool and the water off their edge
//   windReef    the windward reef off the north-west point
//   northBeach  the windward north beach's wash
//   bank, hump  the bank (10 km south-west) and the hump (6 km east-north-east), and the water about them
//   ledge       the north's deep ledge, dropoff the drop-off, blue the open ocean
//   bay         the bay's water, its beach, its pier and its reef
//   shelf / coast   the island's deep water, or its shallows, anywhere else round it
//   placeOf( habitat, x, z ) -> a PLACES id

export const PLACES = {
	bay: { name: 'the bay' },
	coast: { name: 'round the island' },
	northBeach: { name: 'the north beach' },
	creek: { name: 'the mangrove creek' },
	windReef: { name: 'the windward reef' },
	shelf: { name: 'the shelf' },
	dropoff: { name: 'the drop-off' },
	ledge: { name: 'the north ledge' },
	hump: { name: 'the hump' },
	bank: { name: 'the bank' },
	blue: { name: 'the blue water' },
};
export const PLACE_IDS = Object.keys( PLACES );
// the bay's water: between its headlands, from its beach out past its mouth (m)
const BAY = { x: [ - 330, 330 ], z: [ - 160, 330 ] };
// about the bank and the hump: as far out from them as counts as theirs (m)
const NEAR = { bank: 600, hump: 1800 };
// the north ledge: flat bottom at its depth counts only this far either side of north of the island's middle (rad; its
// bearings and a little: the canyon's floor off the bay is as flat and as deep, but isn't it)
const C = SEABED.centre, LEDGE_BEARING = ( SEABED.ledge.to + 10 ) * Math.PI / 180;

export function placeOf( h, x, z ) {

	if ( h.creek > 0.3 ) return 'creek';
	if ( h.big > 0.4 ) return 'windReef';
	if ( h.wash > 0.3 && h.side > 0.6 ) return 'northBeach';
	const B = SEABED.bank, [ hx, hz ] = SEABED.hump[ 0 ];
	if ( Math.hypot( x - B.x, z - B.z ) < B.a + NEAR.bank ) return 'bank';
	if ( Math.hypot( x - hx, z - hz ) < NEAR.hump ) return 'hump';
	if ( h.ledge > 0.4 && Math.abs( Math.atan2( x - C.x, C.z - z ) ) < LEDGE_BEARING ) return 'ledge';
	if ( h.edge > 0.4 ) return 'dropoff';
	if ( h.blue > 0.1 ) return 'blue';
	if ( x > BAY.x[ 0 ] && x < BAY.x[ 1 ] && z > BAY.z[ 0 ] && z < BAY.z[ 1 ] ) return 'bay';
	return h.deep > 0.5 || h.ledge > 0.4 ? 'shelf' : 'coast';

}

// a place's name, with its first letter up when it starts a line ('The north beach')
export const placeName = ( id, upper = false ) => {

	const n = PLACES[ id ] ? PLACES[ id ].name : '';
	return upper ? n.charAt( 0 ).toUpperCase() + n.slice( 1 ) : n;

};
