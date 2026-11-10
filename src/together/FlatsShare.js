import { Vector3 } from '../engine/index.js';
import { cleanFlats, flatsId, flatsWire, forgetFlats, mergeFlats } from '../game/Flats.js';
import { FT } from '../game/Units.js';
import { clockFrom } from './Crew.js';

// (M17) The flats together (docs/m17/flats-together.md): a guest and her host fishing the same flat see the same fish and the
// same happenings. Each school's placed from the clock, the tide and its patch of flat (game/Flats.js), the same on every game,
// so only what changes is shared:
//  - what each player's done to them, in their own record (FlatsFishing's `mine`: the schools they've spooked, till when and
//    from where, and how many they've hooked from each), as a shared value of the room's that's theirs alone to write
//    ('flats.<id>': Flats' flatsWire), so no two writes ever cross. Every game runs on all of them together (mergeFlats into
//    FlatsFishing's `state`): a school spooked on one game bolts and is gone for its quiet time on everyone's, from the same
//    island time; a fish hooked from a school is one fewer on everyone's for the rest of its visit. The room keeps the values,
//    so someone joining later, or coming back, reads the flat as it stands; what's long past is let go (forgetFlats)
//  - a fish one of you has seen and looked at, called to whoever's near it by the clock, as a guide calls it from the
//    platform: "bonefish, 10 o'clock, 40 ft, moving left" ('flats': the school and where it is; each hears it from where they
//    are, 12 o'clock their bow, or ahead of them on foot). Told where to look, they see it better (Sight.js' `told`)
// A fish being fought is seen on everyone's game as anyone's is (the pose's rod and line). A guest's catch is landed on
// the guest's own game (FlatsFishing.caught there), so a guest's slam is the guest's.
//   const f = new FlatsShare( together )   f.update( dt )   (Together.update, alone too: the room keeps your record for whoever comes)
//   callText( kind, mode, n, x, z, hx, hz, from )   the words of a call, heard at from = { x, z, yaw }

export const FLATS_KEY = 'flats.'; // + a player's id: their record
const WRITE_S = 0.3; // s after a change that your record's written: a hook and its school's spook go as one
const AGAIN_S = 5; // s before a write that failed is tried again
const FORGET_S = 20; // s between lettings-go of what's long past
export const CALL = {
	dwell: 1.0, // s looked at, seen, before it's called
	look: Math.cos( 12 * Math.PI / 180 ), // that near the middle of your view
	seen: 0.5, // that plainly shown to you (body, shadow, tail or sign)
	hear: 60, // m: called only with someone this near it, and heard only this near it (past that it's no use to them)
	again: 60, // s before the same school's called again, by anyone
	told: 25, // s you know where to look, after a call
};

// what a guide calls each, and what it's doing
const NAMES = { bonefish: 'bonefish', permit: 'permit', tarpon: 'tarpon', barracuda: 'barracuda', snook: 'snook', blacktipShark: 'blacktips', lemonShark: 'lemon shark' };
const DOING = { tail: 'tailing', feed: 'mudding', laid: 'laid-up', roll: 'rolling', mill: 'milling' };
const r1 = ( v ) => Math.round( v * 10 ) / 10, r2 = ( v ) => Math.round( v * 100 ) / 100;
const _look = new Vector3();

// the words of a call: what it is, by the clock from your bow (or ahead of you), how far in feet (to the nearest ten, as
// guides call it), and which way it's going if it's going anywhere: left, right, at you or away (Gink & Gasoline's "bow
// clock": a time, a distance and the fish's way)
export function callText( kind, mode, n, x, z, hx, hz, from ) {

	const dx = x - from.x, dz = z - from.z, d = Math.hypot( dx, dz ) || 1e-6;
	const ft = Math.max( 10, Math.round( d / FT / 10 ) * 10 );
	const name = NAMES[ kind ] || kind, doing = DOING[ mode ];
	const what = doing ? `${ doing } ${ name }` : kind === 'bonefish' && n >= 5 ? 'a school of bonefish' : kind === 'permit' && n === 2 ? 'two permit' : name;
	let way = '';
	const hl = Math.hypot( hx, hz );
	if ( mode === 'cruise' && hl > 1e-6 ) {

		// (its way against the line from it to you; across it, to your right or left as you look at it)
		const ax = hx / hl, az = hz / hl, along = - ( ax * dx + az * dz ) / d, side = ( - ax * dz + az * dx ) / d;
		way = along > 0.7 ? 'coming at you' : along < - 0.7 ? 'going away' : side > 0 ? 'moving right' : 'moving left';

	}

	return `${ what }, ${ clockFrom( from.yaw, dx, dz ) } o'clock, ${ ft } ft${ way ? `, ${ way }` : '' }`;

}

