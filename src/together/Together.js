import { Vector3, Quaternion, Matrix4, MathUtils } from '../engine/index.js';
import { gltfLoader } from '@allthespaces/portal/three';
import { Avatar, LOOKS, lookOf } from './Avatar.js';
import { figureStandIn } from './Figure.js';
import { RecordsBoard } from './RecordsBoard.js';
import { BoatLamps } from '../world/boat/BoatLamps.js';
import { FISH, fishLengthCm, isTrophy } from '../game/FishTable.js';
import { ROD_L, SEAT_Y } from '../game/FishingRod.js';
import { gunModels, setBands } from '../game/Speargun.js';
import { CastNet } from '../game/CastNet.js';
import { G } from '../core/Globals.js';
import { gearStats, defaultUpgrades } from '../game/Gear.js';
import { DAY_RATE, REST, clockAt, restTo } from '../game/IslandClock.js';
import { weekOrder, weekNumber, tallyFor, deliver, delivered } from '../game/WeekOrder.js';
import { lb } from '../game/Units.js';
import { WORLD } from '../world/WorldLayout.js';

// (Salt Life) Playing together: whoever else is on the island (portal.session, All the Spaces), drawn
// where they are, doing what they do. Light, drop-in: everyone keeps their own progress and their own
// fish; what's shared is
//  - where each of you is: a pose message about ten times a second while anyone else is here ('p'),
//    shown a little behind (DELAY) and eased between, so it moves smoothly
//  - the time of day: one clock for everyone (the shared value 'clock': { at, hour, day, speed }, see
//    game/IslandClock.js), which the host sets if there's none. On your own you can hold it and rest
//    until later; in company it runs, and a rest needs everyone here to want it ('rest.<id>')
//  - catches: a message to the others ('catch'), who see the fish on your line and you cheering; a
//    toast only for one worth hearing of (an island record or a trophy-sized fish)
//  - the island's records: each species' heaviest fish anyone in the group has landed, who and when,
//    in the group's shared save ('records': kept between visits), chalked on a board at Joe's stand
//    (RecordsBoard) and listed in the cooler
//  - the week's order (game/WeekOrder.js): what each of the group has brought toward it, in the
//    group's shared save ('weekOrder'); a sale toward it brings that up to date and tells the others
//    ('week', with the tally)
// Riding along: next to someone's boat while they're aboard, you board theirs (TheirBoat: the boat's
// shape at their boat's pose, for the Player) and walk its deck while they drive; your poses say whose
// boat you're on ('R': the deck position is in its frame), so everyone sees you aboard it.
// Each other player is one of four islanders (Avatar.js: Rocketbox characters, as Joe and Marta),
// walking, running, swimming, at the helm or holding a rod (or under water, a speargun) as they are, with their name over them in
// their colour and a dot on the minimap; they wave when you meet; their boat is a copy of yours (its meshes, no new shaders), out at sea; their rod, line and
// bobber are the rod's (FishingRod.tackle); their cast net is one of yours (CastNet), thrown as they
// threw it ('net': where it was aimed, how well it opened) and drawn and hauled as their poses say.
// Their wakes, spray and sounds aren't drawn.
//   const t = new Together( app );  t.track( dt )  (before the player: where everyone is, the boat
//   you ride);  t.update( dt )  (after the game: the camera is placed)
//   t.syncClock( settings )  (each frame: the time of day from the shared clock)
//   t.alone  t.holdClock( held )  t.rest( 'dawn' )  t.restWishes()  (the clock's menu: game/TimeHUD.js)
//   t.week()  (this week's order's tally)  t.deliver( kg )  (a sale toward it)

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
// (Salt Life) the cast net: 0 put away, 1 loaded in the hands, 2 winding up, 3 thrown, 4 in the water, 5
// its purse up in front of them, 6 being loaded again (their net, here: game/CastNet.js, thrown as
// they threw it, the 'net' message)
const NET = { held: 1, windup: 2, throw: 3, flying: 3, sinking: 4, lifted: 5, dumping: 5, gather: 6 };
const NET_STATE = [ null, 'held', 'windup', 'throw', 'sinking', 'lifted', 'gather' ];
const NET_PITCH = - 0.38; // their head, looking down at the water ahead
const NET_FAR = 90; // m: a net farther off than this isn't drawn (or simulated)
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
const _qa = new Quaternion(), _qb = new Quaternion(), _m = new Matrix4(), _mt = new Matrix4();
const _bp = new Vector3(), _bq = new Quaternion();

// another player's boat, to ride in: the boat's shape (yours: the same model) at their boat's pose,
// with what the Player asks of a boat while you're on its deck
class TheirBoat {

	constructor( owner, model ) {

		this.owner = owner; // their id
		this.model = model;
		this.position = new Vector3();
		this.quaternion = new Quaternion();
		this.speed = 0;
		this.driven = false;
		this.moored = false;
		this.throttle = 0;
		this.mooring = { anchor: new Vector3(), heading: 0 };
		this._has = false;

	}

	toWorld( local, out ) {

		return out.copy( local ).applyQuaternion( this.quaternion ).add( this.position );

	}

	forward( out ) {

		return out.set( 0, 0, 1 ).applyQuaternion( this.quaternion );

	}

