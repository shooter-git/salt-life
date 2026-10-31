import { G } from '../core/Globals.js';
import { CONDITIONS, islandTime } from './Weather.js';
import { broadcast } from './MarineForecast.js';
import { TOW } from './Gear.js';
import { farOff } from './Units.js';

// (M15) The VHF at the helm (R, the pad's X, the Radio button; on the boat's dash its set: world/boat/Wheelhouse.js,
// its display drawn by Instruments.js from Radio.reading). Its panel has two things on it:
//   - the weather, on WX1: the coastal waters forecast (MarineForecast.js), read in a computer's voice and
//     looped, as NOAA Weather Radio's is. It goes on while you steer: its words along the bottom as it reads,
//     until you stop it or step off her. The voice is the device's own (speechSynthesis): it differs by device,
//     some have none, and it doesn't go through the game's sound; muted, or with no voice, the words alone run
//     at a reader's pace;
//   - Marta, on channel 16: her tow in, called for from wherever you are (Game.towJob( true )): what it'll
//     cost and how long she'll be, her fee by the distance (Gear.towFee). Not in a blow: she won't come out in
//     a gale (`NO_TOW`) or once a hurricane's warned of, until it's gone by.
// Keys while its panel's open: ← → picks, Enter (RT, F) does it, R (X), E (B) or Esc closes it (E doesn't
// leave the helm while it's open).
//   const r = new Radio( ui, game );   r.update( dt, inp, lDown )   r.reading -> { channel, big, mark, freq, tag, on }

const CSS = /* css */`
.rd-lcd { display: grid; grid-template-columns: 1fr auto; align-items: baseline; gap: 0 var(--tw-3); padding: var(--tw-2) var(--tw-3); margin-bottom: var(--tw-3); border-radius: var(--tw-r-sm, 6px);
	font-family: var(--tw-mono); background: #98a68e; color: #141a12; box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.45); }
.rd-lcd.is-night { background: #c9832a; color: #1f1204; }
.rd-ch { font-size: calc(26 * var(--tw-u)); font-weight: 700; letter-spacing: 0.04em; }
.rd-freq { font-size: var(--tw-fs-md); font-weight: 600; }
.rd-tag { grid-column: 1 / -1; font-size: var(--tw-fs-xs); font-weight: 600; letter-spacing: 0.1em; opacity: 0.8; }
.rd-row.is-sel { background: var(--tw-fill); box-shadow: 0 0 0 1px var(--tw-line); border-radius: var(--tw-r-sm, 6px); }
.rd-row { padding-left: var(--tw-2); padding-right: var(--tw-2); }
.rd-row small { display: block; color: var(--tw-ink-3); font-size: var(--tw-fs-sm); margin-top: 1px; }
.rd-say { margin: var(--tw-1) 0 var(--tw-2); line-height: 1.45; color: var(--tw-ink); }
.rd-words { position: absolute; left: 50%; bottom: calc(max(calc(72 * var(--tw-u)), 13vh) + calc(10 * var(--tw-u))); transform: translate(-50%, 8px); display: flex; gap: var(--tw-2); align-items: baseline;
	width: min(92vw, calc(560 * var(--tw-u))); padding: var(--tw-2) var(--tw-4); border-radius: var(--tw-r-lg); font: 500 var(--tw-fs-md) var(--tw-font); line-height: 1.4; color: var(--tw-ink);
	opacity: 0; pointer-events: none; transition: opacity var(--tw-med) var(--tw-ease), transform var(--tw-med) var(--tw-ease); }
.rd-words.is-on { opacity: 1; transform: translate(-50%, 0); }
.rd-words b { flex: none; font: 700 var(--tw-fs-xs) var(--tw-mono); letter-spacing: 0.06em; color: var(--tw-sun); }
`;

