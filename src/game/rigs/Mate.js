import { Vector3 } from '../../engine/index.js';
import { seaHere } from '../Seaworthy.js';
import { figureStandIn } from '../../together/Figure.js';

// (M19) The sportfisher's hired mate (Gear.js' sfMate, docs/m19/big.md). With a fish on (yours, or a guest's aboard her)
// and you off her helm on her deck or in her chair, and no one else at it, he takes her helm (BoatController.helmsman) and
// backs her down on it, as a real crew does: her stern brought round to the line, then astern toward the fish as fast as the
// sea lets him, easing off as she comes up on it. The line it took comes back as she closes (CatchMinigame: the boat's
// closing speed, up to 3 m/s). A big blue marlin is landed so: "more line, and a boat after the fish" (docs/m17/lines.md).
// When the fish is off, or you take her helm, she's yours again, stopped.
// He's paid $200 for each day of a trip she's out with him (mateDay; docs/m19/sources-big-game.md: a private boat's mate on a
// fishing day), on your money, or on Marta's tab if you're short.
//
// How fast (docs/m19/sources-big-game.md): boat tests back a sportfisher down at 3.3 to 4.6 m/s with no water over the
// transom, and captains go "just fast enough" in a big sea. Up to 3 m/s in a calm sea, down to 1 m/s in 3 m of it (the taper
// is judgement), and nothing within 15 m of the fish.
//   MATE                                    his figures
//   mateTarget( distance, landAt, Hs )      the closing speed he backs her down at (m/s)
//   const m = new Mate( game )   m.update( dt )   (Game, each frame)
export const MATE = {
	most: 3, least: 1, calm: 1, rough: 3, // m/s astern in a calm sea and in a rough one (Hs, m)
	near: 15, far: 60, // m: easing off from `far` to nothing at `near` (or a little past where it's landed)
	stern: 0.5, lose: 0.9, // rad: her stern this near the line, he backs down (until it's `lose` off); further off he pivots her round first
	pivot: 1.2, kp: 1.6, kd: 1.2, // the wheel: pivoting her, and holding her stern on it going astern
	perMs: 0.105, gain: 0.35, lever: 0.7, // the lever astern for a speed (about 2.8 m/s at 0.3: the sportfisher's), its correction, its most
};

const smooth = ( a, b, x ) => {

	const t = Math.min( 1, Math.max( 0, ( x - a ) / ( b - a ) ) );
	return t * t * ( 3 - 2 * t );

};

export function mateTarget( distance, landAt = 1, Hs = 0 ) {

	const sea = MATE.most - ( MATE.most - MATE.least ) * smooth( MATE.calm, MATE.rough, Hs );
	return sea * smooth( Math.max( MATE.near, landAt * 1.5 ), MATE.far, distance );

}

// the lever and the wheel he puts on her to back her down on a fish at `at`, from where she is: { th, st } (BoatController's
// setInput). Pure but for three's maths, so test/mate.mjs can drive the real sportfisher with it
export function mateHelm( b, at, distance, landAt, Hs, out = { th: 0, st: 0, err: 0, astern: false } ) {

	const yaw = b.getYaw(), dx = at.x - b.position.x, dz = at.z - b.position.z;
	// (her stern to it: her bow away from it)
	let err = Math.atan2( - dx, - dz ) - yaw;
	err = Math.atan2( Math.sin( err ), Math.cos( err ) );
	out.err = err;
	// (stopped, on her twin screws, the wheel swings her as it does going ahead; going astern at speed, the other way: her
	// rudder's in the water coming at it from behind. Each against how fast she's swinging already)
	const rate = b.angular.y;
	// (once backing down he keeps at it unless her stern's well off the line: not between the two at its edge)
	out.astern = Math.abs( err ) < ( out.astern ? MATE.lose : MATE.stern );
	if ( ! out.astern ) {

		// round on her twin screws, stopped
		out.th = 0;
		out.st = Math.max( - 1, Math.min( 1, Math.sign( err ) * Math.min( 1, Math.abs( err ) * MATE.pivot ) - rate * MATE.kd ) );
		return out;

	}

	// astern toward it, at the closing speed he wants, the wheel keeping her stern on the line
	const len = Math.hypot( dx, dz ) || 1, closing = ( b.velocity.x * dx + b.velocity.z * dz ) / len, want = mateTarget( distance, landAt, Hs );
	out.th = want > 0.05 ? - Math.min( MATE.lever, Math.max( 0, want * MATE.perMs + ( want - closing ) * MATE.gain ) ) : 0;
	out.st = Math.max( - 1, Math.min( 1, - err * MATE.kp + rate * MATE.kd ) );
	return out;

}

