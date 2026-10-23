// (Salt Life) The island measures in pounds, inches and feet. Underneath, the game keeps kilograms,
// centimetres and metres (the catch table, the physics, the saves, what's sent to the others); these
// say them as the player reads them.
//   lb( 1.2 ) -> '2.65 lb', lb( 0.3 ) -> '11 oz', pounds( 54.4 ) -> '120', inches( 44 ) -> '17.3 in',
//   feet( 3 ) -> '10 ft', lbOz( 1.2 ) -> '2 lb 10 oz', feetInches( 44 ) -> '1 ft 5 in'

export const LB = 2.20462; // pounds in a kilogram
export const IN = 2.54; // centimetres in an inch
export const FT = 0.3048; // metres in a foot

// a fish's weight: ounces under a pound, else pounds to `digits` places
export function lb( kg, digits = 2 ) {

	const oz = Math.round( kg * LB * 16 );
	return oz < 16 ? `${ Math.max( 1, oz ) } oz` : `${ Math.max( 1, kg * LB ).toFixed( digits ) } lb`;

}

// a weight in pounds, without the unit: a tenth under ten, else whole ('7.5', '42'). The cooler's
// load, the week's order, the boards
export function pounds( kg ) {

	const p = kg * LB;
	return p < 10 ? p.toFixed( 1 ) : String( Math.round( p ) );

}

// a fish's length, to a tenth of an inch
export const inches = ( cm ) => `${ ( cm / IN ).toFixed( 1 ) } in`;

// a distance or a depth, in whole feet
export const feet = ( m ) => `${ Math.round( m / FT ) } ft`;

// the catch card's second line: pounds and ounces, and feet and inches from a foot up ('' under)
export function lbOz( kg ) {

	const oz = Math.round( kg * LB * 16 );
	return oz < 16 ? `${ oz } oz` : `${ Math.floor( oz / 16 ) } lb ${ oz % 16 } oz`;

}

export function feetInches( cm ) {

	const n = Math.round( cm / IN );
	return n < 12 ? '' : `${ Math.floor( n / 12 ) } ft ${ n % 12 } in`;

}
