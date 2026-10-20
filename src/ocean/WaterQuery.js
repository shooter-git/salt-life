import { G } from '../core/Globals.js';

export const MAX_QUERIES = 64;

// Water surface queries, on the CPU.
//   - slot 0 is always the camera (the underwater view switches on it)
//   - other slots are gameplay points (boat hull samples, swimmer, bobber...)
// Tidewater evaluated these on the GPU and read them back 1-3 frames later; here they are evaluated
// from the same waves the GPU draws (Waves), synchronously in update(). The API is unchanged:
// `cpu[ slot * 4 ] = ( height, nx, nz, sea floor )`, `cpuValid`, and `version` / `resultTime` /
// `resultInputs` / `latency` for the boat, which integrates between results.
export class WaterQuery {

	constructor( waves, terrain = null ) {

		this.waves = waves;
		this.terrain = terrain;
		this.inputs = new Float32Array( MAX_QUERIES * 4 );
		this.count = 1;
		this.cpu = new Float32Array( MAX_QUERIES * 4 );
		this.cpuValid = false;
		this.version = 0;
		this.resultTime = 0;
		this.resultInputs = new Float32Array( MAX_QUERIES * 4 );
		this.latency = 0; // s: results describe this frame (the boat leads its samples by this much)
		this.slots = new Map();

	}

	setCamera( x, z ) {

		this.inputs[ 0 ] = x;
		this.inputs[ 1 ] = z;

	}

	// allocate named slots (e.g. 'boat' -> 24 points). Returns the first index.
	allocate( name, n ) {

		if ( this.slots.has( name ) ) return this.slots.get( name ).start;
		const start = this.count;
		if ( start + n > MAX_QUERIES ) throw new Error( 'WaterQuery: out of slots' );
		this.slots.set( name, { start, n } );
		this.count += n;
		return start;

	}

	setPoint( i, x, z ) {

		this.inputs[ i * 4 ] = x;
		this.inputs[ i * 4 + 1 ] = z;

	}

	// last results: { height, nx, nz, floor }
	get( i, out = {} ) {

		const c = this.cpu;
		out.height = c[ i * 4 ];
		out.nx = c[ i * 4 + 1 ];
		out.nz = c[ i * 4 + 2 ];
		out.floor = c[ i * 4 + 3 ];
		return out;

	}

	update() {

		const t = G.time.value;
		const W = this.waves, e = 0.35;
		for ( let i = 0; i < this.count; i ++ ) {

			const x = this.inputs[ i * 4 ], z = this.inputs[ i * 4 + 1 ];
			const h = W.heightAt( x, z, t );
			const hx = W.heightAt( x + e, z, t );
			const hz = W.heightAt( x, z + e, t );
			const nx = ( h - hx ) / e, nz = ( h - hz ) / e;
			const len = Math.hypot( nx, 1, nz );
			this.cpu[ i * 4 ] = h;
			this.cpu[ i * 4 + 1 ] = nx / len;
			this.cpu[ i * 4 + 2 ] = nz / len;
			this.cpu[ i * 4 + 3 ] = this.terrain ? this.terrain.heightAt( x, z ) : - 500;

		}

		this.resultInputs.set( this.inputs );
		this.resultTime = t;
		this.cpuValid = true;
		this.version ++;

	}

}