const _at = new Vector3();
const _helm = { th: 0, st: 0, err: 0, astern: false };

export class Mate {

	constructor( game ) {

		this.game = game;
		this.figure = null; // (his figure at her helm: made the first time he takes it)
		this._said = false;

	}

	get app() {

		return this.game.app;

	}

	// where a fish is on her that he'd back down on: yours, or a guest's aboard her (Together's crew, their line's end), or null
	_fishAt( out ) {

		const g = this.game, app = this.app, p = app.player;
		if ( g.fight && g.rod && g.rod.lineInWater ) return { at: out.copy( g.rod.bobber ), distance: g.fight.distance, landAt: g.fight.landAt || 1 };
		const T = app.together, crew = T && T.crew && T.crew.aboard ? T.crew.aboard() : null;
		if ( crew && p.mode === 'deck' && ! p.riding ) for ( const o of crew ) if ( o.fishOn && o.cur && o.cur.bobber ) {

			const b = app.boatCtl, d = Math.hypot( o.cur.bobber.x - b.position.x, o.cur.bobber.z - b.position.z );
			return { at: out.copy( o.cur.bobber ), distance: d, landAt: 3 };

		}

		return null;

	}

	update( dt ) {

		const g = this.game, app = this.app, b = app.boatCtl, p = app.player;
		if ( ! b || ! app.boat ) return;
		const s = g.state.stats, sportfisher = app.boat.id === 'sportfisher';
		this._pay( s, sportfisher, b );
		const fish = s.mate && sportfisher && p.mode === 'deck' && ! p.riding ? this._fishAt( _at ) : null;
		const human = !! ( app.together && app.together._handed );
		const can = !! fish && ! b.moored && ! b.hauled && ! b.beached && b.engineOn && ! human && g.state.fuelL > 0;
		if ( can ) this._drive( dt, fish );
		else if ( b.helmsman === 'mate' ) this.handBack();
		if ( this.figure ) this.figure.visible = b.helmsman === 'mate';

	}

	_drive( dt, fish ) {

		const g = this.game, b = this.app.boatCtl;
		if ( b.helmsman !== 'mate' ) {

			b.helmsman = 'mate';
			b.driven = true;
			b.moored = false;
			if ( ! this._said ) g.toast( 'Your mate has her helm: he\'ll back her down on it', 2800 );
			this._said = true;
			this._show();

		}

		const app = this.app, w = app.weather && ( app.weather.live || app.weather.target ), Hs = w ? seaHere( w ) : 0;
		mateHelm( b, fish.at, fish.distance, fish.landAt, Hs, _helm );
		b.setInput( _helm.th, _helm.st, dt );

	}

	// hers to you again, stopped; not as you leaving her helm (her anchor isn't let go for it: Game.updateAnchor)
	handBack() {

		const b = this.app.boatCtl;
		b.helmsman = null;
		// (you've taken her helm: she's yours, driven; otherwise stopped, and not as you leaving it)
		if ( this.app.player.mode !== 'boat' ) {

			b.driven = false;
			b.throttle = 0;
			b.steer = 0;
			this.game._wasDriven = false;

		}

		this._said = false;
		if ( this.figure ) this.figure.visible = false;

	}

	// his figure at her helm on your game (another's copy of her shows him by her pose: Together's `Mt`)
	_show() {

		const model = this.app.boat;
		if ( this.figure || ! model || ! model.group || ! model.helmEye ) return;
		const f = figureStandIn();
		const eye = model.helmEye;
		f.position.set( eye.x, eye.y - 1.62, eye.z );
		model.group.add( f );
		this.figure = f;

	}

	// $200 for each day of a trip she's out with him: the first as she leaves her berth with him aboard, then one each 24 hours
	// out (DaysOut's d.out; days.mate, how many this trip's paid). On Marta's tab if you're short
	_pay( s, sportfisher, b ) {

		const st = this.game.state, d = st.days;
		if ( ! s.mate || ! sportfisher || b.moored || b.hauled || ! s.mateDay ) return;
		const due = Math.floor( ( d.out || 0 ) / 24 ) + 1;
		if ( ( d.mate | 0 ) >= due ) return;
		const owe = ( due - ( d.mate | 0 ) ) * s.mateDay;
		d.mate = due;
		const paid = st.money >= owe;
		if ( paid ) st.money -= owe;
		else st.dues.owed += owe;
		this.game.toast( `Your mate's day: $${ owe }${ paid ? '' : ', on Marta\'s tab' }`, 2400 );
		st.save();
		st.emit();

	}

}
