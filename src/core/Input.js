// Keyboard / mouse input with pointer lock, plus what All the Spaces adds: gamepads (relayed by the
// app: a creation's frame can't read them) and the on-screen touch controls (ui/TouchControls.js).
// Everything lands in the same fields Tidewater's game code reads: `keys` / `pressed` by key code
// (gamepad and touch buttons press the matching keys), `look` deltas in pixels, mouse buttons, and
// `move`, an analog stick (x right, y forward, each -1..1) for the touch joystick and gamepads.

// standard gamepad buttons -> the keys they stand for
const PAD_KEYS = {
	0: 'Space', // A: jump / swim up
	1: 'KeyE', // B: interact (board, helm, trade)
	2: 'KeyR', // X: the rod
	3: 'KeyV', // Y: boat camera
	4: 'KeyC', // LB: crouch / dive
	5: 'ShiftLeft', // RB: sprint / boost
	8: 'KeyI', // back / view: cooler and fish log
	12: 'KeyI', // d-pad up
	13: 'KeyL', // d-pad down: flashlight (at the helm: the searchlight)
	10: 'Horn', // left stick pressed: the horn, at the helm (its own code: H off the helm is the guide)
};
const PAD_LOOK = 700; // px per second at full right-stick deflection
const DEADZONE = 0.15;
const MAX_STEP = 300; // px: a mouse event moving further is spurious (see the mousemove handler)

export class Input {