export class FlatsShare {

	// t: Together (its session, me, others and app)
	constructor( t ) {

		this.t = t;
		this.session = t.session;
		this.me = t.me;
		this.theirs = new Map(); // player id -> their record, cleaned
		this._dirty = false;
		this._writeT = 0;
		this._forgetT = FORGET_S;
		this._calledAt = new Map(); // school id -> s (performance.now) it was last called, by anyone
		this._looking = null;
		this._lookT = 0;
		this.sent = 0; // (records written, and calls made: for the checks)
		this.calls = 0;
		const F = this.flats;
		if ( F ) F.onMine = () => this._changed();
		const s = this.session;
		// the room's records as they stand (someone joining later; yours from before a reload), and as they change
		if ( s.entries ) for ( const [ k, v ] of s.entries( FLATS_KEY ) ) this._read( k, v );
		if ( s.onAnyChange ) s.onAnyChange( ( k, v ) => typeof k === 'string' && k.startsWith( FLATS_KEY ) && this._read( k, v ) );
		s.on( 'flats', ( body, from ) => this._heard( body, from ) );

	}

	get flats() {

		return this.t.app.game && this.t.app.game.flats;

	}

	get T() {

		return this.flats ? this.flats.T : 0;

	}

	update( dt ) {

		const F = this.flats;
		if ( ! F ) return;
		if ( F.onMine === null ) F.onMine = () => this._changed();
		if ( this._dirty && ( this._writeT -= dt ) <= 0 ) this._write();
		if ( ( this._forgetT -= dt ) <= 0 ) {

			this._forgetT = FORGET_S;
			this._forget();

		}

		if ( this.t.others.size ) this._spot( dt );

	}

	// ---- the records

	// one of the room's records, read (as you join, or as its player writes it)
	_read( key, raw ) {

		const F = this.flats;
		if ( ! F ) return;
		const id = key.slice( FLATS_KEY.length ), T = this.T, rec = forgetFlats( cleanFlats( raw ), T );
		if ( id === this.me.id ) {

			// (yours: from before a reload, or your own write coming back. Kept with what you've done since)
			const M = F.mine;
			let more = false;
			for ( const [ s, until ] of Object.entries( rec.spooked ) ) if ( ! ( M.spooked[ s ] >= until ) ) {

				M.spooked[ s ] = until;
				if ( rec.at[ s ] ) M.at[ s ] = rec.at[ s ];

			}

			for ( const [ s, n ] of Object.entries( rec.hooked ) ) if ( ! ( M.hooked[ s ] >= n ) ) M.hooked[ s ] = n;
			for ( const s of Object.keys( M.spooked ) ) if ( rec.spooked[ s ] === undefined ) more = true;
			for ( const s of Object.keys( M.hooked ) ) if ( rec.hooked[ s ] !== M.hooked[ s ] ) more = true;
			if ( more && ! this._dirty ) this._changed();
			this._merge();
			return;

		}

		const was = this.theirs.get( id );
		this.theirs.set( id, rec );
		this._merge();
		// (a school they've spooked since: it bolts here too, from where it was spooked there, or from them)
		for ( const [ s, until ] of Object.entries( rec.spooked ) ) {

			if ( ! ( until > T ) || ( was && was.spooked[ s ] >= until ) ) continue;
			let at = rec.at[ s ];
			if ( ! at ) {

				const o = this.t.others.get( id );
				at = o && o.cur ? [ o.cur.pos.x, o.cur.pos.z ] : null;

			}

			if ( F.theirSpook( s, at ? at[ 0 ] : NaN, at ? at[ 1 ] : NaN ) && ! F.events.spooked ) F.events.spooked = 'theirs';

		}

	}

	// everyone's records, as FlatsFishing's state: what flatsSchools runs on
	_merge() {

		const F = this.flats;
		mergeFlats( F.state, [ F.mine, ...this.theirs.values() ] );

	}

	_changed() {

		this._dirty = true;
		this._writeT = WRITE_S;

	}

	_write() {

		const F = this.flats, s = this.session;
		this._dirty = false;
		if ( s.mode === 'solo' || ! s.set ) return;
		this.sent ++;
		Promise.resolve( s.set( FLATS_KEY + this.me.id, flatsWire( F.mine ) ) ).catch( ( e ) => {

			// (refused, or lost: tried again a while after)
			console.warn( 'flats', e );
			this._dirty = true;
			this._writeT = AGAIN_S;

		} );

	}

