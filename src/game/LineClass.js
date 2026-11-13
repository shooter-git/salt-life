// (M19) IGFA's line classes and fly tippet classes, for line-class records (stream RECORDS: docs/m19/records.md; the classes from
// docs/m19/sources-big-game.md, sec. 1): the heaviest fish of each kind you've had on each class, kept in your log (GameState's
// log entries' cls), told on the catch card, listed in the Log tab; and the island's best for its class (the fish's weight to
// the class's, IGFA's ratio) on the records board.
//
// A class is named in kg, as IGFA names it, with its pound label: 4 kg (8 lb) and on. A line goes in the lightest class it
// doesn't test over (the most each may test, IGFA's own figures: 8.81 lb for the 4 kg); a fly's tippet in the tippet classes
// (1 to 10 kg) the same way, its key with an f before it ('f6'), by the tippet alone (IGFA puts no limit on the fly line or the
// backing). The game's lines: 8 lb mono the 4 kg class, 15 lb mono the 8 kg (it over-tests the 6 kg's 13.22 lb), 30 lb braid
// the 15 kg, 60 lb braid and 80 lb mono the 37 kg, 130 lb mono the 60 kg; the tippets, 12, 16 and 20 lb, the 6, 8 and 10 kg.
// A record fish weighs at least half its class, and beats the one before by 2 oz under 25 lb, by 0.5% from there.
//   classOf( lineKg, fly ) -> key or null   classKg( key )   classLabel( key ) -> '15 kg (30 lb) line'   isClass( key )
//   counts( key, kg ) -> heavy enough   beats( kg, heldKg ) -> a new record over that one   ratio( key, kg )
const KG_LB = 0.45359237;
// [ kg, its pound label, the most it may test (lb) ]
export const CLASSES = [ [ 1, 2, 2.2 ], [ 2, 4, 4.4 ], [ 3, 6, 6.61 ], [ 4, 8, 8.81 ], [ 6, 12, 13.22 ], [ 8, 16, 17.63 ], [ 10, 20, 22.04 ], [ 15, 30, 33.06 ], [ 24, 50, 52.91 ], [ 37, 80, 81.57 ], [ 60, 130, 132.27 ] ];
const TIPPET_MOST = 10; // kg: the tippet classes are 1 to 10 kg
const BEAT_OZ = 0.05669, BEAT_KG = 11.34, BEAT_SHARE = 0.005;

const byKey = ( key ) => {

	const m = /^(f?)(\d{1,3})$/.exec( String( key ) );
	if ( ! m ) return null;
	const c = CLASSES.find( ( x ) => x[ 0 ] === + m[ 2 ] );
	return c && ( ! m[ 1 ] || c[ 0 ] <= TIPPET_MOST ) ? { kg: c[ 0 ], lb: c[ 1 ], fly: !! m[ 1 ] } : null;

};

export const isClass = ( key ) => !! byKey( key );

export function classOf( lineKg, fly = false ) {

	if ( ! ( lineKg > 0 ) ) return null;
	const lb = lineKg / KG_LB;
	const c = CLASSES.find( ( x ) => lb <= x[ 2 ] + 1e-6 && ( ! fly || x[ 0 ] <= TIPPET_MOST ) );
	return c ? ( fly ? 'f' : '' ) + c[ 0 ] : null;

}

export const classKg = ( key ) => ( byKey( key ) || { kg: 0 } ).kg;

export function classLabel( key ) {

	const c = byKey( key );
	return c ? `${ c.kg } kg (${ c.lb } lb) ${ c.fly ? 'tippet' : 'line' }` : '';

}

export const counts = ( key, kg ) => isClass( key ) && kg >= classKg( key ) / 2;

export const beats = ( kg, held ) => ! ( held > 0 ) || kg >= held + ( held < BEAT_KG ? BEAT_OZ : held * BEAT_SHARE ) - 1e-9;

export const ratio = ( key, kg ) => kg / Math.max( classKg( key ), 1e-9 );
