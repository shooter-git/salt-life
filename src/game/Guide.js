import { STAND } from './FishStand.js';
import { CHANDLERY } from './Chandlery.js';

// First-play guide:
//  - an intro (3 cards) the first time the game starts, after the start overlay: the goal, the fishing
//    controls, getting around and where Joe and Marta are (live direction and distance; their
//    markers pulse on the minimap). Enter / Space / click or tap: next, Esc: skip. Replay with H (Salt
//    Life: Tidewater's help panel, F1, isn't ported).
//  - one-time tips the first time something happens (rod out, first nibble, fish on, first catch,
//    full cooler, next to the boat, at Joe's, at Marta's), in a card above the minimap.
// Seen state under 'tidewater.guide' (in the person's saves: core/SaveStore), wrapped in try/catch.
//   const guide = new Guide( ui, game, minimap );  guide.update( dt );  guide.replay()

const KEY = 'tidewater.guide';

const CSS = /* css */`
.gm-guide { position: absolute; inset: 0; display: grid; place-items: center; pointer-events: none; opacity: 0; visibility: hidden;
	background: radial-gradient(70% 70% at 50% 50%, rgba(4, 10, 16, 0.2), rgba(4, 10, 16, 0.55));
	transition: opacity 420ms var(--tw-ease), visibility 0s linear 420ms; }
.gm-guide.is-on { opacity: 1; visibility: visible; pointer-events: auto; transition: opacity 420ms var(--tw-ease), visibility 0s; }
.gm-guide-card { width: min(calc(480 * var(--tw-u)), calc(100vw - 2 * var(--tw-edge))); padding: var(--tw-5) var(--tw-5) var(--tw-4); border-radius: var(--tw-r-lg);
	color: var(--tw-ink); font: 500 var(--tw-fs-md) var(--tw-font); transform: translateY(calc(10 * var(--tw-u))); transition: transform 520ms var(--tw-ease); }
.gm-guide.is-on .gm-guide-card { transform: none; }
.gm-guide-eyebrow { font-size: var(--tw-fs-xs); font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: var(--tw-sun); }
.gm-guide-card h2 { margin: var(--tw-2) 0 var(--tw-3); font-size: calc(24 * var(--tw-u)); font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; }
.gm-guide-body { color: var(--tw-ink-2); line-height: 1.55; }
.gm-guide-body p { margin: 0 0 var(--tw-3); }
.gm-guide-body b { color: var(--tw-ink); font-weight: 600; }
.gm-guide-list { display: grid; gap: calc(7 * var(--tw-u)); margin: 0 0 var(--tw-3); }
.gm-guide-row { display: grid; grid-template-columns: calc(92 * var(--tw-u)) 1fr; gap: var(--tw-3); align-items: baseline; }
.gm-guide-row .k { display: flex; flex-wrap: wrap; gap: 3px; }
.gm-guide-row kbd { font: 600 var(--tw-fs-xs) var(--tw-mono); color: var(--tw-ink); padding: 1px calc(6 * var(--tw-u)); border-radius: calc(4 * var(--tw-u));
	border: 1px solid var(--tw-line-2); background: var(--tw-fill); }
.gm-guide-where { display: grid; gap: var(--tw-2); margin: var(--tw-1) 0 var(--tw-3); }
.gm-guide-where div { display: flex; align-items: center; gap: var(--tw-3); padding: var(--tw-2) var(--tw-3); border-radius: var(--tw-r-md); background: var(--tw-fill); border: 1px solid var(--tw-line); }
.gm-guide-where i { width: calc(12 * var(--tw-u)); height: calc(12 * var(--tw-u)); border-radius: 50%; flex: none; box-shadow: 0 0 0 1.5px rgba(255,255,255,0.8); }
.gm-guide-where .is-joe i { background: var(--tw-sun); }
.gm-guide-where .is-marta i { background: var(--tw-aqua); }
.gm-guide-where span { flex: 1; }
.gm-guide-where em { font-style: normal; font-family: var(--tw-mono); font-size: var(--tw-fs-sm); color: var(--tw-ink-2); white-space: nowrap; }
.gm-guide-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--tw-3); margin-top: var(--tw-4); }
.gm-guide-dots { display: flex; gap: 6px; }
.gm-guide-dots span { width: 6px; height: 6px; border-radius: 50%; background: var(--tw-fill-2); transition: background var(--tw-med), width var(--tw-med) var(--tw-ease); }
.gm-guide-dots span.is-on { width: 18px; border-radius: 3px; background: var(--tw-sun); }
.gm-guide-btns { display: flex; align-items: center; gap: var(--tw-2); }
.gm-guide-hint { color: var(--tw-ink-3); font-size: var(--tw-fs-xs); margin-right: var(--tw-2); }
.gm-coach { position: absolute; right: var(--tw-edge); bottom: calc(var(--tw-edge) + 184 * var(--tw-u) + var(--tw-3)); width: min(calc(290 * var(--tw-u)), calc(100vw - 2 * var(--tw-edge)));
	padding: var(--tw-3) var(--tw-4); border-radius: var(--tw-r-lg); color: var(--tw-ink); font: 500 var(--tw-fs-sm) var(--tw-font); line-height: 1.5;
	pointer-events: none; opacity: 0; transform: translateY(calc(8 * var(--tw-u))); visibility: hidden;
	transition: opacity 360ms var(--tw-ease), transform 480ms var(--tw-ease), visibility 0s linear 480ms, right var(--tw-slow) var(--tw-ease); }
.tw-root[data-panel='open'] .gm-coach { right: calc(var(--tw-panel-w) + 2 * var(--tw-3)); }
.gm-coach.is-on { opacity: 1; transform: none; visibility: visible; transition: opacity 360ms var(--tw-ease), transform 480ms var(--tw-ease), visibility 0s, right var(--tw-slow) var(--tw-ease); }
.gm-coach-eyebrow { display: block; margin-bottom: 3px; font-size: var(--tw-fs-xs); font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: var(--tw-aqua); }
.gm-coach b { color: var(--tw-ink); font-weight: 600; }
.gm-coach kbd { font: 600 var(--tw-fs-xs) var(--tw-mono); color: var(--tw-ink); padding: 0 calc(5 * var(--tw-u)); border-radius: calc(4 * var(--tw-u)); border: 1px solid var(--tw-line-2); background: var(--tw-fill); }

.tw-help-guide { display: flex; align-items: center; gap: var(--tw-4); margin-top: var(--tw-4); padding-top: var(--tw-4); border-top: 1px solid var(--tw-line);
	color: var(--tw-ink-2); font-size: var(--tw-fs-sm); line-height: 1.5; }
.tw-help-guide b { color: var(--tw-ink); }
.tw-help-guide .gm-btn { flex: none; }
@media (max-width: 640px) { .tw-help-guide { flex-direction: column; align-items: flex-start; } .gm-coach { bottom: calc(var(--tw-edge) + 128 * var(--tw-u) + var(--tw-3)); } .gm-guide-row { grid-template-columns: calc(78 * var(--tw-u)) 1fr; } }
/* (Salt Life) phones on their side: the cards a little tighter, so the buttons stay on screen */
@media (max-height: 500px) {
	.gm-guide-card { padding: var(--tw-4) var(--tw-5) var(--tw-3); }
	.gm-guide-card h2 { margin: var(--tw-1) 0 var(--tw-2); font-size: calc(20 * var(--tw-u)); }
	.gm-guide-body { line-height: 1.4; }
	.gm-guide-list { gap: calc(3 * var(--tw-u)); margin-bottom: var(--tw-2); }
	.gm-guide-where { margin-bottom: var(--tw-2); }
	.gm-guide-where div { padding: var(--tw-1) var(--tw-3); }
	.gm-guide-foot { margin-top: var(--tw-2); }
}
@media (prefers-reduced-motion: reduce) { .gm-guide-card, .gm-coach { transform: none !important; } }
`;

