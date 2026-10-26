import { STAND } from './FishStand.js';
import { CHANDLERY } from './Chandlery.js';
import { feet } from './Units.js';

// First-play guide:
//  - an intro (3 cards) the first time the game starts, after the start overlay: the goal, the fishing
//    controls, getting around and where Joe and Marta are (live direction and distance; their
//    markers pulse on the minimap). Enter / Space / click or tap: next, Esc: skip. Replay with H (Salt
//    Life: Tidewater's help panel, F1, isn't ported).
//  - one-time tips the first time something happens (rod out, first nibble, fish on, first catch,
//    full cooler, next to the boat, at Joe's, at Marta's; Salt Life: the speargun out, its band to
//    load, a big fish on the shaft, the breath running low, the cast net out, in the water, the first
//    bait in the bucket; M10: water in the boat's bilge, her hull worn), in a card above the minimap.
// Seen state under 'tidewater.guide' (in the person's saves: core/SaveStore), wrapped in try/catch.
//   const guide = new Guide( ui, game, minimap );  guide.update( dt );  guide.replay()

const KEY = 'tidewater.guide';

const CSS = /* css */`
.gm-guide { position: absolute; inset: 0; display: grid; grid-template: minmax(0, 1fr) / minmax(0, 1fr); place-items: center; pointer-events: none; opacity: 0; visibility: hidden;
	background: radial-gradient(70% 70% at 50% 50%, rgba(4, 10, 16, 0.2), rgba(4, 10, 16, 0.55));
	transition: opacity 420ms var(--tw-ease), visibility 0s linear 420ms; }
.gm-guide.is-on { opacity: 1; visibility: visible; pointer-events: auto; transition: opacity 420ms var(--tw-ease), visibility 0s; }
.gm-guide-card { width: min(calc(480 * var(--tw-u)), calc(100vw - 2 * var(--tw-edge))); padding: var(--tw-5) var(--tw-5) var(--tw-4); border-radius: var(--tw-r-lg);
	color: var(--tw-ink); font: 500 var(--tw-fs-md) var(--tw-font); transform: translateY(calc(10 * var(--tw-u))); transition: transform 520ms var(--tw-ease);
	display: flex; flex-direction: column; max-height: calc(100% - 2 * var(--tw-edge)); }
/* (Salt Life) on a screen too short for a card, its words scroll between the title and the buttons (the
   guide's one row is the screen's height, so the card's max-height measures against it) */
.gm-guide-card > * { flex: none; }
.gm-guide-card > .gm-guide-body { flex: 0 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
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
/* (Salt Life) phones on their side: the cards wider and a little tighter, so there's less to scroll */
@media (max-height: 500px) {
	.gm-guide-card { width: min(calc(640 * var(--tw-u)), calc(100vw - 2 * var(--tw-edge))); padding: var(--tw-4) var(--tw-5) var(--tw-3); }
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
	body: `<p>Catch fish from the <b>beach</b>, the <b>pier</b> or your <b>boat</b>, throw a <b>cast net</b> over mullet and bait fish, or dive for them with a <b>speargun</b>. Different fish bite in the shallows, around the pier, over the reef and out in deep water, and they change with the time of day.</p>
		<p>Sell your catch to <b>Joe</b> at the fish stand by the pier, then spend the money on upgrades from <b>Marta</b> at the chandlery by the boathouse: stronger line, a faster reel, a bigger cast net and a bait bucket, a better speargun, a bigger hold, a fish finder and lights for fishing at night.</p>
		<p>They keep island hours. Each morning Joe chalks the fish he's after on his counter, and pays over the odds for them. Under it is the week's order for a restaurant on the mainland, which everyone on the island fills together.</p>`,
};

const FISHING = {
	keyboard: [ [ k( 'R' ), 'Take out the rod (by the water or on the boat)' ], [ k( 'Hold', 'LMB' ), 'Wind up, release to cast. Hold longer to cast farther' ],
		[ k( 'LMB' ), 'Strike when the bobber is <b>pulled under</b> (dips are only nibbles)' ], [ k( 'Hold', 'LMB' ), 'Reel in. <b>Let go when the tension turns red</b>, or the line snaps' ],
		[ k( 'RMB' ), 'Reel an empty line back in' ], [ k( 'N' ), 'The cast net, for mullet and bait. <kbd>B</kbd> picks the bait for the hook' ],
		[ k( 'F', 'G' ), 'The left and right mouse buttons, from the keyboard' ], [ k( 'I' ), 'Your cooler, fish log, island records and islander' ] ],
	touch: [ [ k( 'Rod' ), 'Take out the rod (by the water or on the boat)' ], [ k( 'Hold', 'Cast' ), 'Wind up, let go to cast. Hold longer to cast farther' ],
		[ k( 'Strike' ), 'When the bobber is <b>pulled under</b> (dips are only nibbles)' ], [ k( 'Hold', 'Reel' ), 'Reel in. <b>Let go when the tension turns red</b>, or the line snaps' ],
		[ k( 'Reel in' ), 'Reel an empty line back in' ], [ k( 'Cast net' ), 'For mullet and bait fish. <b>Bait</b> picks what goes on the hook' ],
		[ k( 'Cooler' ), 'Your cooler, fish log, island records and islander' ] ],
	gamepad: [ [ k( 'X' ), 'Take out the rod (by the water or on the boat)' ], [ k( 'Hold', 'RT' ), 'Wind up, release to cast. Hold longer to cast farther' ],
		[ k( 'RT' ), 'Strike when the bobber is <b>pulled under</b> (dips are only nibbles)' ], [ k( 'Hold', 'RT' ), 'Reel in. <b>Let go when the tension turns red</b>, or the line snaps' ],
		[ k( 'LT' ), 'Reel an empty line back in' ], [ k( 'D-pad ↑' ), 'The cast net, for mullet and bait. <kbd>D-pad ← →</kbd> picks the bait for the hook' ],
		[ k( 'Back' ), 'Your cooler, fish log, island records and islander' ] ],
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
		gunOut: 'Dive (look down and swim) and <b>fin slowly</b> up to a fish: rush it and it bolts. Put it in the sights and <b>click</b>. They tell you what it is, and whether you may take it.',
		gunLoad: '<b>Hold the left mouse button</b> to draw the band back to its notch on the shaft.',
		spearFight: 'A big one. <b>Hold the left mouse button</b> to pull it in, let go when it runs, until it tires.',
		breath: 'Your <b>breath</b> is running out (the gauge by your money). Swim up (<kbd>Space</kbd>) before you black out.',
		netOut: 'Look at the water where you want it and <b>hold the left mouse button</b> to swing it back. Let go <b>as the ring brightens</b> and it spins fully open. Mullet and bait fish school in the shallows, by the pier and round the boat.',
		netSink: 'Let it <b>sink</b>: the lead line traps what\'s under it as it reaches the bottom. Then <b>hold the left mouse button</b> to draw it closed and haul it in.',
		bait: 'Live bait goes in your <b>bucket</b>. With the rod out, <kbd>B</kbd> puts it on the hook: bigger fish take it, and sooner. A mullet can be cut up for bait in the cooler (<kbd>I</kbd>).',
		bilge: 'There\'s <b>water in the bilge</b> (the gauge by your money). On deck, <b>hold <kbd>E</kbd></b> to bail it out before it reaches the engine. Marta sells a <b>bilge pump</b>.',
	},
	touch: {
		rodOut: 'Hold <b>Cast</b> to wind up and let go to cast. Try deeper water, around the pier or over the reef.',
		nibble: 'The bobber is dipping: something is <b>nibbling</b>. Wait until it is <b>pulled under</b>, then tap <b>Strike</b>.',
		fishOn: '<b>Hold Reel</b> to reel in. When the tension needle nears the <b>red</b>, let go until it settles, then reel again.',
		caught: 'Into the cooler (the <b>Cooler</b> button). Sell your catch to <b>Joe</b> at the fish stand by the pier: he is on the map.',
		boat: 'Your boat. Tap <b>Board boat</b>, then <b>Take the helm</b> at the wheel and drive with the left side. Diesel is sold by Marta.',
		joe: '<b>Joe</b> buys your fish. Tap <b>Talk to Joe</b> to see what he will pay.',
		marta: '<b>Marta</b> sells upgrades and diesel. Tap <b>Talk to Marta</b> to see her stock.',
		gunOut: 'Tap <b>Dive</b> and <b>fin slowly</b> up to a fish: rush it and it bolts. Put it in the sights and tap <b>Shoot</b>. They tell you what it is, and whether you may take it.',
		gunLoad: '<b>Hold Load</b> to draw the band back to its notch on the shaft.',
		spearFight: 'A big one. <b>Hold Pull</b> to pull it in, let go when it runs, until it tires.',
		breath: 'Your <b>breath</b> is running out (the gauge by your money). <b>Swim up</b> before you black out.',
		netOut: 'Look at the water where you want it and <b>hold Throw</b> to swing it back. Let go <b>as the ring brightens</b> and it spins fully open. Mullet and bait fish school in the shallows, by the pier and round the boat.',
		netSink: 'Let it <b>sink</b>: the lead line traps what\'s under it as it reaches the bottom. Then <b>hold Close</b> to draw it shut and haul it in.',
		bait: 'Live bait goes in your <b>bucket</b>. With the rod out, <b>Bait</b> puts it on the hook: bigger fish take it, and sooner. A mullet can be cut up for bait in the <b>Cooler</b>.',
		bilge: 'There\'s <b>water in the bilge</b> (the gauge by your money). On deck, <b>hold Bail</b> to bail it out before it reaches the engine. Marta sells a <b>bilge pump</b>.',
	},
	gamepad: {
		rodOut: 'Hold <kbd>RT</kbd> to wind up and release to cast. Try deeper water, around the pier or over the reef.',
		nibble: 'The bobber is dipping: something is <b>nibbling</b>. Wait until it is <b>pulled under</b>, then <kbd>RT</kbd> to strike.',
		fishOn: '<b>Hold <kbd>RT</kbd></b> to reel. When the tension needle nears the <b>red</b>, let go until it settles, then reel again.',
		caught: 'Into the cooler (<kbd>Back</kbd>). Sell your catch to <b>Joe</b> at the fish stand by the pier: he is on the map.',
		boat: 'Your boat. <kbd>B</kbd> to board, <kbd>B</kbd> again at the wheel to drive with the left stick. Diesel is sold by Marta.',
		joe: '<b>Joe</b> buys your fish. <kbd>B</kbd> to see what he will pay.',
		marta: '<b>Marta</b> sells upgrades and diesel. <kbd>B</kbd> to see her stock.',
		gunOut: 'Dive (look down and swim) and <b>fin slowly</b> up to a fish: rush it and it bolts. Put it in the sights and <kbd>RT</kbd>. They tell you what it is, and whether you may take it.',
		gunLoad: '<b>Hold <kbd>RT</kbd></b> to draw the band back to its notch on the shaft.',
		spearFight: 'A big one. <b>Hold <kbd>RT</kbd></b> to pull it in, let go when it runs, until it tires.',
		breath: 'Your <b>breath</b> is running out (the gauge by your money). Swim up (<kbd>A</kbd>) before you black out.',
		netOut: 'Look at the water where you want it and <b>hold <kbd>RT</kbd></b> to swing it back. Let go <b>as the ring brightens</b> and it spins fully open. Mullet and bait fish school in the shallows, by the pier and round the boat.',
		netSink: 'Let it <b>sink</b>: the lead line traps what\'s under it as it reaches the bottom. Then <b>hold <kbd>RT</kbd></b> to draw it closed and haul it in.',
		bait: 'Live bait goes in your <b>bucket</b>. With the rod out, <kbd>D-pad ← →</kbd> puts it on the hook: bigger fish take it, and sooner. A mullet can be cut up for bait in the cooler (<kbd>Back</kbd>).',
		bilge: 'There\'s <b>water in the bilge</b> (the gauge by your money). On deck, <b>hold <kbd>B</kbd></b> to bail it out before it reaches the engine. Marta sells a <b>bilge pump</b>.',
	},
	full: 'Your cooler is <b>full</b>. Sell to Joe, or buy a bigger hold from Marta at the chandlery.',
	worn: 'Your boat\'s <b>hull is worn</b> (the gauge by your money): she\'s slower, and she leaks. Marta <b>repairs</b> it at the chandlery, with the boat at her dock.',
	// (M12) the surf
	rip: 'You\'re in a <b>rip current</b>, carried out through a gap in the breakers (the milky water). Swim <b>along the beach</b> out of it, not against it.',
	tumble: 'A <b>breaker</b> tumbled you. In a big surf, <b>dive under</b> a big one before it breaks on you, or keep out beyond the breakers.',
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
					if ( el ) el.textContent = `${ feet( Math.hypot( t.x - x, t.z - z ) ) } ${ compassWord( x, z, t.x, t.z ) }`;

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

		// (Salt Life) the speargun and the held breath
		const gun = g.gun;
		if ( gun && gun.equipped && ! prev.gun ) this.tip( 'gunOut' );
		if ( gun && gun.state === 'empty' && [ 'landing', 'pulling' ].includes( prev.gunState ) ) this.tip( 'gunLoad' );
		if ( g.spearFight && ! prev.spearFight ) this.tip( 'spearFight' );
		if ( p.mode === 'swim' && p.under && p.breath < p.breathMax * 0.3 ) this.tip( 'breath' );
		// ((M12) the surf: carried out by a rip for a few seconds; the first tumble in a breaker)
		if ( p.inRip > 4 ) this.tip( 'rip' );
		if ( prev.tumbles !== undefined && p.tumbles > prev.tumbles ) this.tip( 'tumble' );
		prev.tumbles = p.tumbles;
		prev.gun = !! ( gun && gun.equipped );
		prev.gunState = gun && gun.state;
		prev.spearFight = !! g.spearFight;

		// (Salt Life) the cast net, and the bait it brings in
		const net = g.net, s = g.state;
		if ( net && net.equipped && ! prev.net ) this.tip( 'netOut' );
		if ( net && net.state === 'sinking' && net.footprint.wet && prev.netState !== 'sinking' ) this.tip( 'netSink' );
		const baitN = s.baitCount;
		if ( prev.baitN !== undefined && baitN > prev.baitN ) this.tip( 'bait' );
		prev.net = !! ( net && net.equipped );
		prev.netState = net && net.state;
		prev.baitN = baitN;

		if ( s.holdKg >= s.stats.holdKg * 0.92 ) this.tip( 'full' );
		// (M10) the boat's hull: the first water in the bilge, aboard; the first real wear
		const hull = g.hull;
		if ( hull && hull.bilge >= 20 && ( p.mode === 'deck' || p.mode === 'boat' ) && ! p.riding ) this.tip( 'bilge' );
		if ( hull && hull.wear >= 0.1 ) this.tip( 'worn' );
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
