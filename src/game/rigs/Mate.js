import { Group, Quaternion, Vector3 } from '../../engine/index.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { seaHere } from '../Seaworthy.js';
import { Character } from '../Character.js';
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
//   m.where -> 'helm' | 'cockpit' | null    ((M21) where he is on her: at her helm, in her cockpit, or not aboard
//   m.wire() -> 0 | 1 | 2                   and that for your pose (Together's Mt); mateRead( Mt ) the other way
//
// (M21) Seen as one of the game's people (docs/m21/deckhand.md): the islander in a polo shirt and shorts (player-m1, one of the
// four looks players choose from: together/Avatar.js), on the clips the players' avatars use, standing in her cockpit
// (idle_neutral_01) or both hands on her wheel at her helm (trolley_idle). He's aboard whenever she's out with him (hired, and
// she's left her berth: as his day's paid), not at her berth nor hauled out, and only on her. His spots are hers
// (SportfisherModel.mateSpot): her cockpit's forward corner to port, and at her helm a step nearer the wheel than its stand, his
// arms reached to its rim after the clip (the players' trolley_idle holds the hands at the hips). From one place to the other is
// a cut: fading him out and in would be a program of its own (a skinned look drawn see-through), on materials he shares.
// Loaded the first time he's wanted, after the game's ready and after Joe's and Marta's looks (App.loadCharacters), as Pearl's
// boatman is (App.loadPerson); a player already wearing that look lends theirs (Together's looks). Until then, or if it doesn't
// load, the grey stand-in a player's drawn as while theirs loads (Figure.js), its arms on the wheel at her helm. Parented to her
// model (and to her copy on another's game, by her pose: Together._mate), so he sways with her; lit as the players are
// (App.lightPerson); on low drawn only near the camera, as the traders are there.
//   DECKHAND                                his look, his clips, how far off he's drawn
//   const d = new Deckhand( app )   d.update( where, model, parent, dt )   (Mate's, and each copy's: Together._mate)
//   mateSpot( model, where ) -> { x, y, z, yaw, grips? } (her frame) or null
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

// ---- (M21) him, seen

// his look and its two clips; how far off he's drawn (m): on low as the traders are there (App.nearDetail's 60), elsewhere as far
// as another player is (Together's PERSON_SEE); his clip played within `moving` m, his pose held further off
export const DECKHAND = {
	look: 'player-m1', stand: 'idle_neutral_01', helm: 'trolley_idle',
	far: { low: 60, mid: 800, high: 800 }, moving: 120,
};

// where he stands on her, in her frame ({ x, y, z, yaw, grips? }: yaw about up, 0 facing her bow), or null: her cockpit's spot, or
// at her helm, hers for him (SportfisherModel.mateSpot.helm: a step nearer her wheel than its stand, his hands on its rim: grips),
// or failing that its stand (where a figure's seen at it, clear of her seat), facing her bow as the helm does. A boat without a
// cockpit spot has no place for him there
const _spot = { x: 0, y: 0, z: 0, yaw: 0 };
export function mateSpot( M, where ) {

	if ( ! M ) return null;
	if ( where === 'cockpit' ) return M.mateSpot || null;
	if ( where !== 'helm' ) return null;
	if ( M.mateSpot && M.mateSpot.helm ) return M.mateSpot.helm;
	if ( ! M.helm ) return null;
	const h = M.helm, s = h.stand;
	_spot.x = s ? s[ 0 ] : h.x;
	_spot.z = s ? s[ 1 ] : h.z;
	_spot.y = Number.isFinite( h.y ) ? h.y : M.helmEye ? M.helmEye.y - 1.62 : 0;
	_spot.yaw = 0;
	return _spot;

}

// her pose's Mt: 1 her mate at her helm (as M19 sent it, so an older game still draws him there), 2 aboard in her cockpit (an older
// game draws nothing for it, as it did); anything else, not aboard
export const mateWire = ( where ) => where === 'helm' ? 1 : where === 'cockpit' ? 2 : 0;
export const mateRead = ( Mt ) => Mt === 1 ? 'helm' : Mt === 2 ? 'cockpit' : null;

