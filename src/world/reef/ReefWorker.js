import { TerrainData } from '../TerrainData.js';
import { ReefLayout, reefTransferables } from './ReefLayout.js';
import { noiseVolumeData } from './ReefNoise.js';

// (Salt Life) Lays out the reef off the page's thread (ReefLayout): the terrain's arrays in, the
// layout's data back with its arrays transferred, and the materials' noise volume (ReefNoise).
self.onmessage = ( e ) => {

	try {

		const terrain = Object.assign( Object.create( TerrainData.prototype ), e.data.terrain );
		const data = new ReefLayout( { terrain } ).toData();
		data.noise = noiseVolumeData();
		self.postMessage( { data }, [ ...reefTransferables( data ), data.noise.buffer ] );

	} catch ( error ) {

		self.postMessage( { error: String( error && error.stack || error ) } );

	}

};
