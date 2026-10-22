import { fishModels, fishModelTransferables } from './FishModels.js';

// (Salt Life) Builds the fish's models off the page's thread (FishModels): their names in, the
// merged geometry back with its arrays transferred.
self.onmessage = ( e ) => {

	try {

		const models = fishModels( e.data.names );
		self.postMessage( { models }, fishModelTransferables( models ) );

	} catch ( error ) {

		self.postMessage( { error: String( error && error.stack || error ) } );

	}

};
