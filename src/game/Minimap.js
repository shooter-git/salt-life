import { WORLD } from '../world/WorldLayout.js';
import { STAND } from './FishStand.js';
import { CHANDLERY } from './Chandlery.js';
import { SHELTER } from '../world/village/StormPlaces.js';
import { CAMP } from './FishCamp.js';
import { HARBOUR_LIGHTS } from '../world/HarbourLights.js';
import { LIGHTHOUSE } from '../world/Lighthouse.js';
import { toWorld } from '../world/wreck/WreckPlan.js';
import { SHEETS, NAMES, HOME, legTo, magnetic, fuelFor } from './Chart.js';
import { SheetBake, drawSymbols, S52, rgb } from './ChartBake.js';

// Minimap, lower right: the island baked once from the terrain data into a 2D canvas, shown in a round window
// that turns with the view (forward is up, a small N on the rim). Markers: the player (centre arrow), Joe's fish
// stand, Marta's chandlery, (M15) Pearl's fish camp, and the boat; markers beyond the rim sit on it with an
// arrow. With the fish finder upgrade, a couple of soft rings mark the richest water in view.
// (M15) It's your chart (Chart.js, ChartBake.js), drawn as an electronic chart is (S-52's colours; it was a
// painting of the island from the air), on three sheets: the island's, its waters' and the far grounds' (the
// offshore seabed, 32 km), each S-52's grey for no chart where you haven't been, drawn in as you go; the names
// you've come to, upright over it, your own marks and a fish where you first had one at each place. It zooms out
// at sea as you go further from the island, out to the far grounds, and says how far home is and whether the
// fuel will get you there. The plotter on the boat's dash draws the same sheets (`sheets`, `soundings`).
//
// Per frame it only writes a few CSS transforms. The bakes run in row chunks over the first frames; the sheets
// as you've charted them are drawn again when the chart changes (a second apart at most).
//   const map = new Minimap( hudEl, game, { tier } );  map.update( dt );  map.highlight( [ 'joe', 'marta' ] )

const ROWS_PER_FRAME = 32;
// (M15) the island's sheet (px: 2 m a pixel; 3 on the low tier), its rows a frame
const NEAR_N = { low: 768, mid: 1152, high: 1152 };
// (M15) the island's waters' sheet and the far grounds' (px; half on the low tier), their rows a frame
const OUT_N = { low: 512, mid: 1024, high: 1024 };
const FAR_ROWS = 64;
// (M15) how far out it shows (m): on foot, near the island at sea, and growing as you go further from it (a metre
// more for each past ISLE.r of its middle), to the far grounds
const VIEW = { foot: 110, sea: 240, per: 1.1, max: 16000 };
const ISLE = { x: 0, z: - 310, r: 750 };
// (M15) the names shown at a view's radius (m): the island's small ones, the island's, the far grounds'
const NAMES_AT = { small: 420, island: 2600, far: 700 };

