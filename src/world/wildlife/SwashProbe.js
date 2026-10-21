import { G } from '../../core/Globals.js';

// Where is the edge of the swash? The run-up of the waves on the sand (ShoreWaves), evaluated at a
// few points (the shorebirds) with the same model the water uses.
//
// Per point: run-up of the current wave Rt and the point's own "inland" distance (both in metres
// up the beach, measured with the nominal beach slope), the speed of the leading edge (dRt/dt,
// > 0 while the water runs up) and the phase of the swash cycle.
//
// Salt Life: on the CPU (ShoreWaves.swash), every `interval` frames; Tidewater ran a compute kernel
// and read the results back 1-3 frames later. The same interface: set / clear / update / get.

export class SwashProbe {

	// terrain: TerrainData (heightAt)
	constructor( { shore, terrain, count = 32, interval = 6 } ) {

		this.shore = shore;
		this.terrain = terrain;
		this.n = count;
		this.interval = interval; // frames between evaluations (the owner extrapolates in between)
		this._frame = 0;
		this.inputs = new Float32Array( count * 4 );
		this.cpu = new Float32Array( count * 4 );
		this.valid = false;
		this.issued = new Float32Array( count * 4 ); // inputs of the latest result
		this.resultTime = 0;
		this.active = false;
		this._sw = {};

	}

	set( i, x, z ) {

		const o = i * 4;
		this.inputs[ o ] = x;
		this.inputs[ o + 1 ] = z;
		this.inputs[ o + 3 ] = 1;
		this.active = true;

	}

	clear( i ) {

		this.inputs[ i * 4 + 3 ] = 0;

	}

	update() {

		if ( ! this.active ) return;
		this.active = false;
		if ( ( this._frame ++ ) % this.interval !== 0 ) return;
		const t = G.time.value, sw = this._sw;
		for ( let i = 0; i < this.n; i ++ ) {

			const o = i * 4;
			if ( this.inputs[ o + 3 ] < 0.5 ) continue;
			const x = this.inputs[ o ], z = this.inputs[ o + 1 ];
			this.shore.swash( x, z, t, this.terrain.heightAt( x, z ), sw );
			this.cpu[ o ] = sw.runup;
			this.cpu[ o + 1 ] = sw.inland;
			this.cpu[ o + 2 ] = sw.dRdt;
			this.cpu[ o + 3 ] = sw.tau;

		}

		this.issued.set( this.inputs );
		this.resultTime = t;
		this.valid = true;

	}

	// latest result for point i: { runup, inland, speed, tau, age } (null until one arrives)
	get( i, out ) {

		if ( ! this.valid || this.issued[ i * 4 + 3 ] < 0.5 ) return null;
		const c = this.cpu, o = i * 4;
		const period = Math.max( this.shore.params.period, 1 );
		const age = G.time.value - this.resultTime;
		const tau = c[ o + 3 ] + age / period;
		out.inland = c[ o + 1 ];
		out.x = this.issued[ o ];
		out.z = this.issued[ o + 1 ];
		out.age = age;
		if ( tau < 1 ) {

			out.runup = c[ o ] + c[ o + 2 ] * age;
			out.speed = c[ o + 2 ];

		} else {

			// the next wave has reached the shoreline since: its edge races up the beach
			const t = ( tau - 1 ) * period;
			out.speed = 3.2 * Math.max( 0.2, 1 - t / 3 );
			out.runup = 0.35 + 3.2 * t * ( 1 - t / 6 );

		}

		out.tau = tau % 1;
		return out;

	}

}
