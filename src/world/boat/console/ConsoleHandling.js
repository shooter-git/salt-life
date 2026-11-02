import { MathUtils } from '../../../engine/index.js';
import { outboards } from './Outboards.js';

const sstep = MathUtils.smoothstep;
const DEG = Math.PI / 180;

// (M16) Her figures (Handling.js says what each is): a 2.5 t, 23 ft deep-V on outboards. Sources in
// docs/m16/console.md: Boating's and Sportfishing's tests of the Regulator 23, Yamaha's bulletins. Stiff in pitch and quick to
// respond, she leans into a turn where the lobster boat leans out; she stops soon off the plane.

// the water's resistance by speed (m/s, N): plowing up to the hump about 13 kn (6.8 m/s), her lift then carrying her over
// it. Air's added on top by the controller
const R_AT = [ [ 0, 0 ], [ 1, 70 ], [ 2, 300 ], [ 3, 800 ], [ 4, 1500 ], [ 5, 2700 ], [ 6, 3800 ], [ 7, 4150 ], [ 8, 4050 ], [ 10, 3550 ], [ 12, 3300 ], [ 15.4, 3400 ], [ 18, 3850 ], [ 21.5, 4800 ], [ 25, 6000 ], [ 30, 8400 ] ];

function resistance( au ) {

	const n = R_AT.length - 1;
	if ( au >= R_AT[ n ][ 0 ] ) return R_AT[ n ][ 1 ] * ( au / R_AT[ n ][ 0 ] ) ** 2;
	let i = 0;
	while ( i < n - 1 && au > R_AT[ i + 1 ][ 0 ] ) i ++;
	const [ a, ra ] = R_AT[ i ], [ b, rb ] = R_AT[ i + 1 ], t = ( au - a ) / ( b - a );
	return ra + ( rb - ra ) * t * t * ( 3 - 2 * t );

}

export const CONSOLE_HANDLING = {
	windArea: [ 4.5, 9.5 ], // (end-on with the T-top; abeam she shows more than her freeboard)
	windCd: 0.9,
	windY: 1.05,
	windLead: 2.6,
	rightFrom: 10 * DEG,
	rightK: 52000,
	rollInertia: 1.15,
	addedMass: [ 0.5, 0.55, 0.04 ],
	addedInertia: [ 0.8, 0.35, 0.18 ],
	waterplane: [ 0.86, 0.86 ],
	stations: [ [ - 2.8, 0.42 ], [ - 1.9, 0.44 ], [ - 1.0, 0.44 ], [ - 0.1, 0.42 ], [ 0.8, 0.38 ], [ 1.6, 0.26 ], [ 2.3, 0.1 ] ],
	lateralY: - 0.05,
	hullLift: 0.75,
	bank: 0, // (she leans in through outboards: Outboards.js)
	heave: [ 1700, 950 ],
	damping: [ 22000, 2200, 3400, 520 ],
	resistance,
	// the bow up over the hump (7° at 13 kn); running, with the thrust's lever and the engines' trim, at 4° on the plane
	trim: ( u ) => ( 5.4 * sstep( u, 2.5, 6.5 ) - 3.4 * sstep( u, 7, 13 ) - 0.4 * sstep( u, 15, 22 ) ) * DEG,
	// her lift: most of her weight at speed
	rise: ( u ) => 0.62 * sstep( u, 4.5, 13 ) + 0.1 * sstep( u, 13, 22 ),
	contacts: [ [ 0, 0.05, 2.65 ], [ 0, - 0.3, 1.9 ], [ 0, - 0.52, 0 ], [ 0, - 0.5, - 2.9 ], [ 0.95, 0.02, 1.0 ], [ - 0.95, 0.02, 1.0 ], [ 1, 0, - 2.8 ], [ - 1, 0, - 2.8 ], [ 0, 0.8, 3.9 ] ],
	outline: [ [ 0, 0.3, 3.4 ], [ 1.05, 0.3, 1.6 ], [ - 1.05, 0.3, 1.6 ], [ 1.27, 0.3, - 1.0 ], [ - 1.27, 0.3, - 1.0 ], [ 1.15, 0.3, - 3.0 ], [ - 1.15, 0.3, - 3.0 ], [ 0.7, 0.3, - 4.3 ], [ - 0.7, 0.3, - 4.3 ] ],
	bowZ: 3.95,
	sternZ: - 3.6,
	// one 150 at speedMul 1, as she's sold (Gear's consoleEngine; twin 150s are speedMul 1.25, which Game squares for the thrust
	// and the power: the real boat's figures): a bollard pull of a tonne; pitch speed 20.4 m/s at 6000 rpm; 60% of 190 hp to
	// the water (a 150 on a hull this size runs her at her hardest, so her cruise is close under her best)
	engine: { maxThrust: 10500, pitchSpeed: 20.4, reverseFactor: 0.42, shaftRpm: 3230, power: 89000 },
	propulsion: outboards,
	fin: { area: 0.09, race: 0.11, lift: 2.2, lean: 3000, upright: 48000 },
};