	constructor( dom, { portal = null } = {} ) {

		this.dom = dom;
		this.portal = portal;
		this.keys = new Set();
		this.pressed = new Set();
		this.look = { x: 0, y: 0 };
		this.move = { x: 0, y: 0 };
		this.touchMove = { x: 0, y: 0 }; // written by the touch joystick
		this.wheel = 0;
		this.mouseDown = false;
		this.rightDown = false;
		this.locked = false;
		this.enabled = true;
		this.lastDevice = 'keyboard'; // 'keyboard' | 'touch' | 'gamepad': hints and prompts follow it
		this._virtual = new Map(); // key code -> how many virtual sources hold it (touch, pad)
		this._pad = new Set();

		window.addEventListener( 'keydown', ( e ) => {

			if ( e.target && ( e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA' ) ) return;
			if ( ! this.keys.has( e.code ) ) this.pressed.add( e.code );
			this.keys.add( e.code );
			this.lastDevice = 'keyboard';
			if ( [ 'Space', 'ArrowUp', 'ArrowDown', 'Tab' ].includes( e.code ) ) e.preventDefault();

		} );
		window.addEventListener( 'keyup', ( e ) => {

			if ( ! this._virtual.has( e.code ) ) this.keys.delete( e.code );

		} );
		window.addEventListener( 'blur', () => {

			this.keys.clear();
			this._virtual.clear();

		} );

		dom.addEventListener( 'mousedown', ( e ) => {

			if ( e.button === 0 ) this.mouseDown = true;
			if ( e.button === 2 ) this.rightDown = true;

		} );
		window.addEventListener( 'mouseup', ( e ) => {

			if ( e.button === 0 ) this.mouseDown = false;
			if ( e.button === 2 ) this.rightDown = false;

		} );
		dom.addEventListener( 'contextmenu', ( e ) => e.preventDefault() );
		window.addEventListener( 'mousemove', ( e ) => {

			// (one event moving hundreds of pixels is spurious: browsers report the cursor's jump as it
			// locks, and headless ones a jump and its return for every scripted move)
			if ( Math.abs( e.movementX ) > MAX_STEP || Math.abs( e.movementY ) > MAX_STEP ) return;
			if ( this.locked || this.mouseDown || this.rightDown ) {

				this.look.x += e.movementX;
				this.look.y += e.movementY;

			}

		} );
		dom.addEventListener( 'wheel', ( e ) => {

			this.wheel += Math.sign( e.deltaY );
			e.preventDefault();

		}, { passive: false } );

		document.addEventListener( 'pointerlockchange', () => {

			this.locked = document.pointerLockElement === dom;

		} );

	}

	requestLock() {

		// (not in a browser driven by automation, as All the Spaces' checks are: headless Chrome there
		// grows by hundreds of megabytes a minute while the pointer is locked, and draws at a third of
		// the speed; dragging with the mouse still looks around)
		if ( navigator.webdriver ) return;
		if ( ! this.locked && this.lastDevice !== 'touch' ) this.dom.requestPointerLock?.()?.catch?.( () => {} );

	}

	// a virtual source (touch button, gamepad button) holds / lets go of a key ('mouse0' / 'mouse2':
	// the left / right mouse button)
	press( code ) {

		if ( code === 'mouse0' || code === 'mouse2' ) {

			this[ code === 'mouse0' ? 'mouseDown' : 'rightDown' ] = true;
			return;

		}

		if ( ! this.keys.has( code ) ) this.pressed.add( code );
		this.keys.add( code );
		this._virtual.set( code, ( this._virtual.get( code ) || 0 ) + 1 );

	}

	release( code ) {

		if ( code === 'mouse0' || code === 'mouse2' ) {

			this[ code === 'mouse0' ? 'mouseDown' : 'rightDown' ] = false;
			return;

		}

		const n = ( this._virtual.get( code ) || 0 ) - 1;
		if ( n > 0 ) this._virtual.set( code, n );
		else {

			this._virtual.delete( code );
			this.keys.delete( code );

		}

	}

	// once per frame, before the game reads input: gamepads and the touch joystick
	update( dt ) {

		let mx = this.touchMove.x, my = this.touchMove.y;
		const pads = this.portal ? this.portal.input.gamepads() : [];
		const held = new Set();
		for ( const p of pads ) {

			const ax = p.axes[ 0 ] ?? 0, ay = p.axes[ 1 ] ?? 0;
			if ( Math.hypot( ax, ay ) > DEADZONE ) {

				mx += ax;
				my -= ay;
				this.lastDevice = 'gamepad';

			}

			const lx = p.axes[ 2 ] ?? 0, ly = p.axes[ 3 ] ?? 0;
			if ( Math.hypot( lx, ly ) > DEADZONE ) {

				this.look.x += lx * Math.abs( lx ) * PAD_LOOK * dt;
				this.look.y += ly * Math.abs( ly ) * PAD_LOOK * dt;
				this.lastDevice = 'gamepad';

			}

			for ( const [ i, code ] of Object.entries( PAD_KEYS ) ) if ( ( p.buttons[ i ] ?? 0 ) > 0.5 ) held.add( code );
			if ( ( p.buttons[ 7 ] ?? 0 ) > 0.5 ) held.add( 'mouse0' ); // right trigger: cast / reel
			if ( ( p.buttons[ 6 ] ?? 0 ) > 0.5 ) held.add( 'mouse2' ); // left trigger: reel in an empty line

		}

		for ( const code of held ) if ( ! this._pad.has( code ) ) {

			this.lastDevice = 'gamepad';
			if ( code === 'mouse0' ) this.mouseDown = true;
			else if ( code === 'mouse2' ) this.rightDown = true;
			else this.press( code );

		}

		for ( const code of this._pad ) if ( ! held.has( code ) ) {

			if ( code === 'mouse0' ) this.mouseDown = false;
			else if ( code === 'mouse2' ) this.rightDown = false;
			else this.release( code );

		}

		this._pad = held;
		const len = Math.hypot( mx, my );
		this.move.x = len > 1 ? mx / len : mx;
		this.move.y = len > 1 ? my / len : my;

	}

	// (a key pressed since the last frame counts as held for this one, even if it's already up again:
	// a quick tap still does something, also when frames are slow)
	down( code ) {

		return this.enabled && ( this.keys.has( code ) || this.pressed.has( code ) );

	}

	// true once per key press
	hit( code ) {

		return this.enabled && this.pressed.has( code );

	}

	consumeLook() {

		const l = { x: this.look.x, y: this.look.y };
		this.look.x = 0;
		this.look.y = 0;
		return l;

	}

	consumeWheel() {

		const w = this.wheel;
		this.wheel = 0;
		return w;

	}

	endFrame() {

		this.pressed.clear();

	}

}
