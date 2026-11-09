import { MathUtils, Vector3 } from '../engine/index.js';
import { farOff } from '../game/Units.js';

// (M16) A boat's crew. Anyone aboard takes a job by going where it's done: the helm (hers, or with her owner aboard and
// away from it, anyone's who rides along: the owner's game still runs her, on their input), up the tower spotting, or in
// the chair. Those aboard are told who's gone where.
//  - the helm: drives, and backing her down on a hooked fish, takes line back for whoever's fighting it (a skipper's
//    half of it: about a knot astern, BACKING)
//  - the tower: looking at birds, a weedline or something floating, for a moment, is calling it: each of the crew hears
//    where it lies by the clock from her bow, and it's on their map for a few minutes
//  - the chair: sat in, facing aft; everyone sees them there and the helm's told when a fish is on ((M17) sat in it, strapped in
//    for a fish: not stood beside it)
// Where they are: `stations` on her Vessel. Sent in the pose ('J').
//   jobAt( model, mode, deck, chair ) -> 'helm' | 'tower' | 'chair' | null   clockFrom( yaw, dx, dz ) -> 1..12
//   ((M17) chair: whether they're sat in it, strapped in (Player.chair, Rigs._sit): by the seat, not by how near they stand)
//   spotted( finds, cam, look ) -> { kind, x, z, d } | null   (what you're looking at from up there)
//   perched( model ) -> the model, or for a boat that's sat in, the same with a place for a rider
//   footY( model, x, z, maxY ) -> the deck under that spot
//   const c = new Crew( together );  c.update( dt )  c.job  c.aboard()  c.backing()  c.theirCall( body )

const BACKING = 0.4; // m/s of line she takes back, backing down at a knot or so against the fish's run
const LOOK = Math.cos( MathUtils.degToRad( 9 ) ); // how near to it you're looking
const CALL_DWELL = 1.0; // s looked at
const CALL_AGAIN = 180; // s before the same thing's called again
const MARK_S = 240; // s a call stays on the map
const CALLS = {
	bait: { name: 'Birds working', far: 3500, color: '#f2c14e', short: 'Birds' },
	weed: { name: 'A weedline', far: 2500, color: '#7fb35a', short: 'Weed' },
	debris: { name: 'Something floating', far: 900, color: '#d9a066', short: 'Debris' },
};
const SAID = { helm: 'took the helm', tower: 'went up the tower', chair: 'took the chair' };

export function jobAt( model, mode, deck, chair = null ) {

	if ( mode === 'helm' || mode === 'boat' ) return 'helm';
	const S = model && model.stations;
	if ( ! S || ! deck || mode !== 'deck' ) return null;
	// ((M17) the chair's whoever's in it: standing beside it, or behind it at the rail, isn't)
	if ( chair && S.chair ) return 'chair';
	const s = S.tower;
	if ( s && Math.hypot( deck.x - s.x, deck.z - s.z ) < s.r && Math.abs( deck.y - s.y ) < 1.2 ) return 'tower';
	return null;

}

export const clockFrom = ( yaw, dx, dz ) => {

	// (clockwise from her bow, as you stand looking forward; +x is her port side, and yaw's about +y from +z)
	const a = yaw - Math.atan2( dx, dz ), h = Math.round( a / ( Math.PI / 6 ) );
	return ( ( h % 12 ) + 12 ) % 12 || 12;

};

export function spotted( finds, cam, look ) {

	let best = null, score = LOOK;
	const flat = Math.hypot( look.x, look.z ) || 1;
	for ( const kind of Object.keys( CALLS ) ) for ( const f of finds[ kind ] || [] ) {

		const dx = f.x - cam.x, dz = f.z - cam.z, d = Math.hypot( dx, dz );
		if ( d < 40 || d > CALLS[ kind ].far ) continue;
		const k = ( dx * look.x + dz * look.z ) / ( d * flat );
		if ( k > score ) {

			score = k;
			best = { kind, x: f.x, z: f.z, d };

		}

	}

	return best;

}

// a boat that's sat in has room on her tank well for one more, held there
export function perched( model ) {

	if ( ! model.seated ) return model;
	const at = model.perch || new Vector3( 0, model.lines.deckY, model.lines.zAft * 0.55 );
	const v = Object.create( model );
	v.seated = false;
	v.boardPoint = at;
	v.helmEye = model.helmEye;
	v.soleY = () => at.y;
	v.clampToDeck = ( p ) => {

		p.x = MathUtils.clamp( p.x, at.x - 0.1, at.x + 0.1 );
		p.z = MathUtils.clamp( p.z, at.z - 0.1, at.z + 0.1 );

	};

	return v;

}

export function footY( model, x, z, maxY ) {

	let g = model.soleY( x, z, maxY );
	for ( const c of model.colliders ) {

		if ( ! c.walkable || Math.abs( x - c.center.x ) > c.half.x || Math.abs( z - c.center.z ) > c.half.z ) continue;
		const top = c.center.y + c.half.y;
		if ( top <= maxY && top > g ) g = top;

	}

	return g;

}

