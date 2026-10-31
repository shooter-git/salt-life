import { StaleSaveError } from '@allthespaces/portal';

// What Tidewater kept in localStorage, kept in the person's saves in All the Spaces instead (a
// creation's sealed frame has no browser storage). A synchronous Storage-like object
// (getItem / setItem / removeItem), as GameState and the guide expect: everything is read once before
// the game starts, and changes are written back a moment later, one write at a time, and at once when
// the app covers the game (a hidden tab, the app gone to the background, where it may be closed), when
// the page goes, and when the person leaves.

// Tidewater's keys -> keys in the person's saves (anything else lives only for this visit)
const KEYS = {
	'tidewater.save.v1': 'progress', // money, cooler, fish log, upgrades, fuel (GameState)
	'tidewater.guide': 'guide', // tips already shown (Guide)
	'saltlife.clock': 'clock', // (Salt Life) the island's hour and day when you left (App.saveClock)
	'saltlife.boat': 'boat', // (M15) where your boat was left, and whether you were aboard (App.saveBoat, game/Away.js)
};
const WRITE_AFTER_MS = 1200;

export class SaveStore {

	constructor( portal, { onError = () => {}, writeAfterMs = WRITE_AFTER_MS } = {} ) {

		this.portal = portal;
		this.onError = onError;
		this.values = new Map(); // save key -> JSON value
		this.memory = new Map(); // keys that aren't saved
		this.dirty = new Set();
		this.stopped = false; // saved from elsewhere (another device): stop overwriting it
		this.writeAfterMs = writeAfterMs;
		this._timer = 0;
		// (the write out now, if any: the next waits for it. Two out at once, the second made on the
		// version the first was, were turned down as saved from elsewhere, and saving stopped for the
		// rest of the visit: a hold full of fish gone)
		this._writing = Promise.resolve();
		portal.onExit( () => this.flush() );
		if ( portal.on ) portal.on( 'pause', () => this.flush() );
		// (and the page going: closed, or reloaded)
		if ( typeof addEventListener === 'function' ) addEventListener( 'pagehide', () => this.flush() );

	}

	async load() {

		for ( const key of Object.values( KEYS ) ) {

			try {

				this.values.set( key, await this.portal.save.personal.get( key ) );

			} catch ( e ) {

				this.stopped = true;
				this.onError( e );

			}

		}

	}

	getItem( name ) {

		const key = KEYS[ name ];
		if ( ! key ) return this.memory.has( name ) ? this.memory.get( name ) : null;
		const v = this.values.get( key );
		return v === null || v === undefined ? null : JSON.stringify( v );

	}

	setItem( name, text ) {

		const key = KEYS[ name ];
		if ( ! key ) {

			this.memory.set( name, String( text ) );
			return;

		}

		let value;
		try {

			value = JSON.parse( text );

		} catch {

			value = String( text );

		}

		this.values.set( key, value );
		this.dirty.add( key );
		clearTimeout( this._timer );
		this._timer = setTimeout( () => this.flush(), this.writeAfterMs );

	}

	removeItem( name ) {

		const key = KEYS[ name ];
		if ( ! key ) {

			this.memory.delete( name );
			return;

		}

		this.values.set( key, null );
		this.dirty.add( key );

	}

	// what's changed, written after any write already out
	flush() {

		clearTimeout( this._timer );
		this._writing = this._writing.then( () => this._write() );
		return this._writing;

	}

	async _write() {

		if ( this.stopped ) return;
		const keys = [ ...this.dirty ];
		this.dirty.clear();
		for ( const key of keys ) {

			try {

				await this.portal.save.personal.set( key, this.values.get( key ) ?? null );

			} catch ( e ) {

				// a newer save from another device or version: keep it, don't overwrite it again
				if ( e instanceof StaleSaveError ) this.stopped = true;
				this.onError( e );

			}

		}

	}

}
