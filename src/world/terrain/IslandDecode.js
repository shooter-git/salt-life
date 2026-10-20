import { unzlibSync } from 'fflate';
import { MAGIC } from './IslandBake.js';

// Reads the island bake (IslandBake.js writes it; the format is described there).

export function readIslandHeader( bytes ) {

	if ( new TextDecoder().decode( bytes.subarray( 0, 4 ) ) !== MAGIC ) throw new Error( 'island.bin: not an island bake' );
	const length = new DataView( bytes.buffer, bytes.byteOffset ).getUint32( 4, true );
	return { header: JSON.parse( new TextDecoder().decode( bytes.subarray( 8, 8 + length ) ) ), dataStart: 8 + length };

}

// -> { res, heights: Float32Array, rock: Float32Array, sand…scarp: Uint8Array, rockSites }, for new TerrainData( seed, baked )
export function decodeIsland( bytes ) {

	const { header, dataStart } = readIslandHeader( bytes );
	const n = header.res * header.res;
	const out = { res: header.res, rockSites: header.rockSites };
	for ( const f of header.fields ) {

		// (inflated straight into a buffer of the field's size: left to grow, the inflater's buffers
		// come to several times the island, all garbage a phone's script memory has to hold at once)
		const size = f.encoding === 'u16-row-delta' ? n * 2 : n;
		const raw = unzlibSync( bytes.subarray( dataStart + f.offset, dataStart + f.offset + f.length ), { out: new Uint8Array( size ) } );
		if ( f.encoding === 'u16-row-delta' ) {

			const q = new Uint16Array( raw.buffer, raw.byteOffset, n );
			const h = new Float32Array( n );
			for ( let j = 0, res = header.res; j < res; j ++ ) {

				let v = 0;
				for ( let i = 0; i < res; i ++ ) {

					const k = j * res + i;
					v = ( v + q[ k ] ) & 0xffff;
					h[ k ] = f.min + v * f.step;

				}

			}

			out[ f.name ] = h;

		} else if ( f.encoding === 'u8-unit' ) {

			const r = new Float32Array( n );
			for ( let k = 0; k < n; k ++ ) r[ k ] = raw[ k ] / 255;
			out[ f.name ] = r;

		} else out[ f.name ] = raw;

	}

	return out;

}