const k = ( ...keys ) => keys.map( ( x ) => `<kbd>${ x }</kbd>` ).join( '' );
const row = ( keys, text ) => `<div class="gm-guide-row"><span class="k">${ keys }</span><span>${ text }</span></div>`;

// the intro's cards and the tips, worded for the input in use (Input.lastDevice: 'keyboard' | 'touch' |
// 'gamepad'; on touch screens the controls are TouchControls' buttons)
const WELCOME = {
	eyebrow: 'Welcome to Salt Life',
	title: 'Fish the island, sell your catch',
	body: `<p>Catch fish from the <b>beach</b>, the <b>pier</b> or your <b>boat</b>. Different fish bite in the shallows, around the pier, over the reef and out in deep water, and they change with the time of day.</p>
		<p>Sell your catch to <b>Joe</b> at the fish stand by the pier, then spend the money on upgrades from <b>Marta</b> at the chandlery by the boathouse: stronger line, a faster reel, a bigger hold, a fish finder and lights for fishing at night.</p>
		<p>They keep island hours. Each morning Joe chalks the fish he's after on his counter, and pays over the odds for them. Under it is the week's order for a restaurant on the mainland, which everyone on the island fills together.</p>`,
};

const FISHING = {
	keyboard: [ [ k( 'R' ), 'Take out the rod (by the water or on the boat)' ], [ k( 'Hold', 'LMB' ), 'Wind up, release to cast. Hold longer to cast farther' ],
		[ k( 'LMB' ), 'Strike when the bobber is <b>pulled under</b> (dips are only nibbles)' ], [ k( 'Hold', 'LMB' ), 'Reel in. <b>Let go when the tension turns red</b>, or the line snaps' ],
		[ k( 'RMB' ), 'Reel an empty line back in' ], [ k( 'F', 'G' ), 'The left and right mouse buttons, from the keyboard' ], [ k( 'I' ), 'Your cooler, fish log, island records and islander' ] ],
	touch: [ [ k( 'Rod' ), 'Take out the rod (by the water or on the boat)' ], [ k( 'Hold', 'Cast' ), 'Wind up, let go to cast. Hold longer to cast farther' ],
		[ k( 'Strike' ), 'When the bobber is <b>pulled under</b> (dips are only nibbles)' ], [ k( 'Hold', 'Reel' ), 'Reel in. <b>Let go when the tension turns red</b>, or the line snaps' ],
		[ k( 'Reel in' ), 'Reel an empty line back in' ], [ k( 'Cooler' ), 'Your cooler, fish log, island records and islander' ] ],
	gamepad: [ [ k( 'X' ), 'Take out the rod (by the water or on the boat)' ], [ k( 'Hold', 'RT' ), 'Wind up, release to cast. Hold longer to cast farther' ],
		[ k( 'RT' ), 'Strike when the bobber is <b>pulled under</b> (dips are only nibbles)' ], [ k( 'Hold', 'RT' ), 'Reel in. <b>Let go when the tension turns red</b>, or the line snaps' ],
		[ k( 'LT' ), 'Reel an empty line back in' ], [ k( 'Back' ), 'Your cooler, fish log, island records and islander' ] ],
};

