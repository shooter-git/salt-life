import { holdWord } from '../game/Seaworthy.js';

// (v2.3.0) One fish box aboard, as on a real boat. A guest's catch goes in the box of the boat he's riding, with her owner
// aboard her and here (her owner's game runs it, as it runs her rods and her traps), and it stays his: in his save, his to
// sell, and with him when he steps off. Her owner's game tells whoever's riding her what's in it, once a second as it
// changes ('box': her room, her ice and how fast it goes, everyone's fish in it by whose); each of them tells it his own
// fish in it ('boxIn'), and those caught aboard her are chilled on her ice, once each. Each game saves only its own: her
// ice in her owner's save, his fish in his. Before, a guest's catch went in his own boat's box, back at her berth with no
// ice in it, and was over the side in half a day.
//   const b = new SharedBox( together );  b.update( dt )  b.told( body, from )  b.given( body, from )
//   b.herBox()   riding with her owner here: her box as last told (DaysOut.her), or null: your own boat's
//   b.guestsKg   aboard your own: kg of your guests' fish in your box;  b.guests: [ { name, n, kg } ] of them
//   b.chill( f ) riding: a fish of yours stamped into her box (DaysOut._stamp): her owner's game melts her ice for it

const SEND_MS = 1000; // between looks at what's to tell (the wall's: a slow device's frames are seconds apart)
const AGAIN_S = 5; // s after which it's told again even if nothing's changed (someone come aboard, a lost message)
const MOST = 5000; // kg: past any box's
const r2 = ( v ) => Math.round( v * 100 ) / 100;
// ((v2.4.1) her melt finer: a guest's ice bar says the time her ice lasts, the same as hers. A hundredth of a kg an hour
// was 1% of a console's, hours off over a box of ice)
const r5 = ( v ) => Math.round( v * 1e5 ) / 1e5;
const kgOk = ( v ) => Number.isFinite( v ) && v >= 0 && v <= MOST;

export class SharedBox {

	constructor( together ) {

		this.t = together;
		this._t = - Infinity;
		// her owner's side: id -> { kg, n, chilled: Set of their fish ids whose chill came off your ice }
		this._in = new Map();
		this.guestsKg = 0;
		this.guests = [];
		// the guest's side: { from, at, box } as told; your fish caught aboard her, to be chilled on her ice; what you told
		this._her = null;
		this._chill = new Set();
		this._said = null;
		this._saidAt = 0;

	}

	get _app() {

		return this.t.app;

	}

	// ---- riding along

	herBox() {

		const t = this.t, p = this._app.player, h = this._her;
		// (as last told, for as long as you're riding her with her owner aboard: a phone that's paused, or a tab hidden, isn't her
		// box gone. Her owner gone from the room, her owner off her, or you: your own again)
		if ( ! h || ! p.riding || p.boat.owner !== h.from ) return null;
		const c = t.others.get( h.from )?.cur;
		return c && c.boat && ( c.mode === 'deck' || c.mode === 'helm' ) && ! c.ride && c.boatId === p.boat.model.id ? h.box : null;

	}

	chill( f ) {

		this._chill.add( f.id );

	}

	// what her owner's game says is in her box
	told( b, from ) {

		const t = this.t, p = this._app.player, o = t.others.get( from );
		if ( ! o || ! b || b.to !== t.me.id || ! p.riding || p.boat.owner !== from ) return;
		if ( ! kgOk( b.c ) || b.c <= 0 || ! kgOk( b.i ) || ! kgOk( b.m ) || ! kgOk( b.k ) || ! Array.isArray( b.f ) || b.f.length > 16 ) return;
		let others = 0;
		const by = [];
		for ( const e of b.f ) {

			if ( ! Array.isArray( e ) || typeof e[ 0 ] !== 'string' || ! kgOk( e[ 1 ] ) || ! Number.isInteger( e[ 2 ] ) || e[ 2 ] < 0 ) return;
			if ( e[ 0 ] === t.me.id ) continue;
			others += e[ 1 ];
			if ( e[ 2 ] > 0 ) by.push( { name: e[ 0 ] === from ? o.person.name : t.others.get( e[ 0 ] )?.person.name || 'Someone', n: e[ 2 ], kg: e[ 1 ] } );

		}

		const word = b.w === 'cooler' || b.w === 'hold' ? b.w : holdWord( b.c );
		this._her = { from, at: performance.now(), box: { cap: b.c, ice: b.i, melt: b.m, makes: b.k, others, word, whose: o.person.name, by } };

	}

