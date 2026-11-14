import { Vector3 } from '../engine/index.js';
import { G } from '../core/Globals.js';
import { BAITS } from './Bait.js';
import { FLY_RODS, flyRodFor } from './Gear.js';
import { FlyLine, loopShape, newPoints } from './rigs/FlyLine.js';

// (M19) Fly casting (stream FLY: docs/m19/fly.md; the figures' sources in docs/m19/sources-fly.md). Gear.js' fly rods and
// FLY_RODS, Bait.js' flies, Presentation's fly rig; FishingRod's 'falsecast' and 'shoot' states, which this drives.
//
//   Hold the button: false casting, back and forward on the line's own rhythm. Each stroke takes the rod's stroke and the time
//   the loop takes to unroll at the line's speed (strokeTime: 2.4 s a false cast at 9 m of line), and each forward one carries
//   2 m more line, up to what the rod carries. Each stroke's line in the air can spook a fish under it (FlatsFishing.falseCast).
//   Let go: in the forward stroke's window, after the rod stops and while the loop unrolls, it's shot: the line carried and up
//   to the rest of the rod's cast, by how well it's timed; before the stop, a tailing loop (short, landing hard); after the
//   window, late (short); on the back cast, it collapses in a heap. The wind along the cast stretches or cuts it, and sets it
//   aside across it.
//   The fly on the water: a tap strips it (0.6 m), holding strips on, still lets it sink. A fish eats it: a strip is the
//   strip-set (a tarpon's bony mouth wants two); lifting the rod (the other button) is a trout set, and mostly pulls it out of
//   its mouth. Otherwise the other button picks the line up into a back cast, laid straight back down unless you hold on.
//
//   const f = new FlyCast( game )   f.update( dt )   f.input( { lDown, lUp, lmb, rDown } ) -> it's the fly's
//   f.start( hold, L )   f.release()   f.strip()   f.pickUp( hold )   f.set()   f.troutSet()
//   f.work() -> how the fly's been worked (Bites.workedTake)   f.working() -> the bites' pace on a fly
//   f.phase, f.L (the pose the others are sent: together/Together.js)   f.label() (ui/Actions.js)
export const FLY = {
	speed: 20, // m/s the line travels: a fishing cast, under Løvoll and Borger's measured 24
	stroke: 0.3, // s of the rod's own stroke before its stop
	start: 5, // m past the tip you start with: the leader and a little line
	gain: 2, // m slipped through the fingers with each false cast
	window: 0.6, // the share of the loop's unrolling it's well shot over
	best: 0.1, // s after the stop: the best moment to let go
	tail: 0.35, late: 0.35, // the share of the shoot a tailing loop or a late release gets
	heap: 0.45, // a collapsed cast lays this share of the line out
	hard: { tail: 1.8, heap: 2.5 }, // how much louder they land
	loop: { good: 0.7, tail: 0.35, late: 1.2 }, // m: the loop's size
	rise: { fwd: 0.06, back: 0.18 }, // the rod's leg climbs this much a metre (the back cast's higher)
	off: 1.5, // m off line at worst for a poor cast
	wind: { at: 7, into: 0.25, down: 1 / 6, cross: 1.5 }, // a 7 m/s wind: a quarter off into it, a sixth on with it, 1.5 m aside at 20 m
	laid: 0.35, // s it takes to fall to the water
	strip: 0.6, stripS: 0.35, fast: 0.45, lift: 0.1, // m a strip, s it takes, s between strips held, m it lifts the fly
	inM: 3.5, // the fly this near the tip, it's in
	trout: 0.7, troutPull: 1.5, // a trout set misses this often, and pulls the fly this far
	sets: { tarpon: 2 }, setMore: 0.8, // strip-sets a bony mouth wants, and the s it gives you for the next
	worked: 4, idle: 0.15, // a fly left still more than this long draws the bites at this pace
	elev: { back: 1.7, fwd: 0.95, follow: 0.45, shot: 0.22, fished: 0.05 }, // the rod's elevation over the view: its stops, after, and the tip kept low stripping
	bend: { back: 0.08, fwd: - 0.14 }, // the blank loaded through each stroke
};

export const strokeTime = ( L ) => FLY.stroke + 2 * L / FLY.speed;

