import { connect } from '@allthespaces/portal';
import { App } from './App.js';
import './style.css';

// Salt Life inside All the Spaces: connect to the app, build the island behind its loading veil
// (portal.progress), then say we're ready. On its own (pnpm dev, GitHub Pages) the SDK stands in for
// the app, and there's no veil: we put up our own.

const portal = await connect( {
	// version 1: Tidewater's progress shape (GameState) and the guide's seen tips
	save: { version: 1 },
} );
// On its own, the SDK's stand-in calls every device 'high'; choose as All the Spaces would (as
// Hallowed Lanterns does). ?tier= still overrides it (App.js).
if ( portal.standalone ) portal.tier = standaloneTier();

const veil = portal.standalone ? standInVeil() : null;

// report a stage, then let the page breathe before the next (synchronous) stage of work
const progress = async ( p, label ) => {

	portal.progress( p, label );
	if ( veil ) veil.show( p, label );
	performance.mark( `load: ${ label }` ); // (where the load's time goes, in a profile)
	await new Promise( ( r ) => requestAnimationFrame( () => setTimeout( r, 0 ) ) );

};

try {

	const app = new App( portal );
	window.__app = app; // console and test access
	await app.init( progress );
	portal.progress( 1, 'Ready' );
	performance.mark( 'load: ready' );
	app.start();
	if ( veil ) veil.lift();
	portal.ready();

} catch ( e ) {

	if ( veil ) veil.fail( e );
	throw e;

}

// The quality to start at on its own, chosen the way the All the Spaces app chooses it (its
// space-view quality.ts, without the advice it learns from other devices): phones at mid unless
// they say they're small, computers at high only with plenty of cores and memory.
function standaloneTier() {

	const cores = navigator.hardwareConcurrency ?? 4;
	const memory = navigator.deviceMemory ?? 4;
	if ( matchMedia( '(pointer: coarse)' ).matches ) return cores <= 2 || memory <= 2 ? 'low' : 'mid';
	return cores >= 8 && memory >= 8 ? 'high' : 'mid';

}

// The loading screen when running on its own: what's loading, how far along, and what went wrong.
function standInVeil() {

	const el = document.createElement( 'div' );
	el.style.cssText = 'position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;align-items:center;'
		+ 'justify-content:center;gap:14px;padding:16px;box-sizing:border-box;background:#0b2a3c;color:#f4f1ea;text-align:center';
	el.innerHTML = '<div style="font-size:28px;font-weight:600">Salt Life</div>'
		+ '<div style="width:min(280px,80vw);height:6px;border-radius:3px;background:rgba(244,241,234,.2);overflow:hidden">'
		+ '<div data-bar style="width:0;height:100%;background:#f4f1ea;transition:width .2s"></div></div>'
		+ '<div data-label style="opacity:.75">Loading…</div>';
	document.body.append( el );
	const bar = el.querySelector( '[data-bar]' ), text = el.querySelector( '[data-label]' );

	return {
		show( p, label ) {

			bar.style.width = `${ Math.round( p * 100 ) }%`;
			if ( label ) text.textContent = label;

		},
		lift() {

			el.remove();

		},
		fail( e ) {

			text.textContent = `Salt Life couldn't load: ${ e && e.message ? e.message : e }`;
			text.style.opacity = '1';

		},
	};

}
