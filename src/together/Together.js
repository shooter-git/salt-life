import { Vector3, Quaternion, Matrix4, MathUtils } from '../engine/index.js';
import { gltfLoader } from '@allthespaces/portal/three';
import { Avatar, LOOKS, lookOf } from './Avatar.js';
import { figureStandIn } from './Figure.js';
import { RecordsBoard } from './RecordsBoard.js';
import { BoatLamps } from '../world/boat/BoatLamps.js';
import { RADAR_RPM, PROP_DISPLAY_RPS } from '../world/BoatModel.js';
import { FISH, fishLengthCm, isTrophy } from '../game/FishTable.js';
import { PLACES } from '../game/Places.js';
import { VARIATION } from '../game/Chart.js';
import { ROD_L, SEAT_Y } from '../game/FishingRod.js';
import { gunModels, setBands } from '../game/Speargun.js';
import { CastNet } from '../game/CastNet.js';
import { G } from '../core/Globals.js';
import { gearStats, defaultUpgrades } from '../game/Gear.js';
import { DAY_RATE, REST, clockAt, restTo } from '../game/IslandClock.js';
import { weekOrder, weekNumber, tallyFor, deliver, delivered } from '../game/WeekOrder.js';
import { lb } from '../game/Units.js';
import { WORLD } from '../world/WorldLayout.js';
import { islandTime, weatherHere } from '../game/Weather.js';
import { anchorLie, boatRecord, cleanBoats, keepBoat, sheerAt, swingRate, wearRate } from '../game/Away.js';
import { RODE_SLACK } from '../player/BoatController.js';

// (Salt Life) Playing together: whoever else is on the island (portal.session, All the Spaces), drawn
// where they are, doing what they do. Light, drop-in: everyone keeps their own progress and their own
// fish; what's shared is
//  - where each of you is: a pose message about ten times a second while anyone else is here ('p'),
//    shown a little behind (DELAY) and eased between, so it moves smoothly
//  - the time of day: one clock for everyone (the shared value 'clock': { at, hour, day, speed }, see
//    game/IslandClock.js), which the host sets if there's none. On your own you can hold it and rest
//    until later; in company it runs, and a rest needs everyone here to want it ('rest.<id>')
//  - the weather picked: one for everyone (the shared value 'weather': { id, since }: null the day's;
//    since, a hurricane's start), anyone's pick, a new room starting from its host's
//  - (M14) the host's clouds and whale: where the clouds have drifted to (SkyProClouds.driftState) and where
//    the whale is on its loop and what it's doing (WhaleBrain.snapshot), sent by the host every WORLD_S
//    ('world'), followed by everyone else's (followDrift, followHost): each kept their own, and the clouds
//    over the island and the whale breaching by the pier were one player's and not another's
//  - the sea: its waves' time (G.time) from the shared 'waves' (ms since 1970 when it was 0), which the host
//    sets from its own, so the same waves roll under everyone (each kept its own, and a boat, a swimmer or
//    a bobber sat on another's sea as it was there: someone's boat awash, its deck under your waves)
//  - catches: a message to the others ('catch'), who see the fish on your line and you cheering; a
//    toast only for one worth hearing of (an island record or a trophy-sized fish)
//  - the island's records: each species' heaviest fish anyone in the group has landed, who and when,
//    in the group's shared save ('records': kept between visits), chalked on a board at Joe's stand
//    (RecordsBoard) and listed in the cooler
//  - the week's order (game/WeekOrder.js): what each of the group has brought toward it, in the
//    group's shared save ('weekOrder'); a sale toward it brings that up to date and tells the others
//    ('week', with the tally)
//  - (M15) anchored boats whose owners are away, in the group's shared save ('boats': its shape in game/Away.js):
//    on everyone's sea from there, each device floating them on its own. Her pose is only ever her owner's; the
//    host keeps her wear and her tow while they're gone ('boats', with the saved list, tells the others)
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
//   t.syncWaves()  (each frame, after the time's moved on: the waves' time from the shared one)
//   t.alone  t.holdClock( held )  t.rest( 'dawn' )  t.restWishes()  (the clock's menu: game/TimeHUD.js)
//   t.setWeather( id, since )  (a pick, for everyone here)
//   t.week()  (this week's order's tally)  t.deliver( kg )  (a sale toward it)
//   t.setBoats( boats, mine )  (the group's anchored boats, as read at the start)  t.mineBoat( now )  (yours in it)

const SEND = 0.1; // s between poses
const WORLD_S = 1; // (M14) s between the host's clouds and whale ('world')
const SETTLE_MS = 8000; // (Salt Life) after this long with nobody else in the lists, you're on your own
const DELAY = 0.15; // s behind the newest pose: room to ease between two
const STALE = 6; // s without a pose: not shown
const TAG_FAR = 70; // m: names fade out toward here
const KEEP_S = 10; // (M15) s between the host's looks at the boats whose owners are away
const KEEP_SAVE = 0.005; // (and what the weather's taken off one before it's written)
const MINE_MS = 5 * 60e3; // (M15) how often your own anchored boat's record is brought up to date
const AWAY_NEAR = 600; // m: an away boat further off than this isn't tilted to the waves
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
const _bp = new Vector3(), _bq = new Quaternion(), _bow = new Vector3();

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