const AROUND = {
	keyboard: [ [ k( 'W', 'A', 'S', 'D' ), 'Move, mouse to look, <kbd>Shift</kbd> to run' ], [ k( 'E' ), 'Board the boat, take the helm, talk to Joe and Marta' ],
		[ k( 'L' ), 'Flashlight (at night). At the helm, the searchlight' ], [ k( 'H' ), 'This guide again. At the helm, hold for the horn' ],
		[ k( 'T' ), 'The clock: hold it or rest until later (with others, once everyone agrees)' ] ],
	touch: [ [ k( 'Left side' ), 'Drag to walk, from wherever your thumb lands' ], [ k( 'Right side' ), 'Drag to look around' ],
		[ k( 'Gold button' ), 'Board the boat, take the helm, talk to Joe and Marta' ], [ k( 'Torch' ), 'Flashlight, after dusk. At the helm: the searchlight' ],
		[ k( 'Horn' ), 'At the helm, hold it to sound the horn' ], [ k( 'Time' ), 'Tap the time at the top right to hold the clock or rest until later' ] ],
	gamepad: [ [ k( 'Left stick' ), 'Move, right stick to look' ], [ k( 'B' ), 'Board the boat, take the helm, talk to Joe and Marta' ], [ k( 'D-pad ↓' ), 'Flashlight. At the helm, the searchlight' ],
		[ k( 'L3' ), 'At the helm, press and hold the left stick for the horn' ], [ k( 'R3' ), 'The clock: hold it or rest until later' ] ],
};