// the release at t s into a stroke (stroke: 1 forward, - 1 back) with L m of line out -> { kind, q }: 'good' (q 0.6 to 1, how
// well), 'tail', 'late' or 'heap'
export function releaseOf( stroke, t, L ) {

	if ( stroke < 0 ) return { kind: 'heap', q: 0 };
	if ( t < FLY.stroke ) return { kind: 'tail', q: 0 };
	const w = FLY.window * 2 * L / FLY.speed, x = t - FLY.stroke;
	if ( x > w ) return { kind: 'late', q: 0 };
	return { kind: 'good', q: 1 - 0.4 * Math.min( 1, Math.abs( x - FLY.best ) / Math.max( FLY.best, w - FLY.best ) ) };

}

// how much line goes out: L carried, and of the shoot (shootM at most) what the release gives; the wind along the cast
// (m/s: + behind you) stretching it or cutting it short
export function castLength( L, shootM, rel, along = 0 ) {

	const m = rel.kind === 'heap' ? L * FLY.heap : L + shootM * ( rel.kind === 'good' ? rel.q : rel.kind === 'tail' ? FLY.tail : FLY.late );
	const w = Math.max( - 1, Math.min( 1, along / FLY.wind.at ) );
	return m * ( 1 + ( w < 0 ? w * FLY.wind.into : w * FLY.wind.down ) );

}

const smooth = ( x ) => {

	const t = Math.min( 1, Math.max( 0, x ) );
	return t * t * ( 3 - 2 * t );

};
const _v = new Vector3(), _w = new Vector3(), _end = new Vector3();

export class FlyCast {

	constructor( game ) {

		this.game = game;
		this.L = 0; // m of line in the air past the tip
		this.stroke = 0; // 1 forward, - 1 back, 0 none
		this.t = 0; // s into this stroke
		this.T = 0; // its length
		this.casts = 0; // false casts made
		this.hold = true; // the button's held (a pick-up's laid back down by itself until it is)
		this.dir = new Vector3( 0, 0, 1 ); // the cast's way over the water
		this.shot = null; // { L0, L1, rel, D, u, lay, hard }
		this.landing = null; // { hard, lineM } of the last cast down: FlatsFishing.landed
		this.pts = newPoints();
		this.line = null; // FlyLine, made the first time a fly's cast
		this.now = 0;
		this.lastStrip = - 99;
		this.strips = 0; // since the fly came down
		this._moving = 0; // m of a strip still to come
		this._held = false;
		this._polled = false;
		this._e0 = FLY.elev.follow;

	}

	get rod() {

		return this.game.rod;

	}

	// the rod a fly's on: the one it's tied for, if you have it, else your heaviest (Gear.flyRodFor); its figures
	get wt() {

		const st = this.game.state;
		return flyRodFor( st.stats.flyRods, BAITS[ st.baitPick ]?.wt );

	}

	get fig() {

		return FLY_RODS[ this.wt ] || FLY_RODS[ 8 ];

	}

	// where you're casting: the way you look, over the water
	_aim( out ) {

		const d = this.game.app.camera.getWorldDirection( out ).setY( 0 );
		return d.lengthSq() > 1e-6 ? d.normalize() : out.copy( this.dir );

	}

	// ---- what the buttons do with a fly on (-> true: it's the fly's)

	input( { lDown = false, lUp = false, lmb = false, rDown = false } = {} ) {

		const rod = this.rod, st = rod.state;
		if ( rod.rig !== 'fly' ) return false;
		this._polled = true;
		this._held = lmb;
		if ( st === 'falsecast' ) {

			if ( rDown ) this.stop();
			else if ( lUp && this.hold ) this.release();
			else if ( lDown && ! this.hold ) this.hold = true; // (a pick-up: held on, it's false cast)
			return true;

		}

		if ( st === 'shoot' ) return true;
		if ( st !== 'floating' ) return false;
		const take = this.game.bite && this.game.bite.phase === 'take';
		if ( lDown ) take ? this.set() : this.strip();
		else if ( rDown ) take ? this.troutSet() : this.pickUp( lmb );
		return true;

	}

	// ---- the cast