const CSS = /* css */`
.gm-map { position: absolute; right: var(--tw-edge); bottom: var(--tw-edge); width: calc(184 * var(--tw-u)); height: calc(184 * var(--tw-u));
	border-radius: 50%; padding: calc(5 * var(--tw-u)); pointer-events: none;
	transition: right var(--tw-slow) var(--tw-ease), opacity var(--tw-med) var(--tw-ease); }
.tw-root[data-panel='open'] .gm-map { right: calc(var(--tw-panel-w) + 2 * var(--tw-3)); }
.gm-map-view { position: relative; width: 100%; height: 100%; border-radius: 50%; overflow: hidden; background: #0b2c48;
	box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 0 18px rgba(0,0,0,0.45); }
.gm-map-view canvas { position: absolute; left: 0; top: 0; transform-origin: 0 0; image-rendering: auto; }
.gm-map-view { background: rgb(${ S52.NODTA.join( ',' ) }); }
.gm-map-vig { position: absolute; inset: 0; border-radius: 50%; pointer-events: none;
	background: radial-gradient(circle at 50% 50%, transparent 58%, rgba(4, 12, 20, 0.45) 100%); }
.gm-map-marks { position: absolute; inset: 0; }
.gm-mk { position: absolute; left: 0; top: 0; width: 0; height: 0; }
.gm-mk > i { position: absolute; left: 0; top: 0; display: grid; place-items: center; width: calc(20 * var(--tw-u)); height: calc(20 * var(--tw-u));
	margin: calc(-10 * var(--tw-u)) 0 0 calc(-10 * var(--tw-u)); border-radius: 50%; font: 700 calc(10 * var(--tw-u)) var(--tw-font); font-style: normal;
	color: #0b1418; box-shadow: 0 1px 3px rgba(0,0,0,0.55), 0 0 0 1.5px rgba(255,255,255,0.85); }
.gm-mk > i svg { width: 64%; height: 64%; }
.gm-mk.is-joe > i { background: var(--tw-sun); }
.gm-mk.is-marta > i { background: var(--tw-aqua); }
.gm-mk.is-shut > i { filter: saturate(0.25) brightness(0.75); }
.gm-mk.is-boat > i { background: #f2efe6; }
.gm-mk.is-shelter > i { background: #2f6fb0; color: #fff; }
.gm-mk.is-camp > i { background: #d9825a; }
.gm-mk.is-player > i { width: calc(16 * var(--tw-u)); height: calc(16 * var(--tw-u)); margin: calc(-8 * var(--tw-u)) 0 0 calc(-8 * var(--tw-u)); color: #fff;
	text-shadow: 0 1px 1px rgba(0,0,0,0.6); }
.gm-mk > b { position: absolute; left: 0; top: 0; width: 0; height: 0; border-left: calc(5 * var(--tw-u)) solid transparent; border-right: calc(5 * var(--tw-u)) solid transparent;
	border-bottom: calc(7 * var(--tw-u)) solid rgba(255,255,255,0.9); margin: calc(-19 * var(--tw-u)) 0 0 calc(-5 * var(--tw-u)); transform-origin: calc(5 * var(--tw-u)) calc(19 * var(--tw-u)); display: none; }
.gm-mk.is-edge > b { display: block; }
.gm-mk.is-edge > i { transform: scale(0.82); }
.gm-mk.is-hot > i { animation: gm-map-pulse 1.3s var(--tw-ease-io) infinite; }
@keyframes gm-map-pulse { 0%, 100% { box-shadow: 0 1px 3px rgba(0,0,0,0.55), 0 0 0 1.5px rgba(255,255,255,0.85), 0 0 0 0 rgba(255,255,255,0.6); }
	60% { box-shadow: 0 1px 3px rgba(0,0,0,0.55), 0 0 0 1.5px rgba(255,255,255,0.85), 0 0 0 calc(10 * var(--tw-u)) rgba(255,255,255,0); } }
.gm-map-me { position: absolute; left: 50%; top: 50%; width: 0; height: 0; }
.gm-map-me svg { position: absolute; width: calc(18 * var(--tw-u)); height: calc(18 * var(--tw-u)); left: calc(-9 * var(--tw-u)); top: calc(-10 * var(--tw-u));
	filter: drop-shadow(0 1px 2px rgba(0,0,0,0.6)); }
.gm-map-n { position: absolute; left: 0; top: 0; width: calc(14 * var(--tw-u)); height: calc(14 * var(--tw-u)); margin: calc(-7 * var(--tw-u)) 0 0 calc(-7 * var(--tw-u));
	border-radius: 50%; display: grid; place-items: center; font: 700 calc(9 * var(--tw-u)) var(--tw-font); color: #0b1418; background: rgba(255,255,255,0.9);
	box-shadow: 0 1px 2px rgba(0,0,0,0.5); }
.gm-map-fish { position: absolute; left: 0; top: 0; width: 0; height: 0; opacity: 0; transition: opacity 600ms var(--tw-ease); }
.gm-map-fish.is-on { opacity: 0.9; }
.gm-map-fish > i { position: absolute; left: calc(-12 * var(--tw-u)); top: calc(-12 * var(--tw-u)); width: calc(24 * var(--tw-u)); height: calc(24 * var(--tw-u));
	border-radius: 50%; border: 1.5px solid rgba(var(--tw-aqua-rgb), 0.9); animation: gm-map-ring 2.2s var(--tw-ease-io) infinite; }
.gm-map-fish > i + i { animation-delay: -1.1s; }
@keyframes gm-map-ring { 0% { transform: scale(0.45); } 100% { transform: scale(1.15); border-color: rgba(var(--tw-aqua-rgb), 0); } }
.gm-map-label { position: absolute; left: 50%; bottom: calc(-2 * var(--tw-u)); transform: translate(-50%, 100%); padding-top: calc(4 * var(--tw-u));
	font: 500 var(--tw-fs-xs) var(--tw-mono); color: var(--tw-ink-3); white-space: nowrap; text-shadow: 0 1px 2px rgba(0,0,0,0.7); display: none; }
.gm-map-label.is-on { display: block; }
/* ((M15) over the map, not under it: it sits at the screen's foot) */
.gm-map-label.is-home { top: calc(-2 * var(--tw-u)); bottom: auto; transform: translate(-50%, -100%); padding: 0 0 calc(4 * var(--tw-u)); }
/* (on a touch screen the map's under the purse, the tips under it: to its left) */
html.is-touch .gm-map-label.is-home { left: auto; right: calc(100% + 6 * var(--tw-u)); top: 50%; transform: translateY(-50%); padding: 0; }
.gm-map-label b { font-weight: 600; color: var(--tw-ink-2); }
.gm-map-label i { font-style: normal; }
.gm-map-label i.is-ok { color: #8fdc8a; } .gm-map-label i.is-tight { color: #f2c14e; } .gm-map-label i.is-short { color: #ff7a6a; }
/* (M15) the chart's names: upright over it, black with a pale halo as on a chart; the water's in italics */
.gm-map-name { position: absolute; left: 0; top: 0; width: 0; height: 0; display: none; }
.gm-map-name.is-on { display: block; }
.gm-map-name > span { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); white-space: nowrap; text-align: center;
	font: 600 calc(9.5 * var(--tw-u)) var(--tw-font); line-height: 1.05; letter-spacing: 0.01em; color: #101416;
	text-shadow: 0 0 2px rgba(255,255,255,0.95), 0 0 3px rgba(255,255,255,0.8); }
.gm-map-name.is-water > span { font-style: italic; font-weight: 500; }
.gm-map-name.is-small > span { font-size: calc(8 * var(--tw-u)); }
.gm-map-name.is-peak > span::before { content: '▲ '; font-size: 0.8em; }
.gm-map-name small { display: block; font: 600 calc(7.5 * var(--tw-u)) var(--tw-font); font-style: normal; color: rgb(197,69,195); }
.gm-map-name.is-fished > span::after { content: ' ⟡'; color: #1d5b8f; }
.gm-mk.is-mark > i { width: calc(12 * var(--tw-u)); height: calc(12 * var(--tw-u)); margin: calc(-6 * var(--tw-u)) 0 0 calc(-6 * var(--tw-u)); border-radius: 2px;
	transform: rotate(45deg); background: #d6303a; box-shadow: 0 0 0 1.5px #fff, 0 1px 3px rgba(0,0,0,0.5); }
.gm-mk.is-mark > i > em { transform: rotate(-45deg); font: 700 calc(7 * var(--tw-u)) var(--tw-font); font-style: normal; color: #fff; }
.gm-mk.is-fishplace > i { width: calc(13 * var(--tw-u)); height: calc(13 * var(--tw-u)); margin: calc(-6.5 * var(--tw-u)) 0 0 calc(-6.5 * var(--tw-u));
	background: #1d5b8f; color: #fff; box-shadow: 0 0 0 1.2px #fff, 0 1px 2px rgba(0,0,0,0.5); }
@media (max-width: 640px) { .gm-map { width: calc(128 * var(--tw-u)); height: calc(128 * var(--tw-u)); } .gm-map-name.is-small { display: none; } }
@media (prefers-reduced-motion: reduce) { .gm-mk.is-hot > i, .gm-map-fish > i { animation: none; } }
`;

