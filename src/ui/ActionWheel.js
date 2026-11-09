import './action-wheel.css';
import { ACTIONS, offers } from './Actions.js';
import { iconSvg, iconFor } from './ActionIcons.js';
import { LEFT, RIGHT, UP, DOWN } from '../core/Glyphs.js';

// The actions wheel: everything you can do here that isn't used every few seconds, in a ring round the middle of the
// screen (Actions.js says what's offered: the rod, the cast net, bait, rig, leader, cooler, torch, horn, camera, and
// the guide). Each presses the key it stands for, so it does what the key does.
//   touch     the wheel's button under the right thumb (TouchControls): tap it, then a picture; or press it, slide to
//             one and let go. The pictures alone, the one under your finger named in the middle.
//   keyboard  Q: tap it and click one, or hold it, move the mouse towards one and let go. Each with its words and key.
//   gamepad   Start, then the right stick towards one and A (B or Start to close); or hold Start and let go.
// The horn's held as long as its picture is (or blown for a moment, from a key).
//   const w = new ActionWheel( input, { game } );  w.update( dt, player, game ) after input.update, before the player

const ORDER = [ 'rod', 'net', 'bait', 'rig', 'leader', 'cooler', 'torch', 'horn', 'plotter', 'camera', 'guide' ];
const KEY_NAMES = {
	keyboard: { KeyR: 'R', KeyN: 'N', KeyB: 'B', KeyC: 'C', KeyX: 'X', KeyI: 'I', KeyL: 'L', KeyV: 'V', KeyZ: 'Z', Horn: 'H', guide: 'H' },
	gamepad: { KeyR: 'X', KeyN: `D-pad ${ UP }`, KeyB: `D-pad ${ LEFT }${ RIGHT }`, KeyC: 'LB', KeyX: 'Y', KeyI: 'Back', KeyL: `D-pad ${ DOWN }`, KeyV: 'Y', Horn: 'L3' },
};
const HOLD_S = 0.25; // Q (or Start) held longer than this and let go: the one it points at
const DEAD = 26; // px the pointer has to move from the middle before it points at one
const REACH = 140; // px it can go

export class ActionWheel {

	constructor( input, { root = document.body } = {} ) {

		this.input = input;
		this.open = false;
		this.offer = {};
		this.hot = null; // the item pointed at
		this._items = {};
		this._shown = '';
		this._cursor = { x: 0, y: 0 };
		this._holdT = - 1; // how long Q / Start has been held since it opened the wheel (-1: not opened by it)
		this._taps = []; // keys pressed for a tap: [ code, frames left, seconds left ]
		this._game = null;

		const el = this.el = document.createElement( 'div' );
		el.className = 'aw';
		el.hidden = true;
		el.innerHTML = /* html */`<div class="aw-scrim"></div><div class="aw-ring" role="menu" aria-label="Actions"></div>`;
		this.ring = el.lastChild;
		for ( const id of ORDER ) {

			const b = document.createElement( 'button' );
			b.type = 'button';
			b.tabIndex = - 1;
			b.className = 'aw-item';
			b.setAttribute( 'role', 'menuitem' );
			b.dataset.id = id;
			b.hidden = true;
			b.innerHTML = '<span class="aw-ico"></span><span class="aw-name"></span><kbd class="aw-key"></kbd>';
			this.ring.append( b );
			this._items[ id ] = b;

		}

		this.hub = document.createElement( 'button' );
		this.hub.type = 'button';
		this.hub.tabIndex = - 1;
		this.hub.className = 'aw-hub';
		this.hub.innerHTML = `<span class="aw-hub-ico">${ iconSvg( 'close' ) }</span><span class="aw-hub-name">Actions</span><span class="aw-hub-keys"></span>`;
		this.hubName = this.hub.querySelector( '.aw-hub-name' );
		this.hubKeys = this.hub.querySelector( '.aw-hub-keys' );
		this.ring.append( this.hub );
		root.append( el );

		// pointers (a finger, or the mouse once it's free): press one to name it, let go on it to do it; the horn's held
		// while it's pressed. Off them, the scrim or the middle close it
		let down = null; // { id, pointerId, held }
		el.addEventListener( 'pointerdown', ( e ) => {

			e.preventDefault();
			const item = e.target.closest && e.target.closest( '.aw-item' );
			if ( ! item ) {

				this.toggle( false );
				return;

			}

			if ( down ) return;
			const id = item.dataset.id;
			down = { id, pointerId: e.pointerId, held: false };
			item.setPointerCapture( e.pointerId );
			this._point( id );
			if ( ACTIONS[ id ].hold ) {

				down.held = true;
				this.input.press( ACTIONS[ id ].key );

			}

		} );
		const up = ( e ) => {

			if ( ! down || e.pointerId !== down.pointerId ) return;
			const d = down;
			down = null;
			const over = e.type === 'pointerup' && this._itemAt( e.clientX, e.clientY );
			if ( d.held ) {

				this.input.release( ACTIONS[ d.id ].key );
				this.toggle( false );

			} else if ( over === d.id ) this.choose( d.id, e.pointerType === 'mouse' );
			else this._point( null );

		};
		el.addEventListener( 'pointerup', up );
		el.addEventListener( 'pointercancel', up );
		el.addEventListener( 'lostpointercapture', up );
		// (the mouse, free: what it's over is named, and lit)
		el.addEventListener( 'pointermove', ( e ) => {

			if ( e.pointerType !== 'mouse' || down ) return;
			this._point( this._itemAt( e.clientX, e.clientY ) );

		} );
		// (iOS: no double-tap zoom or magnifier: TouchControls)
		for ( const type of [ 'touchstart', 'touchend' ] ) el.addEventListener( type, ( e ) => e.preventDefault(), { passive: false } );

		// a gamepad's A and B are the wheel's while it's open (Input.trap): A does the one pointed at, B closes it
		input.trap = ( code ) => {

			if ( ! this.open ) return false;
			if ( code === 'Space' || code === 'mouse0' ) {

				if ( this.hot ) this.choose( this.hot );
				return true;

			}

			if ( code === 'KeyE' ) {

				this.toggle( false );
				return true;

			}

			return false;

		};

	}