// another player's boat as their pose has it ({ pos, quat, water: the sea's height under her there, or
// null }) on your sea: as high over it as over theirs, so she's never awash here, nor out of it, whatever
// the difference between the two (the waves' time a moment apart, a tier's fewer waves). waves: Waves
export function floatBoat( boat, waves ) {

	if ( boat && typeof boat.water === 'number' && waves ) boat.pos.y += waves.heightAt( boat.pos.x, boat.pos.z ) - boat.water;
	return boat;

}

export class Together {

	constructor( app ) {

		this.app = app;
		this.portal = app.portal;
		this.session = app.portal.session;
		this.me = app.portal.me;
		this.limits = LIMITS[ app.tier ] || LIMITS.low;
		this.others = new Map(); // id -> Remote
		this._since = Date.now(); // (when the game joined: the first lists may not have everyone)
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
		this._shareWorld();
		if ( s.onAnyChange ) s.onAnyChange( ( key ) => key.startsWith( 'rest.' ) && this._restVote() );
		if ( s.onHostChange ) s.onHostChange( () => {

			if ( s.isHost && ! s.get( 'clock' ) ) this.setClock( app.settings.timeOfDay, app.settings.day, app.settings.timeSpeed || DAY_RATE );

		} );
		s.on( 'catch', ( body, from ) => this._theirCatch( body, from ) );
		s.on( 'net', ( body, from ) => this._theirThrow( body, from ) );
		s.on( 'horn', ( on, from ) => this._theirHorn( on, from ) );
		s.on( 'week', ( tally ) => this._setWeek( tally ) );
		s.on( 'world', ( body ) => this._theirWorld( body ) );
		this._worldT = 0;
		// ((M14) coming to host: the whale's surfacings your own again)
		if ( s.onHostChange ) s.onHostChange( () => { if ( s.isHost && app.whale ) app.whale.brain.led = false; } );

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

		// ((M15) the group's anchored boats: read at the start (App.pickUp), and again as someone goes)
		this.boats = {};
		this.away = new Map(); // owner's id -> { r, boat, frame, y, pitch, roll, near }: those drawn here
		this._boatSaved = false; // (your boat's in the group's save)
		this._boatSavedAt = 0;
		this._keepT = 0;
		this._owed = {};
		s.on( 'boats', ( boats ) => this._setBoats( boats ) );

	}

	// ---- anchored boats whose owners are away

	// the group's boats (cleaned), as read at the start; mine: yours is among them
	setBoats( boats, mine ) {

		this.boats = boats;
		this._boatSaved = mine;

	}

	_setBoats( raw ) {

		const boats = cleanBoats( raw );
		// (what the host's seen of the weather and not yet written)
		for ( const [ id, r ] of Object.entries( boats ) ) {

			const was = this.boats[ id ];
			if ( was && was.at === r.at && was.wear > r.wear ) r.wear = was.wear;

		}

		this.boats = boats;

	}

	_readBoats() {

		return this.portal.save.shared.get( 'boats' ).then( ( b ) => this._setBoats( b ) ).catch( ( e ) => console.warn( 'boats', e ) );

	}

	// a change to the group's boats: all of it, whoever else saved meanwhile (update tries again), and the others told
	_saveBoats( change ) {

		return this.portal.save.shared.update( 'boats', ( cur ) => change( cleanBoats( cur ) ) ).then( ( saved ) => {

			this._setBoats( saved );
			if ( this.others.size ) this.session.send( 'boats', saved );

		} ).catch( ( e ) => console.warn( 'boats', e ) );

	}

	// Your boat's place in the group's save: there while she's at anchor, so she's on everyone's sea when you go
	// (written at once, and brought up to date every few minutes and as you go: now), gone once she isn't
	mineBoat( now = false ) {

		const app = this.app, b = app.boatCtl, id = this.me.id, t = Date.now();
		if ( ! b.anchor || b.driven || b.hauled ) {

			if ( ! this._boatSaved ) return Promise.resolve();
			this._boatSaved = false;
			return this._saveBoats( ( cur ) => {

				delete cur[ id ];
				return cur;

			} );

		}

		if ( ! now && this._boatSaved && t - this._boatSavedAt < MINE_MS ) return Promise.resolve();
		this._boatSaved = true;
		this._boatSavedAt = t;
		const r = boatRecord( { name: this.me.name, x: b.position.x, z: b.position.z, heading: b.getYaw(), anchor: b.anchor, at: t } );
		return this._saveBoats( ( cur ) => {

			cur[ id ] = r;
			return cur;

		} );

	}