function cards( device ) {

	const d = FISHING[ device ] ? device : 'keyboard';
	const rows = ( list ) => `<div class="gm-guide-list">${ list.map( ( [ keys, text ] ) => row( keys, text ) ).join( '' ) }</div>`;
	return [
		WELCOME,
		{ eyebrow: 'Fishing', title: 'Cast, strike, reel', body: rows( FISHING[ d ] ) },
		{
			eyebrow: 'Getting around',
			title: 'Joe and Marta',
			body: `${ rows( AROUND[ d ] ) }
			<div class="gm-guide-where">
				<div class="is-joe"><i></i><span><b>Joe</b> · fish stand by the pier</span><em data-where="joe"></em></div>
				<div class="is-marta"><i></i><span><b>Marta</b> · chandlery by the boathouse</span><em data-where="marta"></em></div>
			</div>
			<p style="margin:0;color:var(--tw-ink-3);font-size:var(--tw-fs-sm)">Both are marked on the map ${ document.documentElement.classList.contains( 'is-touch' ) ? 'at the top right' : 'in the lower right' }.</p>`,
		},
	];

}

const CARD_COUNT = 3;

const TIPS = {
	keyboard: {
		rodOut: 'Hold the <b>left mouse button</b> to wind up and release to cast. Try deeper water, around the pier or over the reef.',
		nibble: 'The bobber is dipping: something is <b>nibbling</b>. Wait until it is <b>pulled under</b>, then click to strike.',
		fishOn: '<b>Hold the left mouse button</b> to reel. When the tension needle nears the <b>red</b>, let go until it settles, then reel again.',
		caught: 'Into the cooler (<kbd>I</kbd>). Sell your catch to <b>Joe</b> at the fish stand by the pier: he is on the map.',
		boat: 'Your boat. <kbd>E</kbd> to board, <kbd>E</kbd> again at the wheel to drive (<kbd>W</kbd><kbd>S</kbd> throttle, <kbd>A</kbd><kbd>D</kbd> steer). Diesel is sold by Marta.',
		joe: '<b>Joe</b> buys your fish. <kbd>E</kbd> to see what he will pay.',
		marta: '<b>Marta</b> sells upgrades and diesel. <kbd>E</kbd> to see her stock.',
	},
	touch: {
		rodOut: 'Hold <b>Cast</b> to wind up and let go to cast. Try deeper water, around the pier or over the reef.',
		nibble: 'The bobber is dipping: something is <b>nibbling</b>. Wait until it is <b>pulled under</b>, then tap <b>Strike</b>.',
		fishOn: '<b>Hold Reel</b> to reel in. When the tension needle nears the <b>red</b>, let go until it settles, then reel again.',
		caught: 'Into the cooler (the <b>Cooler</b> button). Sell your catch to <b>Joe</b> at the fish stand by the pier: he is on the map.',
		boat: 'Your boat. Tap <b>Board boat</b>, then <b>Take the helm</b> at the wheel and drive with the left side. Diesel is sold by Marta.',
		joe: '<b>Joe</b> buys your fish. Tap <b>Talk to Joe</b> to see what he will pay.',
		marta: '<b>Marta</b> sells upgrades and diesel. Tap <b>Talk to Marta</b> to see her stock.',
	},
	gamepad: {
		rodOut: 'Hold <kbd>RT</kbd> to wind up and release to cast. Try deeper water, around the pier or over the reef.',
		nibble: 'The bobber is dipping: something is <b>nibbling</b>. Wait until it is <b>pulled under</b>, then <kbd>RT</kbd> to strike.',
		fishOn: '<b>Hold <kbd>RT</kbd></b> to reel. When the tension needle nears the <b>red</b>, let go until it settles, then reel again.',
		caught: 'Into the cooler (<kbd>Back</kbd>). Sell your catch to <b>Joe</b> at the fish stand by the pier: he is on the map.',
		boat: 'Your boat. <kbd>B</kbd> to board, <kbd>B</kbd> again at the wheel to drive with the left stick. Diesel is sold by Marta.',
		joe: '<b>Joe</b> buys your fish. <kbd>B</kbd> to see what he will pay.',
		marta: '<b>Marta</b> sells upgrades and diesel. <kbd>B</kbd> to see her stock.',
	},
	full: 'Your cooler is <b>full</b>. Sell to Joe, or buy a bigger hold from Marta at the chandlery.',
};

const tipText = ( id, device ) => ( TIPS[ device ] || TIPS.keyboard )[ id ] || TIPS[ id ];

const h = ( tag, cls, html ) => {

	const e = document.createElement( tag );
	if ( cls ) e.className = cls;
	if ( html !== undefined ) e.innerHTML = html;
	return e;

};

