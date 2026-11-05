import { ACTIONS, offers } from './Actions.js';
import { iconSvg, iconFor, promptIcon } from './ActionIcons.js';

// On-screen controls for touch screens: a joystick wherever the left thumb lands, drag anywhere on the right to look,
// and under the right thumb what's used every few seconds, as pictures (ActionIcons.js): the big button is the left
// mouse button's part (cast / strike / reel, shoot, throw the net...) with its word under the picture, or jump when
// there's none; round it jump / swim up, dive, reel in, run at the helm; and the actions wheel's button
// (ActionWheel.js: the rod, the cast net, bait, rig, leader, cooler, torch, horn, camera). Over them, the gold button:
// what the player's prompt says ("Board boat", "Take the helm", "Take out the rod"...), its picture and its words.
// (Actions.js says what's offered.) They feed core/Input.js like a keyboard and mouse would. Shown once a touch screen
// is in use; mouse and keyboard players never see them.

const STICK = 56; // joystick travel (px)
const RUN_PAST = 1.35; // ((v2.1.1) of it: a thumb pushed out past the ring runs, as Shift does)
const LOOK_SPEED = 1.3; // look pixels per dragged pixel
// the thumb's buttons, and the slots round the big one they can take: p0 the big one in the corner, p1 left of it,
// p2 up and left, p3 above (style.css)
const THUMB = [ 'use', 'jump', 'dive', 'reel', 'run' ];

export class TouchControls {

