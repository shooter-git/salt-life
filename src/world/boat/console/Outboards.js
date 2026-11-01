import { MathUtils, Vector3 } from '../../../engine/index.js';

// (M16) How outboards drive and turn her: Handling's propulsion for a boat that's steered by swinging the thrust itself,
// with no rudder. Real figures: a 23 ft deep-V of 2.5 t on twin 150s (Regulator 23: 14.25 x 18 props, 1.86:1, 6000 rpm; top
// speed 48 mph, 29 mph cruise: Boating's test, docs/m16/console.md); a single 150 is what she's sold with.
//
//   thrust  what the prop gives is its power over the speed through the water, held under the bollard pull, and gone at the
//           prop's pitch speed. A prop's speed is its rpm, so her speed goes with the revs, as a real boat's: the helm's
//           0.7 of the lever (4200 rpm) is her cruise, and all of it her best: on one 150, 26 and 36 kn; on two, 32 and 43
//   steer   the engines swing on their swivel (35° each way); the thrust's line swings with them, so she turns with way on
//           or none, ahead or astern, and it's the stern that goes first. The leg's a small fin as well, at speed
//   trim    you run the engines tilted up a little at speed, as a skipper does with a thumb: bow up and off the water, a little
//           faster; down to get on the plane. Off the helm they tilt right up out of the water, as she's left
//   ventilation  out of the water on a sea's back, it has nothing to bite: the thrust goes, the revs run up

const clamp = MathUtils.clamp;
const RHO = 1025;
const _p = new Vector3();
const _f = new Vector3();
const _d = new Vector3();

export const STEER_MAX = 35 * Math.PI / 180;
export const TRIM = { down: - 4 * Math.PI / 180, run: 5 * Math.PI / 180, up: 62 * Math.PI / 180, rate: 9 * Math.PI / 180, upRate: 16 * Math.PI / 180 };

// where the engines want to be at this speed (m/s): tucked in to get her up, out as she runs, tilted up with no one driving
export function trimFor( driven, u ) {

	if ( ! driven ) return TRIM.up;
	return TRIM.down + ( TRIM.run - TRIM.down ) * MathUtils.smoothstep( u, 8, 17 );

}

