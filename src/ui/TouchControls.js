import { G } from '../core/Globals.js';

// On-screen controls for touch screens: a joystick wherever the left thumb lands, drag anywhere on
// the right to look, and buttons that follow what you're doing: the action of the moment (the
// player's prompt: "Board boat", "Take the helm"...), jump / swim up, dive, the boat camera, and
// the fishing: the rod, cast / strike / reel (the left mouse button's part), reel in (the right's),
// the bait for the hook, the cast net (throw / close / haul on the same big button), and the
// flashlight after dusk.
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
				<button type="button" class="touch-btn touch-reel" data-key="mouse2" hidden>Reel in</button>
				<button type="button" class="touch-btn touch-cast" data-key="mouse0" hidden>Cast</button>
				<button type="button" class="touch-btn touch-rod" data-key="KeyR" hidden>Rod</button>
				<button type="button" class="touch-btn touch-net" data-key="KeyN" hidden>Cast net</button>
				<button type="button" class="touch-btn touch-bait" data-key="KeyB" hidden>Bait</button>
				<button type="button" class="touch-btn touch-cooler" data-key="KeyI" hidden>Cooler</button>
				<button type="button" class="touch-btn touch-torch" data-key="KeyL" hidden>Torch</button>
				<button type="button" class="touch-btn touch-horn" data-key="Horn" hidden>Horn</button>
			</div>`;
		root.append( el );

		this.stick = el.querySelector( '.touch-stick' );
		this.knob = el.querySelector( '.touch-knob' );
		this.buttons = {
			action: el.querySelector( '.touch-action' ),
			camera: el.querySelector( '.touch-camera' ),
			dive: el.querySelector( '.touch-dive' ),
			jump: el.querySelector( '.touch-jump' ),
			reel: el.querySelector( '.touch-reel' ),
			cast: el.querySelector( '.touch-cast' ),
			rod: el.querySelector( '.touch-rod' ),
			net: el.querySelector( '.touch-net' ),
			bait: el.querySelector( '.touch-bait' ),
			cooler: el.querySelector( '.touch-cooler' ),
			torch: el.querySelector( '.touch-torch' ),
			horn: el.querySelector( '.touch-horn' ),
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

		// (iOS: quick taps on a button are a double-tap to zoom, and a held one brings up the text
		// magnifier, whatever touch-action says; cancelling the touches stops both, and the pointer
		// events above still come)
		for ( const type of [ 'touchstart', 'touchend' ] ) el.addEventListener( type, ( e ) => e.preventDefault(), { passive: false } );

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

	// what the buttons offer this frame: the player's prompt ({ key, text }) and mode, and the fishing
	// game's rod (game: Game, optional)
	update( player, game = null ) {

		if ( ! this.active ) return;
		const prompt = player && player.prompt;
		const rod = game && game.rod;
		const fishing = !! ( rod && rod.equipped );
		// (Salt Life) in the water the same buttons are the speargun's, then the lobster gear's; with the
		// cast net out, its
		const spearing = !! ( game && game.gun && game.gun.equipped );
		const lobstering = !! ( game && game.tools && game.tools.equipped );
		const net = game && game.net, netting = !! ( net && net.equipped );
		const swim = player && player.mode === 'swim';
		const netFree = netting && ! net.busy;
		const away = spearing ? ( game.gun.shaftOut ? null : game.tools && game.tools.owned ? 'Lobster gear' : 'Put away' ) : lobstering ? ( game.tools.busy ? null : 'Put away' ) : null;
		setButton( this.buttons.rod, fishing ? 'Put away' : away || ( ( prompt && prompt.key === 'R' ) || netFree ? ( swim ? 'Speargun' : 'Rod' ) : null ) );
		const offerNet = ! swim && ! lobstering && game && game.canFish && ! game.fight && ( ( prompt && prompt.key === 'R' ) || ( fishing && rod.state === 'idle' ) );
		setButton( this.buttons.net, netFree ? 'Put away' : ! netting && offerNet ? 'Cast net' : null );
		setButton( this.buttons.bait, fishing && rod.state === 'idle' ? 'Bait' : null );
		setButton( this.buttons.cast, fishing ? castLabel( game ) : spearing ? spearLabel( game ) : lobstering ? lobsterLabel( game ) : netting ? netLabel( game ) : null );
		setButton( this.buttons.reel, fishing && ! game.fight && ( rod.state === 'floating' || rod.state === 'flying' ) ? 'Reel in' : null );
		setButton( this.buttons.cooler, game && game.hud && ! fishing && ! spearing && ! lobstering && ! netting ? 'Cooler' : null );
		// the flashlight: offered after dusk (or while it's on)
		const lights = game && game.app && game.app.localLights;
		const torchOn = !! ( lights && lights.flashlight.on );
		// at the helm: the boat's searchlight, after dusk (or while it's on), and the horn
		const helm = player && player.mode === 'boat', app = game && game.app;
		if ( helm ) setButton( this.buttons.torch, app && ( app.searchlight || G.night.value > 0.35 ) ? ( app.searchlight ? 'Searchlight off' : 'Searchlight' ) : null );
		else setButton( this.buttons.torch, lights && ( torchOn || G.night.value > 0.35 ) ? ( torchOn ? 'Torch off' : 'Torch' ) : null );
		setButton( this.buttons.horn, helm ? 'Horn' : null );
		// ((M15) the rod's button is the radio's at the helm: R)
		if ( helm && ! player.riding ) setButton( this.buttons.rod, 'Radio' );
		const action = prompt && prompt.key === 'E' ? prompt.text.split( '   ·' )[ 0 ] : null;
		setButton( this.buttons.action, action );
		setButton( this.buttons.camera, player && player.mode === 'boat' ? 'Camera' : null );
		setButton( this.buttons.dive, player && player.mode === 'swim' ? 'Dive' : null );
		setButton( this.buttons.jump, prompt && prompt.key === 'Space' ? prompt.text : player && player.mode === 'swim' ? 'Swim up' : player && player.mode === 'boat' ? null : 'Jump' );

	}

}

// the big fishing button: hold to wind up, let go to cast; strike when a fish takes the bobber; hold to
// reel in the fight
function castLabel( game ) {

	const rod = game.rod;
	if ( game.fight ) return 'Reel';
	if ( rod.state === 'windup' ) return 'Let go';
	if ( rod.state === 'floating' ) return game.bite && game.bite.phase === 'take' ? 'Strike!' : 'Strike';
	if ( rod.state === 'idle' ) return 'Cast';
	return 'Wait';

}

// (Salt Life) the speargun's: shoot once you've dived, hold to load, hold to pull in a big fish
function spearLabel( game ) {

	const gun = game.gun;
	if ( game.spearFight ) return 'Pull';
	if ( gun.state === 'loaded' ) return ! game.submerged ? 'Dive' : gun.safety ? 'Hold fire' : 'Shoot';
	if ( gun.state === 'empty' ) return 'Load';
	if ( gun.state === 'loading' ) return 'Loading';
	return 'Wait';

}

// (Salt Life) the cast net's: hold to wind up, let go as the ring brightens; hold to draw the brails
// and haul it in. (Never hidden while it's out: a button hidden under a held thumb is never let go)
function netLabel( game ) {

	const net = game.net;
	if ( net.state === 'held' ) return 'Throw';
	if ( net.state === 'windup' ) return 'Let go';
	if ( net.state === 'sinking' ) return ! net.footprint.wet ? 'Draw in' : net.draw >= 1 ? 'Haul' : net.pulling ? 'Closing' : 'Close';
	return 'Wait';

}

// (Salt Life) the lobster gear's: hold to tickle one out of its den, tap to net it in the open
function lobsterLabel( game ) {

	const a = game.lobsterAim;
	if ( game.tools.busy ) return 'Wait';
	if ( ! game.submerged ) return 'Dive';
	if ( ! a || a.state === 'flip' || a.dist > a.reach ) return 'Wait';
	return a.state === 'den' ? 'Tickle' : 'Net';

}

function setButton( b, text ) {

	if ( ! text ) {

		if ( ! b.hidden ) b.hidden = true;
		return;

	}

	if ( b.hidden ) b.hidden = false;
	if ( b.textContent !== text ) b.textContent = text;

}
