import { connect } from '@allthespaces/portal';
import { LoadingVeil } from './ui/LoadingVeil.js';
import './style.css';

// Salt Life inside All the Spaces: connect to the app, build the island behind its loading veil
// (portal.progress), then say we're ready. On its own (pnpm dev, GitHub Pages) the SDK stands in for
// the app, and there's no veil: we put up our own (ui/LoadingVeil.js), at once, while the game itself
// (App.js and all it brings, most of the download) is still on its way.

const alone = window.parent === window;
let veil = alone ? new LoadingVeil() : null;
veil?.show( 0.02, 'Fetching the game' );
// ((M15) ?readout on its own: what the game's using as you play, its watches set before anything's drawn
// or heard: ui/Readout.js)
const readout = alone && new URLSearchParams( location.search ).has( 'readout' ) ? await import( './ui/Readout.js' ) : null;
readout?.installProbes();

try {

	const [ portal, { App } ] = await Promise.all( [
		connect( {
			// version 1: Tidewater's progress shape (GameState) and the guide's seen tips
			save: { version: 1 },
		} ),
		import( './App.js' ),
	] );
	// (framed, but no app answered: the SDK stood in after a moment)
	if ( portal.standalone && ! veil ) veil = new LoadingVeil();
	// On its own, the SDK's stand-in calls every device 'high'; choose as All the Spaces would (as
	// Hallowed Lanterns does). ?tier= still overrides it (App.js).
	if ( portal.standalone ) portal.tier = standaloneTier();

	// report a stage, then let the page breathe before the next (synchronous) stage of work
	const progress = async ( p, label ) => {

		portal.progress( p, label );
		veil?.show( p, label );
		performance.mark( `load: ${ label }` ); // (where the load's time goes, in a profile)
		await new Promise( ( r ) => requestAnimationFrame( () => setTimeout( r, 0 ) ) );

	};

	const app = new App( portal );
	window.__app = app; // console and test access
	await app.init( progress );
	portal.progress( 1, 'Ready' );
	performance.mark( 'load: ready' );
	app.start();
	veil?.lift();
	portal.ready();
	if ( readout ) new readout.Readout( { app } );

} catch ( e ) {

	veil?.fail( e );
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
