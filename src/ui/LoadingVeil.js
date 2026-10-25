import './loading-veil.css';

// The loading screen when Salt Life runs on its own (pnpm dev, GitHub Pages): inside All the Spaces
// the app's own veil covers the load. The island at sunrise, the sea running, and a float riding the
// line as far as the load has got. Everything that moves is a transform or an opacity, so it keeps
// moving while the page is busy building the island.

const TIPS = [
	'Joe chalks the fish he’s after on his counter each morning, and pays over the odds for them.',
	'Marta’s chandlery has better rods, reels and spearguns, and diesel for the boat.',
	'With a speargun, stalk slowly: the fish notice you.',
	'After dark the tarpon gather under the pier lights.',
	'Drop the anchor, or the wind will take your boat. Marta tows her home if she gets away.',
	'Every day brings its own weather: calm, breezy, blustery, now and then a gale.',
	'A cast net from the beach or the pier brings in mullet and bait.',
	'Protected fish are let go, and nobody spears the reef’s aquarium fish.',
	'On your own you can rest until dawn, noon, dusk or night: press T, or tap the clock.',
	'Each week a mainland restaurant orders one kind of fish through Joe.',
];

const SVG = `
<svg class="slv-island" viewBox="0 -10 400 100" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
	<path d="M0 90 C40 82 70 70 110 64 C150 58 170 40 205 38 C240 36 262 54 292 60 C330 68 365 80 400 90 Z"/>
	<path d="M196 40 C198 26 203 14 212 2" fill="none" stroke-width="3.2" stroke-linecap="round"/>
	<path d="M212 3 C200 -1 188 4 180 12 C192 6 202 6 212 5 Z"/>
	<path d="M212 3 C224 -2 238 2 246 10 C234 5 222 5 212 5 Z"/>
	<path d="M212 3 C206 8 200 18 199 28 C204 18 208 11 213 6 Z"/>
	<path d="M212 3 C220 8 226 17 228 27 C222 18 217 11 212 6 Z"/>
	<path d="M212 3 C204 0 194 -6 186 -6 C196 -2 204 2 212 5 Z"/>
	<path d="M236 50 C237 42 240 35 245 29" fill="none" stroke-width="2.2" stroke-linecap="round"/>
	<path d="M245 29 C238 26 230 29 225 34 C232 31 238 31 245 31 Z"/>
	<path d="M245 29 C252 26 260 28 265 33 C258 30 251 30 245 31 Z"/>
	<path d="M245 29 C241 33 238 39 238 45 C241 39 243 35 246 31 Z"/>
	<path d="M110 66 L110 50 L126 44 L142 50 L142 62 Z"/>
	<path d="M300 61 L300 72" fill="none" stroke-width="1.6"/>
	<path d="M300 61 L318 70 L300 70 Z"/>
</svg>`;

const SEA = `<div class="slv-sea">
	<div class="slv-glint"></div>
	<div class="slv-swell slv-swell-1"></div>
	<div class="slv-swell slv-swell-2"></div>
	<div class="slv-swell slv-swell-3"></div>
</div>`;

export class LoadingVeil {

	constructor() {

		const el = this.el = document.createElement( 'div' );
		el.className = 'slv';
		el.setAttribute( 'role', 'progressbar' );
		el.setAttribute( 'aria-label', 'Loading Salt Life' );
		el.setAttribute( 'aria-valuemin', '0' );
		el.setAttribute( 'aria-valuemax', '100' );
		el.innerHTML = `
			<div class="slv-sky"><div class="slv-sun"></div><div class="slv-gull slv-gull-1"></div><div class="slv-gull slv-gull-2"></div></div>
			${ SVG }
			${ SEA }
			<div class="slv-card">
				<h1 class="slv-title">Salt Life</h1>
				<p class="slv-sub">An island fishing game</p>
				<div class="slv-line" aria-hidden="true">
					<div class="slv-taut"></div>
					<div class="slv-ride"><div class="slv-float"><i></i></div></div>
				</div>
				<p class="slv-status"><span class="slv-label">Casting off</span><span class="slv-pct">0%</span></p>
				<p class="slv-tip"></p>
			</div>`;
		document.body.append( el );
		this.label = el.querySelector( '.slv-label' );
		this.pct = el.querySelector( '.slv-pct' );
		this.tip = el.querySelector( '.slv-tip' );
		this.card = el.querySelector( '.slv-card' );

		// the tips, one at a time from a random one
		this._tip = Math.floor( Math.random() * TIPS.length );
		this._showTip();
		this._tips = setInterval( () => this._showTip(), 6000 );

	}

	_showTip() {

		const tip = this.tip;
		tip.classList.remove( 'is-in' );
		setTimeout( () => {

			tip.textContent = TIPS[ this._tip ++ % TIPS.length ];
			tip.classList.add( 'is-in' );

		}, 350 );

	}

	show( p, label ) {

		const v = Math.max( 0, Math.min( 1, p ) );
		this.el.style.setProperty( '--p', v.toFixed( 3 ) );
		this.el.setAttribute( 'aria-valuenow', String( Math.round( v * 100 ) ) );
		this.pct.textContent = `${ Math.round( v * 100 ) }%`;
		if ( label ) this.label.textContent = label;

	}

	lift() {

		clearInterval( this._tips );
		this.show( 1, 'Ready' );
		this.el.classList.add( 'is-lifting' );
		const done = () => this.el.remove();
		this.el.addEventListener( 'transitionend', ( e ) => e.target === this.el && done() );
		setTimeout( done, 1500 ); // (in case the transition never runs)

	}

	fail( e ) {

		clearInterval( this._tips );
		this.el.classList.add( 'is-failed' );
		this.label.textContent = 'The island couldn’t be loaded';
		this.pct.textContent = '';
		this.tip.classList.add( 'is-in' );
		this.tip.textContent = e && e.message ? e.message : String( e );
		const again = document.createElement( 'button' );
		again.className = 'slv-again';
		again.type = 'button';
		again.textContent = 'Try again';
		again.addEventListener( 'click', () => location.reload() );
		this.card.append( again );

	}

}