	// The host's look at the boats whose owners are away: a hurricane's warning, or a week gone, and Marta tows her
	// in; a storm takes its toll. Her wear's written once there's some of it to write
	_keepBoats( dt ) {

		this._keepT += dt;
		if ( this._keepT < KEEP_S ) return;
		const seconds = Math.min( this._keepT, KEEP_S * 3 );
		this._keepT = 0;
		if ( ! this.session.isHost ) return;
		const app = this.app, s = app.settings, T = islandTime( s.day, s.timeOfDay ), n = app.weather && app.weather.news;
		const warned = !! n && ( n.stage === 'warning' || T >= n.onset ), dock = WORLD.boatDock.position, pick = app.weatherPick(), now = Date.now();
		const due = {};
		for ( const [ id, r ] of Object.entries( this.boats ) ) {

			if ( id === this.me.id || this.others.has( id ) || r.tow ) continue;
			const next = keepBoat( r, { now, warned, rate: wearRate( weatherHere( T, pick, s.weatherSince, r.x, r.z ) ), seconds, dock } );
			if ( next === r ) continue;
			this._owed[ id ] = ( this._owed[ id ] || 0 ) + next.wear - r.wear;
			this.boats[ id ] = next;
			if ( next.tow || this._owed[ id ] >= KEEP_SAVE ) due[ id ] = next;

		}

		const ids = Object.keys( due );
		if ( ! ids.length ) return;
		for ( const id of ids ) delete this._owed[ id ];
		// (her wear and her tow, never her pose: if she's gone or they're back, as she is)
		this._saveBoats( ( cur ) => {

			for ( const id of ids ) if ( cur[ id ] && cur[ id ].at === due[ id ].at ) {

				cur[ id ].wear = Math.max( cur[ id ].wear, due[ id ].wear );
				cur[ id ].tow = cur[ id ].tow || due[ id ].tow;

			}

			return cur;

		} );

	}

	// The boats to draw this frame: whoever's away, nearest first, in what's left of the device's boats after those
	// being driven about (and the one you're aboard, always), each floated on your sea
	_awayBoats( dt ) {

		const app = this.app, cam = app.camera.position, list = [];
		const riding = app.player.riding ? app.player.boat.owner : null;
		for ( const [ id, r ] of Object.entries( this.boats ) ) {

			// (her owner back, she's theirs once they've sent where she is)
			const o = this.others.get( id );
			if ( id !== this.me.id && ! r.tow && ! ( o && o.cur && o.cur.boat ) ) list.push( [ Math.hypot( r.x - cam.x, r.z - cam.z ), id, r ] );

		}

		list.sort( ( a, b ) => a[ 0 ] - b[ 0 ] );
		const room = Math.max( 0, this.limits.boats - ( this._liveBoats || 0 ) ), show = new Set();
		for ( const [ d, id, r ] of list ) {

			const a = this.away.get( id ) || this._awayEntry( id );
			a.r = r;
			a.near = d < AWAY_NEAR;
			if ( show.size < room || id === riding ) {

				show.add( id );
				this._floatAway( a, dt );

			}

		}

		for ( const [ id, a ] of this.away ) {

			const on = show.has( id );
			if ( on && ! a.boat ) {

				a.boat = this._boatCopy();
				a.boat.userData.lamps.set( { underway: false, spot: false } ); // (her anchor light)
				a.rode = app.game.rodeCopy();
				app.scene.add( a.rode );

			}

			if ( a.boat ) {

				a.boat.visible = on;
				a.rode.visible = on;
				if ( on ) {

					a.boat.position.copy( a.frame.pos );
					a.boat.quaternion.copy( a.frame.quat );
					// (her rode, from her stem head to where her anchor lies)
					a.rode.material.uniforms.lineA.value.copy( app.boatCtl.stemHead ).applyQuaternion( a.frame.quat ).add( a.frame.pos );
					app.game.layRode( a.rode, _q.set( a.r.a[ 0 ], app.terrainData.heightAt( a.r.a[ 0 ], a.r.a[ 1 ] ), a.r.a[ 1 ] ) );

				}

			}

			// (gone: towed in, her owner's back, or she's up and away)
			if ( ! list.some( ( e ) => e[ 1 ] === id ) ) this._dropAway( id );

		}

	}

	_awayEntry( id ) {

		const a = { id, r: null, boat: null, rode: null, theirBoat: null, frame: { pos: new Vector3(), quat: new Quaternion(), water: null }, y: null, heading: 0, pitch: 0, roll: 0, near: false };
		this.away.set( id, a );
		return a;

	}

	_dropAway( id ) {

		const a = this.away.get( id ), app = this.app;
		if ( a && a.boat ) {

			app.scene.remove( a.boat );
			a.boat.userData.lamps.removeLight( app.localLights );
			a.boat.userData.lamps.dispose();
			app.scene.remove( a.rode );
			a.rode.material.dispose();

		}

		this.away.delete( id );

	}