// the channels as the set shows them, and what it's tuned to when it's idle
const WX = { channel: 'WX 01', big: '01', mark: 'WX', freq: '162.550', tag: 'NOAA WEATHER' };
const CH16 = { channel: '16', big: '16', mark: '', freq: '156.800', tag: 'HAIL · DISTRESS' };
// a reader's pace with no voice (words a second), the least a line stays up, the pause between lines and
// before the broadcast comes round again (s)
const PACE = 2.6, LEAST = 2.5, BETWEEN = 0.5, ROUND = 6;
// Marta won't come out in a gale's wind where you are (m/s)
export const NO_TOW = CONDITIONS.gale.wind;
// a voice, by preference: US English, then any English, as the device has them (none: the words alone)
export function pickVoice( voices ) {

	const en = ( v ) => /^en/i.test( v.lang );
	return voices.find( ( v ) => /^en[-_]US/i.test( v.lang ) ) || voices.find( en ) || null;

}
// how long a line stays up with no voice to time it (s)
export const lineTime = ( text ) => Math.max( LEAST, text.split( /\s+/ ).length / PACE );
// how long she'll be, as she'd say it
export function towWords( seconds ) {

	const m = Math.round( seconds / 60 / 5 ) * 5;
	if ( m < 60 ) return `${ Math.max( 5, m ) } minutes`;
	const h = Math.floor( m / 60 ), rest = m - h * 60;
	return rest ? `${ h } hour${ h > 1 ? 's' : '' } ${ rest } minutes` : `${ h } hour${ h > 1 ? 's' : '' }`;

}

export class Radio {

	constructor( ui, game ) {

		this.game = game;
		const style = document.createElement( 'style' );
		style.textContent = CSS;
		document.head.append( style );
		this.panel = document.createElement( 'div' );
		this.panel.className = 'gm-panel tw-glass tw-interactive';
		ui.root.append( this.panel );
		this.words = document.createElement( 'div' );
		this.words.className = 'rd-words tw-glass';
		this.words.innerHTML = '<b>WX1</b><span></span>';
		this.wordsText = this.words.querySelector( 'span' );
		( ui.hud || ui.root ).append( this.words );
		this.open = false;
		this.listening = false; // the broadcast's on
		this.pick = 0; // the row picked (0: the weather, 1: Marta)
		this.call = null; // the call to Marta: { job, say, can }
		this.lines = [];
		this.line = - 1;
		this._wait = 0; // s until the next line, with no voice timing it (or between lines)
		this._saying = false;
		this._stuck = 0; // s a line's voice has been going
		this._round = false; // (the pause before it comes round)
		this._seq = 0; // (whose end a speech's end event is)
		this.synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
		this._noVoice = false; // (it never started or never ended: the words alone from then on)
		// (it can outlive the page, on some browsers)
		if ( typeof window !== 'undefined' ) window.addEventListener( 'pagehide', () => this._hush() );

	}

	// what the set's display shows (Instruments.js)
	get reading() {

		const c = this.call || ! ( this.listening || ( this.open && this.pick === 0 ) ) ? CH16 : WX;
		return { ...c, on: this.listening || !! this.call };

	}

	get _muted() {

		const a = this.game.app.audio;
		return !! ( a && a.muted );

	}

	get _helm() {

		const p = this.game.app.player;
		return p.mode === 'boat' && ! p.riding;

	}

	get _aboard() {

		const p = this.game.app.player;
		return ( p.mode === 'boat' || p.mode === 'deck' ) && ! p.riding;

	}

	// per frame: R at the helm, its keys while it's open, and the broadcast's words
	update( dt, inp, lDown ) {

		const hit = inp.hit( 'KeyR' );
		if ( this.open ) {

			if ( ! this._helm || hit || inp.hit( 'KeyE' ) || inp.hit( 'Escape' ) || ( this.game.hud && this.game.hud.invOpen ) ) this.close();
			else {

				if ( inp.hit( 'ArrowLeft' ) || inp.hit( 'ArrowRight' ) ) this.step( inp.hit( 'ArrowRight' ) ? 1 : - 1 );
				// (the pad's RT, not a click: a click's on its own button)
				if ( ( lDown && inp.lastDevice === 'gamepad' ) || inp.hit( 'KeyF' ) || inp.hit( 'Enter' ) || inp.hit( 'NumpadEnter' ) ) this.act();

			}

		} else if ( hit && this._helm && ! this.game.makingRoom ) this.show();

		if ( this.listening ) {

			// (stepped off her, or she's gone from under you: it's her radio)
			if ( ! this._aboard ) this.listen( false );
			else this.read( dt );

		}

	}

