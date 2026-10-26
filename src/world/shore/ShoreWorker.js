import { computeShoreField, fieldGround } from '../ShoreField.js';

// (M12) Solves another swell's shore field off the page's thread (a fast-marching solve: a few tenths
// of a second on a laptop, several on a phone): the island's own field's depths in, the new field's
// data back, transferred.
self.onmessage = ( e ) => {

	try {

		const { ground, swellDir } = e.data;
		const field = computeShoreField( fieldGround( ground ), { res: ground.res, swellDir } );
		self.postMessage( { field }, [ field.data.buffer, field.depth.buffer ] );

	} catch ( error ) {

		self.postMessage( { error: String( error && error.stack || error ) } );

	}

};
