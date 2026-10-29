import { G } from '../core/Globals.js';
import { seaCaveCalm } from '../world/terrain/CaveLight.js';

export const MAX_QUERIES = 64;

// Water surface queries, on the CPU.
//   - slot 0 is always the camera (the underwater view switches on it)
//   - other slots are gameplay points (boat hull samples, swimmer, bobber...)
// Tidewater evaluated these on the GPU and read them back 1-3 frames later; here they are evaluated
// from the same waves the GPU draws (Waves), synchronously in update(). The API is unchanged:
// `cpu[ slot * 4 ] = ( height, nx, nz, sea floor )`, `cpuValid`, and `version` / `resultTime` /
// `resultInputs` / `latency` for the boat, which integrates between results.
export class WaterQuery {

	constructor( waves, terrain = null, shore = null ) {

		this.waves = waves;
		this.terrain = terrain;
		this.shore = shore; // ShoreWaves: the breakers and the swash sheet near the beach
		// ((M15) in doubles: tens of km out a 32-bit float's step, 4 mm at 40 km, shook the boat's heights)
		this.inputs = new Float64Array( MAX_QUERIES * 4 );
		this.count = 1;
		this.cpu = new Float32Array( MAX_QUERIES * 4 );
		this.cpuValid = false;
		this.version = 0;
		this.resultTime = 0;
		this.resultInputs = new Float64Array( MAX_QUERIES * 4 );
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

	// the water surface's height at (x, z): the open sea, the breaking shore waves on top, and the
	// swash sheet on the sand (the same smooth max the water mesh takes)
	heightAt( x, z, t ) {

		let h = this.waves.heightAt( x, z, t );
		// ((M15) in a sea cave's gully, inlet and cave: a gentler surge, no breakers nor run-up, as the water's drawn)
		const calm = seaCaveCalm( x, z );
		if ( calm > 0 ) h = G.seaLevel.value + ( h - G.seaLevel.value ) * ( 1 - 0.4 * calm );
		if ( this.shore && this.terrain ) {

			const ground = this.terrain.heightAt( x, z );
			const sw = this.shore.sample( x, z, t, ground, this.terrain );
			const calmK = 1 - 0.85 * calm;
			h += sw.y * calmK;
			if ( calm > 0 ) sw.swashLevel = G.seaLevel.value - 5 + ( sw.swashLevel - G.seaLevel.value + 5 ) * calmK;
			const k = 0.04, m = Math.min( 1, Math.max( 0, ( sw.swashLevel - h ) / k * 0.5 + 0.5 ) );
			h = h + ( sw.swashLevel - h ) * m + m * ( 1 - m ) * k;

		}

		return h;

	}

	// (M12) the surf's current at (x, z) (ShoreWaves.currentAt: the rips and their feeders), m/s
	currentAt( x, z, t = G.time.value, out ) {

		if ( ! this.shore || ! this.terrain ) return out ? ( out.x = out.z = out.rip = 0, out ) : { x: 0, z: 0, rip: 0 };
		return this.shore.currentAt( x, z, t, this.terrain.heightAt( x, z ), out );

	}

	// (M12) the breaker a swimmer at (x, z) is in (ShoreWaves.breakerAt)
	breakerAt( x, z, t = G.time.value, out ) {

		if ( ! this.shore || ! this.terrain ) return null;
		return this.shore.breakerAt( x, z, t, this.terrain.heightAt( x, z ), this.terrain, out );

	}

	update() {

		const t = G.time.value;
		const e = 0.35;
		for ( let i = 0; i < this.count; i ++ ) {

			const x = this.inputs[ i * 4 ], z = this.inputs[ i * 4 + 1 ];
			const h = this.heightAt( x, z, t );
			const hx = this.heightAt( x + e, z, t );
			const hz = this.heightAt( x, z + e, t );
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