	// what's long past let go: yours (and the room's copy of it rewritten if that changed), theirs, and everyone's together
	_forget() {

		const F = this.flats, T = this.T, M = F.mine;
		const n = Object.keys( M.spooked ).length + Object.keys( M.hooked ).length;
		forgetFlats( M, T );
		if ( Object.keys( M.spooked ).length + Object.keys( M.hooked ).length !== n ) this._changed();
		for ( const r of this.theirs.values() ) forgetFlats( r, T );
		this._merge();

	}

	// ---- calls

	// a school you've seen and are looking at, a moment: called to whoever's near it
	_spot( dt ) {

		const F = this.flats, fish = F.fish, app = this.t.app;
		if ( ! fish || ! fish.sightGroups || ! fish.sightGroups.length || ! app.camera ) return;
		const cam = app.camera, c = cam.position, look = cam.getWorldDirection( _look ), lf = Math.hypot( look.x, look.z ) || 1;
		let best = null, score = CALL.look;
		for ( const g of fish.sightGroups ) {

			const S = g.sight;
			if ( ! S || ! g.active || S.bolt > 0 || S.life < 0.5 ) continue;
			const o = S.seen;
			if ( Math.max( o.body, o.shadow, o.tail, o.sign ) < CALL.seen ) continue;
			const dx = g.center.x - c.x, dz = g.center.z - c.z, d = Math.hypot( dx, dz );
			if ( d < 1 || d > fish.sightRange ) continue;
			const k = ( dx * look.x + dz * look.z ) / ( d * lf );
			if ( k > score ) {

				score = k;
				best = g;

			}

		}

		const id = best ? best.sight.id : null;
		if ( id !== this._looking ) {

			this._looking = id;
			this._lookT = 0;
			return;

		}

		if ( ! best || ( this._lookT += dt ) < CALL.dwell ) return;
		const now = performance.now() / 1000, last = this._calledAt.get( id );
		if ( last !== undefined && now - last < CALL.again ) return;
		let near = false;
		for ( const o of this.t.others.values() ) if ( o.cur && Math.hypot( o.cur.pos.x - best.center.x, o.cur.pos.z - best.center.z ) < CALL.hear ) near = true;
		if ( ! near ) return;
		const S = best.sight;
		const body = { i: id, k: S.kind, m: S.mode, n: S.shown || S.n, x: r1( best.center.x ), z: r1( best.center.z ), h: [ r2( S.dx ), r2( S.dz ) ] };
		this.calls ++;
		this.session.send( 'flats', body );
		this._heard( body, this.me.id );

	}

	// a call: yours, told back to you, or someone else's, heard from where you are, if you're near enough for it to help
	_heard( b, from ) {

		const F = this.flats, app = this.t.app;
		if ( ! F || ! b || ! flatsId( b.i ) || ! NAMES[ b.k ] || ! Number.isFinite( b.x ) || ! Number.isFinite( b.z ) ) return;
		const now = performance.now() / 1000;
		this._calledAt.set( b.i, now );
		const mine = from === this.me.id;
		// (where it is here: its own fish, if they're about you, else where they saw it)
		const g = F.fish && F.fish.sightGroups ? F.fish.sightGroups.find( ( h ) => h.sight && h.sight.id === b.i && h.active ) : null;
		const x = g ? g.center.x : b.x, z = g ? g.center.z : b.z, S = g ? g.sight : null;
		const p = app.player, c = app.camera.position;
		if ( ! mine && Math.hypot( x - c.x, z - c.z ) > CALL.hear ) return;
		const aboard = p && ( p.mode === 'boat' || p.mode === 'deck' ) && p.boat && p.boat.getYaw;
		const yaw = aboard ? p.boat.getYaw() : ( () => {

			const l = app.camera.getWorldDirection( _look );
			return Math.atan2( l.x, l.z );

		} )();
		const h = Array.isArray( b.h ) ? b.h : [ 0, 0 ];
		const words = callText( b.k, S ? S.mode : b.m, S ? S.shown || S.n : b.n | 0, x, z, S ? S.dx : + h[ 0 ] || 0, S ? S.dz : + h[ 1 ] || 0, { x: c.x, z: c.z, yaw } );
		const who = mine ? 'You call it' : this.t.others.get( from ) ? this.t.others.get( from ).person.name : 'Someone';
		if ( ! mine ) {

			F.called.set( b.i, now + CALL.told );
			if ( ! F.events.called ) F.events.called = who;

		}

		this.lastCall = `${ who }: ${ words }`;
		if ( app.game && app.game.toast ) app.game.toast( this.lastCall, 4200 );

	}

}
