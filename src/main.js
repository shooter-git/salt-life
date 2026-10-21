import { connect } from '@allthespaces/portal';
import { App } from './App.js';
import './style.css';

// Salt Life inside All the Spaces: connect to the app, build the island behind its loading veil
// (portal.progress), then say we're ready. On its own (pnpm dev) the SDK stands in for the app.

const portal = await connect( {
	// version 1: Tidewater's progress shape (GameState) and the guide's seen tips
	save: { version: 1 },
} );

// report a stage, then let the page breathe before the next (synchronous) stage of work
const progress = async ( p, label ) => {

	portal.progress( p, label );
	performance.mark( `load: ${ label }` ); // (where the load's time goes, in a profile)
	await new Promise( ( r ) => requestAnimationFrame( () => setTimeout( r, 0 ) ) );

};

const app = new App( portal );
window.__app = app; // console and test access
await app.init( progress );
portal.progress( 1, 'Ready' );
performance.mark( 'load: ready' );
app.start();
portal.ready();
