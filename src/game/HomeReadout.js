import { HOME, legTo, magnetic, fuelFor } from './Chart.js';

// (M16) The way home in the HUD's panel (GameHUD.setHome; it was a label by the map): aboard and past SHOWN m from the
// dock, home's distance and bearing (magnetic, as the compass gives it). With fuel of your own: where on the fuel bar
// getting home takes you to, and whether it will, the mariner's rule of thirds (Chart.fuelFor).
// With no plotter aboard (fix false), only her compass: her heading, magnetic.
//   homeReadout( { x, z, aboard, riding, fuelL, tank, rpm, speed, speedMul, boat, twin, fix, heading } ) ->
//     null | { label, text, need: 0..1 of the tank or null, state: 'ok' | 'tight' | 'short' | null }
// (riding in someone else's, it's their fuel, and you don't know it; a boat with no engine has none: tank 0)

export const SHOWN = 600;

export function homeReadout( { x, z, aboard, riding = false, fuelL = 0, tank = 0, rpm = 0, speed = 0, speedMul = 1, boat = 'lobster', twin = false, fix = true, heading = 0 } ) {

	const leg = legTo( x, z, HOME.x, HOME.z );
	if ( ! aboard || leg.m <= SHOWN ) return null;
	if ( ! fix ) return { label: 'Compass', text: `${ String( magnetic( heading ) ).padStart( 3, '0' ) }°`, need: null, state: null };
	const text = `${ ( leg.m / 1852 ).toFixed( 1 ) } NM · ${ String( magnetic( leg.bearing ) ).padStart( 3, '0' ) }°`;
	if ( riding || ! ( tank > 0 ) ) return { label: 'Home', text, need: null, state: null };
	const f = fuelFor( leg.m, fuelL, { rpm, speed, speedMul, boat, twin } );
	return { label: 'Home', text, need: Math.min( 1, f.litres / tank ), state: f.state };

}