const ICON = {
	fish: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 12c3-4 7-6 11-6 3 0 5 2 7 4l-2 2 2 2c-2 2-4 4-7 4-4 0-8-2-11-6Zm12-1.2a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"/></svg>',
	anchor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="5" r="2"/><path d="M12 7v13M7 11h10M4 14c1 4 4 6 8 6s7-2 8-6"/></svg>',
	boat: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v9H6l6-9Zm1 2 5 7h-5V5ZM3 14h18l-3 5H6l-3-5Z"/></svg>',
	// (M13) the shelter: a house under a roof
	shelter: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 1.5 10.5h3V21h15V10.5h3L12 2Zm-2.2 11.5h4.4V21H9.8v-7.5Z"/></svg>',
};

const h = ( tag, cls, html ) => {

	const e = document.createElement( tag );
	if ( cls ) e.className = cls;
	if ( html !== undefined ) e.innerHTML = html;
	return e;

};

export class Minimap {

	constructor( parent, game, { tier = 'high' } = {} ) {

		this.game = game;
		const style = h( 'style' );
		style.textContent = CSS;
		document.head.append( style );

		const outN = OUT_N[ tier ] || OUT_N.high;
		const nearN = NEAR_N[ tier ] || NEAR_N.high;
		this.el = h( 'div', 'gm-map tw-glass', `<div class="gm-map-view"><canvas class="gm-map-far" width="${ outN }" height="${ outN }"></canvas><canvas class="gm-map-mid" width="${ outN }" height="${ outN }"></canvas><canvas class="gm-map-near" width="${ nearN }" height="${ nearN }"></canvas><div class="gm-map-vig"></div>
			<div class="gm-map-marks"></div>
			<div class="gm-map-me"><svg viewBox="0 0 24 24"><path d="M12 2 20 21 12 16.5 4 21Z" fill="#fff" stroke="#0b1418" stroke-width="1.4" stroke-linejoin="round"/></svg></div></div>
			<div class="gm-map-label is-home"></div>` );
		this.el.setAttribute( 'aria-hidden', 'true' );
		this.view = this.el.querySelector( '.gm-map-view' );
		this.canvas = this.el.querySelector( '.gm-map-near' );
		this.marks = this.el.querySelector( '.gm-map-marks' );
		this.label = this.el.querySelector( '.gm-map-label' );
		parent.append( this.el );

		const mk = ( kind, icon ) => {

			const e = h( 'div', 'gm-mk is-' + kind, `<b></b><i>${ icon }</i>` );
			this.marks.append( e );
			return { el: e, arrow: e.firstChild };

		};

		this.markers = [
			{ id: 'joe', ...mk( 'joe', ICON.fish ), pos: () => ( { x: STAND.x, z: STAND.z } ), vendor: () => game.stand.vendor },
			{ id: 'marta', ...mk( 'marta', ICON.anchor ), pos: () => ( { x: CHANDLERY.x, z: CHANDLERY.z } ), vendor: () => game.chandlery.vendor },
			// ((M15) Pearl's fish camp on the north beach)
			{ id: 'camp', ...mk( 'camp', ICON.fish ), pos: () => ( { x: CAMP.keeper.x, z: CAMP.keeper.z } ), vendor: () => game.camp.vendor },
			// ((M13) the shelter, while a hurricane's watched for, warned of, or here)
			{ id: 'shelter', ...mk( 'shelter', ICON.shelter ), pos: () => ( { x: SHELTER.x, z: SHELTER.z } ), hideWhen: () => {

				const n = game.app.weather && game.app.weather.news;
				return ! n || n.stage === 'outlook';

			} },
			{ id: 'boat', ...mk( 'boat', ICON.boat ), pos: () => {

				const b = game.app.boatCtl;
				return b ? { x: b.position.x, z: b.position.z } : null;

			}, hideWhen: () => {

				const p = game.app.player;
				return p.mode === 'boat' || p.mode === 'deck';

			} },
		];
		this.north = h( 'div', 'gm-map-n', 'N' );
		this.marks.append( this.north );
		this.fish = [ h( 'div', 'gm-map-fish', '<i></i><i></i>' ), h( 'div', 'gm-map-fish', '<i></i><i></i>' ) ];
		this.fish.forEach( ( f ) => this.marks.prepend( f ) );
		this._fishPts = [];
		this._fishT = 0;

		this.radiusM = 110; // world radius shown (m), eased between on foot and at sea
		this._hot = new Set();
		this._size = 0;
		// ((M15) the chart's two sheets: each baked (base), then shown blank where you haven't been (view: in the
		// map, and drawn by the plotter); their soundings, for the plotter)
		const sheet = ( spec, px, view ) => {

			const base = document.createElement( 'canvas' ), mask = document.createElement( 'canvas' );
			base.width = base.height = px;
			mask.width = mask.height = spec.n;
			view.style.width = view.style.height = px + 'px';
			const m = mask.getContext( '2d' );
			return { spec, px, ppm: px / spec.ext, bake: new SheetBake( spec, px ), base, view, mask, maskImg: m.createImageData( spec.n, spec.n ), drawn: - 1 };

		};
		// (drawn far to near: each under the finer)
		this.sheets = { far: sheet( SHEETS.far, outN, this.el.querySelector( '.gm-map-far' ) ), mid: sheet( SHEETS.mid, outN, this.el.querySelector( '.gm-map-mid' ) ), near: sheet( SHEETS.near, nearN, this.canvas ) };
		this.soundings = null;
		this._composeT = - 1e9; // (when they were last drawn: ms)
		// (the island's sheet baked: App lets its masks go)
		this._bake = { done: false };

		// ((M15) the chart's names, your marks, the fish where you first had one at each place)
		this.names = NAMES.map( ( n ) => {

			const el = h( 'div', `gm-map-name${ n.water ? ' is-water' : '' }${ n.small ? ' is-small' : '' }${ n.peak ? ' is-peak' : '' }`, `<span>${ n.name }${ n.light ? `<small>${ n.light }</small>` : '' }</span>` );
			this.marks.prepend( el );
			return { n, el };

		} );
		this._marks = new Map(); // id -> el
		this._fishPlaces = new Map(); // place -> el
		this._chartV = - 1;
		this._labelT = 0;
		// the view's size, kept by a ResizeObserver (reading clientWidth per frame forces a style +
		// layout pass right after last frame's transform writes)
		this._viewSize = - 1;
		if ( typeof ResizeObserver !== 'undefined' ) {

			this._ro = new ResizeObserver( () => {

				this._viewSize = this.view.clientWidth;

			} );
			this._ro.observe( this.view );

		}

	}

