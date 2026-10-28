import { computeShoreField, fieldGround, shelter } from '../ShoreField.js';

// (M12) Solves another swell's shore field off the page's thread (a fast-marching solve: a few tenths
// of a second on a laptop, several on a phone): the island's own field's depths in, the new field's
// data back, transferred. (M13) At a sea level of its own (a storm surge's). (M14) Or a wind sea's, its lee
// taken out (`lee`: ShoreField.shelter).
self.onmessage = ( e ) => {

	try {

		const { ground, swellDir, seaLevel = 0, lee = false } = e.data;
		const field = computeShoreField( fieldGround( ground ), { res: ground.res, swellDir, seaLevel } );
		// ((M14) a wind sea's: its lee taken out)
		if ( lee ) shelter( field, swellDir );
		self.postMessage( { field }, [ field.data.buffer, field.depth.buffer ] );

	} catch ( error ) {

		self.postMessage( { error: String( error && error.stack || error ) } );

	}

};