// (nothing of him before the game's ready, nor before Joe's and Marta's looks have loaded (App.loadCharacters): their loading's
// the start's high point of script memory, and it comes after prepareLate has readied the stand-in's program (Together.compile))
const canShow = ( app ) => !! app._started && !! app._peopleIn;
const canLoad = ( app ) => canShow( app ) && typeof app.loadPerson === 'function';

// his look's model, loaded once for every deck hand drawn (yours, and on copies of others'): from a player already wearing it
// (Together._loadLook's, lit, compiled and its textures up), or loaded as Pearl's boatman is (App.loadPerson: lit, its programs
// compiled and first used and its textures uploaded before it's drawn, the clips but his two let go, its shape on the GPU
// alone). -> a promise of { scene, animations } (each deck hand a skinned clone of it), or of null if it didn't load
const LOOKS = new WeakMap();
export function deckhandLook( app ) {

	if ( LOOKS.has( app ) ) return LOOKS.get( app );
	const D = DECKHAND, clips = [ D.stand, D.helm ];
	const own = () => app.loadPerson( `models/characters/${ D.look }.glb`, clips ).then( ( c ) => ( { scene: c.group, animations: [ ...c.clips.values() ] } ) );
	const T = app.together, worn = T && T._looks && T._looks.get( D.look );
	const p = ( worn ? worn.then( ( g ) => g ? { scene: g.scene, animations: g.animations.filter( ( a ) => clips.includes( a.name ) ) } : own() ) : own() ).catch( ( e ) => {

		console.warn( 'The deck hand\'s look didn\'t load; his stand-in stays', e );
		return null;

	} );
	LOOKS.set( app, p );
	return p;

}

const _w = new Vector3(), _s = new Vector3(), _e = new Vector3(), _h = new Vector3(), _t = new Vector3(), _d = new Vector3();
const _p = new Vector3(), _u = new Vector3(), _v = new Vector3(), _q = new Quaternion(), _qa = new Quaternion(), _qb = new Quaternion();

// turn a bone by a rotation in the world (after the clip has posed it: Avatar's turnBoneBy)
function turnBy( bone, q ) {

	bone.parent.getWorldQuaternion( _qa );
	bone.getWorldQuaternion( _qb );
	bone.quaternion.copy( _qa.invert().multiply( _qb.premultiply( q ) ) );
	bone.updateMatrixWorld( true );

}

// an arm's wrist to `to` (world), `short` m shy of it toward the shoulder (the hand closes round it), the elbow bent out toward
// `pole` (a world direction): the upper arm and the forearm solved as a triangle of their own lengths
function reach( arm, fore, hand, to, pole, short ) {

	arm.getWorldPosition( _s );
	fore.getWorldPosition( _e );
	hand.getWorldPosition( _h );
	const a = _s.distanceTo( _e ), b = _e.distanceTo( _h );
	_d.subVectors( to, _s );
	const d = Math.min( Math.max( _d.length() - short, Math.abs( a - b ) + 1e-3 ), a + b - 1e-3 );
	_d.normalize();
	const cos = ( a * a + d * d - b * b ) / ( 2 * a * d ), sin = Math.sqrt( Math.max( 0, 1 - cos * cos ) );
	_p.copy( pole ).addScaledVector( _d, - pole.dot( _d ) ).normalize();
	_t.copy( _s ).addScaledVector( _d, a * cos ).addScaledVector( _p, a * sin ); // (the elbow)
	_q.setFromUnitVectors( _u.subVectors( _e, _s ).normalize(), _v.subVectors( _t, _s ).normalize() );
	turnBy( arm, _q );
	fore.getWorldPosition( _e );
	hand.getWorldPosition( _h );
	_t.copy( _s ).addScaledVector( _d, d ); // (the wrist)
	_q.setFromUnitVectors( _u.subVectors( _h, _e ).normalize(), _v.subVectors( _t, _e ).normalize() );
	turnBy( fore, _q );

}

const GRIP_SHORT = 0.05; // m: the wrist that far shy of the rim
const _pole = new Vector3();

export class Deckhand {