	// false casting from the line you have out (L: picked up off the water), held on or laid straight back down
	start( hold = true, L = FLY.start ) {

		const rod = this.rod, fig = this.fig;
		this.L = Math.max( FLY.start, Math.min( fig.carryM, L ) );
		this.stroke = - 1;
		this.t = 0;
		this.T = strokeTime( this.L );
		this.casts = 0;
		this.hold = hold;
		this.shot = null;
		this._e0 = rod.pose ? rod.pose.elev : FLY.elev.follow;
		this._aim( this.dir );
		rod.setState( 'falsecast' );
		// (begun by this frame's press: the button's read, though the rig wasn't a fly's when it was)
		this._polled = true;
		this._held = hold;
		this._whoosh( 0.6 );
		return true;

	}

	// let go: shot, as well as it's timed
	release() {

		const rod = this.rod, game = this.game, fig = this.fig, rel = releaseOf( this.stroke, this.t, this.L );
		const wd = G.windDir.value, ws = G.windSpeed.value, d = this.dir;
		const L1 = castLength( this.L, Math.max( 0, fig.castM - fig.carryM ), rel, ws * ( wd.x * d.x + wd.y * d.z ) );
		// off line: a poor cast either side, and the wind across it carrying it its way
		const cross = ws * ( wd.x * - d.z + wd.y * d.x ), off = ( 1 - rel.q ) * FLY.off * ( Math.random() * 2 - 1 ) + cross / FLY.wind.at * FLY.wind.cross * L1 / 20;
		const tip = rod.tip, tx = tip.x + d.x * L1 - d.z * off, tz = tip.z + d.z * L1 + d.x * off;
		const u = new Vector3( tx - tip.x, 0, tz - tip.z ).normalize();
		this.shot = { L0: this.L, L1, rel, D: FLY.loop[ rel.kind ] || FLY.loop.good, u, lay: 0, hard: FLY.hard[ rel.kind ] || 1 };
		if ( rel.kind === 'heap' ) {

			this.stroke = 1;
			this.t = FLY.stroke + 2 * L1 / FLY.speed;

		}

		rod.setState( 'shoot' );
		game.baitHook();
		rod.flySink = BAITS[ game.hookBait ]?.sink || 0.2;
		const say = { tail: 'Too soon: a tailing loop, short and landing hard · let go as the rod stops', late: 'Too late: the loop had unrolled · let go as the rod stops on the forward cast', heap: 'Let go on the back cast: it fell in a heap · let go on the forward stroke' }[ rel.kind ];
		if ( say ) game.toast( say, 2400 );
		return rel;

	}

	// false casting stopped: the line in
	stop() {

		const rod = this.rod;
		rod.setState( 'idle' );
		rod.setRig( 'fly', true );
		this.stroke = 0;
		this.shot = null;

	}

	// ---- the fly on the water

	strip() {

		const rod = this.rod, game = this.game;
		if ( Math.hypot( rod.bobber.x - rod.tip.x, rod.bobber.z - rod.tip.z ) < FLY.inM ) {

			// (stripped all the way in: on the hook keeper)
			game.bite = null;
			this.stop();
			return;

		}

		this._moving = FLY.strip;
		this.lastStrip = this.now;
		this.strips ++;
		rod.hookM = Math.max( 0, rod.hookM - FLY.lift );

	}

	// the line ripped off the water into a back cast: held on, false cast; else laid straight back down
	pickUp( hold = false ) {

		const rod = this.rod, game = this.game, out = Math.hypot( rod.bobber.x - rod.tip.x, rod.bobber.z - rod.tip.z );
		game.bite = null;
		if ( out < FLY.inM + 1 ) return this.stop();
		_end.copy( rod.bobber );
		this.start( hold, out );
		this.dir.set( _end.x - rod.tip.x, 0, _end.z - rod.tip.z ).normalize();
		// (the line torn off the water, over whatever's under it)
		if ( game.flats ) game.flats.falseCast( rod.tip, _end );

	}

	// the strip-set: a fish that's eaten it hooked (a tarpon's bony mouth wants it twice)
	set() {

		const game = this.game, b = game.bite, need = FLY.sets[ b.species ] || 1;
		b.sets = ( b.sets || 0 ) + 1;
		if ( b.sets < need ) {

			b.t = Math.max( b.t, FLY.setMore );
			this._moving = 0.3;
			game.toast( 'Again: set it hard, it\'s a bony mouth', 1200 );
			return false;

		}

		game.strike();
		return true;

	}