	// style writes only when the value changes
	_setStyle( el, prop, value ) {

		const k = '__gm_' + prop;
		if ( el[ k ] === value ) return;
		el[ k ] = value;
		el.style[ prop ] = value;

	}

	_toggle( el, cls, on ) {

		const k = '__gm_c_' + cls;
		if ( el[ k ] === on ) return;
		el[ k ] = on;
		el.classList.toggle( cls, on );

	}

	// (Salt Life) another player: a dot in their colour with their initial (together/Together.js);
	// pos() -> { x, z } or null while they're out of sight
	addPlayer( id, { name, color, pos } ) {

		const e = h( 'div', 'gm-mk is-player', '<b></b><i></i>' );
		e.lastChild.textContent = ( name || '?' ).trim().charAt( 0 ).toUpperCase();
		e.lastChild.style.background = color;
		this.marks.append( e );
		this.markers.push( { id, el: e, arrow: e.firstChild, pos } );

	}

	removePlayer( id ) {

		const i = this.markers.findIndex( ( m ) => m.id === id );
		if ( i < 0 ) return;
		this.markers[ i ].el.remove();
		this.markers.splice( i, 1 );

	}

	highlight( ids = [] ) {

		this._hot = new Set( ids );
		for ( const m of this.markers ) this._toggle( m.el, 'is-hot', this._hot.has( m.id ) );

	}

