// The heads-up display, for now: what you can do here (the player's prompt) and a first hint about
// the controls. On touch screens the prompt is the action button itself (TouchControls).

const KEY_NAMES = { E: 'E', Space: 'Space', V: 'V', R: 'R', N: 'N', B: 'B', I: 'I', L: 'L', LMB: 'Left mouse · F', RMB: 'Right mouse · G' };
const PAD_NAMES = { E: 'B', Space: 'A', V: 'Y', R: 'X', N: 'D-pad ↑', B: 'D-pad ← →', I: 'Back', L: 'D-pad ↓', LMB: 'RT', RMB: 'LT' };

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

	}

	// a first hint about the controls, for the device in use; fades after a while
	showHint( device ) {

		this.hint.textContent = device === 'touch'
			? 'Left side to walk · right side to look'
			: device === 'gamepad'
				? 'Left stick to walk, right stick to look, A to jump'
				: 'W A S D to walk, click and move the mouse to look, Space to jump';
		this.hint.hidden = false;
		this._hintTime = 9;

	}

	toast( text, seconds = 2.5 ) {

		this.toastEl.textContent = text;
		this.toastEl.hidden = false;
		this._toastTime = seconds;
		this.placeToast();

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
		if ( this._toastTime > 0 && ( this._toastTime -= dt ) <= 0 ) this.toastEl.hidden = true;

	}

}

function escapeHtml( s ) {

	return s.replace( /[&<>"]/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ c ] ) );

}
