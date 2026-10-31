#!/usr/bin/env node
// (M16) Packs what tools/sportfisher/seats.py made into src/world/boat/sportfisher/seats.data.js: positions in 16 bits over
// their bounds, normals in 8, indices in 16, base64. Importing it needs no fetch, so Node's tests build her too, and it comes
// in her own chunk: only someone in her pays for it.
//   blender -b -P tools/sportfisher/seats.py -- /tmp/seats.json && node tools/sportfisher/build-seats.mjs /tmp/seats.json
import { readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse( readFileSync( process.argv[ 2 ], 'utf8' ) );
const b64 = ( t ) => Buffer.from( t.buffer, t.byteOffset, t.byteLength ).toString( 'base64' );
const pack = ( { p, n, i } ) => {

	const min = [ Infinity, Infinity, Infinity ], max = [ - Infinity, - Infinity, - Infinity ];
	for ( let k = 0; k < p.length; k ++ ) {

		min[ k % 3 ] = Math.min( min[ k % 3 ], p[ k ] );
		max[ k % 3 ] = Math.max( max[ k % 3 ], p[ k ] );

	}

	const P = new Uint16Array( p.length ), N = new Int8Array( n.length );
	for ( let k = 0; k < p.length; k ++ ) P[ k ] = Math.round( 65535 * ( p[ k ] - min[ k % 3 ] ) / Math.max( 1e-6, max[ k % 3 ] - min[ k % 3 ] ) );
	for ( let k = 0; k < n.length; k ++ ) N[ k ] = Math.round( 127 * n[ k ] );
	return { min: min.map( ( v ) => + v.toFixed( 4 ) ), max: max.map( ( v ) => + v.toFixed( 4 ) ), p: b64( P ), n: b64( N ), i: b64( Uint16Array.from( i ) ) };

};

const out = {};
for ( const [ seat, parts ] of Object.entries( raw ) ) {

	out[ seat ] = {};
	for ( const [ part, lods ] of Object.entries( parts ) ) out[ seat ][ part ] = { high: pack( lods.high ), low: pack( lods.low ) };

}

const text = `// (M16) Made by tools/sportfisher/build-seats.mjs, from tools/sportfisher/seats.py. Not to be edited.\nexport const SEATS = ${ JSON.stringify( out ) };\n`;
writeFileSync( new URL( '../../src/world/boat/sportfisher/seats.data.js', import.meta.url ), text );
console.log( `seats.data.js: ${ ( text.length / 1024 ).toFixed( 1 ) } KB` );