	constructor( app ) {

		this.app = app;
		this.root = new Group();
		this.root.name = 'Deckhand'; // (left out of a copy made from your boat: BoatCopies._template)
		this.root.visible = false;
		this.standIn = null; // (the grey figure until his look's in)
		this.character = null;
		this.bones = null; // (his arms, to reach to her wheel)
		this.where = null;
		this._loading = false;

	}

	// each frame: where he is ('helm', 'cockpit' or null: not aboard) on her (M: her model, whose spots), in `parent` (her group, or
	// her copy)
	update( where, M, parent, dt ) {

		const app = this.app, r = this.root, spot = parent && canShow( app ) ? mateSpot( M, where ) : null;
		if ( ! spot ) {

			// (out of her too: a boat you've left is let go (App.setBoat), and he'd hold on to her)
			r.visible = false;
			r.removeFromParent();
			return;

		}

		if ( r.parent !== parent ) parent.add( r );
		r.position.set( spot.x, spot.y, spot.z );
		r.rotation.set( 0, spot.yaw, 0 );
		// (near enough to be drawn: her frame now, not as last drawn: a game that isn't drawing hasn't one)
		parent.updateWorldMatrix( true, false );
		_w.set( spot.x, spot.y, spot.z ).applyMatrix4( parent.matrixWorld );
		const d = _w.distanceTo( app.camera.position );
		r.visible = d < ( DECKHAND.far[ app.tier ] ?? DECKHAND.far.high );
		if ( ! r.visible ) return;
		if ( ! this.character && ! this.standIn ) this._standIn();
		if ( ! this.character && ! this._loading && canLoad( app ) ) {

			this._loading = true;
			deckhandLook( app ).then( ( look ) => look && this._dress( look ) );

		}

		if ( where !== this.where ) {

			this.where = where;
			this._pose();

		}

		if ( this.character && d < DECKHAND.moving ) {

			this.character.update( dt );
			// (the players' trolley_idle holds the hands at the hips: his reach out to her wheel's rim after it)
			if ( where === 'helm' && spot.grips ) this._grip( spot.grips, parent );

		}

	}

	// both hands on her wheel at ten to two (grips: her frame, right then left), the elbows a little out and down
	_grip( grips, parent ) {

		const B = this.bones;
		if ( ! B || ! B.armR || ! B.armL ) return;
		this.root.updateMatrixWorld( true );
		for ( const [ k, side ] of [ [ 0, - 1 ], [ 1, 1 ] ] ) {

			const arm = side < 0 ? B.armR : B.armL, fore = side < 0 ? B.foreR : B.foreL, hand = side < 0 ? B.handR : B.handL;
			if ( ! fore || ! hand ) continue;
			_w.copy( grips[ k ] ).applyMatrix4( parent.matrixWorld );
			_pole.set( side * 0.7, - 0.7, 0 ).transformDirection( this.root.matrixWorld );
			reach( arm, fore, hand, _w, _pole, GRIP_SHORT );

		}

	}

	// standing, or both hands on her wheel: the clip from a random place in it (a cut from the other), or the stand-in's arms
	_pose() {

		const helm = this.where === 'helm', c = this.character;
		if ( c ) {

			const clip = helm ? DECKHAND.helm : DECKHAND.stand;
			if ( c.current !== clip ) c.play( clip, { fade: 0, loop: helm ? 'pingpong' : true, from: Math.random() * c.clipDuration( clip ) } );

		} else if ( this.standIn ) this.standIn.material.uniforms.avLimbs.value.set( 0, 0, helm ? 0.75 : 0.05, helm ? 0.75 : 0.05 );

	}

	// (lit as Together.compile lit the one it readied the program on, before ready)
	_standIn() {

		const s = this.standIn = figureStandIn();
		s.name = 'Deckhand:standIn';
		if ( this.app.lightUp ) this.app.lightUp( s );
		this.root.add( s );
		this._pose();

	}