	// ---- (M15) the chart's sheets: baked a few rows a frame (the island's, then the far grounds'), then shown as
	// you've charted them
	_bakeStep() {

		// ((step 21) on a device that draws on its CPU a frame's a second or more, and a few rows of a frame are nothing
		// to it: done in a tenth of the frames. At a few rows each, the sheets' buffers and the island's masks, which wait
		// for the first (App.releaseMasks), were held for minutes, past what its script memory's allowed)
		const T = this.game.app.terrainData, S = this.sheets, k = this.game.app.cpuGL ? 10 : 1;
		if ( ! this._bake.done ) {

			if ( ! S.near.bake.step( T, ROWS_PER_FRAME * k ) ) return;
			this._finishSheet( S.near, true );
			this._bake.done = true;
			return;

		}

		for ( const s of [ S.mid, S.far ] ) if ( ! s.bake.done ) {

			if ( s.bake.step( T, FAR_ROWS * k ) ) this._finishSheet( s, false );
			return;

		}

		if ( ! this.soundings ) this.soundings = { near: S.near.sounded, mid: S.mid.sounded, far: S.far.sounded };

	}

	// a sheet baked: its image put down, and the symbols drawn over it (island: the buildings, the piers, the
	// lights, the wreck)
	_finishSheet( s, island ) {

		const ctx = s.base.getContext( '2d' ), b = s.bake;
		ctx.putImageData( new ImageData( b.rgba, s.px, s.px ), 0, 0 );
		b.rgba = null;
		// (its soundings, and what it kept to bake by let go: one sheet's worth at a time)
		s.sounded = b.soundings( Object.keys( this.sheets ).find( ( k ) => this.sheets[ k ] === s ) );
		b.H = b.S = null;
		if ( ! island ) return;
		const P = ( x, z ) => [ ( x - s.spec.x0 ) * s.ppm, ( z - s.spec.z0 ) * s.ppm ];
		const W = WORLD.pier, J = CAMP.jetty, wreck = toWorld( 'bow', 0, 0, 0 ), stern = toWorld( 'stern', 0, 0, 0 );
		drawSymbols( ctx, P, s.ppm, {
			pads: this.game.app.terrainData.pads || [],
			piers: [ [ W.x - W.width / 2, W.zStart, W.x + W.width / 2, W.zEnd ], [ W.x - W.headWidth / 2, W.zEnd - W.headDepth, W.x + W.headWidth / 2, W.zEnd ],
				[ J.x - J.width / 2, J.z0, J.x + J.width / 2, J.z1 ], [ J.x - J.headWidth / 2, J.z1, J.x + J.headWidth / 2, J.z1 + J.head ] ],
			lights: [ ...HARBOUR_LIGHTS.map( ( L ) => ( { x: L.x, z: L.z, colour: L.id === 'east' ? 'red' : L.id === 'west' ? 'green' : 'white', size: 26, dir: L.id === 'west' ? - 0.6 : 0.6 } ) ),
				{ x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, colour: 'white', size: 34, dir: - 0.5 } ],
			wrecks: [ { x: ( wreck[ 0 ] + stern[ 0 ] ) / 2, z: ( wreck[ 2 ] + stern[ 2 ] ) / 2, size: 18 } ],
		} );

	}