	show() {

		this.open = true;
		this.game.app.player.helmHeld = true;
		this.call = null;
		this.pick = this.game.towJob( true ) && this.game.state.fuelL <= 0 ? 1 : 0;
		this.draw();
		this.panel.classList.add( 'is-open' );
		try {

			if ( document.pointerLockElement && document.exitPointerLock ) document.exitPointerLock();

		} catch ( e ) { /* ignore */ }

	}

	close() {

		this.open = false;
		this.game.app.player.helmHeld = false;
		this.call = null;
		this.panel.classList.remove( 'is-open' );

	}

	step( by ) {

		const n = this.call ? ( this.call.can ? 2 : 1 ) : 2;
		this.pick = ( this.pick + by + n ) % n;
		this.draw();

	}

	act() {

		if ( this.call ) {

			if ( this.call.can && this.pick === 0 ) this.takeTow();
			else this.hangUp();

		} else if ( this.pick === 0 ) {

			this.listen( ! this.listening );
			this.close();

		} else if ( this.game.towJob( true ) ) this.callMarta();

	}

	// the call: what she says, and whether she'll come
	callMarta() {

		const g = this.game, job = g.towJob( true ), wx = g.weatherNow, news = g.app.weather && g.app.weather.news;
		if ( ! job ) return;
		const blown = wx && wx.wind >= NO_TOW, warned = news && news.stage === 'warning';
		let say, can = false;
		if ( blown || warned ) say = `Marta here. Not in this: ${ warned ? 'there\'s a hurricane on its way' : 'it\'s blowing a gale' }, and I'd not get to you. Anchor if you can, ride it out, and call me when it's blown through.`;
		else {

			const pays = Math.min( job.fee, g.state.money ), short = pays < job.fee, out = job.metres / TOW.out;
			say = `Marta here. I have you, ${ farOff( job.metres ) } off my dock. Give me ${ towWords( out ) } to get out to you, and it's ${ towWords( job.time - out ) } back in tow. That's $${ job.fee.toLocaleString() }.${ short ? ` You've only $${ pays.toLocaleString() }? I'll take that.` : '' }`;
			can = true;

		}

		this.call = { job, say, can };
		this.pick = 0;
		this.draw();

	}

	takeTow() {

		this.close();
		this.listen( false );
		this.game.tow( true );

	}

	hangUp() {

		this.call = null;
		this.pick = 1;
		this.draw();

	}

	draw() {

		const g = this.game, r = this.reading, night = G.night.value > 0.35;
		const lcd = `<div class="rd-lcd${ night ? ' is-night' : '' }"><span class="rd-ch">${ r.channel }</span><span class="rd-freq">${ r.freq }</span><span class="rd-tag">${ r.tag }</span></div>`;
		const key = ( label, k, pad ) => g.hud ? g.hud.keyed( label, k, pad ) : label;
		let list, sub;
		if ( this.call ) {

			const c = this.call;
			list = `<p class="rd-say">“${ c.say }”</p>`;
			if ( c.can ) list += `<div class="gm-shop-row rd-row${ this.pick === 0 ? ' is-sel' : '' }"><span>Tow me in<small>Back at her dock, on deck</small></span><button class="gm-btn" data-go>$${ Math.min( c.job.fee, g.state.money ).toLocaleString() }</button></div>`;
			list += `<div class="gm-shop-row rd-row${ this.pick === ( c.can ? 1 : 0 ) ? ' is-sel' : '' }"><span>${ c.can ? 'Never mind' : 'Thanks, out' }</span><button class="gm-btn is-ghost" data-back>Back</button></div>`;
			sub = 'Channel 16';

		} else {

			const job = g.towJob( true );
			list = `<div class="gm-shop-row rd-row${ this.pick === 0 ? ' is-sel' : '' }"><span>The weather, WX1<small>The forecast for the island's waters and beyond, read on a loop while you steer</small></span><button class="gm-btn" data-wx>${ this.listening ? 'Stop' : 'Listen' }</button></div>`;
			list += `<div class="gm-shop-row rd-row${ this.pick === 1 ? ' is-sel' : '' }"><span>Marta, channel 16<small>${ job ? `A tow in, from ${ farOff( job.metres ) } off her dock` : 'You\'re at her dock' }</small></span>${ job ? '<button class="gm-btn" data-call>Call</button>' : '' }</div>`;
			sub = 'The VHF at the helm';

		}

		this.panel.innerHTML = `<div class="gm-head"><h2>Radio</h2><p class="gm-sub">${ sub }</p></div>${ lcd }<div class="gm-list">${ list }</div>
			<div class="gm-foot"><span class="gm-sub">${ g.app.input.lastDevice === 'touch' ? '' : 'Pick ← →, then Enter' }</span><button class="gm-btn is-ghost" data-close>${ key( 'Close', 'R', 'X' ) }</button></div>`;
		const on = ( sel, fn ) => {

			const b = this.panel.querySelector( sel );
			if ( b ) b.onclick = fn;

		};

		on( '[data-close]', () => this.close() );
		on( '[data-wx]', () => {

			this.pick = 0;
			this.act();

		} );
		on( '[data-call]', () => this.callMarta() );
		on( '[data-go]', () => this.takeTow() );
		on( '[data-back]', () => this.hangUp() );

	}

