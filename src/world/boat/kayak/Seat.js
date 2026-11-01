import { MathUtils, Quaternion, Vector3 } from '../../../engine/index.js';
import { G } from '../../../core/Globals.js';

// (M16) Sat in the kayak: player/Player's mode 'boat' for a boat that's sat in (Vessel.seated). There's no deck to get
// up onto and no wheel: W and S (or the stick, by how far it's pushed) paddle ahead and astern, A and D sweep her round,
// Shift digs in. With the rod or the net out the paddle's laid along the gunwale, she drifts, and you look through your
// own eyes. E gets you out: onto the sand or the shallows if they're by you (and she's pulled up after you), otherwise
// over the side. With the radio's panel up (game/Radio.js) the paddle's laid by too, and E puts it away.
//   updateSeat( player, dt )   each frame in her

const _eye = new Vector3(), _target = new Vector3(), _off = new Vector3(), _up = new Vector3( 0, 1, 0 );
const _boatQ = new Quaternion(), _yawQ = new Quaternion(), _base = new Quaternion(), _local = new Quaternion(), _half = new Quaternion().setFromAxisAngle( _up, Math.PI );
const smooth = ( x ) => x * x * ( 3 - 2 * x );

const CHASE = { dist: 6.2, min: 3.2, max: 24, height: 0.65 };

export function updateSeat( p, dt ) {

	const inp = p.input, b = p.boat, M = b.model, st = M.stroke;
	p.breathe( dt, false, false );
	const look = inp.consumeLook(), wheel = inp.consumeWheel();
	if ( inp.hit( 'KeyV' ) ) p.camMode = p.camMode === 'first' ? 'third' : 'first';

	// the paddle laid by with the rod out, and taken up again
	const full = p.handsFull || p.busy;
	const free = ! full && ! p.helmHeld && ! M.sliding;
	st.held = full || p.helmHeld;

	let throttle = 0, steer = 0;
	if ( free ) {

		const hard = inp.down( 'ShiftLeft' ) || inp.down( 'ShiftRight' );
		if ( inp.down( 'KeyW' ) ) throttle = hard ? 1 : 0.7;
		if ( inp.down( 'KeyS' ) ) throttle = - 0.7;
		if ( inp.down( 'KeyA' ) ) steer += 1;
		if ( inp.down( 'KeyD' ) ) steer -= 1;
		// analog: a stick's forward travel is how hard you paddle, its side the sweep (the stick's edge, a sweep alone)
		if ( inp.move && ( inp.move.x || inp.move.y ) ) {

			if ( ! throttle ) throttle = inp.move.y;
			if ( ! steer ) steer = - inp.move.x;

		}

	}

	b.setInput( throttle, steer, dt );

	// getting out
	p._ashoreT = ( p._ashoreT || 0 ) - dt;
	if ( p._ashoreT <= 0 ) {

		p._ashoreT = 0.25;
		p._ashore = b.speed < 1.2 ? p.ashoreTarget() : null;

	}

	if ( p.helmHeld ) p.prompt = { key: 'E', text: 'Put it away' };
	else if ( free ) {

		const off = p._ashore ? ( M.canPullUp( b ) ? 'Step out and pull her up' : 'Step out' ) : 'Over the side';
		p.prompt = { key: 'E', text: `${ off }   ·   V  camera   ·   R  the rod` };
		if ( inp.hit( 'KeyE' ) ) {

			M.leave( b, p, p._ashore );
			return;

		}

	}

	// (keep the player with her, for the sound and the water asked about)
	b.toWorld( M.seat, p.position );

	// getting in: the view eases in from where you were (climbing out of the water takes longer)
	let inK = 1;
	if ( p._seatT !== undefined && p._seatT < p._seatDur ) {

		p._seatT += dt;
		inK = smooth( Math.min( 1, p._seatT / p._seatDur ) );

	}

	if ( p.camMode === 'first' || full ) {

		// looking about you from the seat. The head keeps its own level, and doesn't follow each stroke's swing of her bow
		p.helmYaw = MathUtils.clamp( p.helmYaw - look.x * 0.0022, - 2.7, 2.7 );
		p.helmPitch = MathUtils.clamp( p.helmPitch - look.y * 0.0022, - 1.3, 1.1 );
		const yaw = b.getYaw();
		if ( p._seatYaw === undefined ) p._seatYaw = yaw;
		const d = Math.atan2( Math.sin( yaw - p._seatYaw ), Math.cos( yaw - p._seatYaw ) );
		p._seatYaw += d * ( 1 - Math.exp( - dt / 0.3 ) );
		_boatQ.copy( b.quaternion ).multiply( _half );
		_yawQ.setFromAxisAngle( _up, p._seatYaw + Math.PI );
		_base.slerpQuaternions( _boatQ, _yawQ, 0.6 );
		_local.setFromEuler( M.euler.set( p.helmPitch, p.helmYaw, 0 ) );
		b.toWorld( _eye.copy( M.helmEye ), _eye );
		if ( inK < 1 ) _eye.lerp( p._seatFrom, 1 - inK );
		p.camera.position.copy( _eye );
		p.camera.quaternion.copy( _base ).multiply( _local );
		p.camInit = false;

	} else {

		p.orbitYaw -= look.x * 0.003;
		p.orbitPitch = MathUtils.clamp( p.orbitPitch + look.y * 0.003, - 0.03, 1.3 );
		p.orbitDist = MathUtils.clamp( p.orbitDist * ( 1 + wheel * 0.08 ), CHASE.min, CHASE.max );
		// gently round behind her as she gets going
		if ( b.speed > 0.7 && Math.abs( look.x ) < 0.5 ) {

			const behind = b.getYaw() + Math.PI;
			let a = behind - p.orbitYaw;
			a = Math.atan2( Math.sin( a ), Math.cos( a ) );
			p.orbitYaw += a * ( 1 - Math.exp( - dt * 0.55 ) );

		}

		b.toWorld( _target.set( 0, CHASE.height, 0 ), _target );
		_off.set( Math.sin( p.orbitYaw ) * Math.cos( p.orbitPitch ), Math.sin( p.orbitPitch ), Math.cos( p.orbitYaw ) * Math.cos( p.orbitPitch ) ).multiplyScalar( p.orbitDist ).add( _target );
		_off.y = Math.max( _off.y, ( p.waterH || G.seaLevel.value ) + 0.45 );
		if ( ! p.camInit ) {

			p.camPos.copy( inK < 1 ? p._seatFrom : _off );
			p.camInit = true;

		}

		p.camPos.lerp( _off, 1 - Math.exp( - dt * 7 ) );
		p.camera.position.copy( p.camPos );
		p.camera.lookAt( _target );
		p._seatYaw = undefined;

	}

	p._camY = p.camera.position.y;

}

// sitting down: called as she's taken (Player.takeHelm). from: 'water' climbing out of it, or off the sand
export function sitDown( p ) {

	const M = p.boat.model;
	p._seatFrom = ( p._seatFrom || new Vector3() ).copy( p.camera.position );
	const wet = p.mode === 'swim' || p._wasSwim;
	p._seatT = 0;
	p._seatDur = wet ? M.climbTime : 0.6;
	p._seatYaw = undefined;
	p.orbitDist = CHASE.dist;
	p.orbitPitch = 0.3;
	p.helmYaw = 0;
	p.helmPitch = - 0.12;
	p.camInit = false;
	p._ashore = null;
	p._ashoreT = 0;
	// (climbing over her side rolls her)
	if ( wet ) p.boat.angular.addScaledVector( M.fwdOf( p.boat ), 0.5 );

}
