import * as THREE from '../engine/index.js';
import { G } from '../core/Globals.js';
import { SPRAY } from './Spray.js';

// (M14) The spray off the open sea's whitecaps, near you (ocean/Whitecaps: where you see a crest breaking,
// from the same hash). On a fair day's breeze a spilling crest throws only a few drops and a puff of white
// off its roller; from a fresh breeze ("chance of some spray", Beaufort 5) more, and from a strong breeze
// ("probably some spray", 6) up the wind tears mist off them too and carries it downwind, as much as the
// wind's past SPRAY_WIND. They're the spray pool's (fx/Spray.js), as the hurricane's are (StormSpray: from a
// strong gale's wind up, off the sea everywhere, not only its breaking crests).
//   const ws = new WhitecapSpray( { spray, caps, waves, tier } );  ws.update( dt, camera )   (each frame, before spray.update)

// m: the crests looked at about you (further, and the drops are less than a pixel)
const RANGE = 45;
// m/s: the wind from which the spray grows from a few drops to its fullest, and the mist's
const SPRAY_WIND = [ 6, 14 ], MIST_WIND = [ 9, 16 ];
// a second, a metre of roller breaking at its strongest: drops, bursts of white (PUFF_N small puffs each),
// and (in a wind) veils of mist
const DROPS = [ 3, 16 ], PUFFS = [ 0.2, 0.7 ], PUFF_N = 3, MISTS = 1.2;
// the most lifted a second, by tier (Spray keeps fewer of the clouds on the lesser tiers)
const MOST = { low: 40, mid: 90, high: 160 };
// sizes (m) and lives (s)
const DROP = [ 0.002, 0.005 ], PUFF = [ 0.06, 0.16 ], PUFF_LIFE = 0.6, MIST = [ 0.4, 0.9 ], MIST_LIFE = 2.2;

const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _d = [ 0, 0, 0 ];

export class WhitecapSpray {

	constructor( { spray, caps, waves, tier = 'high' } ) {

		this.spray = spray;
		this.caps = caps;
		this.waves = waves;
		this.most = MOST[ tier ] ?? MOST.low;
		this._owed = [ 0, 0, 0 ]; // drops, puffs, mist
		this._near = [];
		this._at = ( x0, z0, along, half, on, w ) => this._near.push( { x0, z0, along, half, on, w, len: 2 * half * on } );

	}

	update( dt, camera ) {

		const c = camera.position, sea = G.seaLevel.value;
		if ( ! this.spray || this.caps.cover.value <= 0 || c.y < sea - 0.5 ) return;
		const ws = G.windSpeed.value, wd = G.windDir.value, t = G.time.value, R = Math.random;
		const k = THREE.MathUtils.smoothstep( ws, SPRAY_WIND[ 0 ], SPRAY_WIND[ 1 ] ), mist = THREE.MathUtils.smoothstep( ws, MIST_WIND[ 0 ], MIST_WIND[ 1 ] );
		this._near.length = 0;
		this.caps.rollers( c.x, c.z, RANGE, t, this._at );
		let len = 0;
		for ( const r of this._near ) len += r.len;
		if ( len <= 0 ) return;
		const rates = [ DROPS[ 0 ] + ( DROPS[ 1 ] - DROPS[ 0 ] ) * k, PUFFS[ 0 ] + ( PUFFS[ 1 ] - PUFFS[ 0 ] ) * k, MISTS * mist ];
		// (no more than the tier's most a second, all told)
		const scale = Math.min( 1, this.most / ( len * ( rates[ 0 ] + rates[ 1 ] * PUFF_N + rates[ 2 ] ) ) );
		for ( let kind = 0; kind < 3; kind ++ ) {

			this._owed[ kind ] = Math.min( this._owed[ kind ] + len * rates[ kind ] * scale * dt, 6 );
			while ( this._owed[ kind ] >= 1 ) {

				this._owed[ kind ] -= 1;
				// a breaking crest by how much of it's breaking, and a spot along its roller
				let pick = R() * len, r = this._near[ 0 ];
				for ( const q of this._near ) {

					r = q;
					if ( ( pick -= q.len ) <= 0 ) break;

				}

				const s = ( R() - 0.5 ) * 2 * r.half, x0 = r.x0 + r.along[ 0 ] * s, z0 = r.z0 + r.along[ 1 ] * s;
				this.waves.displacement( x0, z0, t, _d );
				_p.set( x0 + _d[ 0 ], sea + _d[ 1 ] + 0.08, z0 + _d[ 2 ] );
				// (thrown forward off the crest at near its speed, and up)
				const w = r.w, cp = w.omega / w.k * ( 0.5 + 0.4 * R() );
				if ( kind === 0 ) {

					_v.set( w.dx * cp, 0.5 + R() * 1.3, w.dz * cp );
					this.spray.emit( _p, _v, 1, DROP[ 0 ] + ( DROP[ 1 ] - DROP[ 0 ] ) * R(), SPRAY.DROPLET, { spread: 0.6, jitter: 0.5, life: 1.2 } );

				} else if ( kind === 1 ) {

					_v.set( w.dx * cp, 0.3 + R() * 0.6, w.dz * cp );
					this.spray.emit( _p, _v, PUFF_N, PUFF[ 0 ] + ( PUFF[ 1 ] - PUFF[ 0 ] ) * R() * ( 0.6 + 0.4 * k ), SPRAY.SPRAY, { spread: 0.5, jitter: 0.25, life: PUFF_LIFE, sizeJitter: 0.7 } );

				} else {

					// (torn off it by the wind, already moving with the air)
					_v.set( wd.x * ws * 0.45, 0.4 + R() * 0.7, wd.y * ws * 0.45 );
					this.spray.emit( _p, _v, 1, MIST[ 0 ] + ( MIST[ 1 ] - MIST[ 0 ] ) * R(), SPRAY.MIST, { spread: 0.8, jitter: 0.5, life: MIST_LIFE, sizeJitter: 0.5 } );

				}

			}

		}

	}

}