	// ---- aboard your own: your guests' fish in your box

	given( b, from ) {

		const t = this.t, app = this._app, g = app.game, o = t.others.get( from );
		if ( ! g || ! o || ! b || b.to !== t.me.id || ! o.cur || o.cur.ride !== t.me.id || ! this._aboard() ) return;
		if ( ! kgOk( b.k ) || ! Number.isInteger( b.n ) || b.n < 0 || ! Array.isArray( b.c ) || b.c.length > 400 ) return;
		const e = this._in.get( from ) || { kg: 0, n: 0, chilled: new Set() };
		this._in.set( from, e );
		let chill = 0;
		for ( const c of b.c ) {

			if ( ! Array.isArray( c ) || ! Number.isInteger( c[ 0 ] ) || ! kgOk( c[ 1 ] ) || e.chilled.has( c[ 0 ] ) ) continue;
			e.chilled.add( c[ 0 ] );
			chill += c[ 1 ];

		}

		const more = b.k > e.kg + 1e-6, changed = Math.abs( b.k - e.kg ) > 1e-6 || b.n !== e.n;
		e.kg = b.k;
		e.n = b.n;
		this._sum();
		if ( chill > 0 ) g.daysOut.chillFor( chill );
		else if ( more ) g.daysOut._makeRoom();
		if ( chill > 0 ) g.state.save();
		if ( changed || chill > 0 ) g.state.emit();

	}

	_aboard() {

		const p = this._app.player;
		return ( p.mode === 'deck' || p.mode === 'boat' ) && ! p.riding;

	}

	_sum() {

		let kg = 0;
		this.guests = [];
		for ( const [ id, e ] of this._in ) {

			kg += e.kg;
			if ( e.n > 0 ) this.guests.push( { name: this.t.others.get( id )?.person.name || 'Someone', n: e.n, kg: e.kg } );

		}

		this.guestsKg = kg;

	}

	// ---- once a second: who's aboard, and what's told
	update( dt ) {

		const now = performance.now();
		if ( now - this._t < SEND_MS ) return;
		this._t = now;
		const t = this.t, app = this._app, g = app.game, st = g && g.state, aboard = this._aboard();
		if ( ! st ) return;
		// (your guests gone ashore, gone home, or you off her: their fish are theirs alone again)
		let gone = false;
		for ( const id of this._in.keys() ) {

			const c = t.others.get( id )?.cur;
			if ( aboard && c && c.ride === t.me.id ) continue;
			this._in.delete( id );
			gone = true;

		}

		if ( gone ) {

			this._sum();
			st.emit();

		}

		if ( aboard ) this._tell( now );
		const her = this.herBox();
		if ( ! her ) {

			this._chill.clear();
			this._said = null;
			return;

		}

		// (riding: your fish in her box, and which of them were caught aboard her)
		const chill = [];
		for ( const f of st.inventory ) if ( this._chill.has( f.id ) ) chill.push( [ f.id, r2( f.kg ) ] );
		const body = { to: this._her.from, k: r2( st.holdKg ), n: st.inventory.length, c: chill }, wire = JSON.stringify( body );
		if ( wire === this._said && now - this._saidAt < AGAIN_S * 1000 ) return;
		this._said = wire;
		this._saidAt = now;
		t.session.send( 'boxIn', body );

	}

	// her box, to each of those riding her
	_tell( now ) {

		const t = this.t, g = this._app.game;
		let body = null, wire = null;
		for ( const o of t.others.values() ) {

			if ( ! o.cur || o.cur.ride !== t.me.id ) {

				o.boxSent = null;
				continue;

			}

			if ( ! body ) {

				const b = g.daysOut.boxOf(), st = g.state;
				const f = [ [ t.me.id, r2( st.holdKg ), st.inventory.length ] ];
				for ( const [ id, e ] of this._in ) f.push( [ id, r2( e.kg ), e.n ] );
				body = { c: r2( b.cap ), i: r2( b.ice ), m: r5( b.melt ), k: r2( b.makes ), w: b.word, f };
				wire = JSON.stringify( body );

			}

			if ( o.boxSent === wire && now - ( o.boxSentAt || 0 ) < AGAIN_S * 1000 ) continue;
			o.boxSent = wire;
			o.boxSentAt = now;
			t.session.send( 'box', { to: o.person.id, ...body } );

		}

	}

}
