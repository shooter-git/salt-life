import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';
import { SPRAY } from './Spray.js';

// (M13) The spray a hurricane's wind tears off the sea. From a strong gale's wind (WIND[ 0 ]) the crests
// and the breakers are blown into the air (Beaufort 10 and up: "the sea takes a white appearance",
// "the air filled with foam and spray" at 12): sheets of mist and drops lifted off the water upwind of
// the camera and driven past at the wind's speed, as much again over the surf, where it's breaking
// everywhere. They're the spray pool's (fx/Spray.js: mist that follows the air, drops that fly and die in
// the water), so they cost no draw of their own; none over the ground or the dry sand. What they do to
// how far you see is the weather's (Weather.js: its spray haze, the fog's); these are the spray you see
// go by.
//   const storm = new StormSpray( { spray, terrain, waves, tier } );  storm.update( dt, camera )   (each frame, before spray.update)

// m/s: from a strong gale's wind, all of it in a hurricane's
const WIND = [ 22, 36 ];
// lifts a second at full wind, by tier (each a veil of mist and a few drops; Spray keeps fewer clouds on
// the lesser tiers)
const RATE = { low: 18, mid: 36, high: 60 };
// where they're lifted: upwind of the camera (m), and across the wind either side
const UPWIND = [ 4, 46 ], ACROSS = 32;
// the surf's depth (m: as much again lifted there)
const SURF_DEPTH = 6;
// the mist's size (m) and life (s), its drops' size (m), and the share of lifts that throw a white cloud
const MIST = [ 0.6, 1.3 ], MIST_LIFE = 2.6, DROP = 0.004, CLOUD = 0.3;

const _p = new THREE.Vector3(), _v = new THREE.Vector3();

export class StormSpray {

	constructor( { spray, terrain, waves, tier = 'high' } ) {

		this.spray = spray;
		this.terrain = terrain;
		this.waves = waves;
		this.rate = RATE[ tier ] ?? RATE.low;
		this._owed = 0;

	}

	update( dt, camera ) {

		const ws = G.windSpeed.value, k = THREE.MathUtils.smoothstep( ws, WIND[ 0 ], WIND[ 1 ] );
		if ( k <= 0 || ! this.spray || camera.position.y < G.seaLevel.value - 0.5 ) {

			this._owed = 0;
			return;

		}

		const wd = G.windDir.value, sea = G.seaLevel.value, R = Math.random;
		this._owed += this.rate * k * dt;
		let tries = Math.ceil( this._owed * 2 );
		while ( this._owed >= 1 && tries -- > 0 ) {

			// a spot upwind (the wind blows toward wd), across it either way
			const up = UPWIND[ 0 ] + ( UPWIND[ 1 ] - UPWIND[ 0 ] ) * R(), side = ( R() - 0.5 ) * 2 * ACROSS;
			const x = camera.position.x - wd.x * up - wd.y * side, z = camera.position.z - wd.y * up + wd.x * side;
			const depth = sea - this.terrain.heightAt( x, z );
			// (none off the ground or the sand; as much again over the surf)
			if ( depth < 0.3 || ( depth > SURF_DEPTH && R() < 0.5 ) ) continue;
			this._owed -= 1;
			const y = Math.max( this.waves.heightAt( x, z ), sea ) + 0.2 + R() * 1.1;
			_p.set( x, y, z );
			// (thrown up off the crest, already moving with the air)
			_v.set( wd.x * ws * 0.55, 0.8 + R() * 1.2, wd.y * ws * 0.55 );
			this.spray.emit( _p, _v, 1, MIST[ 0 ] + ( MIST[ 1 ] - MIST[ 0 ] ) * R(), SPRAY.MIST, { spread: 1.5, jitter: 0.6, life: MIST_LIFE, sizeJitter: 0.6 } );
			this.spray.emit( _p, _v, 3, DROP, SPRAY.DROPLET, { spread: 2.5, jitter: 0.5, life: 1.4 } );
			if ( R() < CLOUD ) this.spray.emit( _p, _v, 1, 0.35 + R() * 0.3, SPRAY.SPRAY, { spread: 1.2, jitter: 0.4, life: 1.6, sizeJitter: 0.7 } );

		}

		if ( this._owed > 4 ) this._owed = 4;

	}

}
