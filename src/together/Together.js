import { Vector3, Quaternion, Matrix4, MathUtils } from '../engine/index.js';
import { gltfLoader } from '@allthespaces/portal/three';
import { Avatar } from './Avatar.js';
import { figureStandIn } from './Figure.js';
import { RecordsBoard } from './RecordsBoard.js';
import { FISH, fishLengthCm } from '../game/FishTable.js';
import { ROD_L, SEAT_Y } from '../game/FishingRod.js';
import { WORLD } from '../world/WorldLayout.js';

// (Salt Life) Playing together: whoever else is on the island (portal.session, All the Spaces), drawn
// where they are, doing what they do. Light, drop-in: everyone keeps their own progress and their own
// fish; what's shared is
//  - where each of you is: a pose message about ten times a second while anyone else is here ('p'),
//    shown a little behind (DELAY) and eased between, so it moves smoothly
//  - the time of day: one clock for everyone (the shared value 'clock': { at, hour, speed }), which
//    the host sets if there's none, and T changes for all
//  - catches: a message to the others ('catch'), who see a toast, the fish on your line and you
//    cheering
//  - the island's records: each species' heaviest fish anyone in the group has landed, who and when,
//    in the group's shared save ('records': kept between visits), chalked on a board at Joe's stand
//    (RecordsBoard) and listed in the cooler
// Each other player is one of four islanders (Avatar.js: Rocketbox characters, as Joe and Marta),
// walking, running, swimming, at the helm or holding a rod as they are, with their name over them in
// their colour and a dot on the minimap; they wave when you meet; their boat is a copy of yours (its meshes, no new shaders), out at sea; their rod, line and
// bobber are the rod's (FishingRod.tackle). Their wakes, spray and sounds aren't drawn.
//   const t = new Together( app );  t.update( dt )  (after the game: the camera is placed)
//   t.syncClock( settings )  (each frame: the time of day from the shared clock)
//   t.setClock( hour, speed )  (T)

const SEND = 0.1; // s between poses
const DELAY = 0.15; // s behind the newest pose: room to ease between two
const STALE = 6; // s without a pose: not shown
const TAG_FAR = 70; // m: names fade out toward here
const LIMITS = { low: { avatars: 4, boats: 1 }, mid: { avatars: 8, boats: 2 }, high: { avatars: 15, boats: 6 } }; // (the nearest; triangles)
const WAVE_NEAR = 4; // m: they wave the first time you meet
const MODES = { walk: 'w', swim: 's', deck: 'd', boat: 'h' };
const NAMES = { w: 'walk', s: 'swim', d: 'deck', h: 'helm' };
// the rod: 0 put away, 1 held, 2 drawn back to cast, 3 cast, 4 line out, 5 a fish on, 6 landing it;
// and how it's held then (rad above level: past a right angle, back over the shoulder)
const ROD = { stowed: 0, idle: 1, windup: 2, flick: 3, flying: 3, floating: 4, retrieving: 4, fighting: 5, landing: 6 };
const ROD_ELEV = [ 0, 0.5, 1.95, 0.18, 0.45, 0.95, 0.9 ];
const LOW_BOAT = [ 'boat-hull', 'boat-gelcoat', 'boat-wood', 'boat-glass' ]; // (low: the boat without its gear)
const EYE = 1.62;

const CSS = /* css */`
.sl-tags { position: absolute; inset: 0; overflow: hidden; pointer-events: none; }
.sl-tag { position: absolute; left: 0; top: 0; padding: 2px 8px 2px 6px; border-radius: 10px; white-space: nowrap;
	font: 600 12px var(--tw-font); color: var(--tw-ink, #e8f2f6); background: rgba(12, 18, 26, 0.55);
	text-shadow: 0 1px 2px rgba(0,0,0,0.6); will-change: transform; display: none; }
.sl-tag > i { display: inline-block; width: 8px; height: 8px; margin-right: 5px; border-radius: 50%; vertical-align: 0; }
`;

