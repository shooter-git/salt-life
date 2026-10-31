import { MathUtils, Vector3 } from '../../engine/index.js';

// (M16) How a boat handles: what player/BoatController asks of the boat it's driving. The rigid body, the buoyancy,
// the mooring, the anchor and the contacts are the controller's, the same for every boat; these are her figures and
// what drives her, tuned to her hull. A boat's model carries hers as model.handling.
//
//   windArea        m^2 she shows the wind [ end-on, abeam ]
//   windCd, windY   its drag coefficient; how high its centre of effort is (boat frame)
//   windLead        m toward the windward end its push moves as it comes round from abeam to end-on
//   rightFrom, rightK  past this heel or trim (rad) her ballast and flare right her harder (N m per radian past it)
//   rollInertia     her roll inertia against the bare hull's (gear high on deck)
//   addedMass       when fully wet, of her mass: [ sway, heave, surge ]
//   addedInertia    of her inertia: [ pitch, yaw, roll ]
//   waterplane      her effective waterplane's lever arms against the hull's [ x, z ]: her feel, not the bare body's stiffness
//   stations        [ z, lateral area m^2 ] along the keel: hull lift and cross-flow drag
//   lateralY        height of the centre of lateral resistance
//   hullLift        lift of hull and keel per radian of drift
//   bank            roll moment per ( u * drift ): the hull's bottom banking her into turns
//   heave           heave damping [ linear, quadratic ], per m^2 of wet sample
//   damping         angular damping: pitch, yaw, roll, and roll's rise with speed
//   resistance( au ) N at that speed through the water, trim( u ) rad at that speed, rise( u ) of her weight lifted
//   contacts        hull points [ x, y, z ] that can take the ground
//   outline         [ x, y, z ] at the waterline kept out of the piles
//   bowZ, sternZ    where the rest of the game takes her ends to be
//   engine          { maxThrust N, pitchSpeed m/s, reverseFactor, shaftRpm }, or null with nothing to burn
//   propulsion( ctl, q ) puts on what drives and turns her (below): prop and rudder, outboards, a paddle
//   rudder          what propellerAndRudder reads: { area, race, lift }

const sstep = MathUtils.smoothstep;
const clamp = MathUtils.clamp;
const RHO = 1025;

const _p = new Vector3();
const _f = new Vector3();
const _rud = new Vector3();

// A shaft, a propeller and a rudder behind it. q: { addForceAt( force, point ), fwd, side, u, vs, aLoc, comZ }: her
// forward and port directions in the world, her speed ahead and sideways, and her pitch, yaw and roll rates.
// Propeller: thrust from the engine rpm, falling off towards the pitch speed; prop walk astern (stern to port).
export function propellerAndRudder( ctl, q ) {

	const { addForceAt, fwd, side, u, vs, aLoc, comZ } = q, model = ctl.model, R = ctl.handling.rudder;
	const propW = ctl.toWorld( model.propeller, _p );
	const propSub = ctl.sampleWaterAt( propW ) - propW.y;
	const propWet = clamp( propSub / 0.3 + 0.5, 0, 1 );
	const run = ctl.driven && ctl.engineOn;
	const dir = run ? Math.sign( ctl.throttle ) : 0;
	const n = ctl.rpm * ( run && Math.abs( ctl.throttle ) > 0.02 ? 1 : 0 );
	let thrust = 0;
	if ( dir > 0 ) thrust = ctl.maxThrust * n * n * Math.max( 0, 1 - Math.max( u, 0 ) / ( ctl.pitchSpeed * Math.max( n, 0.2 ) ) );
	else if ( dir < 0 ) thrust = - ctl.reverseFactor * ctl.maxThrust * n * n * Math.max( 0, 1 - Math.max( - u, 0 ) / ( ctl.pitchSpeed * 0.6 * Math.max( n, 0.2 ) ) );
	thrust *= propWet * ctl.thrustMul;
	ctl.thrust = thrust;
	addForceAt( _f.copy( fwd ).multiplyScalar( thrust ), propW );
	if ( thrust < 0 ) addForceAt( _f.copy( side ).multiplyScalar( - thrust * 0.08 ), propW );

	// ---- rudder: lifting surface in the propeller race (actuator-disc slipstream); the local
	// flow angle at the stern (drift + yaw) reduces its angle of attack
	// the rudder's side force is partly carried by the aft hull (flap effect), so it acts higher
	// than the blade's centre: less heel kick when the wheel goes over
	const rudW = ctl.toWorld( _rud.set( 0, - 0.15, model.rudder.z ), _rud );
	const race = Math.max( thrust, 0 ) * 2 / ( RHO * R.race ); // slipstream dynamic pressure term (m^2/s^2)
	const Ur2 = u * Math.abs( u ) + 0.9 * race;
	const Ur = Math.sqrt( Math.abs( Ur2 ) ) * Math.sign( Ur2 );
	const vRud = vs + aLoc.y * ( model.rudder.z - comZ );
	const delta = ctl.steer * 0.6 + ( Math.abs( Ur ) > 0.3 ? Math.atan2( vRud, Math.abs( Ur ) ) * Math.sign( Ur ) : 0 );
	const d = clamp( delta, - 0.7, 0.7 );
	const lift = 0.5 * RHO * R.area * Math.abs( Ur2 ) * R.lift * Math.sin( d ) * Math.cos( d ) * propWet * Math.sign( Ur2 || 1 );
	addForceAt( _f.copy( side ).multiplyScalar( - lift ), rudW );
	// rudder drag (induced + form) slows the boat in a turn
	addForceAt( _f.copy( fwd ).multiplyScalar( - Math.abs( lift * Math.sin( d ) ) * 0.8 * Math.sign( u || 1 ) ), rudW );

}