	// on your own sea and in your own wind: lying to it from her anchor as she does (anchorLie; found lying so, and
	// coming round as it does), heaving, pitching and rolling with the sea (her ends' and sides' heights), a little
	// behind it as a hull is. Nobody's sending her pose; this is each device's own, where she lies
	_floatAway( a, dt ) {

		const app = this.app, w = app.waves, r = a.r, f = a.frame, wind = G.windDir.value, U = G.windSpeed.value;
		const lie = anchorLie( r.a[ 0 ], r.a[ 1 ], wind.x, wind.y, U, RODE_SLACK + app.boatCtl.stemHead.z );
		if ( a.y === null ) a.heading = lie.heading;
		else {

			const gap = lie.heading - a.heading;
			a.heading += Math.atan2( Math.sin( gap ), Math.cos( gap ) ) * ( 1 - Math.exp( - dt * swingRate( U ) ) );

		}

		// (and sheering about it: the bow held by the rode, the stern swinging)
		const heading = a.heading + sheerAt( G.time.value, U, a.id ), sin = Math.sin( heading ), cos = Math.cos( heading );
		const x = r.a[ 0 ] - sin * lie.reach, z = r.a[ 1 ] - cos * lie.reach;
		let h = w ? w.heightAt( x, z ) : 0, pitch = 0, roll = 0;
		if ( w && a.near ) {

			const L = 3.5, B = 1.4;
			const bow = w.heightAt( x + sin * L, z + cos * L ), stern = w.heightAt( x - sin * L, z - cos * L );
			const port = w.heightAt( x + cos * B, z - sin * B ), star = w.heightAt( x - cos * B, z + sin * B );
			h = ( bow + stern + port + star ) / 4;
			pitch = Math.atan2( stern - bow, 2 * L );
			roll = Math.atan2( port - star, 2 * B );

		}

		const k = a.y === null ? 1 : 1 - Math.exp( - dt * 3 );
		a.y = a.y === null ? h : a.y + ( h - a.y ) * k;
		a.pitch += ( pitch - a.pitch ) * k;
		a.roll += ( roll - a.roll ) * k;
		f.pos.set( x, a.y, z );
		f.quat.setFromAxisAngle( _up, heading ).multiply( _qa.setFromAxisAngle( _x.set( 1, 0, 0 ), a.pitch ) ).multiply( _qb.setFromAxisAngle( _z.set( 0, 0, 1 ), a.roll ) );

	}