const _look = new Vector3();

export class Crew {

	constructor( together ) {

		this.t = together;
		this.job = null;
		this._looking = null;
		this._lookT = 0;
		this._called = new Map(); // find's key -> when it was called
		this._marks = []; // [ { id, until } ] on the map
		this._markN = 0;

	}

	get _app() {

		return this.t.app;

	}

	// whose boat you're aboard (their id, yours), or null
	boatOwner() {

		const p = this._app.player;
		return p.riding ? p.boat.owner : p.mode === 'deck' || p.mode === 'boat' ? this.t.me.id : null;

	}

	// the others aboard the boat you're on
	aboard( out = [] ) {

		out.length = 0;
		const owner = this.boatOwner();
		if ( ! owner ) return out;
		for ( const [ id, o ] of this.t.others ) {

			const c = o.cur;
			if ( ! c || ( c.mode !== 'deck' && c.mode !== 'helm' ) ) continue;
			if ( c.ride === owner || ( id === owner && ! c.ride ) ) out.push( o );

		}

		return out;

	}

	// how fast a hooked fish is being come up on by someone else at the helm of the boat you're fighting it from (m/s)
	backing() {

		if ( this._app.player.mode !== 'deck' ) return 0;
		for ( const o of this.aboard( this._list || ( this._list = [] ) ) ) if ( o.cur.mode === 'helm' ) return BACKING;
		return 0;

	}

	update( dt ) {

		const t = this.t, app = this._app, p = app.player;
		this.job = p.station || jobAt( p.boat.model, p.mode, p.deckPos, p.chair );
		const crew = this.aboard( this._list || ( this._list = [] ) );
		for ( const o of t.others.values() ) {

			const c = o.cur, job = c ? ( c.mode === 'helm' ? 'helm' : c.job ) : null;
			if ( job !== o.job && job && crew.includes( o ) && o.job !== undefined ) app.game.toast( `${ o.person.name } ${ SAID[ job ] }`, 2600 );
			o.job = job;
			const on = !! c && c.rod === 5;
			if ( on && ! o.fishOn && crew.includes( o ) && this.job === 'helm' ) app.game.toast( `${ o.person.name } has a fish on${ job === 'chair' ? ', in the chair' : '' }. Back her down on it`, 3600 );
			o.fishOn = on;

		}

		// (at the tower's helm you're as high, and it's what you're up there to do)
		if ( ( this.job === 'tower' || ( p.mode === 'boat' && p.atHelm?.upper ) ) && crew.length ) this._spot( dt );
		else this._looking = null;
		const now = performance.now() / 1000;
		for ( let i = this._marks.length - 1; i >= 0; i -- ) if ( now > this._marks[ i ].until ) {

			if ( app.game.minimap ) app.game.minimap.removePlayer( this._marks[ i ].id );
			this._marks.splice( i, 1 );

		}

	}

	_spot( dt ) {

		const t = this.t, app = this._app, cam = app.camera, finds = app.finds;
		if ( ! finds ) return;
		const see = spotted( finds, cam.position, cam.getWorldDirection( _look ) );
		const key = see && `${ see.kind }:${ Math.round( see.x / 100 ) }:${ Math.round( see.z / 100 ) }`;
		if ( key !== this._looking ) {

			this._looking = key;
			this._lookT = 0;
			return;

		}

		if ( ! see ) return;
		this._lookT += dt;
		const now = performance.now() / 1000, last = this._called.get( key );
		if ( this._lookT < CALL_DWELL || ( last !== undefined && now - last < CALL_AGAIN ) ) return;
		this._called.set( key, now );
		const body = { k: see.kind, x: Math.round( see.x ), z: Math.round( see.z ), b: this.boatOwner() };
		t.session.send( 'call', body );
		this.theirCall( body, t.me.id );

	}

	// a call from up the tower: to those aboard her, by the clock from her bow, and on the map
	theirCall( b, from ) {

		const t = this.t, app = this._app, p = app.player, call = b && CALLS[ b.k ];
		if ( ! call || ! Number.isFinite( b.x ) || ! Number.isFinite( b.z ) || b.b !== this.boatOwner() ) return;
		const dx = b.x - p.position.x, dz = b.z - p.position.z, d = Math.hypot( dx, dz );
		const mine = from === t.me.id, who = mine ? 'You call it' : t.others.get( from ) ? t.others.get( from ).person.name : 'The tower';
		app.game.toast( `${ who }: ${ call.name.toLowerCase() }, ${ clockFrom( p.boat.getYaw(), dx, dz ) } o'clock, ${ farOff( d ) } off`, 4200 );
		const map = app.game.minimap;
		if ( ! map ) return;
		const id = `call-${ this._markN ++ }`, at = { x: b.x, z: b.z };
		map.addPlayer( id, { name: call.short, color: call.color, pos: () => at } );
		this._marks.push( { id, until: performance.now() / 1000 + MARK_S } );

	}

}
