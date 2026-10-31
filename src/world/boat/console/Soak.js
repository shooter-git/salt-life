import { G } from '../../../core/Globals.js';

// (M16) Getting soaked: she's no cabin. Out in a squall on her open deck you're wet through in half a minute; under the T-top
// you keep dry, unless you're running flat out and it's driving in under it. Pure, for the tests. Game feeds it each frame and
// says what it comes to:
//   const soak = new Soak();  soak.step( dt, rain 0..1, covered, speed m/s )  soak.wet 0..1, soak.drain() -> 'soaked' | 'dry' | null
// wet shows as drops running down your view (SoakView); and when you're wet through, you're told.

// how fast you're wetted, of all the way, a second: in a full downpour, with nothing over you; and drying off in air
const IN_DOWNPOUR = 1 / 18, DRYING = 1 / 180;
// past this speed under cover the rain's driven in (m/s: from 12 kn, all of it at 35)
const DRIVEN = [ 6, 18 ];

export function soakRate( rain, covered, speed ) {

	const r = Math.max( 0, Math.min( 1, rain ) );
	if ( r <= 0.01 ) return 0;
	const t = Math.max( 0, Math.min( 1, ( speed - DRIVEN[ 0 ] ) / ( DRIVEN[ 1 ] - DRIVEN[ 0 ] ) ) );
	const open = covered ? 0.06 + 0.5 * t : 1;
	return IN_DOWNPOUR * Math.pow( r, 0.7 ) * open;

}

export class Soak {

	constructor() {

		this.wet = 0;
		this._told = false;
		this._said = null;

	}

	step( dt, rain, covered, speed ) {

		const up = soakRate( rain, covered, speed );
		this.wet = up > 0 ? Math.min( 1, this.wet + up * dt ) : Math.max( 0, this.wet - DRYING * dt );
		if ( ! this._told && this.wet >= 0.7 ) {

			this._told = true;
			this._said = 'soaked';

		} else if ( this._told && this.wet <= 0.15 ) {

			this._told = false;
			this._said = 'dry';

		}

	}

	drain() {

		const s = this._said;
		this._said = null;
		return s;

	}

}

// the drops on your view: one tile of them, drawn once, sliding down the screen by CSS (nothing for the frame to do), as
// clear as it's soaked you and as hard as it's raining
class SoakView {

	constructor() {

		const S = 512, c = document.createElement( 'canvas' );
		c.width = c.height = S;
		const g = c.getContext( '2d' );
		let seed = 7;
		const rnd = () => ( seed = ( seed * 16807 ) % 2147483647 ) / 2147483647;
		for ( let i = 0; i < 130; i ++ ) {

			const x = rnd() * S, y = rnd() * S, r = 1.5 + rnd() * rnd() * 11, long = 1 + rnd() * 1.6;
			for ( const [ dx, dy ] of [ [ 0, 0 ], [ S, 0 ], [ - S, 0 ], [ 0, S ], [ 0, - S ] ] ) {

				// a drop: the sky's light gathered at its foot, its head dark, a bright speck on it
				g.save();
				g.translate( x + dx, y + dy );
				g.scale( 1, long );
				const a = g.createRadialGradient( 0, r * 0.35, r * 0.1, 0, 0, r );
				a.addColorStop( 0, 'rgba(235,245,255,0.5)' );
				a.addColorStop( 0.65, 'rgba(190,210,225,0.2)' );
				a.addColorStop( 0.92, 'rgba(20,30,40,0.34)' );
				a.addColorStop( 1, 'rgba(20,30,40,0)' );
				g.fillStyle = a;
				g.beginPath();
				g.arc( 0, 0, r, 0, Math.PI * 2 );
				g.fill();
				g.fillStyle = 'rgba(255,255,255,0.7)';
				g.beginPath();
				g.arc( - r * 0.28, - r * 0.32, Math.max( 0.5, r * 0.11 ), 0, Math.PI * 2 );
				g.fill();
				g.restore();

			}

		}

		const el = this.el = document.createElement( 'div' );
		el.className = 'gm-soak';
		el.style.cssText = `position:fixed;inset:0;z-index:4;pointer-events:none;opacity:0;background-image:url(${ c.toDataURL( 'image/png' ) });background-size:${ S }px ${ S }px;animation:gm-soak-run 14s linear infinite`;
		const style = document.createElement( 'style' );
		style.textContent = `@keyframes gm-soak-run { from { background-position: 0 0; } to { background-position: 0 ${ S }px; } }`;
		document.head.appendChild( style );
		document.body.appendChild( el );
		this.level = 0;

	}

	set( level ) {

		if ( Math.abs( level - this.level ) < 0.01 ) return;
		this.level = level;
		this.el.style.opacity = level.toFixed( 2 );
		this.el.style.display = level > 0.005 ? '' : 'none';

	}

}

// each frame, from Game: for a boat with no cabin (one that says what's under her top)
export function soakStep( game, dt ) {

	const app = game.app, p = app.player, m = app.boat;
	if ( ! m || ! m.underTop ) {

		if ( game._soakView ) game._soakView.set( 0 );
		return;

	}

	const soak = game.soak || ( game.soak = new Soak() ), rain = G.rain.value, aboard = ( p.mode === 'deck' || p.mode === 'boat' ) && ! p.riding;
	const here = aboard ? ( p.mode === 'boat' ? m.helmEye : p.deckPos ) : null;
	const covered = aboard ? m.underTop( here.x, p.mode === 'boat' ? here.y : here.y + 1.5, here.z ) : false;
	soak.step( dt, aboard ? rain : 0, covered, aboard ? app.boatCtl.speed : 0 );
	const said = soak.drain();
	if ( said === 'soaked' ) game.toast( m.fitted.tTop ? 'You\'re soaked through. Get in under the T-top.' : 'You\'re soaked through. She\'s got no cover: run for home.', 4200 );
	if ( ! aboard && ! game._soakView ) return;
	const view = game._soakView || ( game._soakView = new SoakView() );
	// (under the top, or with no rain falling, you've wiped your eyes)
	view.set( aboard ? Math.min( 1, soak.wet * 1.2 ) * Math.min( 1, rain * 1.6 ) * ( covered ? 0.2 : 1 ) : 0 );

}
