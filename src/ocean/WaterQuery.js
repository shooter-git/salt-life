import { G } from '../core/Globals.js';
import { seaCaveCalm } from '../world/terrain/CaveLight.js';

export const MAX_QUERIES = 64;
// (M20) the shore's waves end at this depth (WaterSurface's SHORE_DEEP); steps on the resting point where they push the water
// more than PUSHED m about, until it's drawn within TOL m of the point asked about, NEWTON of them at most, each at most STEP m,
// the slopes measured DX m apart; where they end more than MISS m off, or where the water may fold over (the slopes'
// stretch along the push under FOLD, or the push where they end FOLD_JUMP m more or less than where they began), the scan along the push:
// a quarter again the most the shore's waves could push the water where they've been (ShoreWaves.sample's reach), and REACH m
// more, either way (SCAN m at most) in SCAN_DS m steps, each crossing found in ROOT
// steps at most, and kept if it's within SIDE m of the point across the push
const SHORE_DEEP = 26, PUSHED = 0.005, TOL = 0.002, NEWTON = 6, STEP = 1.5, DX = 0.05;
const MISS = 0.02, FOLD = 0.3, FOLD_JUMP = 0.5, REACH = 0.4, SCAN = 3, SCAN_DS = 0.2, ROOT = 6, SIDE = 0.05;

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
		this._ox = this._oz = 0; // ((M20) the last height's resting point, less the point: _solve)
		this.scans = 0; // ((M20) how many of the heights have needed the scan, for the checks: _scan)

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
	// (M20) The water's height at ( x, z ) as the sea draws it there (stream SEA: docs/m20/sea.md). The sea's vertex is at a resting
	// point x0 moved by the open sea's waves and the shore's (their push along the wave's way squeezes a breaking wave's face into a
	// wall), so the height at ( x, z ) is the one at the x0 whose drawn place is ( x, z ): first the open sea's fixed-point steps,
	// as before (Waves.heightAt), and where the shore's waves push the water about, steps on the whole of it (_solve). Before, the
	// shore's height was the one at ( x, z ) itself: the swash 0.3 to 0.6 m off the drawn water at a bore's face, a bay 4 cm
	// over or under at half tide (tools/checks/shore-match.mjs). On dry sand the swash sheet's level is kept, where the sea's
	// drawn hidden under it
	heightAt( x, z, t ) {

		return this._solve( x, z, t, false );

	}

	// (M20) the height at ( x, z ) -> y, and this._ox, this._oz its resting point less ( x, z ). warm: begun from the resting point
	// this._ox, this._oz from ( x, z ) (a point beside the last one asked about: updateSlots' slopes), the open sea's steps skipped.
	// The steps: Broyden's, begun as the open sea's fixed-point ones (the slopes taken as none), the slopes measured where a step
	// doesn't halve the miss (a wave's face), at most NEWTON of them; then the scan (_scan) where they miss, or the water may fold
	_solve( x, z, t, warm ) {

		if ( ! this.shore || ! this.terrain ) {

			// (no breakers: the open sea's own, gentler in a sea cave, as before; and a stand-in sea of heights alone, the tests')
			const h = this.waves.heightAt( x, z, t ), calm = seaCaveCalm( x, z );
			return calm > 0 ? G.seaLevel.value + ( h - G.seaLevel.value ) * ( 1 - 0.4 * calm ) : h;

		}

		const W = this.waves, v = this._v || ( this._v = { x: 0, y: 0, z: 0, push: 0, px: 0, pz: 0, reach: 0, ux: 1, uz: 0 } );
		const fade = W.fadeAt( x, z ), lee = W.leeAt( x, z );
		let x0 = x, z0 = z;
		if ( warm ) {

			x0 += this._ox;
			z0 += this._oz;

		} else for ( let i = 0; i < W.iterations; i ++ ) {

			this.vertexAt( x0, z0, t, fade, lee, v, false );
			x0 = x - ( v.x - x0 );
			z0 = z - ( v.z - z0 );

		}

		const xs = x0, zs = z0;
		this.vertexAt( x0, z0, t, fade, lee, v, true );
		let rx = v.x - x, rz = v.z - z;
		if ( ( warm || v.push > PUSHED ) && rx * rx + rz * rz > TOL * TOL ) {

			const ux = v.push > 1e-6 ? v.px / v.push : v.ux, uz = v.push > 1e-6 ? v.pz / v.push : v.uz, push0 = v.push;
			const A = this._va || ( this._va = { x: 0, y: 0, z: 0, push: 0, px: 0, pz: 0, reach: 0, ux: 1, uz: 0 } ), B = this._vb || ( this._vb = { x: 0, y: 0, z: 0, push: 0, px: 0, pz: 0, reach: 0, ux: 1, uz: 0 } );
			let j00 = 1, j01 = 0, j10 = 0, j11 = 1, most = v.reach;
			for ( let i = 0; i < NEWTON && rx * rx + rz * rz > TOL * TOL; i ++ ) {

				const det = j00 * j11 - j01 * j10;
				let sx = - rx * 0.5, sz = - rz * 0.5;
				if ( Math.abs( det ) > 0.05 ) {

					sx = ( - rx * j11 + rz * j01 ) / det;
					sz = ( - rz * j00 + rx * j10 ) / det;

				}

				const L = Math.hypot( sx, sz );
				if ( L > STEP ) {

					sx *= STEP / L;
					sz *= STEP / L;

				}

				const wx = v.x, wz = v.z;
				this.vertexAt( x0 + sx, z0 + sz, t, fade, lee, A, true );
				const nx = A.x - x, nz = A.z - z;
				if ( nx * nx + nz * nz > 0.25 * ( rx * rx + rz * rz ) ) {

					// (the step didn't halve the miss: the slopes measured where it began, and the step taken again from there; a
					// step that made the miss worse not kept)
					if ( nx * nx + nz * nz < rx * rx + rz * rz ) {

						x0 += sx;
						z0 += sz;
						Object.assign( v, A );

					}

					this.vertexAt( x0 + DX, z0, t, fade, lee, A, true );
					this.vertexAt( x0, z0 + DX, t, fade, lee, B, true );
					j00 = ( A.x - v.x ) / DX;
					j10 = ( A.z - v.z ) / DX;
					j01 = ( B.x - v.x ) / DX;
					j11 = ( B.z - v.z ) / DX;

				} else {

					// (Broyden's update of the slopes by the step)
					x0 += sx;
					z0 += sz;
					Object.assign( v, A );
					const ss = sx * sx + sz * sz;
					if ( ss > 1e-12 ) {

						const ex = ( v.x - wx ) - ( j00 * sx + j01 * sz ), ez = ( v.z - wz ) - ( j10 * sx + j11 * sz );
						j00 += ex * sx / ss;
						j01 += ex * sz / ss;
						j10 += ez * sx / ss;
						j11 += ez * sz / ss;

					}

				}

				rx = v.x - x;
				rz = v.z - z;
				most = Math.max( most, v.reach );

			}

			// (the water squeezed along the push where they end: Broyden's slopes are only good along the steps, so measured)
			this.vertexAt( x0 + DX * ux, z0 + DX * uz, t, fade, lee, A, true );
			const squeeze = ( ( A.x - v.x ) * ux + ( A.z - v.z ) * uz ) / DX;
			if ( rx * rx + rz * rz > MISS * MISS || squeeze < FOLD || Math.abs( v.push - push0 ) > FOLD_JUMP ) {

				const y = this._scan( x, z, t, fade, lee, xs, zs, ux, uz, Math.min( SCAN, most * 1.25 + REACH ), v.y );
				this._ox = this._sx - x;
				this._oz = this._sz - z;
				return y;

			}

		}

		this._ox = x0 - x;
		this._oz = z0 - z;
		return v.y;

	}

	// (M20) Where the steps miss: a breaking wave's face, its water squeezed into a wall and folded over itself, sends them astray,
	// or to the layer under the fold (at the beach's swash, 1 in 20 of its points 20 cm to 0.8 m off). So the resting points on a
	// line along the shore's push through ( xs, zs ), reach m either way, every crossing of ( x, z ) found (by the Illinois
	// method), and the highest kept, as the sea's seen from above -> the height, and this._sx, this._sz its resting point; missed
	// (no crossing near enough) the nearest across the push, or else the steps'
	_scan( x, z, t, fade, lee, xs, zs, ux, uz, reach, missed ) {

		this.scans ++;
		const v = this._vs || ( this._vs = { x: 0, y: 0, z: 0, push: 0, px: 0, pz: 0, reach: 0, ux: 1, uz: 0 } );
		let best = - Infinity, bestS = 0, near = Infinity, nearY = missed, nearS = 0, s0 = 0, f0 = 0;
		const along = ( s ) => {

			this.vertexAt( xs + s * ux, zs + s * uz, t, fade, lee, v, true );
			return ( v.x - x ) * ux + ( v.z - z ) * uz;

		};

		const n = Math.ceil( 2 * reach / SCAN_DS );
		for ( let i = 0; i <= n; i ++ ) {

			const s1 = - reach + i * SCAN_DS, f1 = along( s1 );
			if ( i > 0 && ( f1 > 0 ) !== ( f0 > 0 ) ) {

				let a = s0, b = s1, fa = f0, fb = f1, m = s1;
				for ( let k = 0; k < ROOT; k ++ ) {

					m = b - fb * ( b - a ) / ( fb - fa );
					const fm = along( m );
					if ( Math.abs( fm ) < TOL ) break;
					if ( ( fm > 0 ) !== ( fb > 0 ) ) {

						a = b;
						fa = fb;

					} else fa *= 0.5;

					b = m;
					fb = fm;

				}

				const side = Math.abs( ( v.z - z ) * ux - ( v.x - x ) * uz );
				if ( side < SIDE ) {

					if ( v.y > best ) {

						best = v.y;
						bestS = m;

					}

				} else if ( side < near ) {

					near = side;
					nearY = v.y;
					nearS = m;

				}

			}

			s0 = s1;
			f0 = f1;

		}

		const s = best > - Infinity ? bestS : near < Infinity ? nearS : 0;
		this._sx = xs + s * ux;
		this._sz = zs + s * uz;
		return best > - Infinity ? best : nearY;

	}

	// (M20) the sea's vertex at its resting point ( x0, z0 ), as WaterSurface's vertex shader makes it: the open sea's waves and the
	// boats' wakes' crests, gentler in a sea cave; near the shore its waves and the swash sheet's smooth max, the push let go where
	// the sheet's the surface -> out { x, z (its drawn place), y, push (the shore's push there, m) }. withShore false: the open sea
	// alone (its fixed-point steps). out.px, out.pz: the shore's push alone; out.reach the most it could be about here
	vertexAt( x0, z0, t, fade, lee, out, withShore = true ) {

		const W = this.waves, sea = G.seaLevel.value, d = this._d || ( this._d = [ 0, 0, 0 ] );
		W.displacement( x0, z0, t, d, fade, lee );
		let dx = d[ 0 ], dy = d[ 1 ] + W.wakeAt( x0, z0 ), dz = d[ 2 ];
		const calm = seaCaveCalm( x0, z0 );
		if ( calm > 0 ) {

			const k = 1 - 0.4 * calm;
			dx *= k;
			dy *= k;
			dz *= k;

		}

		let y = sea + dy;
		out.push = out.px = out.pz = out.reach = 0;
		out.ux = 1;
		out.uz = 0;
		if ( withShore && this.shore && this.terrain ) {

			const ground = this.terrain.heightAt( x0, z0 );
			if ( sea - ground < SHORE_DEEP ) {

				const sw = this.shore.sample( x0, z0, t, ground, this.terrain );
				const calmK = 1 - 0.85 * calm;
				dx += sw.x * calmK;
				dy += sw.y * calmK;
				dz += sw.z * calmK;
				y = sea + dy;
				let swash = sw.swashLevel;
				if ( calm > 0 ) swash = sea - 5 + ( swash - sea + 5 ) * calmK;
				const k = 0.04, m = Math.min( 1, Math.max( 0, ( swash - y ) / k * 0.5 + 0.5 ) );
				y = y + ( swash - y ) * m + m * ( 1 - m ) * k;
				const still = 1 - m;
				dx *= still;
				dz *= still;
				out.px = sw.x * calmK * still;
				out.pz = sw.z * calmK * still;
				out.push = Math.hypot( out.px, out.pz );
				out.reach = sw.reach * calmK;
				out.ux = sw.ux;
				out.uz = sw.uz;

			}

		}

		out.x = x0 + dx;
		out.y = y;
		out.z = z0 + dz;
		return out;

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

		this.updateSlots( 0, this.count, G.time.value );
		this.resultInputs.set( this.inputs );

	}

	// (M17) those slots alone, at the water's time t: a boat worked out in several steps in one frame asks again at each
	// (BoatController.catchUp)
	updateSlots( from, n, t ) {

		const e = 0.35;
		for ( let i = from; i < from + n; i ++ ) {

			const x = this.inputs[ i * 4 ], z = this.inputs[ i * 4 + 1 ];
			// ((M20) the slopes' two heights begun from the height's resting point: _solve)
			const h = this._solve( x, z, t, false ), ox = this._ox, oz = this._oz;
			const hx = this._solve( x + e, z, t, true );
			this._ox = ox;
			this._oz = oz;
			const hz = this._solve( x, z + e, t, true );
			const nx = ( h - hx ) / e, nz = ( h - hz ) / e;
			const len = Math.hypot( nx, 1, nz );
			this.cpu[ i * 4 ] = h;
			this.cpu[ i * 4 + 1 ] = nx / len;
			this.cpu[ i * 4 + 2 ] = nz / len;
			this.cpu[ i * 4 + 3 ] = this.terrain ? this.terrain.heightAt( x, z ) : - 500;
			this.resultInputs[ i * 4 ] = x;
			this.resultInputs[ i * 4 + 1 ] = z;

		}

		this.resultTime = t;
		this.cpuValid = true;
		this.version ++;

	}

}
