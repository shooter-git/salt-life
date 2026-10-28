import { DAY_RATE, REST, REST_NAMES, isOpen, restTo, sunUp, timeText } from './IslandClock.js';
import { HOURS, shutFor } from './Orders.js';
import { CONDITIONS, PICK_IDS, SOUTHERLY, WEATHER_NAMES, MURKY, NORTH, islandTime, forecast, surfText, swellFrom, windFrom } from './Weather.js';
import { G } from '../core/Globals.js';
import { knots } from './Units.js';

// (Salt Life) The island's clock in the HUD: the time at the left of the purse (a sun by day, a moon at
// night, two bars while it's held), and, when it's tapped (T; R3 on a gamepad), a small menu under the
// purse:
//   on your own   hold the clock or let it run, rest until dawn, noon, dusk or night
//   in company    time runs for everyone; a rest happens once all of you want it (each choice shows
//                 who wants it; a dot on the clock when someone else does and you haven't said)
// It says when Joe and Marta open or shut (M9: or that they've shut for the weather), and (Salt Life) the
// weather: what it is (M9: and its rain), what's coming, and a choice of it (in company, for everyone
// here: Together.setWeather). No toasts: a rest dims the world for a moment instead.
//   const t = new TimeHUD( game, purse, root );  t.update( dt )  (per frame)  t.toggle( open? )
//   wxWind( weather ) -> 'NNW' (where it's from)   wxRain( weather ) -> 'rain' ('' dry, or the name says it)
//   (M13) wxNews( news, weather, T, locale ) -> 'Hurricane warning: its winds from 03:00 tomorrow' ('' none)

const ICON = {
	sun: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3" fill="currentColor"/><g stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></g></svg>',
	moon: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.6 2.3a5.9 5.9 0 1 0 3.1 9.2A4.9 4.9 0 0 1 10.6 2.3z" fill="currentColor"/></svg>',
	held: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3" width="2.6" height="10" rx="1" fill="currentColor"/><rect x="9.4" y="3" width="2.6" height="10" rx="1" fill="currentColor"/></svg>',
	play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z" fill="currentColor"/></svg>',
};