	toggle( on = ! this.open ) {

		if ( on === this.open ) return;
		this.open = on;
		this.el.hidden = ! on;
		this.el.classList.toggle( 'is-on', on );
		this._cursor.x = this._cursor.y = 0;
		this._holdT = - 1;
		this._point( null );
		if ( on ) this._refresh();

	}

	// (touch) pressed on the wheel's button: follow that finger, and let go on a picture to do it
	slideFrom( btn, e ) {

		const id = e.pointerId;
		btn.setPointerCapture( id );
		const move = ( ev ) => {

			if ( ev.pointerId === id ) this._point( this._itemAt( ev.clientX, ev.clientY ) );

		};
		const end = ( ev ) => {

			if ( ev.pointerId !== id ) return;
			btn.removeEventListener( 'pointermove', move );
			btn.removeEventListener( 'pointerup', end );
			btn.removeEventListener( 'pointercancel', end );
			const over = ev.type === 'pointerup' && this._itemAt( ev.clientX, ev.clientY );
			if ( over && this.open && ! ACTIONS[ over ].hold ) this.choose( over );

		};
		btn.addEventListener( 'pointermove', move );
		btn.addEventListener( 'pointerup', end );
		btn.addEventListener( 'pointercancel', end );

	}

	// do it: a tap of its key (held for two frames, so a slow frame still sees it), or the guide; the horn, for a moment
	choose( id, relock = false ) {

		const g = this._game;
		this.toggle( false );
		if ( id === 'guide' ) {

			if ( g && g.guide ) g.guide.replay();
			return;

		}

		const key = ACTIONS[ id ].key;
		this.input.press( key );
		this._taps.push( [ key, 2, ACTIONS[ id ].hold ? 0.6 : 0 ] );
		// (chosen with the mouse, freed for it: the view's the mouse's again)
		if ( relock && this.input.lastDevice === 'keyboard' ) this.input.requestLock();

	}

	// once a frame, after Input.update and before the player: Q / Start, the pointer's moves while it's open (the view
	// doesn't turn), and the keys it pressed let go
	update( dt, player, game ) {

		this._game = game;
		this._player = player;
		const inp = this.input;
		for ( let i = this._taps.length - 1; i >= 0; i -- ) {

			const t = this._taps[ i ];
			t[ 2 ] -= dt;
			if ( -- t[ 1 ] > 0 || t[ 2 ] > 0 ) continue;
			inp.release( t[ 0 ] );
			this._taps.splice( i, 1 );

		}

		// (not over the catch card, a panel, or the guide)
		const busy = !! ( game && ( ( game.hud && ( game.hud.catchOpen || game.hud.invOpen || game.hud.standOpen || game.hud.noteOpen ) ) || ( game.guide && game.guide.open ) ) );
		if ( inp.hit( 'KeyQ' ) && ! busy ) {

			if ( this.open ) this.toggle( false );
			else {

				this.toggle( true );
				this._holdT = 0;

			}

		}

		if ( ! this.open ) return;
		if ( busy || inp.hit( 'Escape' ) ) {

			this.toggle( false );
			return;

		}

		this._refresh( player, game );
		// the mouse (captured) or the right stick: towards one points at it
		const look = inp.consumeLook();
		const c = this._cursor;
		c.x += look.x;
		c.y += look.y;
		const r = Math.hypot( c.x, c.y );
		if ( r > REACH ) {

			c.x *= REACH / r;
			c.y *= REACH / r;

		}

		if ( r > DEAD ) this._point( this._toward( Math.atan2( c.y, c.x ) ) );
		// Q / Start held, then let go: the one it points at; tapped, the wheel stays, and the mouse is freed to click one
		if ( this._holdT >= 0 ) {

			if ( inp.keys.has( 'KeyQ' ) ) this._holdT += dt;
			else {

				const held = this._holdT > HOLD_S;
				this._holdT = - 1;
				if ( held && this.hot ) this.choose( this.hot );
				else if ( inp.locked && document.exitPointerLock ) document.exitPointerLock();

			}

		}

	}