const DEG = Math.PI / 180;

// the 8.2 m, 3.2 t Downeast lobster boat: GM ~0.6 m, roll ~3.3 s, pitch ~1.8 s, heave ~1.25 s, all well damped
export const LOBSTER_HANDLING = {
	windArea: [ 6, 11 ],
	windCd: 0.92,
	windY: 1.2,
	windLead: 3,
	rightFrom: 25 * DEG,
	rightK: 45000,
	rollInertia: 1.24,
	addedMass: [ 0.6, 0.7, 0.05 ],
	addedInertia: [ 1.0, 0.4, 0.2 ],
	waterplane: [ 0.79, 0.9 ],
	stations: [ [ - 3.4, 0.73 ], [ - 2.3, 0.78 ], [ - 1.2, 0.8 ], [ - 0.1, 0.77 ], [ 1.0, 0.62 ], [ 2.1, 0.33 ], [ 3.2, 0.14 ] ],
	lateralY: 0.06,
	hullLift: 0.5,
	bank: 0,
	heave: [ 1800, 900 ],
	damping: [ 25000, 2000, 4500, 900 ],
	// calm water: friction + the wave-making hump past hull speed + planing
	resistance: ( au ) => 40 * au + 22 * au * au + 3000 * sstep( au, 2.8, 5.4 ) + 55 * au * au * sstep( au, 7, 11 ),
	// the bow lifts over the hump, then the hull runs at a few degrees
	trim: ( u ) => ( 2.8 * sstep( u, 2.5, 4.8 ) - 0.8 * sstep( u, 4.8, 7.5 ) - 0.4 * sstep( u, 7.5, 10.5 ) ) * DEG,
	rise: ( u ) => 0.15 * sstep( u, 3.5, 9 ),
	contacts: [ [ 0, - 0.7, 3.2 ], [ 0, - 0.75, 0 ], [ 0, - 0.72, - 3.4 ], [ 1.1, - 0.4, 1.5 ], [ - 1.1, - 0.4, 1.5 ], [ 1.2, - 0.35, - 2.5 ], [ - 1.2, - 0.35, - 2.5 ], [ 0, 0.2, 4.2 ] ],
	outline: [ [ 0, 0.3, 4.1 ], [ 1.2, 0.3, 2.0 ], [ - 1.2, 0.3, 2.0 ], [ 1.4, 0.3, - 1.0 ], [ - 1.4, 0.3, - 1.0 ], [ 1.2, 0.3, - 3.8 ], [ - 1.2, 0.3, - 3.8 ] ],
	bowZ: 3.9,
	sternZ: - 3.8,
	engine: { maxThrust: 26000, pitchSpeed: 16, reverseFactor: 0.45, shaftRpm: 2400 },
	propulsion: propellerAndRudder,
	rudder: { area: 0.12, race: 0.14, lift: 2.8 },
};