const r2 = ( v ) => Math.round( v * 100 ) / 100;
const r3 = ( v ) => Math.round( v * 1000 ) / 1000;
const _p = new Vector3(), _q = new Vector3(), _tip = new Vector3(), _hand = new Vector3(), _d = new Vector3();
const _x = new Vector3(), _y = new Vector3(), _z = new Vector3(), _up = new Vector3( 0, 1, 0 );
const _qa = new Quaternion(), _qb = new Quaternion(), _m = new Matrix4();
const _bp = new Vector3(), _bq = new Quaternion();

export class Together {

	constructor( app ) {

		this.app = app;
		this.portal = app.portal;
		this.session = app.portal.session;
		this.me = app.portal.me;
		this.limits = LIMITS[ app.tier ] || LIMITS.low;
		this.others = new Map(); // id -> Remote
		this.ready = ! app.cpuGL; // (devices that draw on the CPU: once prepareLate has the shaders)
		this.stale = STALE;
		this._sendT = 0;
		this._clock = null; // the shared clock, as adopted
		this._tags = null;
		this._boatTemplate = null;

		const s = this.session;
		this._sync( s.players, true );
		s.onPlayers( ( players ) => this._sync( players, false ) );
		s.on( 'p', ( body, from ) => this._pose( body, from ) );
		const clock = s.get( 'clock' );
		if ( clock ) this._adopt( clock );
		else if ( s.isHost ) this.setClock( app.settings.timeOfDay, app.settings.timeSpeed );
		s.onChange( 'clock', ( value ) => this._adopt( value ) );
		s.on( 'catch', ( body, from ) => this._theirCatch( body, from ) );

		// the records: the group's, read now and again when someone breaks one
		this.records = {};
		this.board = new RecordsBoard( { terrain: app.terrainData } );
		app.lightUp( this.board.group );
		// (on a device that draws on its CPU, after the start: its shader is load time)
		if ( this.ready ) app.scene.add( this.board.group );
		this._readRecords();

	}

	// ---- catches and records

	_readRecords() {

		return this.portal.save.shared.get( 'records' ).then( ( r ) => this._setRecords( r ) ).catch( ( e ) => console.warn( 'records', e ) );

	}

	_setRecords( r ) {

		if ( ! r || typeof r !== 'object' ) r = {};
		const clean = {};
		for ( const [ k, v ] of Object.entries( r ) ) if ( FISH[ k ] && v && typeof v.kg === 'number' ) clean[ k ] = v;
		this.records = clean;
		this.board.draw( clean );
		if ( this.app.game.hud && this.app.game.hud.inv && ! this.app.game.hud.inv.hidden ) this.app.game.hud.renderInventory();

	}

	// a fish landed here: is it the island's heaviest of its kind? (from what's known now; the shared
	// save is then brought up to date, and the others told)
	caught( species, kg, cm ) {

		const held = this.records[ species ];
		const island = ! held || kg > held.kg;
		const tell = ( record ) => {

			if ( this.others.size ) this.session.send( 'catch', { s: species, kg: r3( kg ), cm, rec: record } );

		};
		if ( ! island ) {

			tell( false );
			return { island: false, held };

		}

		const mine = { kg: r3( kg ), cm, who: this.me.name, id: this.me.id, at: Date.now() };
		this.portal.save.shared.update( 'records', ( cur ) => {

			const next = cur && typeof cur === 'object' ? { ...cur } : {};
			const r = next[ species ];
			if ( ! r || kg > r.kg ) next[ species ] = mine;
			return next;

		} ).then( ( saved ) => {

			this._setRecords( saved );
			const ours = saved[ species ] && saved[ species ].id === this.me.id && saved[ species ].at === mine.at;
			tell( ours );

		} ).catch( ( e ) => {

			console.warn( 'records', e );
			tell( false );

		} );
		return { island: true, held };

	}

