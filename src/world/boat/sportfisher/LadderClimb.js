import { MathUtils, Quaternion, Vector3 } from '../../../engine/index.js';

// (M16) Going up a ladder at sea: a mode of its own, for something that's too high and too steep to walk, and that you can
// come off. A boat that rolls swings a tower through the air like the top of a mast: at the head of a ladder 7 m over the
// water, a 15 degree roll every 4 seconds throws you sideways at more than half your weight (g sin(roll), and the roll's
// acceleration times your height). Your hands hold so much; moving, one hand's off the rail, and they hold less. So: climb
// in the lulls, and when she lurches, stop, and hold on. Hold through too much for too long and you come off.
//
//   const c = new LadderClimb( ladder, fromTop );  c.update( player, dt ) -> false once it's over
//   the player's mode stays 'deck' all the while (player.climbing is set): the game's still got you aboard her
//   LadderClimb.gripStep( grip, sway, moving, dt ) the hands, alone (tests)

const G = 9.81;
const ROLL_CENTRE = 0.4; // m over the waterline: what she rolls about
export const GRIP = {
	hold: 0.72, // of your weight: what you can hold standing still on the rungs
	move: 0.42, // and what you can hold moving: one hand off
	drain: 2.4, // of your grip a second, per g past that
	back: 0.6, // of it a second, back when she's easy
	warn: 0.7, // your grip under this: the warning
};
const STUN = 3; // s on the deck, getting your wind back, after a fall that lands you there
const HIGH_FALL = 2; // m: a fall under this you just land from

const NONE = new Vector3();
const _up = new Vector3();
const _fwd = new Vector3();
const _side = new Vector3();
const _v = new Vector3();
const _b = new Vector3();
const _q = new Quaternion();

export function gripStep( grip, sway, moving, dt ) {

	const limit = moving ? GRIP.move : GRIP.hold;
	const past = sway - limit;
	return MathUtils.clamp( past > 0 ? grip - GRIP.drain * past * dt : grip + GRIP.back * dt, 0, 1 );

}

// the sideways throw at height y (boat frame), as a share of your weight: her heel's share of gravity, and her rolling and
// pitching's speeding up and slowing down times how far up you are. boat: { quaternion, angular }; last: what was kept of her
// rates, to take the difference
export function swayAt( boat, y, last, dt ) {

	_up.set( 0, 1, 0 ).applyQuaternion( boat.quaternion );
	_fwd.set( 0, 0, 1 ).applyQuaternion( boat.quaternion );
	_side.set( 1, 0, 0 ).applyQuaternion( boat.quaternion );
	const heel = Math.asin( MathUtils.clamp( _side.y, - 1, 1 ) ), trim = Math.asin( MathUtils.clamp( _fwd.y, - 1, 1 ) );
	// (someone else's boat, ridden along on, is a pose and no more: no rates)
	const w = boat.angular || NONE, roll = w.dot( _fwd ), pitch = w.dot( _side );
	const aR = dt > 0 && last.roll !== undefined ? ( roll - last.roll ) / dt : 0, aP = dt > 0 && last.pitch !== undefined ? ( pitch - last.pitch ) / dt : 0;
	last.roll = roll;
	last.pitch = pitch;
	// (her rates are noisy frame to frame: eased, as a body's slower than that)
	const k = 1 - Math.exp( - dt * 5 );
	last.aR = ( last.aR ?? 0 ) + ( aR - ( last.aR ?? 0 ) ) * k;
	last.aP = ( last.aP ?? 0 ) + ( aP - ( last.aP ?? 0 ) ) * k;
	const h = Math.max( 0, y - ROLL_CENTRE );
	// (at the end of a roll her heel and her swing back throw you the same way: rate about her bow, +x's going up)
	const across = Math.sin( heel ) - last.aR * h / G, along = Math.sin( trim ) + last.aP * h / G;
	last.across = across;
	return Math.hypot( across, along * 0.6 ); // (fore and aft you're braced against the rungs: it tells less)

}

export class LadderClimb {

	constructor( ladder, fromTop = false ) {

		this.ladder = ladder;
		this.len = ladder.foot.distanceTo( ladder.head );
		this.s = fromTop ? this.len : 0; // m up it
		this.grip = 1;
		this.sway = 0;
		this.falling = null; // { v: Vector3 world velocity, p: Vector3 world position, t }
		this.stepAcc = 0;
		this._last = {};

	}

	// where your feet are, at s up it
	feet( out ) {

		return out.copy( this.ladder.foot ).lerp( this.ladder.head, this.s / this.len );

	}

	update( player, dt ) {

		return this.falling ? this._fall( player, dt ) : this._climb( player, dt );

	}