	// the rod lifted instead: it mostly pulls the fly out of its mouth and away
	troutSet( rng = Math.random ) {

		const game = this.game;
		if ( rng() >= FLY.trout ) {

			game.strike();
			return true;

		}

		this._moving = FLY.troutPull;
		this.lastStrip = this.now;
		game.bite = { phase: 'wait', t: 6 + rng() * 6 };
		game.toast( 'You lifted the rod and pulled the fly out of its mouth · strip-set: the rod low, one long pull', 3200 );
		return false;

	}

	// how the fly's been worked, for a fish coming to it (Bites.workedTake)
	work() {

		const still = this.now - this.lastStrip;
		return { still, moving: still < 0.8 || this._moving > 0, strips: this.strips, fast: this._held };

	}

	// the bites' pace on a fly: a fly worked draws them, one left still hardly
	working() {

		return this.now - this.lastStrip < FLY.worked ? 1 : FLY.idle;

	}

	// the big button's word (ui/Actions.js): false casting, its word says when to let go
	label() {

		const rod = this.rod, st = rod.state;
		if ( st === 'falsecast' ) {

			if ( ! this.hold ) return 'Hold: false cast';
			const r = releaseOf( this.stroke, this.t, this.L );
			return r.kind === 'good' ? `Let go · ${ Math.round( this.L + ( this.fig.castM - this.fig.carryM ) * r.q ) } m` : 'False cast';

		}

		if ( st === 'shoot' ) return 'Shooting';
		return this.game.bite && this.game.bite.phase === 'take' ? 'Strip-set!' : 'Strip';

	}

	// the false cast as the others are sent it: how far through which stroke (- 1 to 1: a back stroke's negative)
	get phase() {

		return this.stroke * Math.min( 1, this.T > 0 ? this.t / this.T : 0 );

	}

	_whoosh( p ) {

		const au = this.game.app.audio;
		if ( au && au.whoosh ) au.whoosh( p );

	}

	// ---- each frame

	update( dt ) {

		this.now += dt;
		const rod = this.rod, st = rod.state, polled = this._polled;
		this._polled = false;
		if ( ! polled ) this._held = false; // (the button's only held while it's read)
		if ( st === 'falsecast' && ! polled ) this.stop(); // (a panel opened: the rod's input held, the line comes in)
		if ( rod.state === 'falsecast' ) this._false( dt );
		else if ( rod.state === 'shoot' ) this._shoot( dt );
		else if ( rod.state === 'floating' && rod.rig === 'fly' ) this._worked( dt );
		if ( rod.state !== 'falsecast' && rod.state !== 'shoot' ) {

			this.stroke = 0;
			rod.flyPose = rod.state === 'floating' && rod.rig === 'fly' ? { elev: FLY.elev.fished, bend: null } : null;
			if ( this.line ) this.line.hide();

		}

	}

	// the rod's elevation and its load at this moment of the stroke
	_pose( stroke, t, T ) {

		const s = smooth( t / FLY.stroke ), E = FLY.elev;
		if ( stroke < 0 ) return { elev: this._e0 + ( E.back - this._e0 ) * s + 0.08 * Math.max( 0, t - FLY.stroke ) / Math.max( 0.1, T - FLY.stroke ), bend: t < FLY.stroke ? FLY.bend.back : 0 };
		const after = smooth( ( t - FLY.stroke ) / Math.max( 0.1, T - FLY.stroke ) );
		return { elev: E.back + 0.08 + ( E.fwd - E.back - 0.08 ) * s + ( ( this.shot ? E.shot : E.follow ) - E.fwd ) * after, bend: t < FLY.stroke ? FLY.bend.fwd : 0 };

	}

