// (M15) What the open sea's sound is worked out from (pure: test/sound-out-there.mjs).
//
// The surf heard from out at sea (SurfLine): TerrainData.coastDistance is an ellipse's reckoning, good by the
// island and half the true distance kilometres out, and the surf's far roar was only ever placed by the swell's
// way. So the waterline itself, read from the ground into stretches, each heard by the surf that reaches it, by
// how far off it is, and only if it faces you (the mountain's in the way of the rest). Adding them as power gives
// what a real shore does: near by it falls off as a line (3 dB a doubling), far off as a point (6 dB), and the
// roar comes from where most of it is. The bank's rim and sandbar (SEABED.bank) are stretches too, breaking only
// once the sea's big enough for where they are.
//   const line = new SurfLine( terrain );  line.heard( x, z, trains, out )   -> out { g, surf, dx, dz, land }
//
// The sea's own (seaGain): the wash of its whitecaps, as their share of the sea (Monahan: whitecapCover), so
// none in a light air, and a roar in a gale; as grown as the wind's sea is where you are.

import { whitecapCover } from '../ocean/Whitecaps.js';

const clamp = ( v, a, b ) => ( v < a ? a : v > b ? b : v );
export const smooth = ( a, b, x ) => {

	const t = clamp( ( x - a ) / ( b - a ), 0, 1 );
	return t * t * ( 3 - 2 * t );

};

// m: the island's square, its lattice read for the waterline, and the length of shore each stretch stands for
const SQUARE = 1024, STEP = 16, CELL = 32;
// m: the bank's lattice, and its square about SEABED.bank (a stretch's depth is under the deepest any sea breaks)
const BANK_STEP = 40, BANK_LEN = 20, BANK_DEEP = 9;
// m: how far offshore of a stretch its surf's read (its field's exposure), and a stretch's depth breaking: as
// SoundScape's surf reckons where a wave plunges (H = gamma d)
const OFF = 40;
const breakDepth = ( A, gamma ) => Math.pow( A * 3.556 / gamma, 0.8 ) * 0.92;
// the far law's scale: at 750 m it's the near law's (SoundScape: 1.25 / ( 1 + d / 200 )), measured on a fair day
// off the bay (test/sound-out-there.mjs)
const KG = 5;
const sat = ( v ) => clamp( v, 0, 1 );

export class SurfLine {

	constructor( terrain, { bank = null, sea = 0 } = {} ) {

		const h = ( x, z ) => terrain.heightAt( x, z ) - sea;
		const seen = new Set();
		this.points = [];
		for ( let z = - SQUARE; z < SQUARE; z += STEP ) for ( let x = - SQUARE; x < SQUARE; x += STEP ) {

			const up = h( x, z ) > 0;
			if ( ! up || ( h( x + STEP, z ) > 0 && h( x - STEP, z ) > 0 && h( x, z + STEP ) > 0 && h( x, z - STEP ) > 0 ) ) continue;
			const key = Math.floor( x / CELL ) * 4096 + Math.floor( z / CELL );
			if ( seen.has( key ) ) continue;
			seen.add( key );
			// (seaward: down its slope)
			let nx = h( x - 24, z ) - h( x + 24, z ), nz = h( x, z - 24 ) - h( x, z + 24 );
			const l = Math.hypot( nx, nz ) || 1;
			nx /= l;
			nz /= l;
			this.points.push( { x, z, nx, nz, len: CELL, depth: 0 } );

		}

		this.island = this.points.length;
		if ( bank ) {

			const half = bank.size / 2;
			for ( let z = bank.z - half; z < bank.z + half; z += BANK_STEP ) for ( let x = bank.x - half; x < bank.x + half; x += BANK_STEP ) {

				const depth = - h( x, z );
				if ( depth > 0 && depth < BANK_DEEP ) this.points.push( { x, z, nx: 0, nz: 0, len: BANK_LEN, depth } );

			}

		}

		// (a field's exposure at each stretch: fields only change with the swell's way, read once for each)
		this._exp = new Map();
		this._f = [ 0, 0, 0, 0 ];

	}

