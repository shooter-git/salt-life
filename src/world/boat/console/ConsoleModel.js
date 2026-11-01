import { PlainBoat } from '../PlainBoat.js';

// (M16) the center console: about 23 ft, outboards and a T-top. Her size only, until she's modelled
export class ConsoleModel extends PlainBoat {

	constructor() {

		super( 'console', { length: 7, beam: 2.6, depth: 0.85, engine: { maxThrust: 7000, pitchSpeed: 22, reverseFactor: 0.45, shaftRpm: 5500 } } );

	}

}