	_climb( player, dt ) {

		const inp = player.input, b = player.boat, L = this.ladder;
		const look = inp.consumeLook();
		player.deckYaw -= look.x * 0.0022;
		player.pitch = MathUtils.clamp( player.pitch - look.y * 0.0022, - 1.5, 1.5 );

		let want = 0;
		if ( inp.down( 'KeyW' ) ) want += 1;
		if ( inp.down( 'KeyS' ) ) want -= 1;
		if ( inp.move ) want += inp.move.y;
		want = MathUtils.clamp( want, - 1, 1 );
		const moving = Math.abs( want ) > 0.05;

		this.feet( _v );
		this.sway = swayAt( b, _v.y, this._last, dt );
		this.grip = gripStep( this.grip, this.sway, moving, dt );
		if ( this.grip <= 0 ) {

			this._letGo( player );
			return true;

		}

		this.s = MathUtils.clamp( this.s + want * L.speed * dt, 0, this.len );
		const moved = Math.abs( want ) * L.speed * dt;
		this.stepAcc += moved;
		if ( this.stepAcc > 0.3 ) {

			this.stepAcc = 0;
			if ( player.audio ) player.audio.footstep( 'metal' );

		}

		// off the top, or off the bottom
		if ( ( want > 0 && this.s >= this.len ) || ( want < 0 && this.s <= 0 ) ) {

			player.deckPos.copy( want > 0 ? L.off : L.on );
			player.deckVel.set( 0, 0, 0 );
			player.deckGrounded = true;
			player.deckToWorld();
			return false;

		}

		this.feet( player.deckPos );
		// you hang a little off it, on the climbing side
		player.deckPos.z -= 0.16;
		player.deckToWorld();

		player.prompt = this.grip < GRIP.warn ? { key: '', text: 'Hold on! Stop climbing till she eases' } : { key: 'W / S', text: 'Climb' };
		this.view( player, this.grip < GRIP.warn ? this.sway : 0 );
		return true;

	}

	view( player, shake ) {

		const b = player.boat, p = player.deckPos;
		const eye = _b.set( p.x, p.y + 1.5, p.z );
		b.toWorld( eye, player.camera.position );
		player._camY = player.camera.position.y;
		player.deckBase( _q );
		player.camera.quaternion.copy( _q ).multiply( player.deckLook() );

	}

	// your hands are gone: off you go the way she's throwing you, with her speed and the swing of the tower
	_letGo( player ) {

		const b = player.boat;
		this.feet( player.deckPos );
		const p = b.toWorld( player.deckPos, new Vector3() );
		const side = new Vector3( 1, 0, 0 ).applyQuaternion( b.quaternion );
		const v = ( b.velocity || NONE ).clone().addScaledVector( side, - Math.sign( this._last.across || 1 ) * ( 1.2 + this.sway * 2.5 ) );
		this.falling = { p, v, from: p.y };
		player.falls = ( player.falls || 0 ) + 1;

	}

	_fall( player, dt ) {

		const F = this.falling, b = player.boat;
		player.input.consumeLook();
		F.v.y -= G * dt;
		F.p.addScaledVector( F.v, dt );
		player.position.copy( F.p );
		// in her frame: are you over her, and at a deck?
		_q.copy( b.quaternion ).invert();
		_v.copy( F.p ).sub( b.position ).applyQuaternion( _q );
		const M = b.model, onBoard = Math.abs( _v.x ) < M.lines.halfBreadth( M.lines.tAtSheerZ( _v.z ), Math.max( _v.y, M.lines.deckY ) ) && _v.z > M.lines.zAft && _v.z < M.lines.zBow;
		const g = onBoard ? player.deckGroundAt( _v.x, _v.z, _v.y + 0.05 ) : - Infinity;

		// the view goes with you, turning over a little
		player.camera.position.copy( F.p ).add( _b.set( 0, 1.5, 0 ) );
		player._camY = player.camera.position.y;
		player.deckBase( _q );
		player.camera.quaternion.copy( _q ).multiply( player.deckLook() );

		if ( onBoard && _v.y <= g ) {

			player.deckPos.set( _v.x, g, _v.z );
			M.clampToDeck( player.deckPos, 0.24 );
			player.deckVel.set( 0, 0, 0 );
			player.deckGrounded = true;
			if ( F.from - F.p.y > HIGH_FALL ) player.stunned = STUN;
			if ( player.audio ) player.audio.footstep( M.footstep );
			player.deckToWorld();
			return false;

		}

		if ( F.p.y <= b.position.y - 0.1 ) {

			player.climbing = null;
			player.exitBoat( null, Math.sign( _v.x ) || 1 );
			player.position.copy( F.p ).setY( b.position.y - 0.2 );
			return false;

		}

		return true;

	}

}