	// the broadcast on or off
	listen( on ) {

		if ( on === this.listening ) return;
		this.listening = on;
		this.line = - 1;
		this._wait = 0;
		this._round = false;
		this._hush();
		this.words.classList.toggle( 'is-on', on );
		if ( on ) this._next();
		else this.wordsText.textContent = '';

	}

	_hush() {

		this._seq ++;
		this._saying = false;
		if ( this.synth ) try {

			this.synth.cancel();

		} catch ( e ) { /* ignore */ }

	}

	// the next line: from the top (worked out afresh, as the forecast goes on) once it's come round
	_next() {

		if ( this.line < 0 || this.line >= this.lines.length - 1 ) {

			const app = this.game.app, s = app.settings;
			this.lines = broadcast( islandTime( s.day, s.timeOfDay ), { pick: app.weatherPick ? app.weatherPick() : null, since: s.weatherSince, news: app.weather ? app.weather.news : null } );
			this.line = 0;

		} else this.line ++;

		const text = this.lines[ this.line ];
		this.wordsText.textContent = text;
		this._wait = lineTime( text );
		this._say( text );

	}

	// said by the device's voice, if it has one and the sound's on; it then times the line
	_say( text ) {

		const synth = this.synth;
		if ( ! synth || this._noVoice || this._muted || typeof SpeechSynthesisUtterance === 'undefined' ) return;
		const voices = synth.getVoices ? synth.getVoices() : [], voice = pickVoice( voices );
		if ( voices.length && ! voice ) return;
		try {

			const u = new SpeechSynthesisUtterance( text ), seq = ++ this._seq;
			u.lang = voice ? voice.lang : 'en-US';
			if ( voice ) u.voice = voice;
			u.rate = 1;
			// (as loud as the game's turned up)
			const a = this.game.app.audio;
			if ( a && Number.isFinite( a.volume ) ) u.volume = Math.min( 1, Math.max( 0, a.volume ) );
			const done = () => {

				if ( seq === this._seq ) {

					this._saying = false;
					this._wait = BETWEEN;

				}

			};
			u.onend = done;
			u.onerror = done;
			this._saying = true;
			synth.speak( u );

		} catch ( e ) {

			this._saying = false;

		}

	}

	// a frame of the broadcast
	read( dt ) {

		// (muted, its voice stops and the words run on)
		if ( this._saying && this._muted ) this._hush();
		if ( this._saying ) {

			// (a voice that never starts, or never ends (some devices): the words go on alone at the reader's pace)
			this._stuck += dt;
			if ( this._stuck < lineTime( this.lines[ this.line ] ) * 3 + 4 ) return;
			this._noVoice = true;
			this._hush();
			this._wait = 0;

		}

		this._stuck = 0;
		this._wait -= dt;
		if ( this._wait > 0 ) return;
		// (a pause, the broadcast's come round)
		if ( this.line >= this.lines.length - 1 && ! this._round ) {

			this._round = true;
			this._wait = ROUND;
			this.wordsText.textContent = '';
			this.words.classList.remove( 'is-on' );
			return;

		}

		this._round = false;
		this.words.classList.add( 'is-on' );
		this._next();

	}

}
