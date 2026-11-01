import { Euler, Group, MathUtils, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from '../../../engine/index.js';
import { G } from '../../../core/Globals.js';
import { Vessel } from '../Vessel.js';
import { Avatar } from '../../../together/Avatar.js';
import { SPRAY } from '../../../fx/Spray.js';
import { KayakLines } from './KayakLines.js';
import { kayakBody, paddleGeometry } from './KayakHull.js';
import { KAYAK_HANDLING, Stroke } from './Paddle.js';
import { dryFrom, layOn, waterFrom } from './Shore.js';
import { Drops } from './Drops.js';
import { TUMBLE_B, capsizeHeel, breakerCapsizes, spillShare, climbSeconds, soakStep, SOAKED } from './Capsize.js';

const _mid = new Vector3(), _dir = new Vector3(), _up = new Vector3(), _z = new Vector3(), _m = new Matrix4();
const _l = new Vector3(), _r = new Vector3(), _w = new Vector3(), _v = new Vector3(), _fwd = new Vector3();
const _breaker = { n: 0, H: 0, b: - 9, dx: 0, dz: 1 };
const GRACE = 6; // s
const _seat = { left: null, right: null, twist: 0, lean: 0 };

const app_ui = ( game ) => ( game.app.ui && game.app.ui.ui ? game.app.ui.ui.root : null );

// where she's kept when she's brought home, with no berth to go by: on the sand beside the pier's foot (fleet/Berths.js)
const HOME = { x: 44, z: - 24 }; // m

// (M16) The fishing kayak: 12 ft, paddled, sat in. What she's made of is in KayakHull.js, how she's driven in Paddle.js,
// how she's sat in in Seat.js. Everything's in `body`, which is what turns over when she capsizes (the rigid body under
// it stays upright: there's nothing a keel-up kayak's physics would add but trouble).
//
// What she does beyond the rest of the fleet is here: play( dt, game ), each frame (Game.updateBoat): the paddle's
// splashes, you in her, a capsize and righting her, launching and landing, getting soaked.
const LEFT_TURNED = 0.7;

export class KayakModel extends Vessel {

	constructor() {

		super( 'kayak' );
		const L = this.lines = new KayakLines();
		this.handling = KAYAK_HANDLING;
		this.seated = true;
		this.lowCopy = [ 'boat-hull', 'boat-paddle' ];
		this.body = new Group();
		this.body.name = 'kayak-body';
		this.group.add( this.body );

		const { geometry, deck, fitted } = kayakBody( L );
		this.deck = deck;
		this._fitted = fitted;
		this._fullPositions = geometry.attributes.position.array.slice();
		const hull = this.materials.hull = new MeshStandardMaterial( { vertexColors: true, roughness: 0.42, metalness: 0 } );
		hull.name = 'kayakHull';
		const mesh = new Mesh( geometry, hull );
		mesh.name = 'boat-hull';
		mesh.castShadow = mesh.receiveShadow = true;
		this.body.add( mesh );
		this.meshes.hull = mesh;

		const blade = this.materials.paddle = new MeshStandardMaterial( { vertexColors: true, roughness: 0.45, metalness: 0.05 } );
		blade.name = 'kayakPaddle';
		const paddle = new Mesh( paddleGeometry(), blade );
		paddle.name = 'boat-paddle';
		paddle.castShadow = true;
		paddle.matrixAutoUpdate = false;
		paddle.frustumCulled = false;
		this.body.add( paddle );
		this.meshes.paddle = paddle;

		this.floatBody( { keelBottom: - 0.122, roofHeight: L.sheerY( 1 ), comY: 0.2, gyration: [ 0.42, 0.19, 0.2 ] } );

		const sz = deck.seatZ, seatZ = ( sz[ 0 ] + sz[ 1 ] ) / 2 - 0.04, seatY = deck.y( 0, seatZ ) + 0.045;
		this.seat = new Vector3( 0, seatY, seatZ );
		this.helmEye = new Vector3( 0, seatY + 0.87, seatZ + 0.08 ); // (as a person's sat up on her seat)
		this.helm = { x: 0, z: seatZ, eye: this.helmEye, rise: [ 0.5, seatZ ] };
		this.stroke = new Stroke( seatZ );
		this.boardPoint = new Vector3( 0, seatY, seatZ );
		this.boardReach = 2.3;
		// (out over either side, about the seat)
		this.exitPoints = this.railPoints( [ seatZ - 0.5, seatZ, seatZ + 0.5, seatZ + 1.1 ] );
		this.overSide = 0.95;
		this.propeller = new Vector3( 0, - 0.08, L.zAft + 0.25 );
		this.rudder = new Vector3( 0, - 0.08, L.zAft + 0.25 );
		this.bowSprayPoints = this.waterlinePoints( [ 0.9, 1.05, 1.2, 1.35 ] );
		this.colliders = [];
		this.rainTops = [ { x0: - 0.28, x1: 0.28, z0: deck.cockZ[ 0 ], z1: deck.cockZ[ 1 ], y: 0.06 }, { x0: - 0.24, x1: 0.24, z0: deck.wellZ[ 0 ], z1: deck.wellZ[ 1 ], y: 0.09 } ];
		this.shelter = this.shelterBox( 0.001, - 100, - 99, 0, 1 ); // (nothing's under cover)
		this.wake = { quarterX: 0.3, quarterZ: - 1, washZ: L.zAft - 0.1 };
		// (the all-round white on the safety pole)
		this.lamps = { masthead: [ - 0.14, 1.14, L.zAft + L.length * 0.1 - 0.02 ] };
		this.perch = new Vector3( 0, deck.y( 0, deck.wellZ[ 1 ] - 0.1 ), deck.wellZ[ 1 ] - 0.1 ); // (a rider: together/)

		this.fit( {} );
		this.euler = new Euler( 0, 0, 0, 'YXZ' ); // (Seat's)
		this.drops = new Drops();
		this.capsized = false;
		this.righting = false;
		this.sliding = null; // { x0, z0, h0, x1, z1, h1, t, T }: going down the sand into the water
		this.climbTime = climbSeconds( false );
		this.figure = null;
		this._roll = 0;
		this._rollTo = 0;
		this._over = 0;
		this._crest = null;
		this._canT = 0;
		this._can = false;
		this._game = null;
		this._soakSaid = false;
		this.update( 0 );

	}

	// ---- the paddle where the stroke has it

	// a paddle mesh (hers, or a copy's: together/) posed where her stroke is
	posePaddle( p ) {

		const st = this.stroke;
		st.pose( _mid, _dir );
		// (its blades' faces square to her length: its local y turned from the shaft toward her bow; laid along her,
		// flat on the gunwale)
		_z.set( 0, 0, 1 );
		if ( st.park > 0.5 ) _z.set( 0, 1, 0 );
		_up.copy( _z ).addScaledVector( _dir, - _z.dot( _dir ) ).normalize();
		_z.crossVectors( _dir, _up );
		_m.makeBasis( _dir, _up, _z ).setPosition( _mid );
		p.matrix.copy( _m );
		p.matrixWorldNeedsUpdate = true;

	}

	update( dt ) {

		this.posePaddle( this.meshes.paddle );
		// (turned over and back)
		if ( this._roll !== this._rollTo ) {

			const go = dt * ( this.righting ? 2.6 : 4.4 ), d = this._rollTo - this._roll;
			this._roll += Math.sign( d ) * Math.min( Math.abs( d ), go * ( 0.35 + Math.abs( Math.sin( this._roll ) ) ) );
			this.body.rotation.z = this._roll;
			this.body.position.y = 0.075 * Math.abs( Math.sin( this._roll / 2 ) );
			if ( this.righting && this._roll === 0 ) this.righting = this.capsized = false;

		}

	}

	// (together/) what the others are told of her: the stroke, and whether she's over
	get sent() {

		return [ ...this.stroke.wire, this.capsized ? 1 : 0 ];

	}

	// (together/) a copy of her posed from that: its paddle and its turn over. Returns the seat for whoever's in it (null:
	// nobody's sitting in her, she's over)
	poseCopy( copy, w ) {

		this.stroke.wire = w;
		const paddle = copy.getObjectByName( 'boat-paddle' ), body = copy.getObjectByName( 'kayak-body' );
		if ( paddle ) this.posePaddle( paddle );
		if ( body ) body.rotation.z += ( ( w[ 4 ] ? Math.PI : 0 ) - body.rotation.z ) * 0.1;
		return w[ 4 ] ? null : this.seatFor( copy );

	}

	soleY() {

		return this.seat.y;

	}

	// (nobody walks her: where you sit)
	clampToDeck( p ) {

		p.set( this.seat.x, this.seat.y, this.seat.z );

	}

	fwdOf( ctl ) {

		return ctl.forward( _fwd );

	}

	// ---- what's fitted to her: the small cooler, or Marta's crate in its place; the finder's puck; the anchor trolley. Each
	// is in her one mesh, its vertices folded to a point while it's not there (no new draw, and they're in her count)
	fit( stats ) {

		const show = { cooler: ! ( stats.holdKg > 12 ), crate: stats.holdKg > 12, puck: !! stats.finder, trolley: stats.anchorM > 0 || !! stats.trolley };
		const key = Object.values( show ).join();
		if ( key === this._fitKey ) return;
		this._fitKey = key;
		const pos = this.meshes.hull.geometry.attributes.position, full = this._fullPositions;
		for ( const k in show ) {

			const { start, count } = this._fitted[ k ];
			for ( let i = start * 3, n = ( start + count ) * 3; i < n; i ++ ) pos.array[ i ] = show[ k ] ? full[ i ] : full[ start * 3 + i % 3 ];

		}

		pos.needsUpdate = true;

	}

	// ---- what Player asks

	// the word on the prompt beside her
	get boardText() {

		const p = this._game && this._game.app.player;
		if ( this.righting ) return 'Righting her';
		if ( this.capsized ) return 'Right her';
		if ( p && p.boat.beached ) return 'Push her off and get in';
		return p && p.mode === 'swim' ? 'Climb back on' : 'Get in';

	}

	// getting in; false if that's not what happens (she's over: E rights her)
	board( ctl, p ) {

		if ( this.righting ) return false;
		if ( this.capsized ) {

			this.righting = true;
			this._rollTo = 0;
			if ( p.audio ) p.audio.splash( 0.5, p.position );
			return false;

		}

		this._settle = GRACE;
		if ( ctl.beached && ! this.sliding ) {

			const to = waterFrom( ctl.terrain, G.seaLevel.value, ctl.position.x, ctl.position.z );
			if ( to ) this.sliding = { x0: ctl.position.x, z0: ctl.position.z, h0: ctl.getYaw(), x1: to.x, z1: to.z, h1: to.heading, t: 0, T: MathUtils.clamp( to.metres / 2, 0.7, 5.5 ) };

		}

		return true;

	}

	// whether the sand's there to pull her up
	canPullUp( ctl ) {

		const now = performance.now();
		if ( now > this._canT ) {

			this._canT = now + 300;
			this._can = !! dryFrom( ctl.terrain, G.seaLevel.value, ctl.position.x, ctl.position.z );

		}

		return this._can;

	}

	// getting out: onto what's there (target: Player.ashoreTarget), and she's pulled up the sand; or over the side
	leave( ctl, p, target ) {

		const dry = target ? dryFrom( ctl.terrain, G.seaLevel.value, ctl.position.x, ctl.position.z ) : null;
		p.exitBoat( target, target ? 0 : 1 );
		if ( ! dry ) {

			// (stepped out onto a jetty or a rock, you take her painter)
			if ( target ) {

				ctl.moored = true;
				ctl.mooring.anchor.set( ctl.position.x, 0, ctl.position.z );
				ctl.mooring.heading = ctl.getYaw();

			}

			return;

		}

		const go = () => {

			this.lie( ctl, dry.x, dry.z, dry.heading );
			this._standBy( ctl, p, dry.heading );
			if ( this._game ) this._game.state.save();

		};

		const time = this._game && this._game.time;
		if ( time && time.dim() ) setTimeout( go, 230 );
		else go();

	}

	// you beside her on the sand, having done it, looking at her
	_standBy( ctl, p, heading ) {

		const c = Math.cos( heading ), s = Math.sin( heading ), x = ctl.position.x + c * 1.1 + s * 0.4, z = ctl.position.z - s * 1.1 + c * 0.4;
		p.position.set( x, p.groundAt( x, z, 40 ), z );
		p.yaw = Math.atan2( x - ctl.position.x, z - ctl.position.z );
		p.velocity.set( 0, 0, 0 );
		p._camY = null;

	}

	// a tow or a rescue has left her somewhere, and got you up out of the seat (Player.updateDeck): beside her if she's on
	// the sand, otherwise still sat in her (on Pearl's mooring); someone else's you were riding, into the water
	setDown( ctl, p ) {

		if ( ! ctl.beached ) return p.riding || ctl.helmFree === false ? p.exitBoat( null, 1 ) : p.takeHelm();
		p.exitBoat( { out: ctl.position, g: ctl.position.y } );
		ctl.moored = false;
		this._standBy( ctl, p, ctl.getYaw() );

	}

	// lying on the sand at ( x, z ), out of the sea's reach
	lie( ctl, x, z, heading ) {

		layOn( ctl.terrain, G.seaLevel.value, x, z, heading, ctl.position, ctl.quaternion );
		ctl.velocity.set( 0, 0, 0 );
		ctl.angular.set( 0, 0, 0 );
		ctl.speed = 0;
		ctl.beached = true;
		ctl.moored = false;
		ctl.anchor = null;
		ctl.apply();

	}

	// she's kept on the sand (BoatController: her start, Marta's tow, the safety net; where she's kept comes from the
	// fleet's berths, once they're there)
	atHome( ctl ) {

		const b = ctl.berth && ctl.berth.position, spot = dryFrom( ctl.terrain, G.seaLevel.value, b ? b.x : HOME.x, b ? b.z : HOME.z, 60 );
		this.capsized = this.righting = false;
		this._roll = this._rollTo = 0;
		this.body.rotation.z = 0;
		this.body.position.y = 0;
		this.sliding = null;
		// ((M16) left at an angle to the water, as people leave them, and so her side shows from up the beach)
		if ( spot ) this.lie( ctl, spot.x, spot.z, spot.heading + LEFT_TURNED );
		else ctl.beached = false;

	}

	// where she was left, on your return (App.pickUp): back on the sand, if that's where it is
	rest( ctl, x, z ) {

		const T = ctl.terrain, sea = G.seaLevel.value;
		if ( T.heightAt( x, z ) > sea - 0.1 ) this.lie( ctl, x, z, ctl.getYaw() );

	}

	// ---- each frame, aboard or not (Game.updateBoat)

	play( dt, game ) {

		this._game = game;
		const app = game.app, ctl = app.boatCtl, p = app.player, st = this.stroke, stats = game.state.stats;
		const aboard = p.mode === 'boat' && p.boat === ctl;
		this.climbTime = climbSeconds( !! stats.lifeJacket );
		st.power = stats.speedMul || 1;
		this.fit( stats );

		// (the controller's not running while she's on the sand)
		if ( ctl.beached && ! aboard ) {

			st.park = 1;
			st.kind = null;

		}

		this.playStrokes( ctl, app, aboard );
		this.playSlide( dt, ctl, app );
		if ( ctl.beached && ! this.sliding && G.seaLevel.value > ctl.position.y - 0.02 ) {

			// (a surge has come up the sand and floated her off)
			ctl.beached = false;
			ctl.hasWater = false;

		}

		// (a fish on tows her, as hard as it pulls: a 3 kg redfish turns her, a big one takes her for a ride)
		if ( aboard && game.fight && game.rod && game.rod.bobber ) {

			_w.copy( game.rod.bobber ).sub( ctl.position ).setY( 0 ).normalize();
			st.tow.copy( _w ).multiplyScalar( ( game.fight.tension || 0 ) * Math.min( 110, 14 + 7 * ( game.fight.kg || 0 ) ) );

		} else st.tow.set( 0, 0, 0 );

		this.playFigure( dt, app, ctl, p, aboard );
		if ( aboard && ! this.sliding && ! this.capsized ) this.playCapsize( dt, game, ctl, p );
		this.playSoak( dt, game, ctl, p, aboard );

	}

	// the blade going in and coming out
	playStrokes( ctl, app, aboard ) {

		const st = this.stroke;
		if ( ! st.events.length ) return;
		for ( const e of st.events ) {

			ctl.toWorld( e.at, _w );
			if ( app.spray ) {

				const k = Math.min( 1, e.f / 2 );
				if ( e.kind === 'catch' ) app.spray.emit( _w, _v.set( 0, 0.7 + k, 0 ), 3 + Math.round( 8 * k ), 0.02, SPRAY.DROPLET, { spread: 0.8, jitter: 0.08, life: 0.5 } );
				else app.spray.emit( _w, _v.set( 0, 0.5 + 0.8 * k, 0 ), 6, 0.016, SPRAY.DROPLET, { spread: 0.5, jitter: 0.1, life: 0.7 } );

			}

			if ( e.kind === 'catch' && aboard && app.audio && app.audio.paddleStroke ) app.audio.paddleStroke( Math.min( 1, e.f / 2 ) );

		}

		st.events.length = 0;

	}

	// shoved down the sand, you in her: then she's afloat
	playSlide( dt, ctl, app ) {

		const S = this.sliding;
		if ( ! S ) return;
		S.t += dt;
		const k = MathUtils.smoothstep( S.t, 0, S.T ), a = S.h1 - S.h0, turn = Math.atan2( Math.sin( a ), Math.cos( a ) );
		layOn( ctl.terrain, G.seaLevel.value, MathUtils.lerp( S.x0, S.x1, k ), MathUtils.lerp( S.z0, S.z1, k ), S.h0 + turn * Math.min( 1, k * 1.6 ), ctl.position, ctl.quaternion );
		ctl.apply();
		if ( S.t >= S.T ) {

			this.sliding = null;
			ctl.beached = false;
			ctl.hasWater = false;
			ctl.position.y = G.seaLevel.value;
			ctl.forward( _v );
			ctl.velocity.copy( _v ).multiplyScalar( 0.8 );
			if ( app.audio ) app.audio.splash( 0.3, ctl.position );

		}

	}

	// you, in her: seen from the chase camera and looking down from the seat
	playFigure( dt, app, ctl, p, aboard ) {

		if ( ! aboard ) {

			if ( this.figure ) this.figure.group.visible = false;
			return;

		}

		const T = app.together;
		const look = T && T.myLook;
		if ( look && ( ! this.figure || this._look !== look ) && ! this._wearing ) {

			this._wearing = true;
			T._loadLook( look ).then( ( gltf ) => {

				this._wearing = false;
				this._look = look;
				if ( ! gltf || this._gone ) return;
				if ( ! this.figure ) {

					// (in the scene, not in her group: the others' copies of her are clones of that: together/BoatCopies)
					this.figure = new Avatar( { id: 'me', name: '' } );
					this._scene = app.scene;
					app.scene.add( this.figure.group );

				}

				this.figure.seatBones = null;
				this.figure.setLook( gltf, { shadows: app.tier === 'high' } );
				app.lightPerson( this.figure.group );

			} );

		}

		const F = this.figure;
		if ( ! F ) return;
		F.group.visible = true;
		const st = this.stroke, own = p.camMode === 'first' || p.handsFull || p.busy;
		ctl.toWorld( this.seat, F.group.position );
		F.group.quaternion.copy( ctl.quaternion );
		F.pose( { mode: 'helm', speed: 0, seat: this.seatFor( this.group ) }, dt );
		const head = F.seatBones && F.seatBones.head;
		if ( head ) head.scale.setScalar( own ? 0.001 : 1 );

	}

	// where someone sat in her holds the paddle, for Avatar.pose's seat. boat: her group, or a copy's
	seatFor( boat ) {

		const st = this.stroke, held = st.park < 0.5;
		if ( held ) {

			st.pose( _mid, _dir );
			st.hands( _r, _l, _mid, _dir );
			boat.updateMatrixWorld( true );
			boat.localToWorld( _r );
			boat.localToWorld( _l );

		}

		_seat.left = held ? _l : null;
		_seat.right = held ? _r : null;
		_seat.twist = held ? - st.swing * 0.55 : 0;
		_seat.lean = 0.06 + 0.16 * ( held ? 1 - st.rest : 0 );
		return _seat;

	}

	// She goes over when she's heeled past what you can hold (bracing with the paddle, a good deal; with a rod in your
	// hands, not much), or a breaker comes down on her beam (Capsize.js)
	playCapsize( dt, game, ctl, p ) {

		// (getting settled, you've a few seconds' grace: nobody's dumped again the moment they're back aboard)
		if ( ( this._settle = ( this._settle || 0 ) - dt ) > 0 ) return;
		_up.set( 0, 1, 0 ).applyQuaternion( ctl.quaternion );
		const heel = Math.asin( Math.min( 1, Math.hypot( _up.x, _up.z ) ) );
		const limit = capsizeHeel( !! this.stroke.kind && this.stroke.park === 0, p.handsFull || p.busy );
		this._over = heel > limit ? this._over + dt : Math.max( 0, this._over - dt * 2 );
		let over = this._over > 0.18;
		const q = ctl.query, x = ctl.position.x, z = ctl.position.z;
		if ( ! over && q.breakerAt ) {

			const br = q.breakerAt( x, z, undefined, _breaker );
			if ( br ) {

				const passed = this._crest !== null && br.n === this._crest + 1;
				this._crest = br.n;
				ctl.forward( _v );
				if ( passed && br.b > TUMBLE_B && breakerCapsizes( br.H, Math.abs( _v.x * br.dx + _v.z * br.dz ) ) ) over = true;

			}

		}

		// (her high side comes up and over)
		if ( over ) this.capsize( game, ctl, p, _v.set( 1, 0, 0 ).applyQuaternion( ctl.quaternion ).y >= 0 ? 1 : - 1 );

	}

	// over she goes, and you with her, to leeward. side: + her port side coming up and over
	capsize( game, ctl, p, side ) {

		this.capsized = true;
		this.righting = false;
		this._over = 0;
		this._rollTo = side * Math.PI;
		const st = this.stroke, stats = game.state.stats, s = game.state;
		st.kind = null;
		st.phase = 1;
		st.park = 1;
		p.exitBoat( null, - side );
		p.soak = 1;
		p.breath = Math.min( p.breath, p.breathMax * ( stats.lifeJacket ? 0.9 : 0.6 ) );
		// (the lid pops, and what's in the cooler goes)
		const n = s.inventory.length, lost = Math.ceil( n * spillShare( !! stats.lifeJacket, !! stats.dryHatch ) - 1e-9 );
		if ( lost > 0 ) {

			s.inventory.length = n - lost;
			s.save();
			s.emit();

		}

		game.toast( `She's over!${ lost ? ` ${ lost === 1 ? 'A fish' : `${ lost } fish` } washed out of the cooler ·` : ' ·' } swim to her and right her`, 5200 );

	}

	// Low to the water: the rain, and any spray or sea that comes aboard, soak you
	playSoak( dt, game, ctl, p, aboard ) {

		if ( p.mode === 'swim' ) p.soak = 1;
		let wash = 0;
		if ( aboard && ctl.hasWater && ! ctl.beached ) {

			for ( let i = 0; i < ctl.samples.length; i ++ ) wash = Math.max( wash, ctl.hEff[ i ] - ctl.position.y );

		}

		const U = game.app.weather ? game.app.weather.windAt( ctl.position.x, ctl.position.z ) : 0;
		p.soak = soakStep( p.soak || 0, dt, { rain: aboard || p.mode === 'walk' ? G.rain.value : 0, wash: aboard ? wash : 0, wind: aboard ? U : 0, sheltered: p.sheltered } );
		if ( aboard && p.soak > SOAKED && ! this._soakSaid ) {

			this._soakSaid = true;
			game.toast( 'You\'re soaked through · she sits low, and it all comes aboard', 3200 );

		} else if ( p.soak < 0.2 ) this._soakSaid = false;
		this.drops.update( dt, aboard && ( p.camMode === 'first' || p.handsFull || p.busy ), G.rain.value, wash, app_ui( game ) );
		// (a sea over her deck throws some about)
		if ( aboard && wash > 0.17 && game.app.spray && Math.random() < dt * 6 ) {

			ctl.toWorld( _v.set( ( Math.random() - 0.5 ) * 0.7, 0.18, ( Math.random() - 0.5 ) * 1.6 ), _w );
			game.app.spray.emit( _w, _v.set( 0, 1.2, 0 ), 14, 0.03, SPRAY.DROPLET, { spread: 1.1, jitter: 0.2, life: 0.8 } );

		}

	}

	dispose() {

		this._gone = true;
		if ( this.figure ) {

			this.figure.group.removeFromParent();
			this.figure.dispose();
			this.figure = null;

		}

		this.drops.dispose();
		for ( const m of Object.values( this.meshes ) ) m.geometry.dispose();
		this.materials.hull.dispose();
		this.materials.paddle.dispose();

	}

}