	// what's offered, round the ring from the top (laid out again when that changes); words and keys for the device
	_refresh( player = this._player, game = this._game ) {

		this._player = player;
		if ( ! player ) return;
		const o = offers( player, game, this.offer );
		const device = this.input.lastDevice;
		const names = KEY_NAMES[ device ] || KEY_NAMES.keyboard;
		const ids = ORDER.filter( ( id ) => o[ id ] );
		const shown = ids.join( ',' );
		for ( const id of ORDER ) {

			const b = this._items[ id ], label = o[ id ];
			if ( ! label ) {

				b.hidden = true;
				continue;

			}

			b.hidden = false;
			const icon = iconFor( label, id === 'net' ? 'net' : 'rod' );
			if ( b.dataset.icon !== icon ) {

				b.dataset.icon = icon;
				b.firstChild.innerHTML = iconSvg( icon );

			}

			if ( b.dataset.label !== label ) {

				b.dataset.label = label;
				b.children[ 1 ].textContent = label;
				b.setAttribute( 'aria-label', label );

			}

			const key = names[ id === 'guide' ? 'guide' : ACTIONS[ id ].key ] || '';
			// (H is the horn at the helm: the guide's from here alone there)
			const k = id === 'guide' && player.mode === 'boat' ? '' : key;
			if ( b.children[ 2 ].textContent !== k ) b.children[ 2 ].textContent = k;
			b.classList.toggle( 'is-on', / off$/.test( label ) );

		}

		if ( shown !== this._shown ) {

			this._shown = shown;
			// (round from the top, clockwise; the ring's size is the stylesheet's, --aw-r)
			ids.forEach( ( id, i ) => {

				const a = - Math.PI / 2 + i * 2 * Math.PI / ids.length;
				this._items[ id ].style.setProperty( '--cx', Math.cos( a ).toFixed( 4 ) );
				this._items[ id ].style.setProperty( '--cy', Math.sin( a ).toFixed( 4 ) );
				this._items[ id ].dataset.a = a;

			} );
			if ( this.hot && ! ids.includes( this.hot ) ) this._point( null );

		}

		const keys = { keyboard: 'Q or Esc to close', gamepad: 'A to choose, B to close' }[ device ] || '';
		if ( this.hubKeys.textContent !== keys ) this.hubKeys.textContent = keys;
		this.el.classList.toggle( 'is-empty', ! ids.length );

	}

	// the item shown nearest a direction (rad, from the middle, y down)
	_toward( a ) {

		let best = null, bd = Infinity;
		for ( const id of ORDER ) {

			const b = this._items[ id ];
			if ( b.hidden ) continue;
			const d = Math.abs( Math.atan2( Math.sin( a - b.dataset.a ), Math.cos( a - b.dataset.a ) ) );
			if ( d < bd ) {

				bd = d;
				best = id;

			}

		}

		return best;

	}

	_itemAt( x, y ) {

		const t = document.elementFromPoint( x, y );
		const item = t && t.closest && t.closest( '.aw-item' );
		return item && ! item.hidden && this.el.contains( item ) ? item.dataset.id : null;

	}

	// point at one (or none): lit, and named in the middle
	_point( id ) {

		if ( this.hot === id ) return;
		if ( this.hot ) this._items[ this.hot ].classList.remove( 'is-hot' );
		this.hot = id;
		if ( id ) this._items[ id ].classList.add( 'is-hot' );
		this.hubName.textContent = id ? this._items[ id ].dataset.label : 'Actions';
		this.hub.classList.toggle( 'is-named', !! id );

	}

}