	// a sheet as you've charted it: the base, blank (S-52's grey for no chart) where you haven't been, its edge
	// soft over a cell
	// (sheet: the chart's, Chart.js's Sheet; key: what's drawn, its version and Marta's chart)
	_compose( s, sheet, chart, key ) {

		const b = s.bake;
		if ( ! b.done ) return false;
		const n = s.spec.n, d = s.maskImg.data, blank = S52.NODTA, cells = sheet.cells, all = chart.bought;
		for ( let k = 0; k < n * n; k ++ ) {

			const o = k * 4;
			d[ o ] = blank[ 0 ]; d[ o + 1 ] = blank[ 1 ]; d[ o + 2 ] = blank[ 2 ];
			d[ o + 3 ] = cells[ k ] === 1 || ( all && chart.charted( sheet, k ) ) ? 0 : 255;

		}

		s.mask.getContext( '2d' ).putImageData( s.maskImg, 0, 0 );
		const ctx = s.view.getContext( '2d' );
		ctx.clearRect( 0, 0, s.px, s.px );
		ctx.drawImage( s.base, 0, 0 );
		ctx.imageSmoothingEnabled = true;
		ctx.drawImage( s.mask, 0, 0, s.px, s.px );
		s.drawn = key;
		return true;

	}

	// ---- per frame
	update( dt ) {

		this._bakeStep();
		const app = this.game.app, cam = app.camera, p = app.player, chart = this.game.state.chart;
		// ((M15) the sheets as you've charted them: at once when baked, then again when the chart's changed, a second
		// apart at most (by the clock: on a slow device too)
		const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
		if ( chart ) for ( const [ k, s ] of Object.entries( this.sheets ) ) {

			const key = chart[ k ].v * 2 + ( chart.bought ? 1 : 0 );
			if ( s.drawn < 0 || ( s.drawn !== key && now - this._composeT > 1000 ) ) if ( this._compose( s, chart[ k ], chart, key ) ) this._composeT = now;

		}

		if ( this._viewSize < 0 || ! this._ro ) this._viewSize = this.view.clientWidth;
		const size = this._viewSize;
		if ( ! size ) return;
		const R = size / 2;

		// forward (xz) of the view
		const e = cam.matrixWorld.elements;
		let fx = - e[ 8 ], fz = - e[ 10 ];
		const fl = Math.hypot( fx, fz );
		if ( fl < 1e-4 ) {

			fx = 0; fz = - 1;

		} else {

			fx /= fl; fz /= fl;

		}

		const rx = - fz, rz = fx; // right
		const x = cam.position.x, z = cam.position.z;

		// zoom: close on foot, wider at sea, ((M15) and wider still the further you are from the island, out to the
		// far grounds; eased by its ratio)
		const sea = p.mode === 'boat' || p.mode === 'deck' || p.mode === 'swim';
		const want = ! sea ? VIEW.foot : p.mode === 'swim' ? VIEW.sea : Math.min( VIEW.max, VIEW.sea + Math.max( 0, Math.hypot( x - ISLE.x, z - ISLE.z ) - ISLE.r ) * VIEW.per );
		this.radiusM *= Math.exp( Math.log( want / this.radiusM ) * ( 1 - Math.exp( - dt * 1.5 ) ) );
		const kpm = R / this.radiusM; // css px per metre

		// map: player at the centre, forward up
		const rot = - Math.PI / 2 - Math.atan2( fz, fx );
		for ( const s of Object.values( this.sheets ) ) this._setStyle( s.view, 'transform', `translate(${ R }px, ${ R }px) rotate(${ rot }rad) scale(${ kpm / s.ppm }) translate(${ - ( x - s.spec.x0 ) * s.ppm }px, ${ - ( z - s.spec.z0 ) * s.ppm }px)` );
		// (the far grounds' only once the view reaches past the island's waters)
		const M = SHEETS.mid, reach = this.radiusM * 1.5;
		this._setStyle( this.sheets.far.view, 'display', x - reach < M.x0 || z - reach < M.z0 || x + reach > M.x0 + M.ext || z + reach > M.z0 + M.ext ? '' : 'none' );

		const place = ( el, dx, dz, edgeInset, arrow ) => {

			let sx = ( dx * rx + dz * rz ) * kpm, sy = - ( dx * fx + dz * fz ) * kpm;
			const r = Math.hypot( sx, sy ), max = R - edgeInset;
			const edge = r > max;
			if ( edge ) {

				sx *= max / r; sy *= max / r;

			}

			this._setStyle( el, 'transform', `translate(${ R + sx }px, ${ R + sy }px)` );
			if ( arrow && edge ) this._setStyle( arrow, 'transform', `rotate(${ Math.atan2( sx, - sy ) }rad)` );
			return edge;

		};
		// ((M15) on the map or not: for the chart's names and marks, which don't sit on the rim)
		const inView = ( dx, dz, inset ) => Math.hypot( dx, dz ) * kpm < R - inset;

		for ( const m of this.markers ) {

			const q = m.pos();
			const hide = ! q || ( m.hideWhen && m.hideWhen() );
			this._setStyle( m.el, 'display', hide ? 'none' : '' );
			if ( hide ) continue;
			const edge = place( m.el, q.x - x, q.z - z, 12, m.arrow );
			this._toggle( m.el, 'is-edge', edge );
			// (Salt Life) a stall whose trader has gone home for the night
			if ( m.vendor ) this._toggle( m.el, 'is-shut', ! m.vendor().open );

		}

		// the N on the rim
		place( this.north, 0, - 1e6, 9 );

		// ((M15) the chart: the names you've come to, as suits the view's radius, your marks, the fish places)
		if ( chart ) {

			if ( chart.version !== this._chartV ) this._syncChart( chart );
			const r = this.radiusM;
			for ( const { n, el } of this.names ) {

				const far = !! n.place || n.id === 'sandbar', fits = n.small ? r < NAMES_AT.small : far ? r > NAMES_AT.far : r < NAMES_AT.island;
				const on = fits && chart.named( n.id ) && inView( n.x - x, n.z - z, 6 );
				this._toggle( el, 'is-on', on );
				if ( on ) {

					place( el, n.x - x, n.z - z, 0 );
					this._toggle( el, 'is-fished', !! this._fished( n, chart ) );

				}

			}

			for ( const m of chart.marks ) {

				const el = this._marks.get( m.id ), on = inView( m.x - x, m.z - z, 4 );
				this._setStyle( el, 'display', on ? '' : 'none' );
				if ( on ) place( el, m.x - x, m.z - z, 0 );

			}

			for ( const [ k, f ] of Object.entries( chart.firsts ) ) {

				const el = this._fishPlaces.get( k );
				if ( ! el ) continue;
				const on = inView( f.x - x, f.z - z, 4 ) && r < NAMES_AT.island * 2;
				this._setStyle( el, 'display', on ? '' : 'none' );
				if ( on ) place( el, f.x - x, f.z - z, 0 );

			}

			// how far home, and whether the fuel will get you there (aboard, out of sight of the dock)
			this._labelT -= dt;
			if ( this._labelT <= 0 ) {

				this._labelT = 0.5;
				this._homeLabel( x, z, p );

			}

		}

		// fish finder: the richest water nearby, refreshed now and then
		const finder = this.game.state.stats.finder;
		this._fishT -= dt;
		if ( finder && this._fishT <= 0 ) {

			this._fishT = 1.5;
			this._fishPts = this._richest( x, z, Math.min( this.radiusM, 300 ) * 0.85 );

		}

		for ( let i = 0; i < this.fish.length; i ++ ) {

			const q = finder ? this._fishPts[ i ] : null;
			this._toggle( this.fish[ i ], 'is-on', !! q );
			if ( q ) place( this.fish[ i ], q.x - x, q.z - z, 14 );

		}

	}