	constructor( input, { root = document.body, wheel = null } = {} ) {

		this.input = input;
		this.wheel = wheel; // (ActionWheel, set by the app)
		this.active = false;
		const el = this.el = document.createElement( 'div' );
		el.className = 'touch';
		const btn = ( id, cls = '' ) => `<button type="button" class="touch-btn touch-${ id }${ cls }" data-key="${ ACTIONS[ id ].key }" tabindex="-1" hidden><span class="touch-ico"></span></button>`;
		el.innerHTML = /* html */`
			<div class="touch-zone touch-move"></div>
			<div class="touch-zone touch-look"></div>
			<div class="touch-stick" hidden><div class="touch-knob"></div></div>
			<div class="touch-buttons">
				<button type="button" class="touch-btn touch-action" data-key="KeyE" tabindex="-1" hidden><span class="touch-ico"></span><span class="touch-label"></span></button>
				<button type="button" class="touch-btn touch-use" data-key="mouse0" tabindex="-1" hidden><span class="touch-ico"></span><span class="touch-cap"></span></button>
				${ btn( 'jump' ) }${ btn( 'dive' ) }${ btn( 'reel' ) }${ btn( 'run' ) }
				<button type="button" class="touch-btn touch-wheel" tabindex="-1" aria-label="Actions" aria-haspopup="menu"><span class="touch-ico">${ iconSvg( 'wheel' ) }</span></button>
			</div>`;
		root.append( el );

		this.stick = el.querySelector( '.touch-stick' );
		this.knob = el.querySelector( '.touch-knob' );
		this.cluster = el.querySelector( '.touch-buttons' );
		this.buttons = { action: el.querySelector( '.touch-action' ) };
		for ( const id of THUMB ) this.buttons[ id ] = el.querySelector( `.touch-${ id }` );
		this.wheelBtn = el.querySelector( '.touch-wheel' );
		this.offer = {};
		this._layout = '';

		// the joystick
		let movePointer = null, cx = 0, cy = 0;
		const moveZone = el.querySelector( '.touch-move' );
		const endStick = () => {

			movePointer = null;
			this.stick.hidden = true;
			this.stick.classList.remove( 'is-run' );
			this.input.touchRun = false;
			this.input.touchMove.x = this.input.touchMove.y = 0;

		};
		// (a thumb put down here takes the stick even while it's thought held: an iPhone now and then never says a
		// thumb was lifted, and the stick stayed pushed, deaf to the next thumb, till a reload)
		moveZone.addEventListener( 'pointerdown', ( e ) => {

			movePointer = e.pointerId;
			moveZone.setPointerCapture( e.pointerId );
			cx = e.clientX;
			cy = e.clientY;
			this.stick.style.left = cx + 'px';
			this.stick.style.top = cy + 'px';
			this.stick.hidden = false;
			this.stick.classList.remove( 'is-run' );
			this._setKnob( 0, 0 );
			this.input.touchRun = false;
			this.input.touchMove.x = this.input.touchMove.y = 0;
			this.input.lastDevice = 'touch';

		} );
		moveZone.addEventListener( 'pointermove', ( e ) => {

			if ( e.pointerId !== movePointer ) return;
			let dx = e.clientX - cx, dy = e.clientY - cy;
			const d = Math.hypot( dx, dy ), run = d > STICK * RUN_PAST;
			if ( run !== this.input.touchRun ) this.stick.classList.toggle( 'is-run', run );
			this.input.touchRun = run;
			if ( d > STICK ) {

				dx *= STICK / d;
				dy *= STICK / d;

			}

			this._setKnob( dx, dy );
			this.input.touchMove.x = dx / STICK;
			this.input.touchMove.y = - dy / STICK;

		} );
		const endMove = ( e ) => {

			if ( e.pointerId === movePointer ) endStick();

		};
		moveZone.addEventListener( 'pointerup', endMove );
		moveZone.addEventListener( 'pointercancel', endMove );
		moveZone.addEventListener( 'lostpointercapture', endMove );

		// looking around
		const lookZone = el.querySelector( '.touch-look' );
		const lookers = new Map();
		lookZone.addEventListener( 'pointerdown', ( e ) => {

			lookZone.setPointerCapture( e.pointerId );
			lookers.set( e.pointerId, { x: e.clientX, y: e.clientY } );
			this.input.lastDevice = 'touch';

		} );
		lookZone.addEventListener( 'pointermove', ( e ) => {

			const p = lookers.get( e.pointerId );
			if ( ! p ) return;
			this.input.look.x += ( e.clientX - p.x ) * LOOK_SPEED;
			this.input.look.y += ( e.clientY - p.y ) * LOOK_SPEED;
			p.x = e.clientX;
			p.y = e.clientY;

		} );
		const endLook = ( e ) => lookers.delete( e.pointerId );
		lookZone.addEventListener( 'pointerup', endLook );
		lookZone.addEventListener( 'pointercancel', endLook );
		lookZone.addEventListener( 'lostpointercapture', endLook );

		// buttons hold their key while pressed (the gold one's key is the prompt's: data-key)
		const letGos = [];
		for ( const b of Object.values( this.buttons ) ) {

			let held = null, key = null;
			b.addEventListener( 'pointerdown', ( e ) => {

				e.preventDefault();
				if ( held !== null ) return;
				held = e.pointerId;
				key = b.dataset.key;
				b.setPointerCapture( e.pointerId );
				b.classList.add( 'is-down' );
				this.input.press( key );
				this.input.lastDevice = 'touch';

			} );
			const letGo = () => {

				if ( held === null ) return;
				held = null;
				b.classList.remove( 'is-down' );
				this.input.release( key );

			};
			const up = ( e ) => {

				if ( e.pointerId === held ) letGo();

			};
			letGos.push( letGo );
			b.addEventListener( 'pointerup', up );
			b.addEventListener( 'pointercancel', up );
			// (a button hidden under a held thumb loses it, and never hears it lifted)
			b.addEventListener( 'lostpointercapture', up );

		}

		// the actions wheel: tap to open it and tap a picture, or press here and slide to one and let go
		this.wheelBtn.addEventListener( 'pointerdown', ( e ) => {

			e.preventDefault();
			this.input.lastDevice = 'touch';
			if ( ! this.wheel ) return;
			if ( this.wheel.open ) {

				this.wheel.toggle( false );
				return;

			}

			this.wheel.toggle( true );
			this.wheel.slideFrom( this.wheelBtn, e );

		} );

		// (iOS: quick taps on a button are a double-tap to zoom, and a held one brings up the text
		// magnifier, whatever touch-action says; cancelling the touches stops both, and the pointer
		// events above still come)
		for ( const type of [ 'touchstart', 'touchend' ] ) el.addEventListener( type, ( e ) => e.preventDefault(), { passive: false } );

		// (nothing left on the screen, or the game put away: the stick, the looks and the held buttons all let go,
		// whatever lifting was lost. The touches' own events say it when a pointer's don't)
		const letGoAll = () => {

			if ( movePointer !== null ) endStick();
			lookers.clear();
			for ( const f of letGos ) f();

		};
		for ( const type of [ 'touchend', 'touchcancel' ] ) {

			window.addEventListener( type, ( e ) => {

				if ( ! e.touches || e.touches.length === 0 ) letGoAll();

			}, { capture: true, passive: true } );

		}

		window.addEventListener( 'blur', letGoAll );
		window.addEventListener( 'pagehide', letGoAll );
		document.addEventListener( 'visibilitychange', () => {

			if ( document.hidden ) letGoAll();

		} );

		// any touch turns them on (a laptop with a touch screen too)
		window.addEventListener( 'pointerdown', ( e ) => {

			if ( e.pointerType === 'touch' ) this.show( true );

		}, { capture: true } );

	}