	// another player landed one: a toast, their cheer, their fish on their line for a moment
	_theirCatch( b, from ) {

		const o = this.others.get( from );
		if ( ! o || ! b || ! FISH[ b.s ] || typeof b.kg !== 'number' ) return;
		const kg = b.kg < 1 ? b.kg.toFixed( 2 ) : b.kg.toFixed( 1 );
		this.app.game.toast( `${ o.person.name } caught a ${ kg } kg ${ FISH[ b.s ].name.toLowerCase() }${ b.rec ? ': a new island record!' : '' }`, 4200 );
		o.avatar.once( 'cheer_01' );
		if ( o.fish ) {

			this.app.scene.remove( o.fish );
			o.fish.geometry.dispose();

		}

		o.fish = this.app.game.display.hangingFish( b.s );
		o.fish.scale.setScalar( fishLengthCm( b.s, b.kg ) / 100 );
		o.fish.visible = false;
		this.app.scene.add( o.fish );
		o.fishUntil = performance.now() / 1000 + 8;
		if ( b.rec ) this._readRecords();

	}

	// ---- the clock

	// everyone's time of day: the hour at `at` (ms since 1970), running at `speed` hours a second
	setClock( hour, speed ) {

		const value = { at: Date.now(), hour: r3( hour ), speed };
		this._adopt( value );
		this.session.set( 'clock', value ).catch( ( e ) => console.warn( 'clock', e ) );

	}

	_adopt( value ) {

		if ( ! value || typeof value.at !== 'number' || typeof value.hour !== 'number' ) return;
		this._clock = { at: value.at, hour: value.hour, speed: Number( value.speed ) || 0 };

	}

	syncClock( s ) {

		const c = this._clock;
		if ( ! c ) return;
		s.timeSpeed = c.speed;
		s.timeOfDay = ( ( c.hour + ( Date.now() - c.at ) / 1000 * c.speed ) % 24 + 24 ) % 24;

	}

	// ---- who's here

	_sync( players, first ) {

		const here = new Set();
		for ( const p of players ) {

			if ( p.id === this.me.id ) continue;
			here.add( p.id );
			if ( this.others.has( p.id ) ) continue;
			this.others.set( p.id, this._remote( p ) );
			if ( ! first ) this.app.game.toast( `${ p.name } came to the island`, 3200 );

		}

		for ( const [ id, o ] of this.others ) {

			if ( here.has( id ) ) continue;
			this._drop( o );
			this.others.delete( id );
			this.app.game.toast( `${ o.person.name } left`, 2600 );

		}

	}

	_remote( person ) {

		const app = this.app;
		const avatar = new Avatar( person );
		avatar.group.visible = false;
		app.scene.add( avatar.group );
		app.lightUp( avatar.group );
		this._loadLook( avatar.look ).then( ( gltf ) => {

			if ( ! gltf || ! this.others.has( person.id ) ) return;
			avatar.setLook( gltf, { shadows: app.tier === 'high' } );
			app.lightUp( avatar.group );

		} );
		const tackle = app.game.rod.tackle();
		app.scene.add( tackle.rod, tackle.bobber, tackle.line );
		const o = { person, avatar, tackle, samples: [], last: - Infinity, boat: null, tag: null, shown: false, mapped: false, cur: null };
		return o;

	}

	_drop( o ) {

		const app = this.app;
		app.scene.remove( o.avatar.group, o.tackle.rod, o.tackle.bobber, o.tackle.line );
		o.avatar.dispose();
		o.tackle.rod.material.dispose();
		o.tackle.line.material.dispose();
		if ( o.boat ) app.scene.remove( o.boat );
		if ( o.fish ) {

			app.scene.remove( o.fish );
			o.fish.geometry.dispose();

		}

		if ( o.tag ) o.tag.remove();
		if ( o.mapped && app.game.minimap ) app.game.minimap.removePlayer( o.person.id );

	}

