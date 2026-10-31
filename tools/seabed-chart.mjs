#!/usr/bin/env node
// (M15) A chart of the seabed as the game has it (the island's bake, the seabed past it, its edge blended
// as TerrainData blends it): shaded relief, coloured by depth, with depth contours, written as a PNG.
//
//   node tools/seabed-chart.mjs [half width, m] [m a pixel] [out.png] [middle x, z]
//   node tools/seabed-chart.mjs 14000 28 qa-output/seabed/chart.png             (the whole of it)
//   node tools/seabed-chart.mjs 3200 6 qa-output/seabed/island.png              (the island's shelf and canyon head)
//   node tools/seabed-chart.mjs 3500 5 qa-output/seabed/bank.png -6200 7400     (the bank and its sandbar)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zlibSync } from 'fflate';

const ROOT = fileURLToPath( new URL( '..', import.meta.url ) );
const [ HALF = '14000', STEP = '28', OUT = 'qa-output/seabed/chart.png', CX = '0', CZ = '0' ] = process.argv.slice( 2 );
const half = Number( HALF ), step = Number( STEP ), out = join( ROOT, OUT ), cx = Number( CX ), cz = Number( CZ );

const { TerrainData } = await import( '../src/world/TerrainData.js' );
const { decodeIsland } = await import( '../src/world/terrain/IslandDecode.js' );
const { Offshore, decodeSeabed } = await import( '../src/world/terrain/Offshore.js' );
const read = ( f ) => new Uint8Array( readFileSync( join( ROOT, 'public/world', f ) ) );
const terrain = new TerrainData( 7, decodeIsland( read( 'island.bin' ) ), { offshore: new Offshore( decodeSeabed( read( 'offshore.bin' ) ) ) } );

const N = Math.round( 2 * half / step );
const H = new Float32Array( N * N );
for ( let j = 0; j < N; j ++ ) for ( let i = 0; i < N; i ++ ) H[ j * N + i ] = terrain.heightAt( cx - half + ( i + 0.5 ) * step, cz - half + ( j + 0.5 ) * step );

// depth colours (m below the sea: the shallows' pale to the deep's dark), the land's green to brown
const STOPS = [ [ 0, [ 196, 236, 232 ] ], [ 5, [ 120, 210, 214 ] ], [ 20, [ 70, 170, 200 ] ], [ 60, [ 48, 128, 188 ] ], [ 120, [ 34, 90, 160 ] ], [ 400, [ 22, 58, 124 ] ], [ 1000, [ 14, 36, 92 ] ], [ 1900, [ 8, 20, 60 ] ] ];
const colour = ( h ) => {

	if ( h > 0 ) return h < 2 ? [ 226, 212, 168 ] : [ 96 + Math.min( 1, h / 220 ) * 80, 132 - Math.min( 1, h / 220 ) * 30, 70 ];
	const d = - h;
	for ( let k = 1; k < STOPS.length; k ++ ) if ( d <= STOPS[ k ][ 0 ] ) {

		const [ a, ca ] = STOPS[ k - 1 ], [ b, cb ] = STOPS[ k ], t = ( d - a ) / ( b - a );
		return ca.map( ( c, n ) => c + ( cb[ n ] - c ) * t );

	}

	return STOPS[ STOPS.length - 1 ][ 1 ];

};

const CONTOURS = [ 10, 20, 50, 100, 200, 500, 1000, 1500 ];
const band = ( h ) => CONTOURS.filter( ( c ) => - h > c ).length;
const px = new Uint8Array( N * ( N * 3 + 1 ) );
for ( let j = 0; j < N; j ++ ) {

	px[ j * ( N * 3 + 1 ) ] = 0;
	for ( let i = 0; i < N; i ++ ) {

		const h = H[ j * N + i ];
		const hx = H[ j * N + Math.min( N - 1, i + 1 ) ] - H[ j * N + Math.max( 0, i - 1 ) ];
		const hz = H[ Math.min( N - 1, j + 1 ) * N + i ] - H[ Math.max( 0, j - 1 ) * N + i ];
		// light from the north-west, the relief exaggerated where it's gentle
		const shade = Math.max( 0.35, Math.min( 1.3, 1 + ( hx - hz ) / ( 2 * step ) * 0.9 ) );
		let c = colour( h ).map( ( v ) => v * shade );
		const edge = band( h ) !== band( H[ j * N + Math.min( N - 1, i + 1 ) ] ) || band( h ) !== band( H[ Math.min( N - 1, j + 1 ) * N + i ] );
		if ( edge && h < 0 ) c = c.map( ( v ) => v * 0.55 + 255 * 0.25 );
		if ( ( h > 0 ) !== ( H[ j * N + Math.min( N - 1, i + 1 ) ] > 0 ) || ( h > 0 ) !== ( H[ Math.min( N - 1, j + 1 ) * N + i ] > 0 ) ) c = [ 30, 30, 30 ];
		const o = j * ( N * 3 + 1 ) + 1 + i * 3;
		px[ o ] = Math.max( 0, Math.min( 255, c[ 0 ] ) ); px[ o + 1 ] = Math.max( 0, Math.min( 255, c[ 1 ] ) ); px[ o + 2 ] = Math.max( 0, Math.min( 255, c[ 2 ] ) );

	}

}

// a PNG (8-bit RGB)
const CRC = new Uint32Array( 256 ).map( ( _, n ) => {

	let c = n;
	for ( let k = 0; k < 8; k ++ ) c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1;
	return c;

} );
const crc = ( b ) => {

	let c = 0xffffffff;
	for ( const v of b ) c = CRC[ ( c ^ v ) & 0xff ] ^ ( c >>> 8 );
	return ( c ^ 0xffffffff ) >>> 0;

};
const chunk = ( type, data ) => {

	const b = new Uint8Array( 12 + data.length ), dv = new DataView( b.buffer );
	dv.setUint32( 0, data.length );
	b.set( new TextEncoder().encode( type ), 4 );
	b.set( data, 8 );
	dv.setUint32( 8 + data.length, crc( b.subarray( 4, 8 + data.length ) ) );
	return b;

};
const ihdr = new Uint8Array( 13 ), dv = new DataView( ihdr.buffer );
dv.setUint32( 0, N ); dv.setUint32( 4, N ); ihdr[ 8 ] = 8; ihdr[ 9 ] = 2;
const parts = [ new Uint8Array( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ), chunk( 'IHDR', ihdr ), chunk( 'IDAT', zlibSync( px, { level: 6 } ) ), chunk( 'IEND', new Uint8Array() ) ];
mkdirSync( dirname( out ), { recursive: true } );
writeFileSync( out, Buffer.concat( parts ) );
console.log( `${ out }: ${ N } x ${ N }, ${ step } m a pixel, north up; contours at ${ CONTOURS.join( ', ' ) } m` );