	_exposure( train ) {

		let e = this._exp.get( train.field );
		if ( e ) return e;
		if ( this._exp.size > 8 ) this._exp.clear();
		e = new Float32Array( this.points.length );
		this.points.forEach( ( p, i ) => {

			train.fieldAt( p.x + p.nx * OFF, p.z + p.nz * OFF, this._f );
			e[ i ] = sat( Math.hypot( this._f[ 1 ], this._f[ 2 ] ) * 1.4 );

		} );
		this._exp.set( train.field, e );
		return e;

	}

	// the surf heard at ( x, z ) from the trains that run (ShoreWaves.trains: slot 3's the bank's alone, the others
	// the island's alone): g, its amplitude by the shore's lie and distance; surf, the height of what's heard (its
	// offshore amplitude, m); dx, dz, the way it comes from; land, the nearest of the island's waterline (m); near, the
	// nearest of what's breaking
	heard( x, z, trains, out = {}, gamma = 0.78 ) {

		const P = this.points, n = P.length;
		const ex = [];
		for ( let k = 0; k < 4; k ++ ) ex[ k ] = trains[ k ] && trains[ k ].amplitude > 0.005 ? this._exposure( trains[ k ] ) : null;
		const bar = trains[ 3 ] ? breakDepth( trains[ 3 ].amplitude, gamma ) : 0;
		let hh = 0, cc = 0, sx = 0, sz = 0, land = Infinity, near = Infinity;
		for ( let i = 0; i < n; i ++ ) {

			const p = P[ i ], vx = p.x - x, vz = p.z - z, r2 = Math.max( vx * vx + vz * vz, 400 ), r = Math.sqrt( r2 );
			if ( i < this.island && r < land ) land = r;
			let a = 0;
			if ( i < this.island ) {

				// (facing you, or near enough: what's round the far side's behind the mountain)
				const facing = smooth( 0.3, - 0.2, ( vx * p.nx + vz * p.nz ) / r );
				if ( facing <= 0 ) continue;
				for ( let k = 0; k < 3; k ++ ) if ( ex[ k ] ) a = Math.max( a, trains[ k ].amplitude * ex[ k ][ i ] * facing );

			} else if ( ex[ 3 ] && p.depth < bar ) a = trains[ 3 ].amplitude * ex[ 3 ][ i ];

			if ( a <= 0 ) continue;
			if ( r < near ) near = r;
			const c = Math.min( 1, a / 0.05 ), w = p.len / r2, pw = w * c * c;
			hh += w * a * a;
			cc += pw;
			sx += pw * vx / r;
			sz += pw * vz / r;

		}

		const l = Math.hypot( sx, sz ) || 1;
		out.g = KG * Math.sqrt( cc );
		out.surf = cc > 0 ? Math.sqrt( hh / cc ) : 0;
		out.dx = sx / l;
		out.dz = sz / l;
		out.land = land;
		out.near = near;
		return out;

	}

}

// the fair-day wind the sea's wash is set at (m/s): MIX.seaOpen is its level there
export const SEA_WIND = 7;
// amplitude (against SEA_WIND's) of the open sea's wash in a wind of u m/s, as grown as it is (0..1)
export function seaGain( u, grown ) {

	return Math.sqrt( whitecapCover( u ) * clamp( grown, 0, 1 ) / whitecapCover( SEA_WIND ) );

}

// how far you are out on open water, by the island's nearest waterline: 0 by the shore, 1 well off it (the coast's
// wind through its bushes gone for the wind at sea, the sea's wash and the surf's far law come in)
export const openWater = ( land ) => smooth( 60, 400, land );

// the surf's far roar's top cut by the air on its way (Hz at land m: about 6 dB off 1 kHz at 1.2 km, ISO 9613's
// air at 20 C, 70%), and how much its loudness moves with the wind (dB: more where the wind's bringing it, the
// sound bent down; less against it, bent up): whichWay, the wind toward you from it, -1..1
export const roarCut = ( land ) => clamp( 1200 * Math.pow( 1000 / Math.max( land, 1 ), 0.85 ), 220, 20000 );
export const roarCarry = ( whichWay, wind, land ) => 5 * whichWay * smooth( 1, 8, wind ) * smooth( 300, 1500, land );