	// a look's glTF, loaded once (null if it doesn't load: the stand-in figure stays), its textures
	// uploaded and its shaders ready before it's first drawn
	_loadLook( look ) {

		const looks = this._looks || ( this._looks = new Map() );
		if ( looks.has( look ) ) return looks.get( look );
		const app = this.app, r = app.renderer;
		const p = ( this._loader || ( this._loader = gltfLoader() ) ).loadAsync( `models/characters/${ look }.glb` ).then( async ( gltf ) => {

			app.lightUp( gltf.scene );
			gltf.scene.traverse( ( o ) => {

				if ( ! o.isMesh ) return;
				for ( const m of [ o.material ].flat() ) for ( const k of [ 'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap' ] ) if ( m[ k ] ) r.initTexture( m[ k ] );

			} );
			await r.compileAsync( gltf.scene, app.camera, app.scene );
			return gltf;

		} ).catch( ( e ) => {

			console.warn( `${ look }: didn't load; the stand-in stays`, e );
			return null;

		} );
		looks.set( look, p );
		return p;

	}

	// ---- poses

	_pose( b, from ) {

		const o = this.others.get( from );
		if ( ! o || ! b || ! Array.isArray( b.p ) ) return;
		const now = performance.now() / 1000;
		o.samples.push( { time: now, body: b } );
		if ( o.samples.length > 12 ) o.samples.shift();
		o.last = now;

	}

	// what this player is doing, for the others
	_mine() {

		const app = this.app, p = app.player, rod = app.game.rod, boat = app.boatCtl;
		const m = MODES[ p.mode ] || 'w';
		const v = p.mode === 'deck' ? Math.hypot( p.deckVel.x, p.deckVel.z ) : Math.hypot( p.velocity.x, p.velocity.z );
		const body = { m, p: [ r2( p.position.x ), r2( p.position.y ), r2( p.position.z ) ], a: r3( p.yaw ), v: r2( v ) };
		if ( m === 'h' ) body.a = r3( boat.getYaw() + Math.PI );
		const r = rod.equipped || rod.state !== 'stowed' ? ROD[ rod.state ] ?? 1 : 0;
		if ( r ) {

			body.r = r;
			if ( r >= 3 && rod.lineInWater ) body.b = [ r2( rod.bobber.x ), r2( rod.bobber.y ), r2( rod.bobber.z ) ];
			if ( r === 5 && app.game.fight ) body.k = r2( Math.min( 1, app.game.fight.tension || 0 ) );

		}

		// the boat: whenever it's away from its mooring, or someone's aboard
		if ( ! boat.moored || m === 'd' || m === 'h' ) {

			const q = boat.quaternion;
			body.B = [ r2( boat.position.x ), r2( boat.position.y ), r2( boat.position.z ), r3( q.x ), r3( q.y ), r3( q.z ), r3( q.w ) ];
			if ( m === 'd' ) body.D = [ r2( p.deckPos.x ), r2( p.deckPos.y ), r2( p.deckPos.z ) ];

		}

		return body;

	}

	// ---- per frame

	update( dt ) {

		const app = this.app;
		if ( ! app.game.hud ) return; // (the HUD comes with the game's first frame)
		this._sendT += dt;
		if ( this.others.size && this._sendT >= SEND ) {

			this._sendT = 0;
			this.session.send( 'p', this._mine() );

		}

		if ( ! this.others.size ) return;
		const now = performance.now() / 1000;
		const cam = app.camera.position;
		// the nearest few are drawn (the device's budget)
		const list = [];
		for ( const o of this.others.values() ) {

			o.cur = now - o.last < this.stale ? this._at( o, now - DELAY ) : null;
			if ( ! o.mapped && app.game.minimap ) {

				o.mapped = true;
				app.game.minimap.addPlayer( o.person.id, { name: o.person.name, color: o.person.color, pos: () => o.cur ? { x: o.cur.pos.x, z: o.cur.pos.z } : null } );

			}

			if ( o.cur ) list.push( o );

		}

		list.sort( ( a, b ) => a.cur.pos.distanceToSquared( cam ) - b.cur.pos.distanceToSquared( cam ) );
		const show = new Set( list.slice( 0, this.limits.avatars ) );
		const boats = new Set( list.filter( ( o ) => o.cur.boat && ! this._docked( o.cur.boat.pos ) ).slice( 0, this.limits.boats ) );
		for ( const o of this.others.values() ) this._place( o, show.has( o ) && this.ready, boats.has( o ), dt );
		this._names();

	}