const CSS = /* css */`
/* (a 44 px box to tap, its margins giving back what the purse's line doesn't need; the pill is the face) */
.gm-clock { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; margin: -12px 0 -12px calc(-6 * var(--tw-u));
	font: 500 var(--tw-fs-md) var(--tw-mono); color: var(--tw-ink-2); white-space: nowrap; transition: color var(--tw-fast); }
.gm-clock-face { display: inline-flex; align-items: center; gap: calc(6 * var(--tw-u)); padding: calc(4 * var(--tw-u)) calc(6 * var(--tw-u)); border-radius: 999px;
	position: relative; transition: background var(--tw-fast); }
.gm-clock:hover, .gm-clock.is-open { color: var(--tw-ink); }
.gm-clock:hover .gm-clock-face, .gm-clock.is-open .gm-clock-face { background: var(--tw-fill-2); }
.gm-clock svg { width: calc(14 * var(--tw-u)); height: calc(14 * var(--tw-u)); flex: none; }
.gm-clock.is-day svg { color: var(--tw-sun); }
.gm-clock.is-held { color: var(--tw-ink-3); }
.gm-clock-dot { position: absolute; top: calc(2 * var(--tw-u)); left: calc(16 * var(--tw-u)); width: calc(7 * var(--tw-u)); height: calc(7 * var(--tw-u));
	border-radius: 50%; background: var(--tw-aqua); box-shadow: 0 0 0 2px rgba(12, 18, 26, 0.8); display: none; }
.gm-clock.has-ask .gm-clock-dot { display: block; }
.gm-time { position: absolute; top: calc(var(--gm-band, 56px) + var(--tw-2)); right: var(--tw-edge); width: calc(268 * var(--tw-u));
	padding: var(--tw-3) var(--tw-4) var(--tw-3); border-radius: var(--tw-r-lg); font: 500 var(--tw-fs-md) var(--tw-font); color: var(--tw-ink);
	opacity: 0; transform: translateY(-4px); pointer-events: none; transition: opacity var(--tw-med) var(--tw-ease), transform var(--tw-med) var(--tw-ease); }
.gm-time.is-open { opacity: 1; transform: none; pointer-events: auto; }
/* (on a phone on its side it scrolls rather than run off the screen) */
.gm-time { max-height: calc(100vh - var(--gm-band, 56px) - 3 * var(--tw-2)); max-height: calc(100dvh - var(--gm-band, 56px) - 3 * var(--tw-2)); overflow-y: auto; overscroll-behavior: contain; }
.gm-time-wx { color: var(--tw-ink-2); }
.gm-time-wx b { color: var(--tw-ink); font-weight: 600; }
.gm-time-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--tw-2); }
.gm-time-now { font: 600 calc(20 * var(--tw-u)) var(--tw-mono); letter-spacing: -0.01em; }
.gm-time-day { color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.gm-time-sub { margin: 2px 0 0; color: var(--tw-ink-3); font-size: var(--tw-fs-sm); }
.gm-time-label { margin: var(--tw-3) 0 var(--tw-1); color: var(--tw-ink-3); font-size: var(--tw-fs-xs); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
.gm-time-hold { display: flex; align-items: center; gap: var(--tw-2); width: 100%; margin-top: var(--tw-3); padding: var(--tw-2) var(--tw-3);
	border-radius: var(--tw-r-md); background: var(--tw-fill); border: 1px solid var(--tw-line); color: var(--tw-ink); font: 600 var(--tw-fs-md) var(--tw-font); }
.gm-time-hold svg { width: calc(14 * var(--tw-u)); height: calc(14 * var(--tw-u)); color: var(--tw-aqua); }
.gm-time-hold small { margin-left: auto; color: var(--tw-ink-3); font-weight: 500; font-size: var(--tw-fs-sm); }
.gm-time-rest { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--tw-1); }
.gm-time-rest button { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: var(--tw-2) 0; border-radius: var(--tw-r-md);
	background: var(--tw-fill); border: 1px solid var(--tw-line); color: var(--tw-ink); font: 600 var(--tw-fs-sm) var(--tw-font); }
.gm-time-rest button small { font: 500 var(--tw-fs-xs) var(--tw-mono); color: var(--tw-ink-3); }
.gm-time-rest.is-wx { grid-template-columns: repeat(3, 1fr); } /* (M9) the forecast and eight kinds of weather: three rows of three */
.gm-time-rest.is-wx button[data-weather="hurricane"] { grid-column: span 2; } /* (M13) and a hurricane of your own; (M14) beside the thunderstorm, under the southerly gale */
.gm-time-news { color: var(--tw-sun); font-weight: 600; }
.gm-time-news.is-warn { color: var(--tw-coral); }
.gm-time-rest button.is-on { background: rgba(var(--tw-aqua-rgb), 0.14); border-color: var(--tw-aqua); box-shadow: inset 0 0 0 1px var(--tw-aqua); }
.gm-time-hold:hover, .gm-time-rest button:hover { background: var(--tw-fill-2); }
.gm-time-note { margin: var(--tw-2) 0 0; color: var(--tw-ink-2); font-size: var(--tw-fs-sm); min-height: 1.4em; }
.gm-time-note b { color: var(--tw-aqua); font-weight: 600; }
.gm-time-foot { margin-top: var(--tw-2); color: var(--tw-ink-4); font-size: var(--tw-fs-xs); }
.gm-time :focus-visible { outline: 2px solid rgba(var(--tw-aqua-rgb), 0.9); outline-offset: 1px; }
.gm-rest-fade { position: absolute; inset: 0; background: #02060b; opacity: 0; pointer-events: none; transition: opacity 420ms var(--tw-ease-io); }
.gm-rest-fade.is-on { opacity: 0.92; transition-duration: 220ms; }
html.is-touch .gm-time { right: var(--gm-r); width: min(calc(300 * var(--tw-u)), calc(100vw - 2 * var(--tw-edge))); }
html.is-touch .gm-time-hold, html.is-touch .gm-time-rest button { min-height: 44px; }
html.is-touch .tw-root:has(.gm-time.is-open) :is(.gm-map, .gm-coach) { visibility: hidden; }
/* with a panel up on a phone on its side, the purse is only your money (game-ui.css): the clock too goes */
@media (prefers-reduced-motion: reduce) { .gm-time, .gm-rest-fade { transition: none; } }
`;