// ctl: player/BoatController. Its engine figures: maxThrust N (bollard pull), pitchSpeed m/s, reverseFactor, power W
// delivered to the water at full revs. Game's upgrades scale maxThrust by speedMul squared and pitchSpeed by speedMul,
// and the power goes with the thrust
export function outboards( ctl, q ) {

	const { addForceAt, fwd, side, u, vs, aLoc, comZ } = q, model = ctl.model, E = ctl.handling.engine, F = ctl.handling.fin;
	const run = ctl.driven && ctl.engineOn;
	// the trim's motor
	const want = trimFor( ctl.driven, Math.abs( u ) ), h = 1 / 120;
	const trim = ctl.outboardTrim ?? TRIM.up;
	const rate = want > TRIM.run + 0.01 || trim > TRIM.run + 0.01 ? TRIM.upRate : TRIM.rate;
	ctl.outboardTrim = trim + clamp( want - trim, - rate * h, rate * h );

	// the props: the wash is at the prop, under the bracket, swung with the trim
	const propW = ctl.toWorld( model.propeller, _p );
	const sub = ctl.sampleWaterAt( propW ) - propW.y;
	const tiltK = clamp( 1 - ( ctl.outboardTrim - TRIM.run ) / 0.5, 0, 1 );
	const wet = clamp( sub / 0.22 + 0.45, 0, 1 ) * tiltK;
	ctl.propWet = wet;
	const dir = run ? Math.sign( ctl.throttle ) : 0, n = ctl.rpm * ( run && Math.abs( ctl.throttle ) > 0.02 ? 1 : 0 );
	const power = E.power * ( ctl.maxThrust / E.maxThrust ); // (W, at full revs: an upgrade's more of it)
	let thrust = 0;
	if ( dir > 0 ) {

		// the power law goes with n squared at a cruising load; the pull with it; the slip's the last tenth of the pitch
		const vP = ctl.pitchSpeed * Math.max( n, 0.05 ), slip = 1 - Math.max( u, 0 ) / vP;
		thrust = Math.min( ctl.maxThrust * n * n, power * n * n / Math.max( u, 1 ) ) * clamp( slip / 0.1, 0, 1 );

	} else if ( dir < 0 ) {

		const vP = ctl.pitchSpeed * 0.55 * Math.max( n, 0.05 ), slip = 1 - Math.max( - u, 0 ) / vP;
		thrust = - ctl.reverseFactor * ctl.maxThrust * n * n * clamp( slip / 0.1, 0, 1 );

	}

	thrust *= wet * ctl.thrustMul;
	ctl.thrust = thrust;

	// the thrust's line, swung with the swivel
	// (hard over at speed, a prop swung that far loses its bite and blows out: what a skipper feels, and doesn't ask of her)
	const bite = 1 - 0.65 * MathUtils.smoothstep( Math.abs( u ), 5, 16 );
	const delta = ctl.steer * STEER_MAX * bite, cd = Math.cos( delta ), sd = Math.sin( delta );
	_d.copy( fwd ).multiplyScalar( cd ).addScaledVector( side, - sd );
	addForceAt( _f.copy( _d ).multiplyScalar( thrust ), propW );
	// the engine's torque leans her a little, and going astern the prop walks her stern to port
	if ( thrust < 0 ) addForceAt( _f.copy( side ).multiplyScalar( - thrust * 0.05 ), propW );

	// the leg, a small fin: lift from the water going by it and the wash, and the turning drags on her
	const race = Math.max( thrust, 0 ) * 2 / ( RHO * F.race );
	const Ur2 = u * Math.abs( u ) + 0.5 * race, Ur = Math.sqrt( Math.abs( Ur2 ) ) * Math.sign( Ur2 );
	const vLeg = vs + aLoc.y * ( model.propeller.z - comZ );
	const aoa = clamp( delta + ( Math.abs( Ur ) > 0.3 ? Math.atan2( vLeg, Math.abs( Ur ) ) * Math.sign( Ur ) : 0 ), - 0.22, 0.22 );
	const lift = 0.5 * RHO * F.area * Math.abs( Ur2 ) * F.lift * Math.sin( aoa ) * Math.cos( aoa ) * wet * Math.sign( Ur2 || 1 );
	addForceAt( _f.copy( side ).multiplyScalar( - lift ), propW );
	addForceAt( _f.copy( fwd ).multiplyScalar( - Math.abs( lift * Math.sin( aoa ) ) * Math.sign( u || 1 ) ), propW );

	// what the trim does to her: out, the shaft points down ahead of the prop and the thrust pulls her stern down, her bow up;
	// in, it lifts her stern and holds the bow down
	addForceAt( _f.set( 0, - Math.sin( ctl.outboardTrim ) * Math.max( thrust, 0 ), 0 ).applyQuaternion( ctl.quaternion ), propW );

	// up on the plane her V carries her on its wetted middle, and it's her lift that keeps her upright where the buoyancy's
	// gone from her sides; and she leans into her turn, pressing on her inner chine, with her speed and how fast she's turning
	// (the wind on her beam doesn't do it, as drift would)
	const lean = F.lean * Math.abs( u ) * clamp( aLoc.y, - 0.8, 0.8 ) + F.upright * MathUtils.smoothstep( Math.abs( u ), 4, 13 ) * side.y;
	if ( lean ) {

		addForceAt( _f.set( 0, - lean, 0 ).applyQuaternion( ctl.quaternion ), ctl.toWorld( _p.set( 1, ctl.com.y, comZ ), _p ) );
		addForceAt( _f.set( 0, lean, 0 ).applyQuaternion( ctl.quaternion ), ctl.toWorld( _p.set( - 1, ctl.com.y, comZ ), _p ) );

	}

	model.setTrim( ctl.outboardTrim );
	// (and her ladder's folded up with way on or at the helm)
	model.setLadder( ! ctl.driven && Math.abs( u ) < 1 );

}
