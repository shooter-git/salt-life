import { PlainBoat } from '../PlainBoat.js';

// (M16) the offshore sportfisher: about 48 ft, twin diesels. Her size only, until she's modelled
export class SportfisherModel extends PlainBoat {

	constructor() {

		super( 'sportfisher', { length: 14.6, beam: 4.8, depth: 1.45, engine: { maxThrust: 90000, pitchSpeed: 20, reverseFactor: 0.45, shaftRpm: 2300 } } );

	}

}