	// both boats at the dock: yours stands in for theirs (they'd sit in the same berth)
	_docked( pos ) {

		const dock = WORLD.boatDock.position, mine = this.app.boatCtl.position;
		return Math.hypot( pos.x - dock.x, pos.z - dock.z ) < 8 && Math.hypot( mine.x - dock.x, mine.z - dock.z ) < 8;

	}

	// the pose at time t, eased between the two samples around it
	_at( o, t ) {

		const S = o.samples;
		if ( ! S.length ) return null;
		let i = S.length - 1;
		while ( i > 0 && S[ i ].time > t ) i --;
		const sa = S[ i ], sb = S[ Math.min( i + 1, S.length - 1 ) ];
		const f = sb === sa ? 0 : MathUtils.clamp( ( t - sa.time ) / ( sb.time - sa.time ), 0, 1 );
		const a = sa.body, b = sb.body, near = f < 0.5 ? a : b;
		const cur = o.state || ( o.state = {
			pos: new Vector3(), yaw: 0, mode: 'walk', speed: 0, rod: 0, tension: 0,
			bobber: null, boat: null, deck: null,
			_bobber: new Vector3(), _deck: new Vector3(), _boat: { pos: new Vector3(), quat: new Quaternion() },
		} );
		// a vector between two [ x, y, z ] (either may be missing: the other then)
		const lerp3 = ( out, A, B ) => {

			A = Array.isArray( A ) ? A : null;
			B = Array.isArray( B ) ? B : null;
			if ( ! A && ! B ) return null;
			A = A || B; B = B || A;
			return out.set( A[ 0 ] + ( B[ 0 ] - A[ 0 ] ) * f, A[ 1 ] + ( B[ 1 ] - A[ 1 ] ) * f, A[ 2 ] + ( B[ 2 ] - A[ 2 ] ) * f );

		};

		lerp3( cur.pos, a.p, b.p );
		cur.yaw = a.a + Math.atan2( Math.sin( b.a - a.a ), Math.cos( b.a - a.a ) ) * f;
		cur.mode = NAMES[ near.m ] || 'walk';
		cur.speed = ( a.v || 0 ) + ( ( b.v || 0 ) - ( a.v || 0 ) ) * f;
		cur.rod = near.r || 0;
		cur.tension = b.k || 0;
		cur.bobber = lerp3( cur._bobber, a.b, b.b );
		cur.deck = lerp3( cur._deck, a.D, b.D );
		const Ba = Array.isArray( a.B ) ? a.B : null, Bb = Array.isArray( b.B ) ? b.B : null;
		cur.boat = null;
		if ( Ba || Bb ) {

			const A = Ba || Bb, B = Bb || Ba;
			cur.boat = cur._boat;
			lerp3( cur.boat.pos, A, B );
			_qa.set( A[ 3 ], A[ 4 ], A[ 5 ], A[ 6 ] ).normalize();
			_qb.set( B[ 3 ], B[ 4 ], B[ 5 ], B[ 6 ] ).normalize();
			cur.boat.quat.slerpQuaternions( _qa, _qb, f );

		}

		return cur;

	}