	_false( dt ) {

		const rod = this.rod, fig = this.fig, game = this.game;
		this.dir.lerp( this._aim( _v ), 1 - Math.exp( - dt * 3 ) ).setY( 0 ).normalize();
		this.t += dt;
		// (a pick-up let go of: laid back down at the best moment of its forward stroke)
		if ( ! this.hold && this.stroke > 0 && this.t >= FLY.stroke + FLY.best ) {

			this.release();
			return this._shoot( 0 );

		}

		if ( this.t >= this.T ) {

			// the stroke's done, its line straight out over the water (or behind you): what's under it may be spooked
			const u = this.stroke;
			_end.copy( rod.tip ).addScaledVector( this.dir, u * this.L ).setY( rod.tip.y );
			if ( game.flats ) game.flats.falseCast( rod.tip, _end );
			if ( u > 0 ) {

				this.casts ++;
				this.L = Math.min( fig.carryM, this.L + FLY.gain );

			}

			this._e0 = u > 0 ? FLY.elev.follow : FLY.elev.back;
			this.stroke = - u;
			this.t -= this.T;
			this.T = strokeTime( this.L );
			this._whoosh( this.stroke > 0 ? 0.35 + 0.65 * this.L / fig.carryM : 0.3 );

		}

		rod.flyPose = this._pose( this.stroke, this.t, this.T );
		const fwd = this.stroke > 0, D = FLY.loop.good;
		_w.copy( this.dir ).multiplyScalar( this.stroke );
		const r = ( FLY.speed / 2 ) * Math.max( 0, this.t - FLY.stroke );
		loopShape( this.pts, rod.tip, _w, this.L, r, D, fwd ? FLY.rise.fwd : FLY.rise.back );
		rod.bobber.copy( this.pts[ 12 ] );
		this._draw();

	}

	_shoot( dt ) {

		const rod = this.rod, S = this.shot;
		if ( ! S ) return this.stop();
		this.t += dt;
		rod.flyPose = this._pose( 1, Math.min( this.t, this.T + 1 ), Math.max( this.T, FLY.stroke + 2 * S.L1 / FLY.speed ) );
		const r = ( FLY.speed / 2 ) * Math.max( 0, this.t - FLY.stroke ), L = S.L0 + ( S.L1 - S.L0 ) * Math.min( 1, r / S.L1 );
		if ( r >= S.L1 ) S.lay = Math.min( 1, S.lay + dt / FLY.laid );
		loopShape( this.pts, rod.tip, S.u, L, r, S.D, FLY.rise.fwd * ( 1 - S.lay ), S.lay, rod.waterY );
		rod.bobber.copy( this.pts[ 12 ] );
		this._draw();
		if ( S.lay >= 1 ) this._land();

	}

	// down: on the water it's fished, on sand it comes back in
	_land() {

		const rod = this.rod, S = this.shot, fly = this.pts[ 12 ];
		const ground = rod.terrain.heightAt( fly.x, fly.z ), onWater = rod.waterY > ground + 0.05;
		rod.bobber.set( fly.x, Math.max( rod.waterY, ground ), fly.z );
		rod.landedAt.copy( rod.bobber );
		rod.bobberVel.set( 0, 0, 0 );
		rod.hookM = 0;
		rod.settled = false;
		this.landing = { hard: S.hard, lineM: 0.75 };
		this.shot = null;
		this.stroke = 0;
		this.strips = 0;
		this.lastStrip = - 99;
		this._moving = 0;
		rod.setState( onWater ? 'floating' : 'retrieving' );
		if ( onWater && this.game.app.audio && this.game.app.audio.plop ) this.game.app.audio.plop( rod.bobber );
		if ( rod.onLand ) rod.onLand( onWater ? 'water' : 'ground' );
		if ( this.line ) this.line.hide();

	}

	// the fly fished: stripped toward you, a strip at a time or on and on while the button's held
	_worked( dt ) {

		const rod = this.rod;
		if ( this._held && this._moving <= 0 && this.now - this.lastStrip >= FLY.fast ) this.strip();
		if ( rod.state !== 'floating' || this._moving <= 0 ) return;
		const step = Math.min( this._moving, FLY.strip / FLY.stripS * dt );
		_v.set( rod.tip.x - rod.bobber.x, 0, rod.tip.z - rod.bobber.z );
		const d = _v.length();
		if ( d > 1e-3 ) rod.bobber.addScaledVector( _v.multiplyScalar( 1 / d ), Math.min( step, d ) );
		this._moving -= step;

	}

	_draw() {

		const rod = this.rod;
		if ( ! rod.rodMesh.visible ) {

			if ( this.line ) this.line.hide();
			return;

		}

		if ( ! this.line ) this.line = new FlyLine( this.game.app.scene );
		this.line.show( this.pts );

	}

}
