import { LEFT, RIGHT, UP, DOWN } from '../core/Glyphs.js';
// The heads-up display, for now: what you can do here (the player's prompt) and a first hint about
// the controls. On touch screens the prompt is the action button itself (TouchControls).

const KEY_NAMES = { E: 'E', Space: 'Space', V: 'V', R: 'R', N: 'N', B: 'B', I: 'I', L: 'L', LMB: 'Left mouse · F', RMB: 'Right mouse · G' };
const PAD_NAMES = { E: 'B', Space: 'A', V: 'Y', R: 'X', N: `D-pad ${ UP }`, B: `D-pad ${ LEFT } ${ RIGHT }`, I: 'Back', L: `D-pad ${ DOWN }`, LMB: 'RT', RMB: 'LT' };

export class Hud {

	constructor( { root = document.body } = {} ) {

		const el = this.el = document.createElement( 'div' );
		el.className = 'hud';
		el.innerHTML = /* html */`
			<div class="hud-prompt" hidden></div>
			<div class="hud-hint" hidden></div>
			<div class="hud-toast" hidden></div>`;
		root.append( el );
		this.prompt = el.querySelector( '.hud-prompt' );
		this.hint = el.querySelector( '.hud-hint' );
		this.toastEl = el.querySelector( '.hud-toast' );
		this._hintTime = 0;
		this._toastTime = 0;
		// (M17) what a toast mustn't cover: () -> elements, or null (the catch card's title while it's up: GameHUD). One that would
		// waits, its time not running, and shows once it wouldn't (the card gone); toasts that come meanwhile wait behind it. On a
		// short screen a toast at the top sat over the card's name (844 x 390, and 390 x 844 under the purse); where there's room
		// beside it, a laptop's, it shows at once
		this.clearOf = null;
		this._waiting = [];
		// a tap or a click on the hint or a toast puts it away (the tap goes no further: it isn't a look or a step)
		for ( const [ e, time ] of [ [ this.hint, '_hintTime' ], [ this.toastEl, '_toastTime' ] ] ) e.addEventListener( 'pointerdown', ( ev ) => {

			ev.preventDefault();
			ev.stopPropagation();
			e.hidden = true;
			this[ time ] = 0;

		} );

	}

	// a first hint about the controls, for the device in use; fades after a while
	showHint( device ) {

		this.hint.textContent = device === 'touch'
			? 'Left side to walk, push past the ring to run · right side to look'
			: device === 'gamepad'
				? 'Left stick to walk, right stick to look, A to jump, Start for actions'
				: 'W A S D to walk, click and move the mouse to look, Space to jump, Q for actions';
		this.hint.hidden = false;
		this._hintTime = 9;

	}

	toast( text, seconds = 2.5 ) {

		if ( this._waiting.length ) {

			this._waiting.push( [ text, seconds ] );
			if ( this._waiting.length > 4 ) this._waiting.shift(); // (a few at most: the oldest goes)
			return;

		}

		this.toastEl.textContent = text;
		this.toastEl.hidden = false;
		this._toastTime = seconds;
		this.placeToast();
		if ( this._covering() ) this._wait();

	}

	// (M17) whether the toast up covers anything clearOf names
	_covering() {

		const els = this.clearOf && ! this.toastEl.hidden ? this.clearOf() : null;
		if ( ! els || ! els.length ) return false;
		const t = this.toastEl.getBoundingClientRect();
		return [ ...els ].some( ( e ) => {

			const r = e.getBoundingClientRect();
			return r.width > 0 && r.height > 0 && t.left < r.right - 1 && r.left < t.right - 1 && t.top < r.bottom - 1 && r.top < t.bottom - 1;

		} );

	}

	// the toast up waits, with what's left of its time, ahead of any waiting already
	_wait() {

		if ( this._toastTime > 0 ) this._waiting.unshift( [ this.toastEl.textContent, Math.max( 1.5, this._toastTime ) ] );
		this.toastEl.hidden = true;
		this._toastTime = 0;

	}

	// on a computer the toast sits at the top beside the game's purse, or under the purse if its text
	// doesn't fit there (style.css); again whenever the purse changes (GameHUD)
	placeToast() {

		const el = this.toastEl;
		if ( el.hidden ) return;
		el.classList.remove( 'is-low' );
		el.classList.toggle( 'is-low', el.scrollWidth > el.clientWidth );

	}

	update( dt, { player, device } ) {

		const p = player && player.prompt;
		// touch screens show the action on its button; others get the key and what it does
		const show = p && device !== 'touch';
		if ( show ) {

			const names = device === 'gamepad' ? PAD_NAMES : KEY_NAMES;
			// (a second key inside the text: 'V  camera', 'R  put the rod away')
			const text = p.text.replace( /\b([RV])\b(?=\s+(camera|put the rod away))/, ( m, key ) => names[ key ] );
			const html = `<kbd>${ names[ p.key ] ?? p.key }</kbd> ${ escapeHtml( text ) }`;
			if ( this.prompt.innerHTML !== html ) this.prompt.innerHTML = html;

		}

		this.prompt.hidden = ! show;
		if ( this._hintTime > 0 && ( this._hintTime -= dt ) <= 0 ) this.hint.hidden = true;
		if ( this._toastTime > 0 && ! this.toastEl.hidden && this._covering() ) this._wait();
		if ( this._toastTime > 0 && ( this._toastTime -= dt ) <= 0 ) this.toastEl.hidden = true;
		// (the next that's waiting, once it would cover nothing: tried, measured and hidden again in the one frame, so nothing flickers)
		if ( this._toastTime <= 0 && this._waiting.length ) {

			const [ text, seconds ] = this._waiting[ 0 ];
			this.toastEl.textContent = text;
			this.toastEl.hidden = false;
			this.placeToast();
			if ( this._covering() ) this.toastEl.hidden = true;
			else {

				this._waiting.shift();
				this._toastTime = seconds;

			}

		}

	}

}

function escapeHtml( s ) {

	return s.replace( /[&<>"]/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ c ] ) );

}