	// their figure, boat and tackle where the pose puts them
	_place( o, visible, boatShown, dt ) {

		const app = this.app, c = o.cur, g = o.avatar.group;
		g.visible = visible;
		o.shown = visible;

		// their boat (or yours standing in for it at the dock)
		let frame = null;
		if ( c && c.boat ) {

			if ( boatShown ) {

				const boat = o.boat || ( o.boat = this._boatCopy() );
				boat.visible = true;
				boat.position.copy( c.boat.pos );
				boat.quaternion.copy( c.boat.quat );
				frame = c.boat;

			} else if ( this._docked( c.boat.pos ) ) frame = { pos: app.boatCtl.position, quat: app.boatCtl.quaternion };

		}

		if ( o.boat && ( ! c || ! c.boat || ! boatShown ) ) o.boat.visible = false;
		const T = o.tackle;
		if ( ! visible || ! c ) {

			T.rod.visible = T.line.visible = T.bobber.visible = false;
			return;

		}

		// the figure: aboard, it stands where they stand on their deck or at the helm
		if ( frame && c.mode === 'helm' ) {

			const helm = app.boat.helmEye;
			_bp.set( helm.x, helm.y - EYE, helm.z ).applyQuaternion( frame.quat ).add( frame.pos );
			g.position.copy( _bp );
			_bq.setFromAxisAngle( _up, c.yaw + Math.PI );
			g.quaternion.copy( _bq );

		} else {

			if ( frame && c.mode === 'deck' && c.deck ) g.position.copy( c.deck ).applyQuaternion( frame.quat ).add( frame.pos );
			else g.position.copy( c.pos );
			g.quaternion.setFromAxisAngle( _up, c.yaw + Math.PI );

		}

		o.avatar.pose( { mode: c.mode, speed: c.speed, rod: c.rod > 0 }, dt );
		// meeting someone: a wave, the first time
		if ( ! o.waved && g.position.distanceTo( app.player.position ) < WAVE_NEAR && c.mode !== 'swim' && app.player.mode !== 'swim' ) {

			o.waved = true;
			o.avatar.once( 'wave_01' );

		}
		g.updateMatrixWorld( true );

		// the rod in their right hand: held as they hold it (ROD_ELEV), toward their bobber when the
		// line is out; the line to the bobber
		const rodOn = c.rod > 0 && ! app.game.rod.holdBack;
		T.rod.visible = rodOn;
		if ( rodOn ) {

			o.avatar.hand( _hand );
			_d.set( 0, 0, 1 ).applyQuaternion( g.quaternion ).setY( 0 );
			if ( c.bobber && c.rod >= 4 ) {

				_q.copy( c.bobber ).sub( _hand ).setY( 0 );
				if ( _q.lengthSq() > 0.25 ) _d.copy( _q );

			}

			_d.normalize();
			const elev = ROD_ELEV[ c.rod ] ?? 0.5;
			_y.copy( _d ).multiplyScalar( Math.cos( elev ) ).addScaledVector( _up, Math.sin( elev ) ).normalize();
			_z.copy( _up ).addScaledVector( _y, - _y.y );
			if ( _z.lengthSq() < 1e-6 ) _z.set( 0, 0, 1 );
			_z.normalize();
			_x.crossVectors( _y, _z ).normalize();
			_m.makeBasis( _x, _y, _z ).setPosition( _p.copy( _hand ).addScaledVector( _y, - SEAT_Y ) );
			T.rod.matrix.copy( _m );
			T.rod.matrixWorldNeedsUpdate = true;
			_tip.copy( _p ).addScaledVector( _y, ROD_L );
			// a fish on bends the blank toward the line
			const U = T.rod.material.uniforms;
			if ( c.rod === 5 && c.bobber ) {

				_d.copy( c.bobber ).sub( _tip ).normalize();
				_q.set( _d.dot( _x ), 0, _d.dot( _z ) );
				if ( _q.lengthSq() > 1e-6 ) _q.normalize();
				U.rodBend.value.set( _q.x, 0, _q.z, 0.06 + 0.3 * c.tension );

			} else U.rodBend.value.set( 0, 0, 0, 0 );

		}

		const lineOn = rodOn && c.rod >= 3 && c.bobber;
		T.line.visible = !! lineOn;
		T.bobber.visible = !! lineOn && c.rod !== 6;
		if ( lineOn ) {

			const L = T.line.material.uniforms;
			L.lineA.value.copy( _tip );
			L.lineB.value.copy( c.bobber );
			const out = _tip.distanceTo( c.bobber ), taut = c.rod === 5 ? Math.min( 1, c.tension * 1.5 ) : 0;
			L.lineCtl.value.copy( _tip ).lerp( c.bobber, 0.5 ).y -= out * 0.07 * ( 1 - taut ) + 0.02;
			T.bobber.position.copy( c.bobber );

		}

		// the fish they've just landed, on the end of their line, turned to you
		if ( o.fish ) {

			const show = lineOn && c.rod === 6 && performance.now() / 1000 < o.fishUntil;
			o.fish.visible = !! show;
			if ( show ) {

				const cam = app.camera.position;
				o.fish.position.copy( c.bobber );
				o.fish.rotation.set( 0, Math.atan2( cam.x - c.bobber.x, cam.z - c.bobber.z ), 0 );

			}

			T.bobber.visible = T.bobber.visible && ! show;
			if ( performance.now() / 1000 > o.fishUntil + 2 ) {

				app.scene.remove( o.fish );
				o.fish.geometry.dispose();
				o.fish = null;

			}

		}

	}

