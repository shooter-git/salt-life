import { PlainBoat } from '../PlainBoat.js';

// (M16) the fishing kayak: about 12 ft, paddled. Her size only, until she's modelled
export class KayakModel extends PlainBoat {

	constructor() {

		super( 'kayak', { length: 3.7, beam: 0.85, depth: 0.4, engine: { maxThrust: 220, pitchSpeed: 2.2, reverseFactor: 0.45, shaftRpm: 0 }, color: 0xc8732a } );

	}

}
