import { zlibSync, unzlibSync } from 'fflate';
import { BAKED_FIELDS } from '../TerrainData.js';

// The island, baked: TerrainData's grids, packed small enough to download before the game starts.
// tools/bake-terrain.mjs writes public/world/island.bin; the game reads it instead of generating the
// island, which takes ~5 s on a desktop and far longer on a phone.
//
//   'SLI1' | u32 header length | header (JSON) | the fields, each zlib-compressed
//
// heights: quantized to u16 (~6 mm steps) and stored as differences along each row, which compress
// well; rock (0..1): u8; the other masks are u8 already.

const MAGIC = 'SLI1';

export function encodeIsland( terrain, { sourceHash } ) {

	const res = terrain.res;
	const blobs = [];
	const fields = [];
	let offset = 0;
	const add = ( name, encoding, bytes, extra = {} ) => {

		const z = zlibSync( bytes, { level: 9 } );
		fields.push( { name, encoding, offset, length: z.length, ...extra } );
		blobs.push( z );
		offset += z.length;

	};

	let min = Infinity, max = - Infinity;
	for ( const h of terrain.heights ) {

		if ( h < min ) min = h;
		if ( h > max ) max = h;

	}

	const step = ( max - min ) / 65535 || 1;
	const q = new Uint16Array( res * res );
	for ( let j = 0; j < res; j ++ ) {

		let prev = 0;
		for ( let i = 0; i < res; i ++ ) {

			const k = j * res + i;
			const v = Math.round( ( terrain.heights[ k ] - min ) / step );
			q[ k ] = ( v - prev ) & 0xffff;
			prev = v;

		}

	}

	add( 'heights', 'u16-row-delta', new Uint8Array( q.buffer ), { min, step } );

	const rock = new Uint8Array( res * res );
	for ( let k = 0; k < rock.length; k ++ ) rock[ k ] = Math.round( Math.min( 1, Math.max( 0, terrain.rock[ k ] ) ) * 255 );
	add( 'rock', 'u8-unit', rock );

	for ( const name of BAKED_FIELDS ) if ( name !== 'heights' && name !== 'rock' ) add( name, 'u8', terrain[ name ] );

	const header = new TextEncoder().encode( JSON.stringify( { version: 1, res, sourceHash, fields, rockSites: terrain.rockSites } ) );
	const out = new Uint8Array( 8 + header.length + offset );
	out.set( new TextEncoder().encode( MAGIC ), 0 );
	new DataView( out.buffer ).setUint32( 4, header.length, true );
	out.set( header, 8 );
	let at = 8 + header.length;
	for ( const b of blobs ) {

		out.set( b, at );
		at += b.length;

	}

	return out;

}

export function readIslandHeader( bytes ) {

	if ( new TextDecoder().decode( bytes.subarray( 0, 4 ) ) !== MAGIC ) throw new Error( 'island.bin: not an island bake' );
	const length = new DataView( bytes.buffer, bytes.byteOffset ).getUint32( 4, true );
	return { header: JSON.parse( new TextDecoder().decode( bytes.subarray( 8, 8 + length ) ) ), dataStart: 8 + length };

}

// -> { heights: Float32Array, rock: Float32Array, sand…scarp: Uint8Array, rockSites }, for new TerrainData( seed, baked )
export function decodeIsland( bytes ) {

	const { header, dataStart } = readIslandHeader( bytes );
	const n = header.res * header.res;
	const out = { rockSites: header.rockSites };
	for ( const f of header.fields ) {

		const raw = unzlibSync( bytes.subarray( dataStart + f.offset, dataStart + f.offset + f.length ) );
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