	// his look, a skinned clone of the shared one: the clips its own, its shape, materials and textures shared
	_dress( look ) {

		const app = this.app, scene = cloneSkinned( look.scene );
		scene.position.set( 0, 0, 0 );
		scene.rotation.set( 0, 0, 0 );
		const c = new Character( { scene, animations: look.animations } );
		scene.traverse( ( o ) => {

			if ( ! o.isMesh ) return;
			o.castShadow = app.tier === 'high'; // (as the players' looks)
			// (skinned: its bounds the rest pose's, the template's or from its arrays while they're in script memory; else drawn
			// wherever it is)
			if ( o.isSkinnedMesh && ! o.boundingSphere ) {

				if ( o.geometry.attributes.position && o.geometry.attributes.position.array ) o.computeBoundingSphere();
				else o.frustumCulled = false;

			}

		} );
		if ( app.lightPerson ) app.lightPerson( scene );
		if ( this.standIn ) {

			this.root.remove( this.standIn );
			this.standIn.geometry.dispose();
			this.standIn.material.dispose();
			this.standIn = null;

		}

		const bone = ( re ) => {

			let found = null;
			scene.traverse( ( o ) => {

				if ( ! found && o.isBone && re.test( o.name ) ) found = o;

			} );
			return found;

		};

		this.bones = { armR: bone( /R_?UpperArm$/ ), foreR: bone( /R_?Forearm$/ ), handR: bone( /R_?Hand$/ ), armL: bone( /L_?UpperArm$/ ), foreL: bone( /L_?Forearm$/ ), handL: bone( /L_?Hand$/ ) };
		this.character = c;
		this.root.add( scene );
		this._pose();
		c.update( 0 );

	}

	dispose() {

		this.root.removeFromParent();
		if ( this.character ) this.character.mixer.stopAllAction();
		if ( this.standIn ) {

			this.standIn.geometry.dispose();
			this.standIn.material.dispose();

		}

	}

}

const _at = new Vector3();
const _helm = { th: 0, st: 0, err: 0, astern: false };

export class Mate {

	constructor( game ) {

		this.game = game;
		this.hand = null; // ((M21) him, seen: a Deckhand, made the first time he's aboard)
		this._said = false;

	}

	get app() {

		return this.game.app;

	}

	// ((M21) his figure, drawn or not (tools/two-players/crew.mjs reads it)
	get figure() {

		return this.hand ? this.hand.root : null;

	}

	// ((M21) aboard her: hired, she's the boat you're in, and she's out (she's left her berth, as his day's paid: _pay), not hauled
	// out. Not at her berth: there she's made fast and he's ashore till she goes out again (docs/m21/deckhand.md)
	get aboard() {

		const app = this.app, b = app.boatCtl, s = this.game.state && this.game.state.stats;
		return !! ( s && s.mate && b && app.boat && app.boat.id === 'sportfisher' && ! b.moored && ! b.hauled );

	}

	// ((M21) at her helm (backing her down), in her cockpit, or not aboard
	get where() {

		const b = this.app.boatCtl;
		return b && b.helmsman === 'mate' ? 'helm' : this.aboard ? 'cockpit' : null;

	}

	// ((M21) that, for your pose: Together's Mt)
	wire() {

		return mateWire( this.where );

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
		// ((M20) not only with her engines running: leaving her helm stops them (Hull), so he never took her. He starts her, as
		// taking her helm does (her hull cranks her once she's driven))
		const can = !! fish && ! b.moored && ! b.hauled && ! b.beached && ! human && g.state.fuelL > 0;
		if ( can ) this._drive( dt, fish );
		else if ( b.helmsman === 'mate' ) this.handBack();
		this._seen( dt );

	}

	// ((M21) him, where he is on her: made the first time he's aboard, and in the boat you're in now (App.setBoat builds her again)
	_seen( dt ) {

		const app = this.app, M = app.boat, where = this.where;
		if ( ! where && ! this.hand ) return;
		this.hand = this.hand || new Deckhand( app );
		this.hand.update( where, M, M && M.group, dt );

	}

	_drive( dt, fish ) {

		const g = this.game, b = this.app.boatCtl;
		if ( b.helmsman !== 'mate' ) {

			b.helmsman = 'mate';
			b.driven = true;
			b.moored = false;
			if ( ! this._said ) g.toast( 'Your mate has her helm: he\'ll back her down on it', 2800 );
			this._said = true;
			// ((M21) the bridge's wheel and lever move under his hands, not the tower's if that was the last you took)
			const M = this.app.boat;
			if ( M && M.helm && 'helmInUse' in M ) M.helmInUse = M.helm;

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