// compass word for the direction from (x, z) to (tx, tz); north is -z
export function compassWord( x, z, tx, tz ) {

	const a = Math.atan2( tx - x, - ( tz - z ) ); // 0 north, clockwise
	const W = [ 'north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west' ];
	return W[ ( ( Math.round( a / ( Math.PI / 4 ) ) % 8 ) + 8 ) % 8 ];

}

export class Guide {

	constructor( ui, game, minimap = null ) {

		this.ui = ui;
		this.game = game;
		this.minimap = minimap;
		const style = h( 'style' );
		style.textContent = CSS;
		document.head.append( style );

		this.seen = this._load();
		this.el = h( 'div', 'gm-guide tw-interactive', `<div class="gm-guide-card tw-glass" role="dialog" aria-modal="true" aria-live="polite">
			<div class="gm-guide-eyebrow"></div><h2></h2><div class="gm-guide-body"></div>
			<div class="gm-guide-foot"><div class="gm-guide-dots">${ '<span></span>'.repeat( CARD_COUNT ) }</div>
			<div class="gm-guide-btns"><span class="gm-guide-hint">Enter · Esc to skip</span><button type="button" class="gm-btn is-ghost gm-guide-skip">Skip</button><button type="button" class="gm-btn gm-guide-next">Next</button></div></div></div>` );
		this.card = this.el.firstChild;
		this.eyebrow = this.el.querySelector( '.gm-guide-eyebrow' );
		this.title = this.el.querySelector( 'h2' );
		this.body = this.el.querySelector( '.gm-guide-body' );
		this.dots = [ ...this.el.querySelectorAll( '.gm-guide-dots span' ) ];
		this.nextBtn = this.el.querySelector( '.gm-guide-next' );
		this.hint = this.el.querySelector( '.gm-guide-hint' );
		this.el.querySelector( '.gm-guide-skip' ).addEventListener( 'click', ( e ) => {

			e.stopPropagation();
			this.close();

		} );
		this.nextBtn.addEventListener( 'click', ( e ) => {

			e.stopPropagation();
			this.next();

		} );
		ui.root.append( this.el );

		this.coach = h( 'div', 'gm-coach tw-glass', '<span class="gm-coach-eyebrow">Tip</span><span class="gm-coach-text"></span>' );
		this.coachText = this.coach.lastChild;
		( ui.hud || ui.root ).append( this.coach );

		this.open = false;
		this.step = 0;
		this._wait = this.seen.intro ? - 1 : 0.8; // seconds after the start overlay before the intro
		this._coachT = 0;
		this._queue = [];
		this._whereT = 0;
		this._prev = { lastCatch: game.state.lastCatch };

		// while the intro is up it owns the keyboard and the mouse (capture phase, before the game's input)
		this._onKey = ( e ) => {

			if ( ! this.open ) return;
			if ( e.code === 'Escape' ) this.close();
			else if ( e.code === 'Enter' || e.code === 'Space' || e.code === 'ArrowRight' ) this.next();
			else if ( e.code === 'ArrowLeft' ) this.show( Math.max( 0, this.step - 1 ) );
			else if ( e.code !== 'KeyH' ) return;
			e.preventDefault();
			e.stopPropagation();

		};

		this._onDown = ( e ) => {

			if ( ! this.open ) return;
			if ( e.target && e.target.closest && e.target.closest( 'button' ) ) return;
			e.preventDefault();
			e.stopPropagation();
			this.next();

		};

		window.addEventListener( 'keydown', this._onKey, true );
		window.addEventListener( 'pointerdown', this._onDown, true );

	}

	get device() {

		return this.game.app.input.lastDevice;

	}

	// (Salt Life: the app's save store, All the Spaces' personal save: a creation's frame has no
	// localStorage of its own)
	get _storage() {

		return ( this.game && this.game.app && this.game.app.store ) || localStorage;

	}

	_load() {

		try {

			return JSON.parse( this._storage.getItem( KEY ) || '{}' ) || {};

		} catch ( e ) {

			return {};

		}

	}

	_save() {

		try {

			this._storage.setItem( KEY, JSON.stringify( this.seen ) );

		} catch ( e ) { /* storage blocked: the guide just shows again next time */ }

	}