	// where an away boat lies this frame, on your sea, or null
	_awayFrame( id ) {

		const a = id && this.away.get( id );
		return a && a.y !== null && ! ( this.boats[ id ] && this.boats[ id ].tow ) ? a.frame : null;

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
		// ((M15) and each place's: '@' and its id, which fish it was)
		for ( const [ k, v ] of Object.entries( r ) ) if ( k[ 0 ] === '@' && PLACES[ k.slice( 1 ) ] && v && typeof v.kg === 'number' && FISH[ v.s ] ) clean[ k ] = v;
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
	// (Salt Life) method: 'rod', 'spear', 'net' or 'hand' (a lobster); a speared, netted or hand-taken
	// record says so (m: 's' | 'n' | 'h')
	// (M15) place: where (Places.js): the heaviest fish anyone's had there is the place's record, under '@'
	// and its id in the same shared save (-> place: true when this one is, and placeHeld: the one it beat)
	caught( species, kg, cm, method = 'rod', place = null ) {

		const held = this.records[ species ];
		const island = ! held || kg > held.kg;
		const pk = place && PLACES[ place ] ? '@' + place : null, placeHeld = pk ? this.records[ pk ] || null : null;
		const atPlace = !! pk && ( ! placeHeld || kg > placeHeld.kg );
		const m = { spear: 's', net: 'n', hand: 'h' }[ method ] || null;
		const tell = ( record ) => {

			if ( this.others.size ) this.session.send( 'catch', m ? { s: species, kg: r3( kg ), cm, rec: record, m } : { s: species, kg: r3( kg ), cm, rec: record } );

		};
		if ( ! island && ! atPlace ) {

			tell( false );
			return { island: false, held, place: false, placeHeld };

		}

		const mine = { kg: r3( kg ), cm, who: this.me.name, id: this.me.id, at: Date.now() };
		if ( m ) mine.m = m;
		this.portal.save.shared.update( 'records', ( cur ) => {

			const next = cur && typeof cur === 'object' ? { ...cur } : {};
			const r = next[ species ];
			if ( island && ( ! r || kg > r.kg ) ) next[ species ] = mine;
			// ((M15) the place's: which fish, too)
			const rp = pk && next[ pk ];
			if ( atPlace && ( ! rp || kg > rp.kg ) ) next[ pk ] = { ...mine, s: species };
			return next;

		} ).then( ( saved ) => {

			this._setRecords( saved );
			const ours = island && saved[ species ] && saved[ species ].id === this.me.id && saved[ species ].at === mine.at;
			tell( !! ours );

		} ).catch( ( e ) => {

			console.warn( 'records', e );
			tell( false );

		} );
		return { island, held, place: atPlace, placeHeld };

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
		if ( b.rec || isTrophy( b.s, b.kg ) ) this.app.game.toast( `${ o.person.name } ${ { s: 'speared', n: 'netted', h: 'caught by hand' }[ b.m ] || 'caught' } a ${ lb( b.kg, 1 ) } ${ FISH[ b.s ].name.toLowerCase() }${ b.rec ? ': a new island record!' : '' }`, 4200 );
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

	// alone and sure of it: a solo session, or nobody else here once the lists have had time to name
	// everyone (the game's first list may not have whoever was already there: holding or resting the
	// clock then set the room's, held for everyone)
	// (M15) whether any room's clock and weather have reached you yet (on your own there's none to wait for)
	get roomKnown() {

		return this.session.mode === 'solo' || Date.now() - this._since > SETTLE_MS;

	}

	get surelyAlone() {

		return this.session.mode === 'solo' || ( this.others.size === 0 && ( this._settled || Date.now() - this._since > SETTLE_MS ) );

	}

	// the weather picked and the waves' time: the session's, or yours if there's none and you host (and
	// again if you come to host a room that has none)
	_shareWorld() {

		const s = this.session, set = this.app.settings;
		this._waves = null;
		const share = () => {

			if ( ! s.isHost ) return;
			if ( ! s.get( 'weather' ) ) this.setWeather( set.weather, set.weatherSince );
			if ( typeof s.get( 'waves' ) !== 'number' ) this._setWaves();

		};
		const wx = s.get( 'weather' ), waves = s.get( 'waves' );
		if ( wx ) this._adoptWeather( wx );
		if ( typeof waves === 'number' ) this._waves = waves;
		share();
		s.onChange( 'weather', ( value ) => this._adoptWeather( value ) );
		s.onChange( 'waves', ( value ) => { if ( typeof value === 'number' ) this._waves = value; } );
		if ( s.onHostChange ) s.onHostChange( share );

	}

	// the weather picked, for everyone here (id null: the day's; since: a hurricane's start, an
	// island time), and as it's adopted from the session
	setWeather( id, since ) {

		const value = { id: id || null, since: Number.isFinite( since ) ? since : 0 };
		this._adoptWeather( value );
		if ( this.session.mode !== 'solo' ) this.session.set( 'weather', value ).catch( ( e ) => console.warn( 'weather', e ) );

	}

	_adoptWeather( value ) {

		if ( ! value || typeof value !== 'object' ) return;
		const s = this.app.settings;
		s.weather = typeof value.id === 'string' ? value.id : null;
		s.weatherSince = Number.isFinite( value.since ) ? value.since : 0;

	}

	// (M14) the host's clouds and whale, as sent ('world'): { at (ms since 1970), sky, whale }
	_world() {

		const app = this.app, C = app.sky && app.sky.clouds;
		return { at: Date.now(), sky: C && C.driftState ? C.driftState() : null, whale: app.whale ? app.whale.brain.snapshot() : null };

	}

	// (M14) the host's, followed (the host leads: its own are its own), as late as it's come
	_theirWorld( body ) {

		if ( ! body || this.session.isHost ) return;
		const app = this.app, C = app.sky && app.sky.clouds;
		const late = MathUtils.clamp( ( Date.now() - ( Number( body.at ) || Date.now() ) ) / 1000, 0, 1 );
		if ( body.sky && C && C.followDrift ) C.followDrift( body.sky, late );
		if ( body.whale && app.whale ) app.whale.brain.followHost( body.whale, late );

	}

	// the waves' time: the room's, from the host's own (so the host's sea doesn't jump)
	_setWaves() {

		if ( this.session.mode === 'solo' ) return;
		this._waves = Date.now() - G.time.value * 1000;
		this.session.set( 'waves', this._waves ).catch( ( e ) => console.warn( 'waves', e ) );

	}

	syncWaves() {

		if ( this._waves !== null && this.session.mode !== 'solo' ) G.time.value = ( Date.now() - this._waves ) / 1000;

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

		if ( ! this.surelyAlone ) return false;
		const s = this.app.settings;
		this.setClock( s.timeOfDay, s.day, held ? 0 : DAY_RATE );
		return true;

	}

	// rest until 'dawn' | 'noon' | 'dusk' | 'night' (null: never mind). On your own, at once; in company,
	// a wish everyone here sees, and the host moves the clock once all of you want the same -> done now?
	rest( to ) {

		const s = this.app.settings;
		if ( this.surelyAlone ) {

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
		// (the room's clock as it is now: your settings catch up with it only as your frames run, and a hidden
		// tab's don't)
		const s = this.app.settings, now = this._clock ? clockAt( this._clock ) : { hour: s.timeOfDay, day: s.day };
		if ( came && ! first && this.session.isHost ) this.setClock( now.hour, now.day, s.timeSpeed || DAY_RATE );

		for ( const [ id, o ] of this.others ) {

			if ( here.has( id ) ) continue;
			this._drop( o );
			this.others.delete( id );
			this.app.game.toast( `${ o.person.name } left`, 2600 );
			// ((M15) and their boat, if she's at anchor: what they wrote as they went)
			setTimeout( () => this._readBoats(), 3000 );

		}

	}

	_remote( person ) {

		const app = this.app;
		const avatar = new Avatar( person );
		avatar.group.visible = false;
		app.scene.add( avatar.group );
		app.lightPerson( avatar.group );
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
			this.app.lightPerson( o.avatar.group );

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
			await app.useNewPrograms();
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
			if ( r >= 3 && rod.lineInWater ) body.b = [ r2( rod.bobber.x ), r2( rod.bobber.y ), r2( rod.bobber.z ), r2( app.waves.heightAt( rod.bobber.x, rod.bobber.z ) ) ];
			if ( r === 5 && app.game.fight ) body.k = r2( Math.min( 1, app.game.fight.tension || 0 ) );

		}

		// (the sea's height where you swim: a swimmer's put as far under another's sea)
		if ( m === 's' ) body.w = r2( app.waves.heightAt( p.position.x, p.position.z ) );
		// your boat, wherever she is (moored too: without it, someone whose own was out saw an empty
		// berth), and the sea's height under her here (on another's sea she floats as high over theirs);
		// riding along in someone else's, whose (R), and where on its deck
		const q = boat.quaternion, bp = boat.position;
		body.B = [ r2( bp.x ), r2( bp.y ), r2( bp.z ), r3( q.x ), r3( q.y ), r3( q.z ), r3( q.w ), r2( app.waves.heightAt( bp.x, bp.z ) ) ];
		if ( p.riding ) body.R = p.boat.owner;
		if ( body.B && this.app.searchlight ) body.S = 1; // (your boat's searchlight is on)
		// ((M14) her deck floodlights' lenses, as lit as yours are: fitted, and as dark as it is)
		const flood = app.game.floodsOn;
		if ( flood > 0 ) body.L = r2( flood );
		if ( body.B && ( boat.anchor || boat.moored ) ) body.A = 1; // (it's at anchor or moored: its lamps say so)
		if ( m === 'h' ) body.E = r2( boat.rpm ); // (the engine's revs: what the others hear)
		// (M10) the starter turning her over (1; 2: it'll catch), heard by whoever's aboard
		const crank = m === 'h' && this.app.game ? this.app.game.hull.crank : 0;
		if ( crank ) body.K = crank;
		// (M11) her hull as it's heard aboard (App.hullHeard: the bilge, the pump, the keel scraping, her wear,
		// how hard she's working), for whoever rides along: while you're aboard and there's something to hear
		if ( body.B && ! p.riding && ( m === 'd' || m === 'h' ) && this.app.game ) {

			const h = this.app.hullHeard();
			if ( h.flood > 0.005 || h.pump || h.scrape > 0.3 || h.motion > 0.05 ) body.H = [ r2( h.flood ), h.pump ? 1 : 0, r2( h.scrape ), r2( h.wear ), r2( h.motion ) ];

		}
		if ( m === 'd' ) body.D = [ r2( p.deckPos.x ), r2( p.deckPos.y ), r2( p.deckPos.z ) ];
		// (M12) what her dash reads that a rider can't work out where they are: her fuel (a share), whether she
		// has Marta's fish finder, and the fish it shows; while you're aboard her
		if ( body.B && ! p.riding && ( m === 'd' || m === 'h' ) && this.app.game ) {

			const g = this.app.game, st = g.state;
			body.F = [ r2( st.fuelL / st.stats.fuelL ), st.stats.finder ? 1 : 0, r2( g._sonar ? g._sonar.fish : 0 ) ];

		}

		return body;

	}

	// ---- per frame

	// before the player: where everyone is now; the boat you're riding in; someone's boat to board
	track( dt ) {

		const app = this.app, p = app.player;
		if ( app._started ) this._awayBoats( dt );
		const now = performance.now() / 1000;
		for ( const o of this.others.values() ) {

			o.cur = now - o.last < this.stale ? this._at( o, now - DELAY ) : null;
			// (their boat on your sea, and everyone aboard her with it; a swimmer and a bobber too)
			const c = o.cur;
			if ( c && app.waves ) {

				floatBoat( c.boat, app.waves );
				if ( c.mode === 'swim' && c.water !== null ) c.pos.y += app.waves.heightAt( c.pos.x, c.pos.z ) - c.water;
				if ( c.bobber && c.bobberWater !== null ) c.bobber.y += app.waves.heightAt( c.bobber.x, c.bobber.z ) - c.bobberWater;

			}
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
			// ((M15) her owner's pose, or with them away, where she lies on your sea)
			const frame = ( o && o.cur && o.cur.boat ) || this._awayFrame( p.boat.owner );
			if ( frame ) p.boat.follow( frame, dt );
			else {

				const towed = this.boats[ p.boat.owner ], name = o ? o.person.name : towed ? towed.n : 'their';
				if ( p.mode === 'deck' ) p.exitBoat( null, 1 );
				else p.unride();
				app.game.toast( towed && towed.tow ? `Marta's towed ${ name }'s boat in` : `${ name === 'their' ? 'The' : name + '\'s' } boat has gone`, 2600 );

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

			// ((M15) and an anchored boat with nobody home: aboard to fish off her, and nothing more. You ride her as
			// you ride anyone's: no helm, and your catch in your own hold)
			for ( const [ id, a ] of this.away ) {

				if ( ! a.boat || ! a.boat.visible ) continue;
				const f = a.frame;
				_bp.copy( app.boat.boardPoint ).applyQuaternion( f.quat ).add( f.pos );
				const d = Math.hypot( _bp.x - p.position.x, _bp.z - p.position.z );
				if ( d > 4.2 || Math.abs( _bp.y - p.position.y ) > 3.2 || d > best ) continue;
				best = d;
				const boat = a.theirBoat || ( a.theirBoat = new TheirBoat( id, app.boat ) );
				boat.follow( f, 0 );
				p.rideOffer = { name: a.r.n || 'someone', boat };

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

		// ((M14) the host's clouds and whale, for everyone else's to follow)
		this._worldT += dt;
		if ( this.others.size && this.session.isHost && this._worldT >= WORLD_S ) {

			this._worldT = 0;
			this.session.send( 'world', this._world() );

		}

		this._ownBoat();
		this._keepBoats( dt );
		this._liveBoats = 0;
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
		this._liveBoats = boats.size;
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
			_bobber: new Vector3(), _deck: new Vector3(), _boat: { pos: new Vector3(), quat: new Quaternion(), water: null },
			hull: null, _hull: { flood: 0, pump: false, scrape: 0, wear: 0, motion: 0 },
			dash: null, _dash: { fuel: 0, finder: false, fish: 0 },
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
		// (a number in each, eased; else null)
		const lerp1 = ( A, B ) => typeof A === 'number' && typeof B === 'number' ? A + ( B - A ) * f : null;
		// (the sea's height where they swim, theirs: a swimmer's put as far under yours)
		cur.water = lerp1( a.w, b.w );
		cur.yaw = a.a + Math.atan2( Math.sin( b.a - a.a ), Math.cos( b.a - a.a ) ) * f;
		cur.mode = NAMES[ near.m ] || 'walk';
		cur.speed = ( a.v || 0 ) + ( ( b.v || 0 ) - ( a.v || 0 ) ) * f;
		cur.rod = near.r || 0;
		cur.ride = typeof near.R === 'string' ? near.R : null;
		cur.spot = near.S === 1;
		cur.anchored = near.A === 1;
		cur.flood = MathUtils.clamp( Number( near.L ) || 0, 0, 1 ); // ((M14) her floodlights' lenses)
		cur.rpm = ( Number( a.E ) || 0 ) + ( ( Number( b.E ) || 0 ) - ( Number( a.E ) || 0 ) ) * f;
		cur.crank = near.K === 1 || near.K === 2 ? near.K : 0;
		// (M11) her hull as the skipper hears it (none sent: nothing to hear)
		const H = Array.isArray( near.H ) && near.H.length === 5 && near.H.every( Number.isFinite ) ? near.H : null;
		cur.hull = H ? Object.assign( cur._hull, { flood: MathUtils.clamp( H[ 0 ], 0, 3 ), pump: H[ 1 ] === 1, scrape: Math.max( 0, H[ 2 ] ), wear: MathUtils.clamp( H[ 3 ], 0, 1 ), motion: MathUtils.clamp( H[ 4 ], 0, 1 ) } ) : null;
		// (M12) her dash's readings a rider can't work out (none sent: not aboard)
		const F = Array.isArray( near.F ) && near.F.length === 3 && near.F.every( Number.isFinite ) ? near.F : null;
		cur.dash = F ? Object.assign( cur._dash, { fuel: MathUtils.clamp( F[ 0 ], 0, 1 ), finder: F[ 1 ] === 1, fish: MathUtils.clamp( F[ 2 ], 0, 1 ) } ) : null;
		cur.tension = b.k || 0;
		cur.bobber = lerp3( cur._bobber, a.b, b.b );
		// (and where their bobber floats, theirs)
		cur.bobberWater = cur.bobber && Array.isArray( a.b ) && Array.isArray( b.b ) ? lerp1( a.b[ 3 ], b.b[ 3 ] ) : null;
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
			cur.boat.water = lerp1( A[ 7 ], B[ 7 ] );

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
				boat.userData.lamps.set( { underway: c.mode === 'helm' || ! c.anchored, spot: c.spot } );
				boat.userData.floodOn.value = c.flood;
				this._spin( boat, c.rpm, dt );
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
				deck = ! ob ? null : ow.boat && ow.boat.visible ? ob : this._docked( ob.pos ) ? { pos: app.boatCtl.position, quat: app.boatCtl.quaternion } : null;
				// ((M15) aboard a boat whose owner's away: where she lies here, if she's drawn)
				const aw = ! ob && this.away.get( c.ride );
				if ( aw && aw.boat && aw.boat.visible ) deck = aw.frame;

			}

		}

		// (aboard a boat that isn't drawn here, past your device's few: not shown, rather than standing on the sea)
		if ( c && ( ( c.mode === 'helm' && ! frame ) || ( c.mode === 'deck' && ! deck ) ) ) {

			visible = false;
			g.visible = o.shown = false;

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

			// (on the wheelhouse's sole: its camera's eye is lower than a figure standing there)
			const helm = app.boat.helmEye;
			_bp.set( helm.x, app.boat.dimensions.deckHeight, helm.z ).applyQuaternion( frame.quat ).add( frame.pos );
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
				// (M11) their dash on standby: the readings drawn are yours
				if ( c.name === 'boat-display' && app.instruments ) c.material = app.instruments.standby;
				// (the wheel, the rudder and the lever amidships: as yours were when copied, they stayed)
				if ( c.name === 'boat-wheel' ) c.rotation.z = 0;
				if ( c.name === 'boat-rudder' ) c.rotation.y = 0;
				if ( c.name === 'boat-throttle' ) c.rotation.x = 0;

			} );

		}

		const b = this._boatTemplate.clone( true );
		b.name = 'PlayerBoat';
		// ((M14) her own lenses, lit as her floodlights are, not as yours: a glow of her own, the same shader)
		const mats = app.boat.materials, floodOn = b.userData.floodOn = { value: 0 };
		if ( mats && mats.glow ) {

			const glow = mats.createGlow.call( { navOn: mats.navOn, floodOn } );
			b.traverse( ( m ) => {

				if ( m.isMesh && m.material === mats.glow ) m.material = glow;

			} );
			b.userData.boatCopy = true;
			app.lightUp( b );

		}
		// (her radar turning and her propeller as her engine runs, as yours do: _spin)
		b.userData.radar = b.getObjectByName( 'boat-radar' );
		b.userData.prop = b.getObjectByName( 'boat-propeller' );
		b.userData.compass = b.getObjectByName( 'boat-compass' ); // ((M15) its card to the north as she turns)
		// its own lamps (their state is theirs), its searchlight's light among the island's
		const lamps = b.userData.lamps = new BoatLamps( app.boat );
		lamps.addLight( app.localLights );
		b.add( lamps.group );
		app.scene.add( b );
		return b;

	}

	// their boat's radar turning, and her propeller at her engine's revs (rpm: 0..1, as sent), as yours do
	// (BoatModel.update)
	_spin( boat, rpm, dt ) {

		const u = boat.userData;
		if ( u.radar ) u.radar.rotation.y = ( u.radar.rotation.y - RADAR_RPM / 60 * Math.PI * 2 * dt ) % ( Math.PI * 2 );
		if ( u.prop ) u.prop.rotation.z = ( u.prop.rotation.z + PROP_DISPLAY_RPS * Math.tanh( rpm * 40 / PROP_DISPLAY_RPS ) * Math.PI * 2 * dt ) % ( Math.PI * 2 );
		if ( u.compass ) {

			const f = _bow.set( 0, 0, 1 ).applyQuaternion( boat.quaternion );
			u.compass.rotation.y = Math.PI - VARIATION - Math.atan2( f.x, f.z );

		}

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
	// distance in the sound's own panning). (M10) An engine at the helm with its revs run down has stalled
	// (an older copy of the game idles at 0.15); crank: the starter turning her over (Hull.crank); (M11)
	// hull: her hull as her skipper hears it (App.hullHeard), or null
	// (M12) the boat you're riding in, as it's drawn here (its group), and what its skipper's pose says
	// (o.cur: rpm, crank, mode, dash), and how fast it goes; null when you're not
	// (M14) where the others' boats are, afloat (for the radar: out, filled again), and yours if you're riding
	// in someone else's
	boatsAbout( out = [] ) {

		out.length = 0;
		for ( const o of this.others.values() ) if ( o.boat && o.boat.visible && o.boat.parent ) out.push( o.boat.position );
		for ( const a of this.away.values() ) if ( a.boat && a.boat.visible ) out.push( a.boat.position );
		const p = this.app.player;
		if ( p.riding && this.app.boat && this.app.boat.group.visible ) out.push( this.app.boatCtl.position );
		return out;

	}

	ridden() {

		const p = this.app.player;
		if ( ! p.riding ) return null;
		const o = this.others.get( p.boat.owner );
		return o && o.cur ? { group: o.boat || null, cur: o.cur, speed: o.boatSpeed || 0 } : null;

	}

	boatSound() {

		const p = this.app.player;
		if ( p.riding ) {

			const o = this.others.get( p.boat.owner ), c = o && o.cur;
			return { active: !! ( c && c.mode === 'helm' && c.rpm > 0.05 ), rpm: c ? c.rpm : 0, crank: c ? c.crank : 0, speed: p.boat.speed, position: p.boat.position, hull: c ? c.hull : null };

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

		return best ? { active: best.cur.rpm > 0.05, rpm: best.cur.rpm, crank: best.cur.crank, speed: best.boatSpeed, position: best.cur.boat.pos, hull: best.cur.hull } : null;

	}

	// for the load's shaders (prepareLate): the stand-in figures' program and the records board's,
	// in the island's light, and first used (App.useNewPrograms) before the board is drawn
	async compile( renderer, camera, scene ) {

		const stand = figureStandIn();
		this.app.lightUp( stand );
		await renderer.compileAsync( stand, camera, scene );
		await renderer.compileAsync( this.board.group, camera, scene );
		await this.app.useNewPrograms();
		if ( ! this.board.group.parent ) scene.add( this.board.group );
		stand.geometry.dispose();
		stand.material.dispose();
		this.ready = true;

	}

}
