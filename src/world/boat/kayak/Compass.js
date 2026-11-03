import { magnetic } from '../../../game/Chart.js';

// (M16) What a kayak angler steers by: a small liquid-filled compass on a wrist strap or a deck mount, read at a glance. A
// card that turned on her deck would be another draw, and a thing too small to read on a phone; so it's on the HUD, a
// dial beside the map, in either view: north on the card, the lubber's mark at the top, and the card lags a little as a
// card in its liquid does. No plotter's needed: every boat's compass is free (Seaworthy's stats.compass).
//   const c = new Compass( parent );   c.update( dt, heading )   heading: rad true, or null to put it away
//   pointOf( degrees ) -> 'NNE'...

const CSS = /* css */`
.kw-compass { position: absolute; right: calc(var(--tw-edge) + 192 * var(--tw-u)); bottom: var(--tw-edge); width: calc(66 * var(--tw-u)); text-align: center; display: none; pointer-events: none; font-family: var(--tw-mono); color: var(--tw-ink); }
.kw-compass.is-on { display: block; }
.kw-compass svg { display: block; width: 100%; height: auto; filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.55)); }
.kw-compass b { display: block; margin-top: 2px; font-size: var(--tw-fs-sm); font-weight: 700; letter-spacing: 0.02em; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8); }
.tw-root[data-panel='open'] .kw-compass, .tw-root:has(.gm-panel.is-open) .kw-compass { display: none; }
html.is-touch .kw-compass { bottom: auto; top: var(--gm-top); right: calc(var(--gm-r) + var(--gm-map) + 8px); width: calc(56 * var(--tw-u)); }
/* (upright, under the map, so a tip beside the map has its room; out of the way of the fight's panel, which takes the
   map's place, and the toasts under it) */
@media (orientation: portrait) {
	html.is-touch .kw-compass { top: calc(var(--gm-top) + var(--gm-map) + 6px); right: calc(var(--gm-r) + (var(--gm-map) - 56 * var(--tw-u)) / 2); }
	html.is-touch .tw-root:has(.gm-fight.is-on) .kw-compass { opacity: 0; }
	html.is-touch:has(.kw-compass.is-on) .hud-toast { top: calc(var(--gm-top) + var(--gm-map) + 104px); }
	html.is-touch:has(.kw-compass.is-on) .hud-hint { top: calc(var(--gm-top) + var(--gm-map) + 152px); }
}
/* (on its side, the first hint stops short of it: style.css) */
@media (orientation: landscape) {
	html.is-touch:has(.kw-compass.is-on) .hud .hud-hint { max-width: calc(100vw - var(--gm-l) - min(calc(300 * var(--tw-u)), 42vw) - 36px - var(--gm-r) - var(--gm-map) - 56 * var(--tw-u)); }
}
`;

const POINTS = [ 'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW' ];
export const pointOf = ( deg ) => POINTS[ Math.round( ( ( deg % 360 ) + 360 ) % 360 / 22.5 ) % 16 ];

// how long the card takes to come round (s)
const LAG = 0.35;

function dial() {

	let ticks = '';
	for ( let a = 0; a < 360; a += 30 ) if ( a % 90 ) ticks += `<path d="M50 11V17" transform="rotate(${ a } 50 50)" stroke="#d9dee0" stroke-width="1.6"/>`;
	const letter = ( t, a, fill ) => `<text x="50" y="25" transform="rotate(${ a } 50 50)" text-anchor="middle" font-size="17" font-weight="700" font-family="sans-serif" fill="${ fill }">${ t }</text>`;
	return `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="48" fill="#15191b"/><circle cx="50" cy="50" r="48" fill="none" stroke="#5b6468" stroke-width="3"/>
		<g class="kw-card">${ ticks }${ letter( 'N', 0, '#f0503c' ) }${ letter( 'E', 90, '#f2f4f4' ) }${ letter( 'S', 180, '#f2f4f4' ) }${ letter( 'W', 270, '#f2f4f4' ) }</g>
		<path d="M50 3L44 13H56Z" fill="#f4b23c"/><path d="M50 40V60M40 50H60" stroke="#8b9498" stroke-width="1.4"/></svg><b></b>`;

}

export class Compass {

	constructor( parent ) {

		this.parent = parent;
		this.el = null;
		this.card = 0; // rad: where the card's come round to
		this.shown = '';

	}

	update( dt, heading ) {

		if ( heading === null ) {

			if ( this.el && this.on ) this.el.classList.remove( 'is-on' );
			this.on = false;
			return;

		}

		if ( ! this.el ) {

			const style = document.createElement( 'style' );
			style.textContent = CSS;
			document.head.append( style );
			this.el = document.createElement( 'div' );
			this.el.className = 'kw-compass';
			this.el.innerHTML = dial();
			this.cardEl = this.el.querySelector( '.kw-card' );
			this.word = this.el.querySelector( 'b' );
			this.parent.append( this.el );

		}

		if ( ! this.on ) {

			this.on = true;
			this.card = heading;
			this.el.classList.add( 'is-on' );

		}

		this.card += Math.atan2( Math.sin( heading - this.card ), Math.cos( heading - this.card ) ) * ( 1 - Math.exp( - dt / LAG ) );
		const deg = magnetic( this.card );
		if ( deg === this.deg ) return;
		this.deg = deg;
		this.cardEl.setAttribute( 'transform', `rotate(${ - deg } 50 50)` );
		this.word.textContent = `${ String( deg ).padStart( 3, '0' ) }° ${ pointOf( deg ) }`;

	}

}