	show( on ) {

		if ( this.active === on ) return;
		this.active = on;
		this.el.classList.toggle( 'is-on', on );
		if ( on ) this.input.lastDevice = 'touch';

	}

	_setKnob( dx, dy ) {

		this.knob.style.transform = `translate(${ dx }px, ${ dy }px)`;

	}

	// what the buttons offer this frame (Actions.js): the player's prompt and mode, and the fishing game's
	// (game: Game, optional)
	update( player, game = null ) {

		if ( ! this.active ) return;
		const o = offers( player, game, this.offer );
		const B = this.buttons;
		// the big button: the left mouse button's part, its word under its picture ('Strike!' lit)
		const use = B.use;
		setButton( use, o.use, iconFor( o.use ) );
		if ( o.use ) {

			const cap = use.lastChild;
			if ( cap.textContent !== o.use ) cap.textContent = o.use;
			use.classList.toggle( 'is-hot', o.use === 'Strike!' );

		}

		setButton( B.jump, o.jump, iconFor( o.jump ) );
		setButton( B.dive, o.dive, 'dive' );
		setButton( B.reel, o.reel, 'reelin' );
		setButton( B.run, o.run, 'run' );
		// the gold button: the prompt, its picture and its words, and its key (E, or R for the rod)
		const a = B.action;
		setButton( a, o.action, o.action && promptIcon( o.action ) );
		if ( o.action ) {

			const label = a.lastChild;
			if ( label.textContent !== o.action ) label.textContent = o.action;
			// (not while it's held: it lets go of the key it pressed)
			if ( a.dataset.key !== o.actionKey && ! a.classList.contains( 'is-down' ) ) a.dataset.key = o.actionKey;

		}

		// the slots: the big one's the left mouse button's part, or jump; the rest in turn round it, the wheel's button
		// above (or in the corner when there's nothing there)
		const shown = THUMB.filter( ( id ) => o[ id ] );
		const big = o.use ? 'use' : o.jump ? 'jump' : null;
		const rest = shown.filter( ( id ) => id !== big );
		let layout = '';
		if ( big ) layout += `${ big }:0 `;
		rest.forEach( ( id, i ) => layout += `${ id }:${ Math.min( i + 1, 2 ) } ` );
		layout += big ? 'wheel:3' : 'wheel:0';
		if ( layout !== this._layout ) {

			this._layout = layout;
			for ( const b of [ ...Object.values( B ), this.wheelBtn ] ) b.classList.remove( 'is-p0', 'is-p1', 'is-p2', 'is-p3' );
			for ( const part of layout.split( ' ' ) ) {

				const [ id, slot ] = part.split( ':' );
				( id === 'wheel' ? this.wheelBtn : B[ id ] ).classList.add( `is-p${ slot }` );

			}

			// (the gold button over the highest of them upright, beside the lowest row on its side: style.css)
			this.cluster.dataset.top = big ? 'p3' : rest.length > 1 ? 'p2' : 'p0';
			this.cluster.dataset.side = rest.length ? 'p1' : 'p0';

		}

		this.wheelBtn.classList.toggle( 'is-open', !! ( this.wheel && this.wheel.open ) );

	}

}

function setButton( b, text, icon ) {

	if ( ! text ) {

		if ( ! b.hidden ) b.hidden = true;
		return;

	}

	if ( b.hidden ) b.hidden = false;
	if ( b.dataset.icon !== icon ) {

		b.dataset.icon = icon;
		b.firstChild.innerHTML = iconSvg( icon );

	}

	if ( b.getAttribute( 'aria-label' ) !== text ) b.setAttribute( 'aria-label', text );

}