const WEATHER_WIND = Object.fromEntries( PICK_IDS.map( ( id ) => [ id, CONDITIONS[ id === SOUTHERLY ? 'gale' : id ].wind ] ) );
// (M9) the picker's names: a third of the menu wide, 'Thunderstorm' doesn't fit; (M14) a southerly gale
const PICK_NAMES = { ...WEATHER_NAMES, storm: 'Thunder', [ SOUTHERLY ]: 'Southerly' };
// the direction a wind turned `a` from the trades blows toward
const turned = ( a ) => {

	const p = G.windPrevailing.value, c = Math.cos( a ), s = Math.sin( a );
	return [ p.x * c - p.y * s, p.x * s + p.y * c ];

};

// (M9) where the weather's wind comes from, on the island's compass ('NNW': the menu, and Joe's forecast slate)
export const wxWind = ( wx ) => windFrom( ...turned( wx.windAngle ) );

// (M9) its rain, a word or two, when the weather's name doesn't say it already ('' when it's dry); (M13)
// in a hurricane's eye, that it's the eye
export function wxRain( wx ) {

	if ( ! wx || wx.id === 'storm' ) return '';
	if ( wx.id === 'hurricane' ) return wx.eye >= 0.5 ? 'the eye' : '';
	if ( wx.thunder >= 0.15 ) return 'thunder';
	if ( wx.id === 'rain' ) return wx.rain >= 0.8 ? 'heavy' : '';
	return wx.rain >= 0.5 ? 'heavy rain' : wx.rain >= 0.12 ? 'rain' : wx.rain >= 0.03 ? 'showers' : '';

}

// (M13) what's said of a hurricane on its way (Weather.hurricaneNews: news), at island time T, in the
// weather wx: on the outlook, watched for, warned of, here ('' none)
export function wxNews( news, wx, T, locale = undefined ) {

	if ( ! news ) return '';
	const when = ( t ) => {

		const days = Math.floor( t / 24 ) - Math.floor( T / 24 );
		return `${ timeText( ( ( t % 24 ) + 24 ) % 24, locale, 30 ) }${ days === 1 ? ' tomorrow' : days > 1 ? ` on day ${ Math.floor( t / 24 ) + 1 }` : '' }`;

	};
	if ( news.stage === 'outlook' ) return `A hurricane far off to the ${ news.from }, coming this way`;
	if ( news.stage === 'watch' ) return `Hurricane watch: its winds could be here by ${ when( news.onset ) }`;
	if ( T < news.onset ) return `Hurricane warning: its winds from ${ when( news.onset ) }`;
	if ( wx && wx.eye >= 0.5 ) return 'The eye: the other side of its wall is still to come';
	if ( T < news.eye ) return news.over ? `Hurricane: its eye passes over about ${ when( news.eye ) }` : `Hurricane: at its worst about ${ when( news.eye ) }`;
	return `Hurricane: its winds ease from about ${ when( news.ends ) }`;

}

const h = ( tag, cls, html ) => {

	const e = document.createElement( tag );
	if ( cls ) e.className = cls;
	if ( html !== undefined ) e.innerHTML = html;
	return e;

};

