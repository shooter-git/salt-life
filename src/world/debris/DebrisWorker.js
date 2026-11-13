import { buildDebris, transferables } from './DebrisBuild.js';

// (Salt Life) Makes the debris off the page's thread (DebrisBuild): the input from debrisInput(),
// the output back with its arrays transferred.
// (M19) Or handed the input early and told when to make it ({ hold: input }, then { go: true }): its copies of the
// island's masks are then this worker's, and the page's can go as soon as the plants are placed (App.handDebris).
// If the making fails, the input goes back with the error, so the page can make it itself.
let held = null;
const make = ( input ) => {

	try {

		const out = buildDebris( input );
		self.postMessage( { out }, transferables( out ) );

	} catch ( error ) {

		self.postMessage( { error: String( error && error.stack || error ), input } );

	}

};

self.onmessage = ( e ) => {

	const d = e.data;
	if ( d && d.hold ) held = d.hold;
	else if ( d && d.go ) {

		const input = held;
		held = null;
		make( input );

	} else make( d );

};
