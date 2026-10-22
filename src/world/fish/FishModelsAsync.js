import FishWorker from './FishWorker.js?worker&inline';
import { classicWorker } from '../../core/ClassicWorker.js';
import { fishModels } from './FishModels.js';

// (Salt Life) The fish's models (FishModels) built in a worker, else on the page:
//   fish.setModels( await fishModelsAsync( fish.modelNames ) )
export async function fishModelsAsync( names ) {

	try {

		return await new Promise( ( resolve, reject ) => {

			const worker = classicWorker( FishWorker );
			worker.onmessage = ( e ) => {

				worker.terminate();
				if ( e.data.error ) reject( new Error( e.data.error ) );
				else resolve( e.data.models );

			};

			worker.onerror = ( e ) => {

				worker.terminate();
				reject( e );

			};

			worker.postMessage( { names } );

		} );

	} catch ( e ) {

		console.warn( 'Fish: models built on the page (no worker)', e && e.message );
		return fishModels( names );

	}

}