	getYaw() {

		const f = this.forward( _fw );
		return Math.atan2( f.x, f.z );

	}

	// to their boat's pose this frame ({ pos, quat })
	follow( frame, dt ) {

		if ( this._has && dt > 0 ) this.speed = this.position.distanceTo( frame.pos ) / dt;
		this.position.copy( frame.pos );
		this.quaternion.copy( frame.quat );
		this._has = true;

	}

}

const _fw = new Vector3();

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
		this._wishSeen = new Map(); // 'rest.<id>' -> { text, t }: when a wish to rest was first seen here
		this.onJump = null; // ( ) => void: the clock jumped (a rest, or joining others), for the HUD
		this._tags = null;
		this._boatTemplate = null;

		const s = this.session;
		this._sync( s.players, true );
		s.onPlayers( ( players ) => this._sync( players, false ) );
		s.on( 'p', ( body, from ) => this._pose( body, from ) );
		// the clock: the session's, or yours from your save if there's none and you host (a new room
		// starts from its first player's)
		const clock = s.get( 'clock' );
		if ( clock ) this._adopt( clock );
		else if ( s.isHost ) this.setClock( app.settings.timeOfDay, app.settings.day, app.settings.timeSpeed );
		s.onChange( 'clock', ( value ) => this._adopt( value ) );
		if ( s.onAnyChange ) s.onAnyChange( ( key ) => key.startsWith( 'rest.' ) && this._restVote() );
		if ( s.onHostChange ) s.onHostChange( () => {

			if ( s.isHost && ! s.get( 'clock' ) ) this.setClock( app.settings.timeOfDay, app.settings.day, app.settings.timeSpeed || DAY_RATE );

		} );
		s.on( 'catch', ( body, from ) => this._theirCatch( body, from ) );
		s.on( 'net', ( body, from ) => this._theirThrow( body, from ) );
		s.on( 'horn', ( on, from ) => this._theirHorn( on, from ) );
		s.on( 'week', ( tally ) => this._setWeek( tally ) );

		// the records: the group's, read now and again when someone breaks one
		this.records = {};
		this.board = new RecordsBoard( { terrain: app.terrainData } );
		app.lightUp( this.board.group );
		// (on a device that draws on its CPU, after the start: its shader is load time)
		if ( this.ready ) app.scene.add( this.board.group );
		this._readRecords();

		// the week's order: the group's tally, read now and sent on whenever someone brings fish toward it
		this._week = null;
		this._readWeek();

	}

	// ---- the week's order

	// this week's tally (a fresh one when the week has turned since it was read). The same object until
	// it changes (the game watches for that: Game.update); not to be changed
	week() {

		const n = weekNumber( Date.now() ), c = this._weekNow;
		if ( c && c.n === n && c.from === this._week ) return c.tally;
		this._weekNow = { n, from: this._week, tally: tallyFor( this._week, weekOrder( Date.now() ) ) };
		return this._weekNow.tally;

	}

	_readWeek() {

		return this.portal.save.shared.get( 'weekOrder' ).then( ( t ) => this._setWeek( t ) ).catch( ( e ) => console.warn( 'week', e ) );

	}

	// a tally, read or sent: kept if it's newer than the one here (within a week it only grows, so
	// messages that cross don't take it back); force: the one just saved
	_setWeek( t, force = false ) {

		if ( ! t || typeof t !== 'object' ) return;
		const now = weekOrder( Date.now() ), next = tallyFor( t, now ), cur = this.week();
		if ( ! force && ( next.week < cur.week || ( next.week === cur.week && delivered( next ) < delivered( cur ) ) ) ) return;
		this._week = next;

	}

	// `kg` of the week's fish sold toward it: counted here at once, then in the group's save (whoever
	// else saved meanwhile: update tries again), and the others told
	deliver( kg ) {

		const w = weekOrder( Date.now() ), me = { id: this.me.id, name: this.me.name };
		this._setWeek( deliver( this._week, w, me, kg ), true );
		return this.portal.save.shared.update( 'weekOrder', ( cur ) => deliver( cur, w, me, kg ) ).then( ( saved ) => {

			this._setWeek( saved, true );
			if ( this.others.size ) this.session.send( 'week', saved );

		} ).catch( ( e ) => console.warn( 'week', e ) );

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

	// your horn, sounded or let go: the others hear it from your boat
	horn( on ) {

		if ( this.others.size ) this.session.send( 'horn', on ? 1 : 0 );

	}

	// theirs: from their boat's horn (as drawn here: their boat, or yours standing in at the dock)
	_theirHorn( on, from ) {

		const o = this.others.get( from ), app = this.app;
		if ( ! o ) return;
		if ( o.horn ) app.audio.hornStop( o.horn );
		o.horn = null;
		if ( on && this._hornAt( o ) ) o.horn = app.audio.hornStart( _bp );

	}

	// (in _bp) where their horn is, as their boat is drawn here: their boat, or yours standing in at the dock
	_hornAt( o ) {

		const c = o.cur, app = this.app;
		if ( ! c || ! c.boat ) return false;
		const frame = o.boat && o.boat.visible ? c.boat : this._docked( c.boat.pos ) ? { pos: app.boatCtl.position, quat: app.boatCtl.quaternion } : c.boat;
		_bp.copy( app.boat.hornAt || _bp.set( - 0.42, 3.4, 1.15 ) ).applyQuaternion( frame.quat ).add( frame.pos );
		return true;

	}

	// a fish landed here: is it the island's heaviest of its kind? (from what's known now; the shared
	// save is then brought up to date, and the others told)
	// (Salt Life) method: 'rod', 'spear' or 'net'; a speared or netted record says so (m: 's' | 'n')
	caught( species, kg, cm, method = 'rod' ) {

		const held = this.records[ species ];
		const island = ! held || kg > held.kg;
		const m = { spear: 's', net: 'n' }[ method ];
		const tell = ( record ) => {

			if ( this.others.size ) this.session.send( 'catch', m ? { s: species, kg: r3( kg ), cm, rec: record, m } : { s: species, kg: r3( kg ), cm, rec: record } );

		};
		if ( ! island ) {

			tell( false );
			return { island: false, held };

		}

		const mine = { kg: r3( kg ), cm, who: this.me.name, id: this.me.id, at: Date.now() };
		if ( m ) mine.m = m;
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

	// (Salt Life) your cast net's thrown (CastNet.lastThrow): the others throw theirs as you threw it,
	// from their copy of you
	netThrow( d ) {

		if ( d && this.others.size ) this.session.send( 'net', { x: r2( d.x ), y: r2( d.y ), z: r2( d.z ), q: r3( d.q ), s: r3( d.seed ), l: this.app.game.state.upgrades.castNet | 0 } );

	}

	_theirThrow( b, from ) {

		const o = this.others.get( from );
		if ( ! this.ready || ! o || ! b || ! [ b.x, b.y, b.z, b.q, b.s ].every( Number.isFinite ) ) return;
		this._netOf( o, b.l ).remoteThrow( { x: b.x, y: b.y, z: b.z, q: MathUtils.clamp( b.q, 0.05, 1 ), seed: b.s } );

	}

	// their cast net (one of yours, posed from their figure: _net), of their net's size, in their hands
	_netOf( o, level ) {

		const app = this.app;
		if ( ! o.net ) {

			o.net = new CastNet( { scene: app.scene, viewer: app.camera, ground: app.terrain, audio: app.audio, spray: app.spray } );
			for ( const m of o.net.meshes ) app.lightUp( m );
			o.netLevel = - 1;
			o.netHands = { r: o.net.handR, l: o.net.handL };

		}

		level = MathUtils.clamp( level | 0, 0, 3 );
		if ( o.netLevel !== level ) {

			o.netLevel = level;
			o.net.setGear( gearStats( { ...defaultUpgrades(), castNet: level } ) );

		}

		if ( ! o.net.equipped ) o.net.equip( true );
		return o.net;

	}

	// their net each frame: held, thrown, drawn and hauled as their poses say, from their eyes (their
	// head, as a camera would be there: CastNet.HANDS are in its frame) looking down at the water
	_net( o, c, g, dt ) {

		const app = this.app;
		const on = c.net > 0 && ( c.mode === 'walk' || c.mode === 'deck' ) && g.position.distanceTo( app.camera.position ) < NET_FAR;
		if ( ! on ) {

			if ( o.net && o.net.equipped ) o.net.equip( false );
			return;

		}

		const net = this._netOf( o, c.netLevel );
		if ( c.net === 2 && net.state === 'held' ) net.startWindup();
		else if ( c.net === 1 && net.state === 'windup' ) net.cancelWindup();
		net.follow( NET_STATE[ c.net ], c.netDraw, c.netLen );
		_bq.setFromAxisAngle( _up, c.yaw ).multiply( _qa.setFromAxisAngle( _x.set( 1, 0, 0 ), NET_PITCH ) );
		_mt.compose( _p.set( g.position.x, g.position.y + EYE, g.position.z ), _bq, _q.set( 1, 1, 1 ) );
		const P = net.P;
		net.update( dt, { frame: _mt, groundAt: this._netGround || ( this._netGround = ( x, z, maxY ) => app.player.groundAt( x, z, maxY ) ), waterY: app.query.heightAt( P[ 0 ], P[ 2 ], G.time.value ) } );
		net.takeEvents(); // (their catch is theirs: nothing here reads the net's moments)

	}

	// another player landed one: their cheer, their fish on their line for a moment; a toast only for
	// an island record or a trophy (on a busy island the rest would add up)
	_theirCatch( b, from ) {

		const o = this.others.get( from );
		if ( ! o || ! b || ! FISH[ b.s ] || typeof b.kg !== 'number' ) return;
		if ( b.rec || isTrophy( b.s, b.kg ) ) this.app.game.toast( `${ o.person.name } ${ b.m === 's' ? 'speared' : b.m === 'n' ? 'netted' : 'caught' } a ${ lb( b.kg, 1 ) } ${ FISH[ b.s ].name.toLowerCase() }${ b.rec ? ': a new island record!' : '' }`, 4200 );
		o.avatar.once( 'cheer_01' );
		if ( b.m === 'n' ) {

			// (in their net's purse: no fish on a line)
			if ( b.rec ) this._readRecords();
			return;

		}
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

	// on your own: a solo session, or nobody else here (yet). You can hold the clock and rest at will
	get alone() {

		return this.session.mode === 'solo' || this.others.size === 0;

	}

	// everyone's time of day: the hour and day at `at` (ms since 1970), running at `speed` hours a
	// second by day (IslandClock: faster at night)
	setClock( hour, day, speed ) {

		const value = { at: Date.now(), hour: r3( hour ), day: Math.max( 1, Math.floor( day ) || 1 ), speed };
		this._adopt( value );
		this.session.set( 'clock', value ).catch( ( e ) => console.warn( 'clock', e ) );

	}

	_adopt( value ) {

		if ( ! value || typeof value.at !== 'number' || typeof value.hour !== 'number' ) return;
		const s = this.app.settings;
		const was = this._clock ? clockAt( this._clock ) : { hour: s.timeOfDay, day: s.day };
		// (a clock from before days were counted keeps the day you're on)
		this._clock = { at: value.at, hour: value.hour, day: Number.isFinite( value.day ) ? value.day : was.day, speed: Number( value.speed ) || 0 };
		const now = clockAt( this._clock );
		if ( Math.abs( now.day * 24 + now.hour - was.day * 24 - was.hour ) > 0.5 && this.onJump ) this.onJump();

	}

	syncClock( s ) {

		const c = this._clock;
		if ( ! c ) return;
		const t = clockAt( c );
		s.timeSpeed = c.speed;
		s.timeOfDay = t.hour;
		s.day = t.day;

	}

	// hold the clock, or let it run again: only on your own -> done?
	holdClock( held ) {

		if ( ! this.alone ) return false;
		const s = this.app.settings;
		this.setClock( s.timeOfDay, s.day, held ? 0 : DAY_RATE );
		return true;

	}

	// rest until 'dawn' | 'noon' | 'dusk' | 'night' (null: never mind). On your own, at once; in company,
	// a wish everyone here sees, and the host moves the clock once all of you want the same -> done now?
	rest( to ) {

		const s = this.app.settings;
		if ( this.alone ) {

			if ( REST[ to ] === undefined ) return false;
			const t = restTo( s.timeOfDay, s.day, to );
			this.setClock( t.hour, t.day, s.timeSpeed );
			return true;

		}

		this.session.set( `rest.${ this.me.id }`, REST[ to ] !== undefined ? { to, c: this._clock ? this._clock.at : 0 } : null )
			.then( () => this._restVote( true ) ).catch( ( e ) => console.warn( 'rest', e ) );
		return false;

	}

	// who here wants to rest until when: wishes made since the clock last changed, for two minutes ->
	// { wishes: Map id -> to, agreed: to | null (all of you, the same), here: [ ids ] }
	restWishes() {

		const c = this._clock ? this._clock.at : 0, now = performance.now();
		const here = [ this.me.id, ...this.others.keys() ];
		const wishes = new Map();
		for ( const id of here ) {

			const key = `rest.${ id }`, w = this.session.get( key );
			if ( ! w || REST[ w.to ] === undefined || w.c !== c ) continue;
			const text = JSON.stringify( w ), seen = this._wishSeen.get( key );
			if ( ! seen || seen.text !== text ) this._wishSeen.set( key, { text, t: now } );
			else if ( now - seen.t > 120000 ) continue;
			wishes.set( id, w.to );

		}

		const tos = new Set( wishes.values() );
		return { wishes, agreed: here.length > 1 && wishes.size === here.length && tos.size === 1 ? [ ...tos ][ 0 ] : null, here };

	}

	// everyone wants to rest: the clock moves on. Moved by whoever's wish completes it (mine: true), or
	// by the host when it sees that (on the wishes as they change: a host whose game is paused, its tab
	// hidden, still hears them). Two moving it at once move it to the same hour
	_restVote( mine = false ) {

		if ( this.alone || ! ( mine || this.session.isHost ) ) return;
		const { agreed } = this.restWishes();
		if ( ! agreed || ! this._clock ) return;
		// (the clock as it is now: the frames that bring the settings up to date may be paused)
		const now = clockAt( this._clock ), t = restTo( now.hour, now.day, agreed );
		this.setClock( t.hour, t.day, this._clock.speed || DAY_RATE );

	}

	// ---- who's here

	// first: the list the game started with (All the Spaces may not have joined the session yet:
	// whoever was already there arrives with the next list, and is "on the island")
	_sync( players, first ) {

		const here = new Set();
		let came = false;
		for ( const p of players ) {

			if ( p.id === this.me.id ) continue;
			here.add( p.id );
			if ( this.others.has( p.id ) ) continue;
			this.others.set( p.id, this._remote( p ) );
			came = true;
			if ( ! first ) this.app.game.toast( this._settled ? `${ p.name } came to the island` : `${ p.name } is on the island`, 3200 );

		}

		this._settled = this._settled || ! first;
		// the first time anyone else is here: where to choose how they see you (after the arrival's toast)
		if ( came && ! this._hinted && ! LOOKS.includes( this.app.game.state.look ) ) {

			this._hinted = true;
			setTimeout( () => this.app.game.toast( 'Others can see you now. Choose your islander in the cooler', 4500 ), 3600 );

		}
		// someone new: the host says what time it is (a clock set before the session was joined stayed
		// on this device), and a held clock runs again: in company it runs for everyone
		const s = this.app.settings;
		if ( came && ! first && this.session.isHost ) this.setClock( s.timeOfDay, s.day, s.timeSpeed || DAY_RATE );

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
		const tackle = app.game.rod.tackle();
		app.scene.add( tackle.rod, tackle.bobber, tackle.line );
		// (Salt Life) and their speargun, its shaft and line
		const spear = app.game.gun.tackle();
		app.scene.add( spear.gun, spear.bands, spear.shaft, spear.line );
		// (their look comes with their first pose: the stand-in figure until then)
		const o = { person, avatar, tackle, spear, samples: [], last: - Infinity, boat: null, tag: null, shown: false, mapped: false, cur: null, wearing: null };
		return o;

	}

	// dress them as `look` (loaded once per look; the stand-in or their last look until then)
	_wear( o, look ) {

		o.wearing = look;
		o.avatar.look = look;
		this._loadLook( look ).then( ( gltf ) => {

			if ( ! gltf || ! this.others.has( o.person.id ) || o.wearing !== look ) return;
			o.avatar.setLook( gltf, { shadows: this.app.tier === 'high' } );
			this.app.lightUp( o.avatar.group );

		} );

	}

	// ---- how the others see you

	get myLook() {

		const chosen = this.app.game.state.look;
		return LOOKS.includes( chosen ) ? chosen : lookOf( this.me );

	}

	// (the cooler's chooser) it goes with the next pose
	setLook( look ) {

		if ( LOOKS.includes( look ) ) this.app.game.state.setLook( look );

	}

	_drop( o ) {

		const app = this.app;
		app.scene.remove( o.avatar.group, o.tackle.rod, o.tackle.bobber, o.tackle.line );
		o.avatar.dispose();
		o.tackle.rod.material.dispose();
		o.tackle.line.material.dispose();
		for ( const m of [ o.spear.gun, o.spear.bands, o.spear.shaft, o.spear.line ] ) {

			app.scene.remove( m );
			m.material.dispose();

		}
		if ( o.boat ) {

			app.scene.remove( o.boat );
			o.boat.userData.lamps.removeLight( app.localLights );
			o.boat.userData.lamps.dispose();

		}

		if ( o.horn ) app.audio.hornStop( o.horn );
		if ( o.fish ) {

			app.scene.remove( o.fish );
			o.fish.geometry.dispose();

		}

		if ( o.net ) o.net.dispose();
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
		// the islander they chose (or, from a game that doesn't say, the one from their id)
		const look = LOOKS[ b.l ] || lookOf( o.person );
		if ( o.wearing !== look ) this._wear( o, look );
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
		const body = { m, p: [ r2( p.position.x ), r2( p.position.y ), r2( p.position.z ) ], a: r3( p.yaw ), v: r2( v ), l: LOOKS.indexOf( this.myLook ) };
		if ( m === 'h' ) body.a = r3( boat.getYaw() + Math.PI );
		// (Salt Life) the speargun: 1 loaded, 2 empty or being loaded, 3 its shaft out, 4 a fish on it
		// landed; which gun (gl); the shaft's tail and direction while it's out (G)
		const gun = app.game.gun;
		if ( gun.equipped ) {

			body.g = gun.state === 'landing' ? 4 : gun.shaftOut ? 3 : gun.state === 'loaded' ? 1 : 2;
			body.gl = app.game.state.upgrades.speargun | 0;
			if ( gun.shaftOut ) {

				const L = gun.gear.shaftM, t = gun.tip, d = gun.dir;
				body.G = [ r2( t.x - d.x * L ), r2( t.y - d.y * L ), r2( t.z - d.z * L ), r3( d.x ), r3( d.y ), r3( d.z ) ];

			}

		}

		// (Salt Life) the cast net (NET; its size, nl), and while it's in the water how far its brails are
		// drawn (nd) and how much hand line is out (nh): the throw itself is the 'net' message
		const net = app.game.net;
		if ( net && net.equipped && NET[ net.state ] ) {

			body.n = NET[ net.state ];
			body.nl = app.game.state.upgrades.castNet | 0;
			if ( net.state === 'sinking' ) {

				body.nd = r2( net.draw );
				body.nh = r2( net.handLen );

			}

		}

		const r = rod.equipped || rod.state !== 'stowed' ? ROD[ rod.state ] ?? 1 : 0;
		if ( r ) {

			body.r = r;
			if ( r >= 3 && rod.lineInWater ) body.b = [ r2( rod.bobber.x ), r2( rod.bobber.y ), r2( rod.bobber.z ) ];
			if ( r === 5 && app.game.fight ) body.k = r2( Math.min( 1, app.game.fight.tension || 0 ) );

		}

		// your boat: whenever it's away from its mooring, or you're aboard it; riding along in someone
		// else's, whose (R), and where on its deck
		if ( ! boat.moored || ( ! p.riding && ( m === 'd' || m === 'h' ) ) ) {

			const q = boat.quaternion;
			body.B = [ r2( boat.position.x ), r2( boat.position.y ), r2( boat.position.z ), r3( q.x ), r3( q.y ), r3( q.z ), r3( q.w ) ];

		}

		if ( p.riding ) body.R = p.boat.owner;
		if ( body.B && this.app.searchlight ) body.S = 1; // (your boat's searchlight is on)
		if ( body.B && boat.anchor ) body.A = 1; // (it's at anchor: its lamps say so)
		if ( m === 'h' ) body.E = r2( boat.rpm ); // (the engine's revs: what the others hear)
		if ( m === 'd' ) body.D = [ r2( p.deckPos.x ), r2( p.deckPos.y ), r2( p.deckPos.z ) ];

		return body;

	}

	// ---- per frame

	// before the player: where everyone is now; the boat you're riding in; someone's boat to board
	track( dt ) {

		const app = this.app, p = app.player;
		const now = performance.now() / 1000;
		for ( const o of this.others.values() ) {

			o.cur = now - o.last < this.stale ? this._at( o, now - DELAY ) : null;
			// how fast their boat goes (for its sound)
			const bp = o.cur && o.cur.boat && o.cur.boat.pos;
			if ( bp && o._boatAt && dt > 0 ) o.boatSpeed += ( bp.distanceTo( o._boatAt ) / dt - o.boatSpeed ) * ( 1 - Math.exp( - dt * 4 ) );
			if ( bp ) ( o._boatAt || ( o._boatAt = new Vector3() ) ).copy( bp );
			else o._boatAt = null;
			o.boatSpeed = o.boatSpeed || 0;

		}

		// riding: their boat's pose (gone, or they left: in the water where it was)
		if ( p.riding ) {

			const o = this.others.get( p.boat.owner );
			const frame = o && o.cur && o.cur.boat;
			if ( frame ) p.boat.follow( frame, dt );
			else {

				const name = o ? o.person.name : 'their';
				if ( p.mode === 'deck' ) p.exitBoat( null, 1 );
				else p.unride();
				app.game.toast( `${ name === 'their' ? 'The' : name + '\'s' } boat has gone`, 2600 );

			}

		}

		// next to the boat of someone aboard it: board theirs (at the dock, theirs before yours)
		p.rideOffer = null;
		if ( ! p.riding && ( p.mode === 'walk' || p.mode === 'swim' ) ) {

			let best = Infinity;
			for ( const o of this.others.values() ) {

				const c = o.cur;
				if ( ! c || ! c.boat || ( c.mode !== 'deck' && c.mode !== 'helm' ) || c.ride ) continue;
				_bp.copy( app.boat.boardPoint ).applyQuaternion( c.boat.quat ).add( c.boat.pos );
				const d = Math.hypot( _bp.x - p.position.x, _bp.z - p.position.z );
				if ( d > 4.2 || Math.abs( _bp.y - p.position.y ) > 3.2 || d > best ) continue;
				best = d;
				const boat = o.theirBoat || ( o.theirBoat = new TheirBoat( o.person.id, app.boat ) );
				boat.follow( c.boat, 0 );
				p.rideOffer = { name: o.person.name, boat };

			}

		}

	}

	update( dt ) {

		const app = this.app;
		if ( ! app.game.hud ) return; // (the HUD comes with the game's first frame)
		this._sendT += dt;
		if ( this.others.size && this._sendT >= SEND ) {

			this._sendT = 0;
			this.session.send( 'p', this._mine() );

		}

		this._ownBoat();
		if ( ! this.others.size ) return;
		const cam = app.camera.position;
		// the nearest few are drawn (the device's budget; the boat you're riding in, always)
		const list = [];
		const riding = app.player.riding ? this.others.get( app.player.boat.owner ) : null;
		for ( const o of this.others.values() ) {

			if ( ! o.mapped && app.game.minimap ) {

				o.mapped = true;
				app.game.minimap.addPlayer( o.person.id, { name: o.person.name, color: o.person.color, pos: () => o.cur ? { x: o.cur.pos.x, z: o.cur.pos.z } : null } );

			}

			if ( o.cur ) list.push( o );

		}

		list.sort( ( a, b ) => a.cur.pos.distanceToSquared( cam ) - b.cur.pos.distanceToSquared( cam ) );
		const show = new Set( list.slice( 0, this.limits.avatars ) );
		const boats = new Set( list.filter( ( o ) => o.cur.boat && ! this._docked( o.cur.boat.pos ) ).slice( 0, this.limits.boats ) );
		if ( riding && riding.cur && riding.cur.boat ) boats.add( riding );
		for ( const o of this.others.values() ) {

			this._place( o, show.has( o ) && this.ready, boats.has( o ), dt );
			if ( o.horn && this._hornAt( o ) ) this.app.audio.hornMove( o.horn, _bp ); // (their horn moves with their boat)

		}

		this._names();

	}

	// riding along at the dock: their boat is drawn, yours (in the same berth) not
	_ownBoat() {

		const app = this.app, p = app.player, g = app.boat.group;
		const o = p.riding && this.others.get( p.boat.owner );
		const hide = !! ( o && o.cur && o.cur.boat && o.cur.boat.pos.distanceTo( app.boatCtl.position ) < 8 );
		if ( hide === !! this._hidOwn ) return;
		this._hidOwn = hide;
		g.visible = ! hide;

	}

	// (Salt Life) their speargun (their gun, from its level: gunModels): in their right hand as they swim,
	// along their facing, or toward the shaft out on its line; its bands drawn or slack; the shaft in the
	// gun or out, and the line to it
	_spear( o, c, g ) {

		const S = o.spear, app = this.app;
		const on = c.gun > 0 && c.mode === 'swim' && ! app.game.gun.holdBack;
		S.gun.visible = S.bands.visible = S.shaft.visible = on;
		S.line.visible = false;
		if ( ! on ) return;
		if ( o.gunLevel !== c.gunLevel ) {

			o.gunLevel = c.gunLevel;
			o.gunModels = gunModels( gearStats( { ...defaultUpgrades(), speargun: c.gunLevel } ) );

		}

		const m = o.gunModels;
		if ( S.gun.geometry !== m.gun ) {

			S.gun.geometry = m.gun;
			S.shaft.geometry = m.shaft;
			S.shaft.material.uniforms.shaftHinge.value = m.hinge;

		}

		o.spearM = m.shaftM;
		o.avatar.hand( _hand );
		_d.set( 0, 0, 1 ).applyQuaternion( g.quaternion );
		const out = c.gun >= 3 && c.shaft;
		if ( out ) {

			_q.copy( c.shaft.tail ).sub( _hand );
			if ( _q.lengthSq() > 0.25 ) _d.copy( _q );

		}

		_d.normalize();
		_y.copy( _d );
		_z.copy( _up ).addScaledVector( _y, - _y.y );
		if ( _z.lengthSq() < 1e-6 ) _z.set( 0, 0, 1 );
		_z.normalize();
		_x.crossVectors( _y, _z ).normalize();
		_m.makeBasis( _x, _y, _z ).setPosition( _hand );
		S.gun.matrix.copy( _m );
		S.bands.matrix.copy( _m );
		setBands( S.bands.material.uniforms, m.lay, m.bands, c.gun === 1 ? [ 1, 1 ] : [ 0, 0 ] );
		S.gun.material.uniforms.gunWraps.value = out ? 0 : 1;
		S.shaft.material.uniforms.shaftFlopper.value = c.gun === 4 ? 1 : 0;
		if ( out ) {

			_y.copy( c.shaft.dir );
			_z.copy( _up ).addScaledVector( _y, - _y.y );
			if ( _z.lengthSq() < 1e-6 ) _z.set( 1, 0, 0 );
			_z.normalize();
			_x.crossVectors( _y, _z ).normalize();
			S.shaft.matrix.makeBasis( _x, _y, _z ).setPosition( c.shaft.tail );
			// the line from their muzzle's hook to the shaft's tail
			_tip.set( 0, m.lay.L - 0.03, m.lay.bottom ).applyMatrix4( S.gun.matrix );
			const L = S.line.material.uniforms;
			L.lineA.value.copy( _tip );
			L.lineB.value.copy( c.shaft.tail );
			L.lineCtl.value.copy( _tip ).lerp( c.shaft.tail, 0.5 ).y -= _tip.distanceTo( c.shaft.tail ) * 0.05;
			S.line.visible = true;

		} else S.shaft.matrix.copy( _m ).multiply( _mt.makeTranslation( 0, 0, m.lay.shaftZ ) );
		for ( const mesh of [ S.gun, S.bands, S.shaft ] ) mesh.matrixWorldNeedsUpdate = true;

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
			pos: new Vector3(), yaw: 0, mode: 'walk', speed: 0, rod: 0, tension: 0, ride: null,
			bobber: null, boat: null, deck: null, gun: 0, gunLevel: 0, shaft: null,
			_bobber: new Vector3(), _deck: new Vector3(), _boat: { pos: new Vector3(), quat: new Quaternion() },
			_shaft: { tail: new Vector3(), dir: new Vector3() },
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
		cur.ride = typeof near.R === 'string' ? near.R : null;
		cur.spot = near.S === 1;
		cur.anchored = near.A === 1;
		cur.rpm = ( Number( a.E ) || 0 ) + ( ( Number( b.E ) || 0 ) - ( Number( a.E ) || 0 ) ) * f;
		cur.tension = b.k || 0;
		cur.bobber = lerp3( cur._bobber, a.b, b.b );
		cur.gun = near.g || 0;
		cur.gunLevel = MathUtils.clamp( near.gl | 0, 0, 2 );
		cur.net = MathUtils.clamp( near.n | 0, 0, NET_STATE.length - 1 );
		cur.netLevel = MathUtils.clamp( near.nl | 0, 0, 3 );
		cur.netDraw = Number.isFinite( b.nd ) ? b.nd : Number.isFinite( a.nd ) ? a.nd : 0;
		cur.netLen = Number.isFinite( b.nh ) ? b.nh : Number.isFinite( a.nh ) ? a.nh : NaN;
		const Ga = Array.isArray( a.G ) && a.G.length === 6 ? a.G : null, Gb = Array.isArray( b.G ) && b.G.length === 6 ? b.G : null;
		cur.shaft = null;
		if ( Ga || Gb ) {

			const A = Ga || Gb, B = Gb || Ga, S = cur._shaft;
			S.tail.set( A[ 0 ] + ( B[ 0 ] - A[ 0 ] ) * f, A[ 1 ] + ( B[ 1 ] - A[ 1 ] ) * f, A[ 2 ] + ( B[ 2 ] - A[ 2 ] ) * f );
			S.dir.set( A[ 3 ] + ( B[ 3 ] - A[ 3 ] ) * f, A[ 4 ] + ( B[ 4 ] - A[ 4 ] ) * f, A[ 5 ] + ( B[ 5 ] - A[ 5 ] ) * f );
			if ( S.dir.lengthSq() > 1e-6 && S.tail.lengthSq() < 1e8 ) {

				S.dir.normalize();
				cur.shaft = S;

			}

		}
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
				boat.userData.lamps.set( { underway: c.mode === 'helm' || ! ( c.anchored || this._docked( c.boat.pos ) ), spot: c.spot } );
				frame = c.boat;

			} else if ( this._docked( c.boat.pos ) ) frame = { pos: app.boatCtl.position, quat: app.boatCtl.quaternion };

		}

		if ( o.boat && ( ! c || ! c.boat || ! boatShown ) ) {

			o.boat.visible = false;
			o.boat.userData.lamps.set( { spot: false } ); // (its searchlight's light too)

		}

		// riding along: on the deck of the boat they're in (yours, or its owner's as drawn here)
		let deck = frame;
		if ( c && c.ride ) {

			if ( c.ride === this.me.id ) deck = { pos: app.boatCtl.position, quat: app.boatCtl.quaternion };
			else {

				const ow = this.others.get( c.ride ), ob = ow && ow.cur && ow.cur.boat;
				deck = ! ob ? null : ( ow.boat && ow.boat.visible ) || ! this._docked( ob.pos ) ? ob : { pos: app.boatCtl.position, quat: app.boatCtl.quaternion };

			}

		}

		const aboardMine = !! ( c && c.ride === this.me.id );
		if ( aboardMine && ! o.aboardMine ) app.game.toast( `${ o.person.name } came aboard`, 2600 );
		o.aboardMine = aboardMine;
		const T = o.tackle;
		if ( ! visible || ! c ) {

			T.rod.visible = T.line.visible = T.bobber.visible = false;
			o.spear.gun.visible = o.spear.bands.visible = o.spear.shaft.visible = o.spear.line.visible = false;
			if ( o.net && o.net.equipped ) o.net.equip( false );
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

			if ( deck && c.mode === 'deck' && c.deck ) g.position.copy( c.deck ).applyQuaternion( deck.quat ).add( deck.pos );
			else g.position.copy( c.pos );
			g.quaternion.setFromAxisAngle( _up, c.yaw + Math.PI );

		}

		// (Salt Life) their cast net first: their arms reach for where its hands are
		this._net( o, c, g, dt );
		o.avatar.pose( { mode: c.mode, speed: c.speed, rod: c.rod > 0, gun: c.gun > 0, reach: o.net && o.net.equipped ? o.netHands : null }, dt );
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

		// (Salt Life) their speargun, held out ahead of them as they swim (toward its shaft when that's out)
		this._spear( o, c, g );

		// the fish they've just landed, on the end of their line (or their shaft), turned to you
		if ( o.fish ) {

			const onShaft = c.gun === 4 && c.shaft;
			const show = ( ( lineOn && c.rod === 6 ) || onShaft ) && performance.now() / 1000 < o.fishUntil;
			o.fish.visible = !! show;
			if ( show ) {

				const cam = app.camera.position;
				const at = onShaft ? _p.copy( c.shaft.tail ).addScaledVector( c.shaft.dir, o.spearM - 0.25 ) : c.bobber;
				o.fish.position.copy( at );
				o.fish.rotation.set( 0, Math.atan2( cam.x - at.x, cam.z - at.z ), 0 );

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
			const own = t.getObjectByName( 'BoatLamps' );
			if ( own ) own.removeFromParent();
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
		// its own lamps (their state is theirs), its searchlight's light among the island's
		const lamps = b.userData.lamps = new BoatLamps( app.boat );
		lamps.addLight( app.localLights );
		b.add( lamps.group );
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

	// the boat to hear (App, for the sound: null = your own): the one you're riding in; or on foot or in
	// the water, the nearest someone is driving (its engine and the water past it, fading with
	// distance in the sound's own panning)
	boatSound() {

		const p = this.app.player;
		if ( p.riding ) {

			const o = this.others.get( p.boat.owner ), c = o && o.cur;
			return { active: !! ( c && c.mode === 'helm' ), rpm: c ? c.rpm : 0, speed: p.boat.speed, position: p.boat.position };

		}

		if ( p.mode === 'boat' || p.mode === 'deck' || this.app.boatCtl.driven ) return null;
		let best = null, bd = 120;
		const cam = this.app.camera.position;
		for ( const o of this.others.values() ) {

			const c = o.cur;
			if ( ! c || ! c.boat || c.mode !== 'helm' ) continue;
			const d = c.boat.pos.distanceTo( cam );
			if ( d < bd ) {

				bd = d;
				best = o;

			}

		}

		return best ? { active: true, rpm: best.cur.rpm, speed: best.boatSpeed, position: best.cur.boat.pos } : null;

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
