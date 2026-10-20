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
	await new Promise( ( r ) => requestAnimationFrame( () => setTimeout( r, 0 ) ) );

};

const app = new App( portal );
window.__app = app; // console and test access
await app.init( progress );
portal.progress( 1, 'Ready' );
app.start();
portal.ready();