	// (M15) the place a name stands for (Places.js), where you've had a fish
	_fished( n, chart ) {

		return ( n.place && chart.firsts[ n.place ] ) || ( { northBeach: 1, creek: 1, windReef: 1, bay: 1 }[ n.id ] && chart.firsts[ n.id ] );

	}

	// (M15) your marks' and the fish places' markers, as the chart has them
	_syncChart( chart ) {

		this._chartV = chart.version;
		const ids = new Set( chart.marks.map( ( m ) => m.id ) );
		for ( const [ id, el ] of this._marks ) if ( ! ids.has( id ) ) {

			el.remove();
			this._marks.delete( id );

		}

		for ( const m of chart.marks ) if ( ! this._marks.has( m.id ) ) {

			const el = h( 'div', 'gm-mk is-mark', `<i><em>${ m.id }</em></i>` );
			this.marks.prepend( el );
			this._marks.set( m.id, el );

		}

		// (a place with a name of its own on the chart has its name marked instead)
		const named = new Set( [ 'northBeach', 'creek', 'windReef', 'bay', 'ledge', 'hump', 'bank' ] );
		for ( const k of Object.keys( chart.firsts ) ) if ( ! this._fishPlaces.has( k ) && ! named.has( k ) ) {

			const el = h( 'div', 'gm-mk is-fishplace', `<i>${ ICON.fish }</i>` );
			this.marks.prepend( el );
			this._fishPlaces.set( k, el );

		}

	}