	// ---- intro
	show( i ) {

		this.step = i;
		const c = cards( this.device )[ i ];
		this.eyebrow.textContent = c.eyebrow;
		this.title.textContent = c.title;
		this.body.innerHTML = c.body;
		this.dots.forEach( ( d, j ) => d.classList.toggle( 'is-on', j === i ) );
		this.nextBtn.textContent = i === CARD_COUNT - 1 ? 'Let\'s fish' : 'Next';
		if ( this.minimap ) this.minimap.highlight( i === CARD_COUNT - 1 ? [ 'joe', 'marta' ] : [] );
		this.hint.hidden = this.device === 'touch';
		this._whereT = 0;
		if ( ! this.open ) {

			this.open = true;
			this.el.classList.add( 'is-on' );

		}

	}

	next() {

		if ( this.step < CARD_COUNT - 1 ) this.show( this.step + 1 );
		else this.close();

	}

	close() {

		if ( ! this.open ) return;
		this.open = false;
		this.el.classList.remove( 'is-on' );
		if ( this.minimap ) this.minimap.highlight( [] );
		this.seen.intro = true;
		this._save();

	}

	replay() {

		this.seen = {};
		this._save();
		this._queue.length = 0;
		this._hideCoach();
		if ( this.ui.toggleHelp ) this.ui.toggleHelp( false );
		this.show( 0 );

	}

	// ---- one-time tips
	tip( id ) {

		if ( this.seen[ id ] || this._queue.includes( id ) || this._current === id ) return;
		this._queue.push( id );

	}

	_hideCoach() {

		this._current = null;
		this.coach.classList.remove( 'is-on' );

	}

	update( dt ) {

		const ui = this.ui, g = this.game, app = g.app, p = app.player;

		// the intro, once the start overlay is gone
		if ( this._wait >= 0 && ! ui._start ) {

			this._wait -= dt;
			if ( this._wait < 0 ) this.show( 0 );

		}

		if ( this.open ) {

			// live direction and distance to Joe and Marta
			this._whereT -= dt;
			if ( this._whereT <= 0 && this.step === CARD_COUNT - 1 ) {

				this._whereT = 0.25;
				const x = p.position.x, z = p.position.z;
				for ( const [ id, t ] of [ [ 'joe', STAND ], [ 'marta', CHANDLERY ] ] ) {

					const el = this.body.querySelector( `[data-where="${ id }"]` );
					if ( el ) el.textContent = `${ Math.round( Math.hypot( t.x - x, t.z - z ) ) } m ${ compassWord( x, z, t.x, t.z ) }`;

				}

			}

			return;

		}

		// triggers (edge detected; each tip shows once)
		const rod = g.rod, b = g.bite, prev = this._prev;
		if ( rod.equipped && ! prev.equipped ) this.tip( 'rodOut' );
		if ( b && b.phase === 'nibble' ) this.tip( 'nibble' );
		if ( g.fight && ! prev.fight ) this.tip( 'fishOn' );
		const lc = g.state.lastCatch;
		if ( lc && lc !== prev.lastCatch && lc.kept ) this._afterCard = 'caught';
		if ( this._afterCard && ! ( g.hud && g.hud.catchOpen ) && ! g.landing ) {

			this.tip( this._afterCard );
			this._afterCard = null;

		}

		const s = g.state;
		if ( s.holdKg >= s.stats.holdKg * 0.92 ) this.tip( 'full' );
		if ( p.mode === 'walk' ) {

			const bt = app.boatCtl;
			if ( bt && Math.hypot( bt.position.x - p.position.x, bt.position.z - p.position.z ) < 9 ) this.tip( 'boat' );
			for ( const v of g.vendors ) if ( v.inRange( p.position ) ) this.tip( v.kind === 'buyer' ? 'joe' : 'marta' );

		}

		prev.equipped = rod.equipped;
		prev.fight = !! g.fight;
		prev.lastCatch = lc;

		// the coach card: one tip at a time, ~7 s each (not over the catch card or a panel)
		const busy = g.hud && ( g.hud.catchOpen || g.hud.invOpen || g.hud.standOpen );
		if ( this._current ) {

			this._coachT -= dt;
			if ( this._coachT <= 0 || busy ) this._hideCoach();

		} else if ( this._queue.length && ! busy ) {

			const id = this._queue.shift();
			this._current = id;
			this.seen[ id ] = true;
			this._save();
			this.coachText.innerHTML = tipText( id, this.device );
			this.coach.classList.add( 'is-on' );
			this._coachT = 7.5;

		}

	}

}