const esc = ( t ) => String( t ).replace( /[&<>"']/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } )[ c ] );

export class TimeHUD {

	constructor( game, purse, root ) {

		this.game = game;
		this.app = game.app;
		const style = h( 'style' );
		style.textContent = CSS;
		document.head.append( style );
		this.button = h( 'button', 'gm-clock tw-interactive', `<span class="gm-clock-face"><span class="gm-clock-ico"></span><span class="gm-clock-t"></span><i class="gm-clock-dot"></i></span>` );
		this.button.type = 'button';
		this.ico = this.button.querySelector( '.gm-clock-ico' );
		this.text = this.button.querySelector( '.gm-clock-t' );
		purse.prepend( this.button );
		this.menu = h( 'div', 'gm-time tw-glass' );
		this.menu.setAttribute( 'role', 'dialog' );
		this.menu.setAttribute( 'aria-label', 'The clock' );
		this.fade = h( 'div', 'gm-rest-fade' );
		root.prepend( this.fade ); // (under the HUD: only the world dims)
		root.append( this.menu );
		this.open = false;
		this._sig = '';
		this._face = '';
		this._focus = 0;
		this.button.addEventListener( 'click', () => this.toggle( undefined, false ) );
		// (the menu's own buttons: a press that lands on the canvas behind closes it)
		addEventListener( 'pointerdown', ( e ) => {

			if ( this.open && ! this.menu.contains( e.target ) && ! this.button.contains( e.target ) ) this.toggle( false );

		}, true );
		const together = this.app.together;
		if ( together ) together.onJump = () => this.dim();

	}

	get locale() {

		return this.app.portal && this.app.portal.locale;

	}

	// the clock's state: { hour, day, held, alone, wishes, agreed, here, mine, others (names) }
	state() {

		const s = this.app.settings, t = this.app.together;
		const st = { hour: s.timeOfDay, day: s.day, held: s.timeSpeed === 0, alone: ! t || t.surelyAlone, wishes: new Map(), here: [], mine: null, asks: [] };
		if ( t && ! st.alone ) {

			const w = t.restWishes();
			st.wishes = w.wishes;
			st.here = w.here;
			st.mine = w.wishes.get( t.me.id ) || null;
			for ( const [ id, to ] of w.wishes ) if ( id !== t.me.id ) st.asks.push( { name: t.others.get( id )?.person.name || 'Someone', to } );

		}

		return st;

	}

	// per frame
	update() {

		const inp = this.app.input, st = this.state();
		// the readout: once the shown time, the sun or moon, or a wish changes
		const day = sunUp( st.hour );
		const face = `${ timeText( st.hour, this.locale ) }|${ st.held ? 'held' : day ? 'sun' : 'moon' }|${ st.asks.length && ! st.mine ? 1 : 0 }`;
		if ( face !== this._face ) {

			this._face = face;
			const [ text, icon, ask ] = face.split( '|' );
			this.text.textContent = text;
			this.ico.innerHTML = ICON[ icon ];
			this.button.classList.toggle( 'is-day', icon === 'sun' );
			this.button.classList.toggle( 'is-held', icon === 'held' );
			this.button.classList.toggle( 'has-ask', ask === '1' );
			this.button.setAttribute( 'aria-label', `${ text }${ st.held ? ', held' : '' }. The clock` );

		}

		const hud = this.game.hud;
		if ( inp.hit( 'KeyT' ) && ! ( hud && hud.catchOpen ) ) this.toggle( undefined, true );
		if ( ! this.open ) return;
		if ( inp.hit( 'Escape' ) || ( hud && ( hud.invOpen || hud.standOpen || hud.catchOpen ) ) ) {

			this.toggle( false );
			return;

		}

		this.render( st );
		// keys and the gamepad: ← → (the d-pad) move between the choices, Space (A) takes one (Enter too).
		// (M10) Each press in turn, as they came: on a slow frame none is lost, and a Space takes the
		// choice the arrows before it reached
		const buttons = [ ...this.menu.querySelectorAll( 'button' ) ];
		for ( const code of inp.enabled ? inp.presses : [] ) {

			if ( ! this.open ) break;
			const step = code === 'ArrowLeft' || code === 'ArrowUp' ? - 1 : code === 'ArrowRight' || code === 'ArrowDown' ? 1 : 0;
			if ( step && buttons.length ) {

				this._focus = ( this._focus + step + buttons.length ) % buttons.length;
				buttons[ this._focus ].focus( { preventScroll: true } );

			} else if ( code === 'Space' && buttons.includes( document.activeElement ) ) document.activeElement.click();

		}

	}

	toggle( open = ! this.open, keys = false ) {

		this.open = open;
		this.menu.classList.toggle( 'is-open', open );
		this.button.classList.toggle( 'is-open', open );
		if ( ! open ) {

			if ( this.menu.contains( document.activeElement ) ) document.activeElement.blur();
			return;

		}

		const hud = this.game.hud;
		if ( hud ) {

			hud.toggleInventory( false );
			hud.closeStand();

		}

		try {

			if ( document.pointerLockElement && document.exitPointerLock ) document.exitPointerLock();

		} catch ( e ) { /* ignore */ }

		this._sig = '';
		this.render( this.state() );
		// from the keyboard or a gamepad: the first choice has the focus (Enter or A takes it)
		const first = this.menu.querySelector( 'button' );
		this._focus = 0;
		if ( keys && first ) first.focus( { preventScroll: true } );

	}

	// the menu, drawn again when what it says changes
	render( st ) {

		const loc = this.locale, at = ( hr ) => timeText( hr, loc, 30 );
		const stall = ( name, hours ) => isOpen( hours, st.hour ) ? `${ name } until ${ at( hours[ 1 ] ) }` : `${ name } opens ${ at( hours[ 0 ] ) }`;
		const asks = st.asks.map( ( a ) => `${ a.name }:${ a.to }` ).join( ',' );
		// (Salt Life) the weather as it's going to be (not as it's easing there: the menu isn't drawn again
		// every frame), and what's coming
		// (chosen: what's picked, yours or, in company, anyone's for everyone)
		const wx = this.app.weather && this.app.weather.target, chosen = this.app.settings.weather || null;
		const pick = chosen;
		const next = wx && ! pick ? forecast( islandTime( st.day, st.hour ), 12 ) : null;
		const wet = wxRain( wx );
		// ((M10) and the water, while a blow's left it murky; (M14) and a big surf on the north shore)
		const north = wx && wx.north >= NORTH.big ? ` · north shore ${ surfText( wx.north ) }` : '';
		const wxLine = wx ? `<b>${ WEATHER_NAMES[ wx.id ] }</b>${ wet ? ` · ${ wet }` : '' } · wind ${ wxWind( wx ) } ${ knots( wx.wind ) } · surf ${ surfText( wx.surf ) } ${ swellFrom( wx.west || 0 ) } at ${ Math.round( wx.period ) } s${ north }${ wx.murk >= MURKY ? ' · water murky' : '' }` : '';
		// (M9) in a gale or a thunderstorm they've both shut and gone home
		// ((M13) and ahead of a hurricane they board up and go home)
		const stalls = wx && wx.boarded ? 'Joe and Marta have boarded up for the hurricane' : wx && shutFor( wx.id ) ? 'Joe and Marta have shut for the weather' : `${ stall( 'Joe', HOURS.joe ) } · ${ stall( 'Marta', HOURS.marta ) }`;
		// ((M13) and what's said of a hurricane on its way: a picked one passes as one of the day's would)
		const T = islandTime( st.day, st.hour ), news = wxNews( this.app.weather && this.app.weather.news, wx, T, loc );
		const wxNext = pick === 'hurricane' ? `${ st.alone ? 'Your own' : 'A chosen' } hurricane${ news ? ` · ${ news }` : ', gone by' }` : pick ? ( st.alone ? 'Your choice holds' : 'Chosen for everyone here' )
			: st.alone || ! wx ? ( next ? `Later: ${ WEATHER_NAMES[ next.id ].toLowerCase() }, from ${ at( next.at % 24 ) }` : 'Settled for now' )
				: `The weather follows the island's day${ next ? ` · later ${ WEATHER_NAMES[ next.id ].toLowerCase() }` : '' }`;
		const wxSaid = pick ? '' : news, warned = this.app.weather && this.app.weather.news && this.app.weather.news.stage === 'warning';
		const sig = [ timeText( st.hour, loc ), st.day, st.held, st.alone, st.mine, asks, st.here.length, this.app.input.lastDevice, wxLine, wxNext, wxSaid, chosen ].join( '|' );
		if ( sig === this._sig ) return;
		this._sig = sig;
		const focused = this.menu.contains( document.activeElement ) ? [ ...this.menu.querySelectorAll( 'button' ) ].indexOf( document.activeElement ) : - 1;
		const count = ( to ) => [ ...st.wishes.values() ].filter( ( x ) => x === to ).length;
		const rest = Object.keys( REST ).map( ( to ) => {

			const small = st.alone ? at( REST[ to ] ) : `${ count( to ) }/${ st.here.length }`;
			return `<button type="button" data-rest="${ to }" class="${ st.mine === to ? 'is-on' : '' }" aria-pressed="${ st.mine === to }">${ REST_NAMES[ to ] }<small>${ small }</small></button>`;

		} ).join( '' );
		// (Salt Life) the weather: the day's, or one picked (in company, for everyone here)
		const weather = [ null, ...PICK_IDS ].map( ( id ) => {

			const on = chosen === id;
			return `<button type="button" data-weather="${ id || '' }" class="${ on ? 'is-on' : '' }" aria-pressed="${ on }">${ id ? PICK_NAMES[ id ] : 'Forecast' }<small>${ id ? knots( WEATHER_WIND[ id ] ) : 'today' }</small></button>`;

		} ).join( '' );
		let body, note = '';
		if ( st.alone ) {

			body = `<button type="button" class="gm-time-hold" data-hold>${ st.held ? ICON.play : ICON.held }<span>${ st.held ? 'Let the day run' : 'Hold the clock' }</span><small>${ st.held ? 'held' : 'running' }</small></button>
				<div class="gm-time-label">Rest until</div><div class="gm-time-rest">${ rest }</div>
				<div class="gm-time-label">Weather</div><div class="gm-time-rest is-wx">${ weather }</div>`;

		} else {

			const ask = st.asks.find( ( a ) => a.to !== st.mine );
			if ( st.mine ) note = `Waiting for everyone to rest until ${ REST_NAMES[ st.mine ].toLowerCase() }. Tap it again to change your mind.`;
			else if ( ask ) note = `<b>${ esc( ask.name ) }</b> would rest until ${ REST_NAMES[ ask.to ].toLowerCase() }. Choose it too to agree.`;
			body = `<p class="gm-time-sub">Time runs for everyone here. You rest once all of you choose the same.</p>
				<div class="gm-time-label">Rest until</div><div class="gm-time-rest">${ rest }</div><p class="gm-time-note">${ note }</p>
				<div class="gm-time-label">Weather, for everyone here</div><div class="gm-time-rest is-wx">${ weather }</div>`;

		}

		const d = this.app.input.lastDevice;
		const keys = d === 'touch' ? '' : d === 'gamepad' ? 'D-pad to choose, A to take it, R3 to close' : 'T or Esc to close';
		this.menu.innerHTML = `
			<div class="gm-time-head"><b class="gm-time-now">${ timeText( st.hour, loc ) }</b><span class="gm-time-day">Day ${ st.day }</span></div>
			<p class="gm-time-sub">${ stalls }</p>
			${ wxLine ? `<p class="gm-time-sub gm-time-wx">${ wxLine }</p>${ wxSaid ? `<p class="gm-time-sub gm-time-news${ warned ? ' is-warn' : '' }">${ wxSaid }</p>` : '' }<p class="gm-time-sub">${ wxNext }</p>` : '' }
			${ body }
			${ keys ? `<div class="gm-time-foot">${ keys }</div>` : '' }`;
		const hold = this.menu.querySelector( '[data-hold]' );
		if ( hold ) hold.onclick = () => this.hold( ! st.held );
		for ( const b of this.menu.querySelectorAll( '[data-rest]' ) ) b.onclick = () => this.rest( b.dataset.rest === this.state().mine ? null : b.dataset.rest );
		for ( const b of this.menu.querySelectorAll( '[data-weather]' ) ) b.onclick = () => this.pickWeather( b.dataset.weather || null );
		const buttons = this.menu.querySelectorAll( 'button' );
		if ( focused >= 0 && buttons[ focused ] ) buttons[ focused ].focus( { preventScroll: true } );

	}

	hold( held ) {

		const t = this.app.together, s = this.app.settings;
		if ( t ) t.holdClock( held );
		else s.timeSpeed = held ? 0 : DAY_RATE;
		this.app.saveClock && this.app.saveClock();
		this._sig = '';

	}

	// (Salt Life) the weather you choose (null: the day's; in company, for everyone here); it comes in over
	// a minute or two
	pickWeather( id ) {

		const s = this.app.settings, t = this.app.together;
		// ((M13) a hurricane of your own comes in from now)
		const since = id === 'hurricane' && s.weather !== 'hurricane' ? islandTime( s.day, s.timeOfDay ) : s.weatherSince;
		if ( t ) t.setWeather( id, since );
		else {

			s.weather = id;
			s.weatherSince = since;

		}

		this.app.saveClock && this.app.saveClock();
		this._sig = '';

	}

	// on your own the world dims first and the clock moves under it; in company it's a wish (Together)
	rest( to ) {

		const t = this.app.together, s = this.app.settings;
		this._sig = '';
		if ( t && ! t.surelyAlone ) {

			t.rest( to );
			return;

		}

		if ( ! to ) return;
		this.toggle( false );
		const go = () => {

			if ( t ) t.rest( to );
			else {

				const r = restTo( s.timeOfDay, s.day, to );
				s.timeOfDay = r.hour;
				s.day = r.day;

			}

			this.app.saveClock && this.app.saveClock();

		};
		if ( this.dim() ) setTimeout( go, 230 );
		else go();

	}

	// the world dims for a moment while the clock jumps (a rest, or joining others)
	dim() {

		if ( this.app.portal && this.app.portal.reducedMotion ) return false;
		this.fade.classList.add( 'is-on' );
		clearTimeout( this._dimT );
		this._dimT = setTimeout( () => this.fade.classList.remove( 'is-on' ), 380 );
		return true;

	}

}
