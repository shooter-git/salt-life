import { STAND } from './FishStand.js';
import { CHANDLERY } from './Chandlery.js';
import { CAMP } from './FishCamp.js';
import { NAMES, NAME, namedAs } from './Chart.js';
import { feet } from './Units.js';
import { edgeAt } from './Weather.js';
import { LEFT, RIGHT, UP, DOWN } from '../core/Glyphs.js';
import { fuelOf } from './Gear.js';
import { FLEET } from './fleet/Fleet.js';
import { iconSvg } from '../ui/ActionIcons.js';

// First-play guide:
//  - an intro (3 cards) the first time the game starts, after the start overlay: the goal, the fishing
//    controls, getting around and where Joe and Marta are (live direction and distance; their
//    markers pulse on the minimap). Enter / Space / click or tap: next, Esc: skip. Replay with H (Salt
//    Life: Tidewater's help panel, F1, isn't ported).
//  - one-time tips the first time something happens (rod out, first nibble, fish on, first catch,
//    full cooler, next to the boat, at Joe's, at Marta's; Salt Life: the speargun out, its band to
//    load, a big fish on the shaft, the breath running low, the cast net out, in the water, the first
//    bait in the bucket; M10: water in the boat's bilge, her hull worn), in a card above the minimap.
//  - (M16) you start in a kayak, with no engine: the intro and the tips are worded for the boat you're in (tipFor), and
//    what's only true of a helm, fuel or a radio shows only once you've one. Marta's list comes up in play: her boats when
//    you've sold a few fish, the console when you could buy her, the sportfisher's silhouette as your gear comes on.
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
.gm-guide-where .is-boat i { background: #f2efe6; }
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
/* (a tap or a click on it puts it away: its cross says so) */
.gm-coach.is-on { pointer-events: auto; cursor: pointer; touch-action: manipulation; }
.gm-coach-x { position: absolute; top: calc(8 * var(--tw-u)); right: calc(10 * var(--tw-u)); display: grid; place-items: center; color: var(--tw-ink-3); }
.gm-coach-x svg { width: calc(14 * var(--tw-u)); height: calc(14 * var(--tw-u)); }
.gm-coach:hover .gm-coach-x { color: var(--tw-ink); }
.gm-coach-eyebrow { display: block; margin-bottom: 3px; font-size: var(--tw-fs-xs); font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: var(--tw-aqua); }
.gm-coach b { color: var(--tw-ink); font-weight: 600; }
.gm-coach kbd { font: 600 var(--tw-fs-xs) var(--tw-mono); color: var(--tw-ink); padding: 0 calc(5 * var(--tw-u)); border-radius: calc(4 * var(--tw-u)); border: 1px solid var(--tw-line-2); background: var(--tw-fill); }
/* (touch: a button's picture for its key, and in the words) */
.gm-guide-row kbd.gm-kico { padding: 1px calc(4 * var(--tw-u)); }
.gm-kico svg { display: block; width: calc(16 * var(--tw-u)); height: calc(16 * var(--tw-u)); }
.gm-pic { display: inline-flex; align-items: center; gap: 2px; vertical-align: -0.22em; white-space: nowrap; }
.gm-pic svg { width: 1.2em; height: 1.2em; }
.gm-guide .ai-badge, .gm-coach .ai-badge { fill: #18232c; }

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
// (touch: the buttons' pictures, ui/ActionIcons.js, as a key and in the words)
const ico = ( ...ids ) => ids.map( ( id ) => `<kbd class="gm-kico">${ iconSvg( id ) }</kbd>` ).join( '' );
const pic = ( id, word = '' ) => `<b class="gm-pic">${ iconSvg( id ) }${ word }</b>`;
const WHEEL = `the actions wheel (${ pic( 'wheel' ) })`;
const row = ( keys, text ) => `<div class="gm-guide-row"><span class="k">${ keys }</span><span>${ text }</span></div>`;

// the intro's cards and the tips, worded for the input in use (Input.lastDevice: 'keyboard' | 'touch' |
// 'gamepad'; on touch screens the controls are TouchControls' buttons)
const HOURS = '<p>They keep island hours. Each morning Joe chalks the fish he\'s after on his counter, and pays over the odds for them. Under it is the week\'s order for a restaurant on the mainland, which everyone on the island fills together.</p>';
const WELCOME = {
	eyebrow: 'Welcome to Salt Life',
	title: 'Fish the island, sell your catch',
	body: `<p>Catch fish from the <b>beach</b>, the <b>pier</b> or your <b>boat</b>, throw a <b>cast net</b> over mullet and bait fish, or dive for them with a <b>speargun</b>. Different fish bite in the shallows, around the pier, over the reef and out in deep water, and they change with the time of day.</p>
		<p>Sell your catch to <b>Joe</b> at the fish stand by the pier, then spend the money on upgrades from <b>Marta</b> at the chandlery by the boathouse: stronger line, a faster reel, a bigger cast net and a bait bucket, a better speargun, a bigger hold, a fish finder and lights for fishing at night.</p>
		${ HOURS }`,
};
// (M16) as it is at the start: a kayak on the sand and a hand-me-down rod
const WELCOME_KAYAK = {
	eyebrow: 'Welcome to Salt Life',
	title: 'A kayak, a rod and the island',
	body: `<p>You've a <b>12 ft fishing kayak</b> on the sand by the pier, and a hand-me-down rod. No engine and no fuel to buy: she goes where you paddle her. Fish from the <b>beach</b>, the <b>pier</b> or her seat. The flats and the sheltered shallows by the village are her water, for redfish, trout, snook and snapper, and they change with the time of day.</p>
		<p>Sell your catch to <b>Joe</b> at the fish stand by the pier, then spend the money with <b>Marta</b> at the chandlery by the boathouse: stronger line, a faster reel, a cooler, and one day a boat with an engine, for the reef and the deep water past it.</p>
		${ HOURS }`,
};

const FISHING = {
	keyboard: [ [ k( 'R' ), 'Take out the rod (by the water or on the boat)' ], [ k( 'Hold', 'LMB' ), 'Wind up, release to cast. Hold longer to cast farther' ],
		[ k( 'LMB' ), 'Strike when the bobber is <b>pulled under</b> (dips are only nibbles)' ], [ k( 'Hold', 'LMB' ), 'Reel in. <b>Let go when the tension turns red</b>, or the line snaps' ],
		[ k( 'RMB' ), 'Reel an empty line back in' ], [ k( 'N' ), 'The cast net, for mullet and bait. <kbd>B</kbd> picks the bait for the hook' ],
		[ k( 'C' ), 'The rig, with the rod out: a float or a sinker, and aboard a trolled line, a kite, a deep drop. <kbd>X</kbd> ties on a leader you own' ],
		[ k( 'F', 'G' ), 'The left and right mouse buttons, from the keyboard' ], [ k( 'I' ), 'Your cooler, fish log, island records and islander' ] ],
	touch: [ [ ico( 'rod' ), 'Take out the rod: the gold button by the water, or the actions wheel' ], [ k( 'Hold' ) + ico( 'cast' ), 'The big button, <b>Cast</b>: wind up, let go to cast. Hold longer to cast farther' ],
		[ ico( 'strike' ), '<b>Strike</b> when the bobber is <b>pulled under</b> (dips are only nibbles)' ], [ k( 'Hold' ) + ico( 'reel' ), '<b>Reel</b>. <b>Let go when the tension turns red</b>, or the line snaps' ],
		[ ico( 'reelin' ), 'Reel an empty line back in' ], [ ico( 'net' ), `The cast net, for mullet and bait fish. ${ pic( 'bait' ) } picks what goes on the hook` ],
		[ ico( 'rig' ), `With the rod out: a float or a sinker, and aboard a trolled line, a kite, a deep drop. ${ pic( 'leader' ) } ties on one you own` ],
		[ ico( 'wheel' ), `The actions wheel: tap it for these and the rest, your ${ pic( 'cooler' ) } cooler, fish log, records and islander` ] ],
	gamepad: [ [ k( 'X' ), 'Take out the rod (by the water or on the boat)' ], [ k( 'Hold', 'RT' ), 'Wind up, release to cast. Hold longer to cast farther' ],
		[ k( 'RT' ), 'Strike when the bobber is <b>pulled under</b> (dips are only nibbles)' ], [ k( 'Hold', 'RT' ), 'Reel in. <b>Let go when the tension turns red</b>, or the line snaps' ],
		[ k( 'LT' ), 'Reel an empty line back in' ], [ k( `D-pad ${ UP }` ), `The cast net, for mullet and bait. <kbd>D-pad ${ LEFT } ${ RIGHT }</kbd> picks the bait for the hook` ],
		[ k( 'LB' ), 'The rig, with the rod out: a float or a sinker, and aboard a trolled line, a kite, a deep drop. <kbd>Y</kbd> ties on a leader you own' ],
		[ k( 'Back' ), 'Your cooler, fish log, island records and islander' ] ],
};

const AROUND = {
	keyboard: [ [ k( 'W', 'A', 'S', 'D' ), 'Move, mouse to look, <kbd>Shift</kbd> to run' ], [ k( 'E' ), 'Board the boat, take the helm, talk to Joe and Marta' ],
		[ k( 'L' ), 'Flashlight (at night). At the helm, the searchlight' ], [ k( 'H' ), 'This guide again. At the helm, hold for the horn' ],
		[ k( LEFT, RIGHT ), 'At the helm, the radar\'s range' ], [ k( 'R' ), 'At the helm, the radio: the forecast, and Marta\'s tow' ],
		[ k( 'P' ), 'A mark of your own on your chart, where you are' ],
		[ k( 'T' ), 'The clock: hold it or rest until later (with others, once everyone agrees)' ], [ k( 'Q' ), 'The actions wheel: what you can do here, and the key for each' ] ],
	touch: [ [ k( 'Left side' ), 'Drag to walk, from wherever your thumb lands; push out past the ring to run' ], [ k( 'Right side' ), 'Drag to look around' ],
		[ k( 'Gold button' ), 'Board the boat, take the helm, talk to Joe and Marta' ], [ ico( 'wheel' ), 'The actions wheel: tap it, then a picture. Or press it, slide to one and let go' ],
		[ ico( 'torch' ), 'Flashlight, after dusk. At the helm: the searchlight' ],
		[ ico( 'horn' ), 'At the helm, hold it to sound the horn' ], [ ico( 'radio' ), 'At the helm, the forecast, and Marta\'s tow' ], [ k( 'Time' ), 'Tap the time at the top to hold the clock or rest until later' ] ],
	gamepad: [ [ k( 'Left stick' ), 'Move, right stick to look' ], [ k( 'B' ), 'Board the boat, take the helm, talk to Joe and Marta' ], [ k( `D-pad ${ DOWN }` ), 'Flashlight. At the helm, the searchlight' ],
		[ k( `D-pad ${ LEFT } ${ RIGHT }` ), 'At the helm, the radar\'s range' ], [ k( 'X' ), 'At the helm, the radio: the forecast, and Marta\'s tow' ],
		[ k( 'L3' ), 'At the helm, press and hold the left stick for the horn' ], [ k( 'R3' ), 'The clock: hold it or rest until later' ],
		[ k( 'Start' ), 'The actions wheel: the right stick to one, <kbd>A</kbd> to do it' ] ],
};

// (M16) in a kayak: no helm, no radar, no horn, and the seat's own keys (kayak/Seat.js)
const AROUND_KAYAK = {
	keyboard: [ [ k( 'W', 'A', 'S', 'D' ), 'Move, mouse to look, <kbd>Shift</kbd> to run' ], [ k( 'E' ), 'Get in the kayak and out of her, talk to Joe and Marta' ],
		[ k( 'W', 'S' ), 'In her seat, paddle and stop, <kbd>Shift</kbd> harder. <kbd>A</kbd><kbd>D</kbd> turn her' ], [ k( 'R' ), 'In her seat too: the rod' ],
		[ k( 'L' ), 'Flashlight (at night)' ], [ k( 'H' ), 'This guide again, ashore' ], [ k( 'P' ), 'A mark of your own on your chart, where you are' ],
		[ k( 'T' ), 'The clock: hold it or rest until later (with others, once everyone agrees)' ], [ k( 'Q' ), 'The actions wheel: what you can do here, and the key for each' ] ],
	touch: [ [ k( 'Left side' ), 'Drag to walk or paddle, from wherever your thumb lands. Further is harder' ], [ k( 'Right side' ), 'Drag to look around' ],
		[ k( 'Gold button' ), 'Get in the kayak and out of her, talk to Joe and Marta' ], [ ico( 'wheel' ), 'The actions wheel: tap it, then a picture. The rod from her seat, your cooler, the camera' ],
		[ ico( 'torch' ), 'Flashlight, after dusk' ], [ k( 'Time' ), 'Tap the time at the top to hold the clock or rest until later' ] ],
	gamepad: [ [ k( 'Left stick' ), 'Move or paddle, further is harder. Right stick to look' ], [ k( 'B' ), 'Get in the kayak and out of her, talk to Joe and Marta' ], [ k( `D-pad ${ DOWN }` ), 'Flashlight' ],
		[ k( 'R3' ), 'The clock: hold it or rest until later' ], [ k( 'Start' ), 'The actions wheel: the right stick to one, <kbd>A</kbd> to do it' ] ],
};

function cards( device, kayak ) {

	const d = FISHING[ device ] ? device : 'keyboard';
	const rows = ( list ) => `<div class="gm-guide-list">${ list.map( ( [ keys, text ] ) => row( keys, text ) ).join( '' ) }</div>`;
	return [
		kayak ? WELCOME_KAYAK : WELCOME,
		{ eyebrow: 'Fishing', title: 'Cast, strike, reel', body: rows( FISHING[ d ] ) },
		{
			eyebrow: 'Getting around',
			title: kayak ? 'Your kayak, Joe and Marta' : 'Joe and Marta',
			body: `${ rows( ( kayak ? AROUND_KAYAK : AROUND )[ d ] ) }
			<div class="gm-guide-where">
				${ kayak ? '<div class="is-boat"><i></i><span><b>Your kayak</b> · on the sand by the pier</span><em data-where="boat"></em></div>' : '' }
				<div class="is-joe"><i></i><span><b>Joe</b> · fish stand by the pier</span><em data-where="joe"></em></div>
				<div class="is-marta"><i></i><span><b>Marta</b> · chandlery by the boathouse</span><em data-where="marta"></em></div>
			</div>
			<p style="margin:0;color:var(--tw-ink-3);font-size:var(--tw-fs-sm)">${ kayak ? 'All three are' : 'Both are' } marked on the map ${ document.documentElement.classList.contains( 'is-touch' ) ? 'at the top right' : 'in the lower right' }.</p>`,
		},
	];

}

const CARD_COUNT = 3;

// (M16) a tip that isn't the same in a kayak (no helm, no fuel, no bilge), or is hers alone; by the device where it's a key
const IN_KAYAK = {
	keyboard: {
		kayak: 'Your <b>kayak</b>. <kbd>E</kbd> to shove her off and sit in her. <kbd>W</kbd> paddles, <kbd>Shift</kbd> harder, <kbd>A</kbd><kbd>D</kbd> turn her, <kbd>S</kbd> stops her. <kbd>R</kbd> in the seat takes out the rod.',
		caught: 'Into the cooler (<kbd>I</kbd>). Her cooler\'s small, so sell to <b>Joe</b> at the fish stand by the pier: he is on the map. Run her up on the sand and step out with <kbd>E</kbd>.',
	},
	touch: {
		kayak: `Your <b>kayak</b>. The gold button shoves her off and sits you in her. Drag on the left to paddle, further for harder, and the ${ pic( 'rod', 'rod' ) } in ${ WHEEL } fishes from the seat.`,
		caught: `Into the cooler (${ pic( 'cooler' ) } in ${ WHEEL }). Her cooler's small, so sell to <b>Joe</b> at the fish stand by the pier: he is on the map. Run her up on the sand and step out with the gold button.`,
	},
	gamepad: {
		kayak: 'Your <b>kayak</b>. <kbd>B</kbd> to shove her off and sit in her. The left stick paddles, further for harder. <kbd>X</kbd> in the seat takes out the rod.',
		caught: 'Into the cooler (<kbd>Back</kbd>). Her cooler\'s small, so sell to <b>Joe</b> at the fish stand by the pier: he is on the map. Run her up on the sand and step out with <kbd>B</kbd>.',
	},
	full: 'Your cooler is <b>full</b>. Sell to Joe, and Marta sells a <b>crate cooler</b> that holds twice as much.',
	stand: 'A kayak\'s <b>low to the water</b>. A breeze she can take, but past 3 ft of sea or 20 knots of wind she goes over. Paddle for the lee of the island or the nearest beach. If she does go, swim to her: <b>the same key that gets you in rights her</b>, then climbs you back on.',
	camp: '<b>Pearl\'s fish camp</b>: she buys your catch at ' + Math.round( CAMP.rate * 100 ) + '% of Joe\'s price (she takes it round to market herself). Run the kayak up on her beach.',
	chart: 'Your <b>chart</b> fills in where you go: the coast as you see it, the depths as you paddle over them, each place\'s name as you come to it, on the map. It has them by their names on a chart: ' + namedAs( NAME.bank ) + ', and so on. Mark a good spot from the cooler\'s <b>Chart</b> tab. Marta sells a chart of the island, if you\'d rather not.',
	edge: 'You\'re past the far grounds, in a <b>kayak</b>. The sea\'s the open ocean\'s out here, the wind fresher and the seas bigger, and it\'s a long paddle home.',
	goRound: 'You\'ve the hang of the bay. There\'s more of the island: the <b>north beach\'s surf</b> for pompano (best on a surf day: Joe\'s slate says) and the <b>mangrove creek</b> on the west for snook and redfish at dawn and dusk. Paddle round on a calm day, or walk: the trail from the square goes round the east to the north beach, the red dashes on your map, with fingerposts at its turns, and <b>Pearl\'s fish camp</b> there buys fish.',
	hurricane: 'A <b>hurricane</b> is coming. <b>Sell your catch</b> before Joe boards up: it won\'t keep till he opens again. Get your kayak off the beach: Marta can <b>haul her up</b> into her yard before she boards up. In it, the <b>shelter</b> (on your map) keeps you safe from the wind, the rain and the sea. You can always step out to watch.',
};

// (M16) what's sold where the boat you're in burns something: her fuel's own word; and what Marta's list says, from what's on it
const fuelWord = ( s ) => fuelOf( s.boat ).name.toLowerCase();
const toBoatRoom = ( s ) => ( fuelOf( s.boat ) ? `upgrades and ${ fuelWord( s ) }` : 'gear, and boats when you\'ve saved for one' );

const TIPS = {
	keyboard: {
		radio: 'The <b>radio</b> at the helm (<kbd>R</kbd>): the <b>weather</b> for these waters, read out on WX1 while you steer, and <b>Marta</b> on channel 16, who\'ll come and tow you in if you run dry, her fee by the distance.',
		rodOut: 'Hold the <b>left mouse button</b> to wind up and release to cast. Try deeper water, around the pier or over the reef.',
		nibble: 'The bobber is dipping: something is <b>nibbling</b>. Wait until it is <b>pulled under</b>, then click to strike.',
		fishOn: '<b>Hold the left mouse button</b> to reel. When the tension needle nears the <b>red</b>, let go until it settles, then reel again.',
		caught: 'Into the cooler (<kbd>I</kbd>). Sell your catch to <b>Joe</b> at the fish stand by the pier: he is on the map.',
		boat: ( s ) => `Your boat. <kbd>E</kbd> to board, <kbd>E</kbd> again at the wheel to drive (<kbd>W</kbd><kbd>S</kbd> throttle, <kbd>A</kbd><kbd>D</kbd> steer). ${ fuelOf( s.boat ).name } is sold by Marta.`,
		joe: '<b>Joe</b> buys your fish. <kbd>E</kbd> to see what he will pay.',
		marta: ( s ) => `<b>Marta</b> sells ${ toBoatRoom( s ) }. <kbd>E</kbd> to see her stock.`,
		chart: 'Your <b>chart</b> fills in where you go: the coast as you see it, the depths as you run over them, each place\'s name as you come to it, on the map and the boat\'s plotter. It has them by their names on a chart: ' + namedAs( NAME.bank ) + ', and so on. <kbd>P</kbd> marks a good spot (<kbd>I</kbd>, Chart, lists them). Marta sells a chart of the island, if you\'d rather not.',
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
		radio: `The <b>radio</b> at the helm (${ pic( 'radio' ) } in ${ WHEEL }): the <b>weather</b> for these waters, read out on WX1 while you steer, and <b>Marta</b> on channel 16, who'll come and tow you in if you run dry, her fee by the distance.`,
		rodOut: `Hold ${ pic( 'cast', 'Cast' ) } to wind up and let go to cast. Try deeper water, around the pier or over the reef.`,
		nibble: 'The bobber is dipping: something is <b>nibbling</b>. Wait until it is <b>pulled under</b>, then tap <b>Strike</b>.',
		fishOn: '<b>Hold Reel</b> to reel in. When the tension needle nears the <b>red</b>, let go until it settles, then reel again.',
		caught: `Into the cooler (${ pic( 'cooler' ) } in ${ WHEEL }). Sell your catch to <b>Joe</b> at the fish stand by the pier: he is on the map.`,
		boat: ( s ) => `Your boat. Tap <b>Board boat</b>, then <b>Take the helm</b> at the wheel and drive with the left side. ${ fuelOf( s.boat ).name } is sold by Marta.`,
		joe: '<b>Joe</b> buys your fish. Tap <b>Talk to Joe</b> to see what he will pay.',
		marta: ( s ) => `<b>Marta</b> sells ${ toBoatRoom( s ) }. Tap <b>Talk to Marta</b> to see her stock.`,
		gunOut: 'Tap <b>Dive</b> and <b>fin slowly</b> up to a fish: rush it and it bolts. Put it in the sights and tap <b>Shoot</b>. They tell you what it is, and whether you may take it.',
		gunLoad: '<b>Hold Load</b> to draw the band back to its notch on the shaft.',
		spearFight: 'A big one. <b>Hold Pull</b> to pull it in, let go when it runs, until it tires.',
		breath: `Your <b>breath</b> is running out (the gauge by your money). Swim up (${ pic( 'swimup' ) }) before you black out.`,
		netOut: 'Look at the water where you want it and <b>hold Throw</b> to swing it back. Let go <b>as the ring brightens</b> and it spins fully open. Mullet and bait fish school in the shallows, by the pier and round the boat.',
		netSink: 'Let it <b>sink</b>: the lead line traps what\'s under it as it reaches the bottom. Then <b>hold Close</b> to draw it shut and haul it in.',
		bait: `Live bait goes in your <b>bucket</b>. With the rod out, ${ pic( 'bait' ) } in ${ WHEEL } puts it on the hook: bigger fish take it, and sooner. A mullet can be cut up for bait in the cooler (${ pic( 'cooler' ) }).`,
		bilge: 'There\'s <b>water in the bilge</b> (the gauge by your money). On deck, <b>hold Bail</b> to bail it out before it reaches the engine. Marta sells a <b>bilge pump</b>.',
	},
	gamepad: {
		radio: 'The <b>radio</b> at the helm (<kbd>X</kbd>): the <b>weather</b> for these waters, read out on WX1 while you steer, and <b>Marta</b> on channel 16, who\'ll come and tow you in if you run dry, her fee by the distance.',
		rodOut: 'Hold <kbd>RT</kbd> to wind up and release to cast. Try deeper water, around the pier or over the reef.',
		nibble: 'The bobber is dipping: something is <b>nibbling</b>. Wait until it is <b>pulled under</b>, then <kbd>RT</kbd> to strike.',
		fishOn: '<b>Hold <kbd>RT</kbd></b> to reel. When the tension needle nears the <b>red</b>, let go until it settles, then reel again.',
		caught: 'Into the cooler (<kbd>Back</kbd>). Sell your catch to <b>Joe</b> at the fish stand by the pier: he is on the map.',
		boat: ( s ) => `Your boat. <kbd>B</kbd> to board, <kbd>B</kbd> again at the wheel to drive with the left stick. ${ fuelOf( s.boat ).name } is sold by Marta.`,
		joe: '<b>Joe</b> buys your fish. <kbd>B</kbd> to see what he will pay.',
		marta: ( s ) => `<b>Marta</b> sells ${ toBoatRoom( s ) }. <kbd>B</kbd> to see her stock.`,
		gunOut: 'Dive (look down and swim) and <b>fin slowly</b> up to a fish: rush it and it bolts. Put it in the sights and <kbd>RT</kbd>. They tell you what it is, and whether you may take it.',
		gunLoad: '<b>Hold <kbd>RT</kbd></b> to draw the band back to its notch on the shaft.',
		spearFight: 'A big one. <b>Hold <kbd>RT</kbd></b> to pull it in, let go when it runs, until it tires.',
		breath: 'Your <b>breath</b> is running out (the gauge by your money). Swim up (<kbd>A</kbd>) before you black out.',
		netOut: 'Look at the water where you want it and <b>hold <kbd>RT</kbd></b> to swing it back. Let go <b>as the ring brightens</b> and it spins fully open. Mullet and bait fish school in the shallows, by the pier and round the boat.',
		netSink: 'Let it <b>sink</b>: the lead line traps what\'s under it as it reaches the bottom. Then <b>hold <kbd>RT</kbd></b> to draw it closed and haul it in.',
		bait: `Live bait goes in your <b>bucket</b>. With the rod out, <kbd>D-pad ${ LEFT } ${ RIGHT }</kbd> puts it on the hook: bigger fish take it, and sooner. A mullet can be cut up for bait in the cooler (<kbd>Back</kbd>).`,
		bilge: 'There\'s <b>water in the bilge</b> (the gauge by your money). On deck, <b>hold <kbd>B</kbd></b> to bail it out before it reaches the engine. Marta sells a <b>bilge pump</b>.',
	},
	// (M16) when the intro's gone, in the kayak; and Marta's list, as it comes up
	shoveOff: 'Your <b>kayak\'s on the sand</b> at the foot of the boardwalk, by the pier, and her marker\'s on your map. Or take out the rod and try the beach or the pier first.',
	list: () => `There's more on Marta's list than gear: her <b>Boats</b> tab. A <b>center console</b> at $${ FLEET.console.price.toLocaleString() }, your first engine, reaches the reef and the wrecks. Under her is a shape with no picture, a <b>sportfisher</b>. She won't sell you that one until your gear's right.`,
	tankLeft: 'Your <b>scuba tank</b> is one dive\'s air: what\'s left is all you have until you fill it at the <b>dock</b> or at <b>Marta\'s</b>. A <b>tank rack</b> on the center console gives you a fresh one each time you\'re back aboard.',
	consoleReady: () => `You've the $${ FLEET.console.price.toLocaleString() } for the <b>center console</b>: Marta's <b>Boats</b> tab. An engine and fuel to think about, and the reef, the wrecks and the near offshore water to go with them. The kayak stays yours.`,
	engine: ( s ) => `Your first <b>engine</b>. She burns <b>${ fuelWord( s ) }</b> (the gauge by your money: Marta sells it) and the wind'll take her if you leave her without an anchor. Marta tows her in, for a fee. <b>Keep an eye on the sky</b>: a blow sends you running in.`,
	sportfisher: ( s ) => `That silhouette on Marta's list: the <b>offshore sportfisher</b>, for the far grounds and the blue water. She'll show her when you've every upgrade on the lobster boat, and your rod, reel and line. You're <b>${ s.unlock.done } of ${ s.unlock.of }</b>.`,
	earned: () => `You've earned her. Marta's <b>Boats</b> tab shows the <b>offshore sportfisher</b> now, $${ FLEET.sportfisher.price.toLocaleString() }: twin diesels, bunks and the bluewater fish, days at a time.`,
	// (and to those who were playing before all this: their old boat, and what's new)
	fleetNews: () => `Marta's got more for you. The <b>kayak</b> on the sand by the pier is yours, for the flats, and her <b>Boats</b> tab lists a <b>center console</b> at $${ FLEET.console.price.toLocaleString() } and a shape with no picture: a <b>sportfisher</b>, once your gear's right.`,
	full: 'Your cooler is <b>full</b>. Sell to Joe, or buy a bigger hold from Marta at the chandlery.',
	worn: 'Your boat\'s <b>hull is worn</b> (the gauge by your money): she\'s slower, and she leaks. Marta <b>repairs</b> it at the chandlery, with the boat at her dock.',
	// (M12) the surf
	rip: 'You\'re in a <b>rip current</b>, carried out through a gap in the breakers (the milky water). Swim <b>along the beach</b> out of it, not against it.',
	tumble: 'A <b>breaker</b> tumbled you. In a big surf, <b>dive under</b> a big one before it breaks on you, or keep out beyond the breakers.',
	knocked: 'A <b>breaker</b> knocked you off your feet. Wading in a big surf, <b>turn side-on</b> to the waves as they break, or keep to the shallows.',
	// (M15) once you've the hang of the bay, the rest of the island; and out on the far water, what to look for
	goRound: 'You\'ve the hang of the bay. There\'s more of the island: the <b>north beach\'s surf</b> for pompano (best on a surf day: Joe\'s slate says), the <b>mangrove creek</b> on the west for snook at dawn and dusk, and the <b>windward reef</b> off the north-west point, its groupers bigger than the bay\'s. Take the boat round, or walk: the trail from the square goes round the east to the north beach, the red dashes on your map, with fingerposts at its turns, and <b>Pearl\'s fish camp</b> there buys fish and sells diesel.',
	camp: '<b>Pearl\'s fish camp</b>: she buys your catch at ' + Math.round( CAMP.rate * 100 ) + '% of Joe\'s price (she takes it round to market herself) and sells <b>diesel</b> from her drums, so a trip round the island needn\'t end in the bay. Tie up at her jetty.',
	chart: 'Your <b>chart</b> fills in where you go: the coast as you see it, the depths as you run over them, each place\'s name as you come to it, on the map and the boat\'s plotter. It has them by their names on a chart: ' + namedAs( NAME.bank ) + ', and so on. Mark a good spot from the cooler\'s <b>Chart</b> tab. Marta sells a chart of the island, if you\'d rather not.',
	edge: 'You\'re past the far grounds. The sea\'s the open ocean\'s out here: the <b>wind fresher</b>, the <b>seas bigger</b>, fewer birds and fewer fish. Nothing stops you going on, but <b>watch your fuel</b>: Marta\'s tow is by the distance.',
	stand: 'Every boat has <b>what she can stand</b>. Past it she ships water and takes a beating: the <b>radio</b> says how the sea is for her, and the lee of the island is calmer. Run for shelter, or for port.',
	ice: 'Fish goes off in the heat: about <b>12 hours</b> in a box with no ice, its price falling after 6. Marta sells <b>ice by the bag</b>, and on ice it keeps for days as long as the ice lasts.',
	bunk: 'She has <b>bunks</b>. Sleep aboard to pass the night, and bring <b>food and water</b> from Marta for days out. Anchor first, or stream a <b>drift sock</b>: she goes where the wind takes her while you sleep.',
	farWater: 'Out here the fish are <b>under things</b>: look for <b>weedlines</b> (mahi), <b>floating debris</b>, and <b>birds working bait</b> (tuna). On the <b>drop-off</b> the tuna come at first light.',
	// (M13) a hurricane
	hurricane: 'A <b>hurricane</b> is coming. <b>Sell your catch</b> before Joe boards up: he\'s shut a day or two, longer than fish keeps without plenty of ice. Ahead of it Marta can <b>haul your boat out</b>, before she boards up; left in the water the storm batters her. In it, the <b>shelter</b> (on your map) keeps you safe from the wind, the rain and the sea. You can always step out to watch.',
};

// the words for a tip, for the input in use and the boat you're in (a function: from the state, as it is then)
export function tipFor( id, device, state ) {

	const K = state.stats.fuelL > 0 ? {} : IN_KAYAK, t = ( K[ device ] || K.keyboard || {} )[ id ] || K[ id ] || ( TIPS[ device ] || TIPS.keyboard )[ id ] || TIPS[ id ];
	return typeof t === 'function' ? t( state ) : t;

}

const h = ( tag, cls, html ) => {

	const e = document.createElement( tag );
	if ( cls ) e.className = cls;
	if ( html !== undefined ) e.innerHTML = html;
	return e;

};

const logged0 = ( s ) => {

	let n = 0;
	for ( const k in s.log ) n += s.log[ k ].count | 0;
	return n;

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

		this.coach = h( 'div', 'gm-coach tw-glass', `<span class="gm-coach-x" aria-hidden="true">${ iconSvg( 'close' ) }</span><span class="gm-coach-eyebrow">Tip</span><span class="gm-coach-text"></span>` );
		this.coachText = this.coach.lastChild;
		( ui.hud || ui.root ).append( this.coach );
		// a tap or a click on the tip puts it away (and the next waits a moment, so it isn't taken for the same one)
		this.coach.addEventListener( 'pointerdown', ( e ) => {

			if ( ! this._current ) return;
			e.preventDefault();
			e.stopPropagation();
			this._hideCoach();
			this._gap = 1.5;

		} );
		this._gap = 0;
		// (where the tip ends: on a touch screen a toast or the first hint goes under it, style.css)
		this._markCoach = () => document.documentElement.style.setProperty( '--gm-coach-b', `${ Math.ceil( this.coach.offsetTop + this.coach.offsetHeight ) }px` );
		if ( typeof ResizeObserver !== 'undefined' ) new ResizeObserver( this._markCoach ).observe( this.coach );

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

	// (M16) the boat you're in has no engine: what's said is hers
	get _kayak() {

		return ! fuelOf( this.game.state.boat );

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
		const c = cards( this.device, this._kayak )[ i ];
		this.eyebrow.textContent = c.eyebrow;
		this.title.textContent = c.title;
		this.body.innerHTML = c.body;
		this.dots.forEach( ( d, j ) => d.classList.toggle( 'is-on', j === i ) );
		this.nextBtn.textContent = i === CARD_COUNT - 1 ? 'Let\'s fish' : 'Next';
		if ( this.minimap ) this.minimap.highlight( i === CARD_COUNT - 1 ? ( this._kayak ? [ 'boat', 'joe', 'marta' ] : [ 'joe', 'marta' ] ) : [] );
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
		const b = this.game.app.boatCtl;
		if ( this._kayak && this.game.app.player.mode === 'walk' && Math.hypot( b.position.x - b.berth.position.x, b.position.z - b.berth.position.z ) < 30 ) this.tip( 'shoveOff' );

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
				const b = g.app.boatCtl;
				for ( const [ id, t ] of [ [ 'boat', b ? { x: b.position.x, z: b.position.z } : STAND ], [ 'joe', STAND ], [ 'marta', CHANDLERY ] ] ) {

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

			// ((v2.1.6) not for one let go off its card after all: the next one kept has it)
			if ( this._afterCard !== 'caught' || ( lc && lc.kept ) ) this.tip( this._afterCard );
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
		// ((M14) and the first time one knocks you off your feet, wading)
		if ( prev.knocks !== undefined && p.knocks > prev.knocks ) this.tip( 'knocked' );
		prev.knocks = p.knocks;
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
		// ((M16) what you could have next: Marta's list as your money and your gear come on. Those who started before it get it all at once)
		// (a lobster boat with no price paid came with the game: someone who was playing before there was a list)
		const mine = s.owns( 'console' ) || s.owns( 'lobster' ) || s.owns( 'sportfisher' ), kept = s.owns( 'lobster' ) && ! s.fleet.lobster.paid;
		if ( kept && ! s.owns( 'console' ) && this.seen.intro ) this.tip( 'fleetNews' );
		if ( ! mine && logged0( s ) >= 5 && p.mode === 'walk' ) this.tip( 'list' );
		if ( ! mine && s.money >= FLEET.console.price ) this.tip( 'consoleReady' );
		if ( s.stats.fuelL > 0 && ! kept && ( p.mode === 'deck' || p.mode === 'boat' ) && ! p.riding ) this.tip( 'engine' );
		if ( s.owns( 'lobster' ) && ! s.unlocked( 'sportfisher' ) && s.unlock.done >= 4 ) this.tip( 'sportfisher' );
		if ( s.unlocked( 'sportfisher' ) && ! s.owns( 'sportfisher' ) ) this.tip( 'earned' );
		// ((M15) the hang of the bay: a dozen fish in your log; the far water: 3 km out from the island's middle)
		if ( logged0( s ) >= 12 ) this.tip( 'goRound' );
		const cam = app.camera.position;
		if ( Math.hypot( cam.x, cam.z + 320 ) > 3000 ) this.tip( 'farWater' );
		// ((M15) the first name you come to past the bay's)
		if ( s.chart.names.size > NAMES.filter( ( n ) => n.known ).length ) this.tip( 'chart' );
		// ((M15) the radio, the first time you're well out at the helm; and past the far grounds, the soft edge)
		// ((M16) on a boat with a set to hear it on, and at a helm: R is a kayak's rod)
		if ( p.mode === 'boat' && ! p.riding && s.stats.vhfM > 0 && ! app.boatCtl.model.seated && Math.hypot( cam.x, cam.z + 320 ) > 2000 ) this.tip( 'radio' );
		if ( edgeAt( cam.x, cam.z ) > 0.15 ) this.tip( 'edge' );
		// ((M16) days out: the sea more than she likes; the catch going soft; bunks to sleep in)
		if ( g.daysOut.aboard && g.daysOut.strain >= 0.6 ) this.tip( 'stand' );
		if ( s.inventory.some( ( f ) => f.w > 3 ) ) this.tip( 'ice' );
		if ( g.daysOut.aboard && app.boatCtl.model.bunks.length ) this.tip( 'bunk' );
		// ((M15) the first time you come to the fish camp, ashore or alongside its jetty)
		if ( Math.hypot( cam.x - CAMP.keeper.x, cam.z - CAMP.keeper.z ) < 30 ) this.tip( 'camp' );
		// (M10) the boat's hull: the first water in the bilge, aboard; the first real wear
		const hull = g.hull;
		if ( hull && hull.bilge >= 20 && ( p.mode === 'deck' || p.mode === 'boat' ) && ! p.riding ) this.tip( 'bilge' );
		if ( hull && hull.wear >= 0.1 && hull.figures.engine ) this.tip( 'worn' ); // ((M16) a kayak's plastic doesn't leak, nor slow)
		if ( p.mode === 'walk' ) {

			const bt = app.boatCtl;
			if ( bt && Math.hypot( bt.position.x - p.position.x, bt.position.z - p.position.z ) < 9 ) this.tip( bt.model.seated ? 'kayak' : 'boat' );
			for ( const v of g.vendors ) if ( v.inRange( p.position ) ) this.tip( v.kind === 'buyer' ? 'joe' : 'marta' );

		}

		prev.equipped = rod.equipped;
		prev.fight = !! g.fight;
		prev.lastCatch = lc;

		// the coach card: one tip at a time, ~7 s each (not over the catch card or a panel)
		const busy = g.hud && ( g.hud.catchOpen || g.hud.invOpen || g.hud.standOpen );
		if ( this._gap > 0 ) this._gap -= dt;
		if ( this._current ) {

			this._coachT -= dt;
			if ( this._coachT <= 0 || busy ) this._hideCoach();

		} else if ( this._queue.length && ! busy && this._gap <= 0 ) {

			const id = this._queue.shift();
			this._current = id;
			this.seen[ id ] = true;
			this._save();
			this.coachText.innerHTML = tipFor( id, this.device, this.game.state );
			this.coach.classList.add( 'is-on' );
			this._markCoach();
			this._coachT = Math.max( 7.5, this.coachText.textContent.length / 22 ); // ((M15) longer to read a longer one)

		}

	}

}