	// (M15) under the map at sea: home's distance and bearing (magnetic, as the compass gives it), and the fuel
	_homeLabel( x, z, p ) {

		const aboard = p.mode === 'boat' || p.mode === 'deck', leg = legTo( x, z, HOME.x, HOME.z );
		const on = aboard && leg.m > 600;
		this._toggle( this.label, 'is-on', on );
		if ( ! on ) return;
		const b = this.game.app.boatCtl, s = this.game.state;
		// ((M15) riding in someone else's, it's their fuel, and you don't know it)
		const f = p.riding ? null : fuelFor( leg.m, s.fuelL, { rpm: b.rpm, speed: b.speed, speedMul: s.stats.speedMul || 1 } );
		const text = `<b>Home</b> ${ ( leg.m / 1852 ).toFixed( 1 ) } NM · ${ String( magnetic( leg.bearing ) ).padStart( 3, '0' ) }°${ f ? ` · <i class="is-${ f.state }">fuel ${ f.state === 'ok' ? 'ok' : f.state === 'tight' ? 'tight' : 'short' }</i>` : '' }`;
		if ( this.label.__text !== text ) this.label.innerHTML = this.label.__text = text;

	}

	// the two richest points on a coarse polar grid around (x, z), at least 25 m apart
	_richest( x, z, r ) {

		const g = this.game, T = g.app.terrainData;
		const pts = [];
		for ( let ring = 1; ring <= 3; ring ++ ) for ( let a = 0; a < 12; a ++ ) {

			const ang = ( a / 12 ) * Math.PI * 2 + ring * 0.4, d = r * ring / 3;
			const px = x + Math.cos( ang ) * d, pz = z + Math.sin( ang ) * d;
			const depth = - T.heightAt( px, pz );
			if ( depth < 1 ) continue;
			const hab = g.habitatAtPoint( px, pz, depth );
			let rich = 0;
			for ( const k in hab ) rich += hab[ k ];
			if ( rich > 0.7 ) pts.push( { x: px, z: pz, rich } );

		}

		pts.sort( ( a, b ) => b.rich - a.rich );
		const out = [];
		for ( const q of pts ) if ( out.every( ( o ) => Math.hypot( o.x - q.x, o.z - q.z ) > 25 ) ) {

			out.push( q );
			if ( out.length === 2 ) break;

		}

		return out;

	}

}
