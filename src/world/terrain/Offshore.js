import { unzlibSync } from 'fflate';

// (M15) The seabed past the island's square (SeabedModel.js makes it, tools/bake-terrain.mjs bakes it into
// public/world/offshore.bin, 32 m, and offshore-512.bin, 64 m for low-powered devices): its map, and the
// deep's floor past that. Outside the bake's source hash, as how it's read doesn't change what's baked.
//
//   const offshore = new Offshore( decodeSeabed( bytes ) )   (then new TerrainData( seed, island, { offshore } ))
//   offshore.heightAt( x, z )                the seabed (m, y up: negative under the sea); -basin past the map
//   offshore.boundsFor( x0, z0, x1, z1 )     [ min, max ] over the box, for the ground's grid
//   offshore.heights, res, size, origin, texel   the map (Float32Array, texel centres at origin + ( i + 0.5 ) * texel)

const MAGIC = 'SLO1';

export function readSeabedHeader( bytes ) {

	if ( new TextDecoder().decode( bytes.subarray( 0, 4 ) ) !== MAGIC ) throw new Error( 'offshore.bin: not a seabed bake' );
	const length = new DataView( bytes.buffer, bytes.byteOffset ).getUint32( 4, true );
	return { header: JSON.parse( new TextDecoder().decode( bytes.subarray( 8, 8 + length ) ) ), dataStart: 8 + length };

}

// -> { res, size, basin, heights: Float32Array }
export function decodeSeabed( bytes ) {

	const { header: h, dataStart } = readSeabedHeader( bytes );
	const n = h.res * h.res;
	const raw = unzlibSync( bytes.subarray( dataStart ), { out: new Uint8Array( n * 2 ) } );
	const q = new Uint16Array( raw.buffer, raw.byteOffset, n ), heights = new Float32Array( n );
	for ( let j = 0; j < h.res; j ++ ) {

		let v = 0;
		for ( let i = 0; i < h.res; i ++ ) {

			const k = j * h.res + i;
			v = ( v + q[ k ] ) & 0xffff;
			heights[ k ] = h.min + v * h.step;

		}

	}

	return { res: h.res, size: h.size, basin: h.basin, heights };

}

// The seabed out there, as the game reads it: the bake's map, with a min/max pyramid for the ground's grid.
export class Offshore {

	constructor( { res, heights, size, basin } ) {

		this.res = res;
		this.size = size;
		this.texel = size / res;
		this.origin = - size / 2;
		this.basin = basin;
		this.heights = heights;
		this._pyramid();

	}

	heightAt( x, z ) {

		const { res, texel, origin, heights } = this;
		const fx = ( x - origin ) / texel - 0.5, fz = ( z - origin ) / texel - 0.5;
		if ( fx < 0 || fz < 0 || fx >= res - 1 || fz >= res - 1 ) return - this.basin;
		const i = Math.floor( fx ), j = Math.floor( fz );
		const tx = fx - i, tz = fz - j;
		const k = j * res + i;
		const a = heights[ k ], b = heights[ k + 1 ], c = heights[ k + res ], d = heights[ k + res + 1 ];
		return ( a * ( 1 - tx ) + b * tx ) * ( 1 - tz ) + ( c * ( 1 - tx ) + d * tx ) * tz;

	}

	// min/max of 8 x 8 texel tiles (each tile with its neighbours' edge texels, as bilinear reaches them),
	// and coarser levels by 2 x 2
	_pyramid() {

		const { res, heights } = this, tile = 8, n = res / tile;
		const mn0 = new Float32Array( n * n ), mx0 = new Float32Array( n * n );
		for ( let tj = 0; tj < n; tj ++ ) for ( let ti = 0; ti < n; ti ++ ) {

			let mn = Infinity, mx = - Infinity;
			for ( let j = tj * tile; j <= Math.min( res - 1, ( tj + 1 ) * tile ); j ++ ) for ( let i = ti * tile; i <= Math.min( res - 1, ( ti + 1 ) * tile ); i ++ ) {

				const h = heights[ j * res + i ];
				if ( h < mn ) mn = h;
				if ( h > mx ) mx = h;

			}

			mn0[ tj * n + ti ] = mn;
			mx0[ tj * n + ti ] = mx;

		}

		this.levels = [ { n, min: mn0, max: mx0 } ];
		for ( let cur = this.levels[ 0 ]; cur.n > 1; ) {

			const m = cur.n >> 1, mn = new Float32Array( m * m ), mx = new Float32Array( m * m );
			for ( let j = 0; j < m; j ++ ) for ( let i = 0; i < m; i ++ ) {

				const a = 2 * j * cur.n + 2 * i, b = a + cur.n;
				mn[ j * m + i ] = Math.min( cur.min[ a ], cur.min[ a + 1 ], cur.min[ b ], cur.min[ b + 1 ] );
				mx[ j * m + i ] = Math.max( cur.max[ a ], cur.max[ a + 1 ], cur.max[ b ], cur.max[ b + 1 ] );

			}

			cur = { n: m, min: mn, max: mx };
			this.levels.push( cur );

		}

	}

	// [ min, max ] of the seabed over the box (conservative)
	boundsFor( x0, z0, x1, z1 ) {

		const { origin, texel } = this, tile = 8;
		const span = Math.max( x1 - x0, z1 - z0 ) / ( texel * tile );
		const l = Math.max( 0, Math.min( this.levels.length - 1, Math.ceil( Math.log2( Math.max( 1, span / 2 ) ) ) ) );
		const L = this.levels[ l ], ts = texel * tile * ( 1 << l );
		const i0 = Math.floor( ( x0 - origin ) / ts ), i1 = Math.floor( ( x1 - origin ) / ts );
		const j0 = Math.floor( ( z0 - origin ) / ts ), j1 = Math.floor( ( z1 - origin ) / ts );
		let mn = Infinity, mx = - Infinity;
		for ( let j = j0; j <= j1; j ++ ) for ( let i = i0; i <= i1; i ++ ) {

			if ( i < 0 || j < 0 || i >= L.n || j >= L.n ) {

				mn = Math.min( mn, - this.basin );
				mx = Math.max( mx, - this.basin );
				continue;

			}

			const k = j * L.n + i;
			if ( L.min[ k ] < mn ) mn = L.min[ k ];
			if ( L.max[ k ] > mx ) mx = L.max[ k ];

		}

		return [ mn, mx ];

	}

}
