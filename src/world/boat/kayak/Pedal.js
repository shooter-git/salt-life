import { Vector3 } from '../../../engine/index.js';

// (M19) The Pescador Pilot 12's pedal drive, and poling her stood up (stream BOATS: docs/m19/boats.md; the sources in
// docs/m19/sources-boats-bait.md, sections 1 and 2). Her Handling's propulsion (Paddle.js' paddling) hands over to these:
//   pedalling( ctl, q )   sat in her with the drive (the model's pedal): the lever's ahead or astern as hard as W or S, Shift
//                         flat out; the prop's push at the drive's leg under her, falling off toward its pitch speed, and the
//                         hand rudder's lift at her stern turning her as she goes. Hands free: the rod's out as you pedal
//   poling( ctl, q )      stood up in her with the pole, in water it reaches the bottom in: pushed along, slowly and silently,
//                         and turned by where you push
// Pure enough for Node: test/boats-m19.mjs drives the real kayak with them.
//
// The drive's figures are fitted to her own resistance (Paddle.js' KAYAK_HANDLING): 3.0 knots cruising (W) and 3.6 flat out
// (Shift), an owner's (docs/m19/sources-boats-bait.md: "a little over 4" mph pushing, 3.5 cruising); reverse at 60%. Its
// thrust goes as the effort's 2.5th power, so W's 0.7 is the cruise. The rudder's 0.045 m^2 is judgement.
export const PEDAL = { most: 85, pitch: 3.0, power: 2.5, astern: 0.6, rudder: 0.045, lift: 3.2, depth: 0.46 };
// poling stood up: a push of 45 N at rest, nothing from 1 m/s (a walking pace poled: judgement), in up to 1.6 m (an 8 ft pole
// with a hand's reach: the sources' derived); the turn's torque (N m) at full lock
export const POLE = { push: 45, fade: 1.0, deep: 1.6, turn: 28 };
const RHO = 1025;
const _at = new Vector3(), _f = new Vector3();

// the water's depth under a point of her in the world (m), or Infinity where it isn't known
function depthUnder( ctl, at ) {

	const T = ctl.terrain;
	if ( ! T || ! T.heightAt ) return Infinity;
	return ctl.sampleWaterAt( at ) - T.heightAt( at.x, at.z );

}

export function pedalling( ctl, q ) {

	const M = ctl.model, P = PEDAL, at = ctl.toWorld( M.driveAt, _at ), t = ctl.driven ? ctl.throttle : 0;
	// (the drive needs its 18 in of water: in less its prop's on the bottom and it gives nothing, until you're off it)
	const wet = depthUnder( ctl, at ) > P.depth - 0.1 ? 1 : 0;
	const ahead = t >= 0 ? 1 : - P.astern, effort = Math.pow( Math.min( 1, Math.abs( t ) ), P.power );
	const n = Math.sign( t ) * P.most * effort * Math.abs( ahead ) * Math.max( 0, 1 - Math.max( 0, Math.sign( t ) * q.u ) / P.pitch ) * wet;
	q.addForceAt( _f.copy( q.fwd ).multiplyScalar( n ), at );
	ctl.thrust = n;
	// the hand rudder at her stern, a lifting surface in the flow past her
	const stern = ctl.toWorld( _at.set( 0, - 0.12, M.lines.zAft + 0.08 ), _at ), d = ctl.steer * 0.5;
	const lift = 0.5 * RHO * P.rudder * q.u * Math.abs( q.u ) * P.lift * Math.sin( d ) * Math.cos( d );
	q.addForceAt( _f.copy( q.side ).multiplyScalar( - lift ), stern );

}

export function poling( ctl, q ) {

	const M = ctl.model, Pl = POLE, at = ctl.toWorld( M.stakeAt, _at ), t = ctl.driven ? ctl.throttle : 0;
	ctl.thrust = 0;
	if ( depthUnder( ctl, at ) > Pl.deep ) return;
	const n = Math.sign( t ) * Pl.push * Math.min( 1, Math.abs( t ) ) * Math.max( 0, 1 - Math.abs( q.u ) / Pl.fade );
	q.addForceAt( _f.copy( q.fwd ).multiplyScalar( n ), at );
	q.torque.y += ctl.steer * Pl.turn;
	ctl.thrust = n;

}
