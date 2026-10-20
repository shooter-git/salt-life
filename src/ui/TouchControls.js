// On-screen controls for touch screens: a joystick wherever the left thumb lands, drag anywhere on
// the right to look, and buttons that follow what you're doing: the action of the moment (the
// player's prompt: "Board boat", "Take the helm"...), jump / swim up, dive, the boat camera.
// They feed core/Input.js like a keyboard and mouse would. Shown once a touch screen is in use;
// mouse and keyboard players never see them.

const STICK = 56; // joystick travel (px)
const LOOK_SPEED = 1.3; // look pixels per dragged pixel

export class TouchControls {

	constructor( input, { root = document.body } = {} ) {

		this.input = input;
		this.active = false;
		const el = this.el = document.createElement( 'div' );
		el.className = 'touch';
		el.innerHTML = /* html */`
			<div class="touch-zone touch-move"></div>
			<div class="touch-zone touch-look"></div>
			<div class="touch-stick" hidden><div class="touch-knob"></div></div>
			<div class="touch-buttons">
				<button type="button" class="touch-btn touch-action" data-key="KeyE" hidden></button>
				<button type="button" class="touch-btn touch-camera" data-key="KeyV" hidden aria-label="Boat camera">Camera</button>
				<button type="button" class="touch-btn touch-dive" data-key="KeyC" hidden aria-label="Dive">Dive</button>
				<button type="button" class="touch-btn touch-jump" data-key="Space" aria-label="Jump">Jump</button>
			</div>`;
		root.append( el );

		this.stick = el.querySelector( '.touch-stick' );
		this.knob = el.querySelector( '.touch-knob' );
		this.buttons = {
			action: el.querySelector( '.touch-action' ),
			camera: el.querySelector( '.touch-camera' ),
			dive: el.querySelector( '.touch-dive' ),
			jump: el.querySelector( '.touch-jump' ),
		};

		// the joystick
		let movePointer = null, cx = 0, cy = 0;
		const moveZone = el.querySelector( '.touch-move' );
		moveZone.addEventListener( 'pointerdown', ( e ) => {

			if ( movePointer !== null ) return;
			movePointer = e.pointerId;
			moveZone.setPointerCapture( e.pointerId );
			cx = e.clientX;
			cy = e.clientY;
			this.stick.style.left = cx + 'px';
			this.stick.style.top = cy + 'px';
			this.stick.hidden = false;
			this._setKnob( 0, 0 );
			this.input.lastDevice = 'touch';

		} );
		moveZone.addEventListener( 'pointermove', ( e ) => {

			if ( e.pointerId !== movePointer ) return;
			let dx = e.clientX - cx, dy = e.clientY - cy;
			const d = Math.hypot( dx, dy );
			if ( d > STICK ) {

				dx *= STICK / d;
				dy *= STICK / d;

			}

			this._setKnob( dx, dy );
			this.input.touchMove.x = dx / STICK;
			this.input.touchMove.y = - dy / STICK;

		} );
		const endMove = ( e ) => {

			if ( e.pointerId !== movePointer ) return;
			movePointer = null;
			this.stick.hidden = true;
			this.input.touchMove.x = this.input.touchMove.y = 0;

		};
		moveZone.addEventListener( 'pointerup', endMove );
		moveZone.addEventListener( 'pointercancel', endMove );

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

		// buttons hold their key while pressed
		for ( const b of Object.values( this.buttons ) ) {

			const key = b.dataset.key;
			let held = null;
			b.addEventListener( 'pointerdown', ( e ) => {

				e.preventDefault();
				if ( held !== null ) return;
				held = e.pointerId;
				b.setPointerCapture( e.pointerId );
				b.classList.add( 'is-down' );
				this.input.press( key );
				this.input.lastDevice = 'touch';

			} );
			const up = ( e ) => {

				if ( e.pointerId !== held ) return;
				held = null;
				b.classList.remove( 'is-down' );
				this.input.release( key );

			};
			b.addEventListener( 'pointerup', up );
			b.addEventListener( 'pointercancel', up );

		}

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

	// what the buttons offer this frame: the player's prompt ({ key, text }) and mode
	update( player ) {

		if ( ! this.active ) return;
		const prompt = player && player.prompt;
		const action = prompt && prompt.key === 'E' ? prompt.text.split( '   ·' )[ 0 ] : null;
		setButton( this.buttons.action, action );
		setButton( this.buttons.camera, player && player.mode === 'boat' ? 'Camera' : null );
		setButton( this.buttons.dive, player && player.mode === 'swim' ? 'Dive' : null );
		setButton( this.buttons.jump, prompt && prompt.key === 'Space' ? prompt.text : player && player.mode === 'swim' ? 'Swim up' : player && player.mode === 'boat' ? null : 'Jump' );

	}

}

function setButton( b, text ) {

	if ( ! text ) {

		if ( ! b.hidden ) b.hidden = true;
		return;

	}

	if ( b.hidden ) b.hidden = false;
	if ( b.textContent !== text ) b.textContent = text;

}