	// a copy of the boat (its meshes and materials: no new shaders), without its gear on low
	_boatCopy() {

		const app = this.app;
		if ( ! this._boatTemplate ) {

			const t = this._boatTemplate = app.boat.group.clone( true );
			if ( app.tier === 'low' ) {

				const keep = [];
				t.traverse( ( c ) => c.isMesh && LOW_BOAT.includes( c.name ) && keep.push( c ) );
				t.clear();
				for ( const m of keep ) {

					m.removeFromParent();
					t.add( m );

				}

			}

			t.traverse( ( c ) => {

				if ( c.isMesh ) c.castShadow = c.castShadow && app.tier === 'high';

			} );

		}

		const b = this._boatTemplate.clone( true );
		b.name = 'PlayerBoat';
		app.scene.add( b );
		return b;

	}

	// names over their heads (DOM), fading with distance
	_names() {

		const app = this.app;
		if ( ! this._tags ) {

			const root = app.ui && app.ui.ui ? app.ui.ui.root : document.body;
			const style = document.createElement( 'style' );
			style.textContent = CSS;
			document.head.append( style );
			this._tags = document.createElement( 'div' );
			this._tags.className = 'sl-tags';
			root.prepend( this._tags );

		}

		const cam = app.camera, canvas = app.renderer.domElement;
		const w = canvas.clientWidth, h = canvas.clientHeight;
		for ( const o of this.others.values() ) {

			if ( ! o.tag ) {

				o.tag = document.createElement( 'div' );
				o.tag.className = 'sl-tag';
				const dot = document.createElement( 'i' );
				dot.style.background = o.person.color;
				o.tag.append( dot, document.createTextNode( o.person.name ) );
				this._tags.append( o.tag );

			}

			let show = o.shown;
			if ( show ) {

				const g = o.avatar.group;
				_p.copy( g.position );
				_p.y += o.cur.mode === 'swim' ? 0.7 : 2.05;
				const d = _p.distanceTo( cam.position );
				_p.project( cam );
				show = d < TAG_FAR && _p.z < 1 && Math.abs( _p.x ) < 1.1 && Math.abs( _p.y ) < 1.1;
				if ( show ) {

					const x = ( _p.x * 0.5 + 0.5 ) * w, y = ( 0.5 - _p.y * 0.5 ) * h;
					o.tag.style.transform = `translate(${ x.toFixed( 1 ) }px, ${ y.toFixed( 1 ) }px) translate(-50%, -100%)`;
					o.tag.style.opacity = String( MathUtils.clamp( ( TAG_FAR - d ) / 20, 0, 1 ) );

				}

			}

			if ( o._tagShown !== show ) {

				o._tagShown = show;
				o.tag.style.display = show ? 'block' : 'none';

			}

		}

	}

	// for the load's shaders (prepareLate): the stand-in figures' program and the records board's,
	// in the island's light
	async compile( renderer, camera, scene ) {

		const stand = figureStandIn();
		this.app.lightUp( stand );
		stand.frustumCulled = false;
		scene.add( stand );
		await renderer.compileAsync( stand, camera, scene );
		if ( ! this.board.group.parent ) scene.add( this.board.group );
		await renderer.compileAsync( this.board.group, camera, scene );
		scene.remove( stand );
		stand.geometry.dispose();
		stand.material.dispose();
		this.ready = true;

	}

}
