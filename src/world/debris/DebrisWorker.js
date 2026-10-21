import { buildDebris, transferables } from './DebrisBuild.js';

// (Salt Life) Makes the debris off the page's thread (DebrisBuild): the input from debrisInput(),
// the output back with its arrays transferred.
self.onmessage = ( e ) => {

	try {

		const out = buildDebris( e.data );
		self.postMessage( { out }, transferables( out ) );

	} catch ( error ) {

		self.postMessage( { error: String( error && error.stack || error ) } );

	}

};
