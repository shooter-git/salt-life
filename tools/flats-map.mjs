#!/usr/bin/env node
// (M17) Where the island's flats are, and what a tide does to them: the island's bake as TerrainData has it (the
// north beach, the trail and the caves are cut in at load by App, not here), its water at low, mean and high water
// for a tide of `range` m, about the sea's mean level (0). Prints each flat (a stretch under `flat` m of water at mean
// level, sand, grass or the mangroves' mud, no rock to speak of) with its area, depths and bottom, how much of it a low
// water bares and how much a high water floods; and writes a PNG of it, north up.
//
//   node tools/flats-map.mjs [range, m] [out.png] [half width, m] [m a pixel] [middle x, z]
//   node tools/flats-map.mjs 0.93 qa-output/flats/island.png 1300 2            (the island, at Settlement Point's range)
//   node tools/flats-map.mjs 0.93 qa-output/flats/village.png 260 0.5 60 -20   (the village's flats)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zlibSync } from 'fflate';

const ROOT = fileURLToPath( new URL( '..', import.meta.url ) );
const [ RANGE = '0.93', OUT = 'qa-output/flats/island.png', HALF = '1300', STEP = '2', CX = '0', CZ = '-300' ] = process.argv.slice( 2 );
const range = Number( RANGE ), out = join( ROOT, OUT ), half = Number( HALF ), step = Number( STEP ), cx = Number( CX ), cz = Number( CZ );

const { TerrainData } = await import( '../src/world/TerrainData.js' );
const { decodeIsland } = await import( '../src/world/terrain/IslandDecode.js' );
const { Offshore, decodeSeabed } = await import( '../src/world/terrain/Offshore.js' );
const { mangroveAt } = await import( '../src/world/terrain/Mangrove.js' );
const read = ( f ) => new Uint8Array( readFileSync( join( ROOT, 'public/world', f ) ) );
const T = new TerrainData( 7, decodeIsland( read( 'island.bin' ) ), { offshore: new Offshore( decodeSeabed( read( 'offshore.bin' ) ) ) } );

const LOW = - range / 2, HIGH = range / 2;
const FLAT = 1.2; // m of water at mean level: a flat (a foot or two, and its edges)
const WADE = 0.6; // m: about knee to thigh, where you'd wade and a bonefish tails
const MIN_AREA = 2000; // m^2: smaller than this isn't a flat of its own
const KAYAK = [ 44, - 38 ]; // her berth on the sand (fleet/Berths.js)

// a cell's bottom: rock, mud (the mangroves'), grass or sand
const cellOf = ( x, z ) => {

	const i = Math.floor( ( x - T.origin ) / T.texel ), j = Math.floor( ( z - T.origin ) / T.texel );
	if ( i < 0 || j < 0 || i >= T.res || j >= T.res ) return 'sand';
	const k = j * T.res + i;
	if ( T.rock[ k ] > 0.5 ) return 'rock';
	const m = mangroveAt( x, z );
	if ( m.stand > 0.3 || m.creek > 0.3 || m.fringe > 0.3 ) return 'mud';
	return T.seagrass[ k ] > 128 ? 'grass' : 'sand';

};

const N = Math.round( 2 * half / step ), A = step * step;
const H = new Float32Array( N * N ), B = new Array( N * N );
const xAt = ( i ) => cx - half + ( i + 0.5 ) * step, zAt = ( j ) => cz - half + ( j + 0.5 ) * step;
for ( let j = 0; j < N; j ++ ) for ( let i = 0; i < N; i ++ ) {

	H[ j * N + i ] = T.heightAt( xAt( i ), zAt( j ) );
	B[ j * N + i ] = cellOf( xAt( i ), zAt( j ) );

}

// the water over the whole window, in bands, at each stage
const BANDS = [ [ 'dry', - Infinity, 0 ], [ '0-0.3 m', 0, 0.3 ], [ '0.3-0.6 m', 0.3, 0.6 ], [ '0.6-1.2 m', 0.6, 1.2 ], [ '1.2-3.5 m', 1.2, 3.5 ] ];
const bandArea = ( level ) => BANDS.map( ( [ , a, b ] ) => {

	let n = 0;
	for ( let k = 0; k < N * N; k ++ ) {

		const d = level - H[ k ];
		if ( d > a && d <= b ) n ++;

	}

	return n * A;

} );
const ha = ( m2 ) => ( m2 / 10000 ).toFixed( 2 ).padStart( 7 );
console.log( `Tide range ${ range } m: low water ${ LOW.toFixed( 2 ) }, high water +${ HIGH.toFixed( 2 ) } m about the mean. Window ${ 2 * half } m square about (${ cx }, ${ cz }), ${ step } m a cell. Areas in hectares.\n` );
console.log( 'water'.padEnd( 12 ) + BANDS.slice( 1 ).map( ( b ) => b[ 0 ].padStart( 11 ) ).join( '' ) );
for ( const [ name, level ] of [ [ 'low water', LOW ], [ 'mean', 0 ], [ 'high water', HIGH ] ] ) console.log( name.padEnd( 12 ) + bandArea( level ).slice( 1 ).map( ( a ) => ha( a ).padStart( 11 ) ).join( '' ) );

// the flats: cells under FLAT m at mean level (or bared by a low water, or flooded by a high one), not rock, joined
const isFlat = ( k ) => H[ k ] < HIGH && H[ k ] > - FLAT && B[ k ] !== 'rock';
const region = new Int32Array( N * N ).fill( - 1 );
const flats = [];
for ( let s = 0; s < N * N; s ++ ) {

	if ( region[ s ] >= 0 || ! isFlat( s ) ) continue;
	const id = flats.length, stack = [ s ], f = { id, n: 0, x: 0, z: 0, wet: 0, bared: 0, flooded: 0, wade: [ 0, 0, 0 ], bottom: { sand: 0, grass: 0, mud: 0 }, depth: 0, deepest: 0 };
	region[ s ] = id;
	while ( stack.length ) {

		const k = stack.pop(), i = k % N, j = ( k - i ) / N, h = H[ k ];
		f.n ++;
		f.x += xAt( i );
		f.z += zAt( j );
		f.bottom[ B[ k ] ] ++;
		if ( h < 0 ) {

			f.wet ++;
			f.depth -= h;
			f.deepest = Math.max( f.deepest, - h );

		}

		if ( h < 0 && h > LOW ) f.bared ++;
		if ( h >= 0 ) f.flooded ++;
		[ LOW, 0, HIGH ].forEach( ( L, n ) => {

			if ( L - h > 0 && L - h <= WADE ) f.wade[ n ] ++;

		} );
		for ( const [ di, dj ] of [ [ 1, 0 ], [ - 1, 0 ], [ 0, 1 ], [ 0, - 1 ] ] ) {

			const a = i + di, b = j + dj;
			if ( a < 0 || b < 0 || a >= N || b >= N ) continue;
			const q = b * N + a;
			if ( region[ q ] < 0 && isFlat( q ) ) {

				region[ q ] = id;
				stack.push( q );

			}

		}

	}

	flats.push( f );

}

const big = flats.filter( ( f ) => f.n * A >= MIN_AREA ).sort( ( a, b ) => b.n - a.n );
console.log( `\n${ big.length } flats of ${ MIN_AREA / 10000 } ha or more (under ${ FLAT } m at mean level, or bared or flooded by the tide; rock left out):\n` );
console.log( '  #   middle (x, z)   to the kayak   area   mean depth  deepest   bared at low   flooded at high   wading-deep at low / mean / high   sand  grass  mud' );
big.forEach( ( f, n ) => {

	const x = f.x / f.n, z = f.z / f.n, pc = ( v ) => `${ Math.round( 100 * v / f.n ) }%`;
	console.log( `${ String( n + 1 ).padStart( 3 ) }   (${ x.toFixed( 0 ).padStart( 5 ) }, ${ z.toFixed( 0 ).padStart( 5 ) })   ${ Math.hypot( x - KAYAK[ 0 ], z - KAYAK[ 1 ] ).toFixed( 0 ).padStart( 6 ) } m   ${ ha( f.n * A ) }   ${ ( f.wet ? f.depth / f.wet : 0 ).toFixed( 2 ).padStart( 6 ) } m   ${ f.deepest.toFixed( 2 ).padStart( 5 ) } m   ${ pc( f.bared ).padStart( 10 ) }   ${ pc( f.flooded ).padStart( 13 ) }   ${ f.wade.map( pc ).join( ' / ' ).padStart( 22 ) }   ${ pc( f.bottom.sand ).padStart( 10 ) } ${ pc( f.bottom.grass ).padStart( 5 ) } ${ pc( f.bottom.mud ).padStart( 4 ) }` );

} );

// the picture: the land, the flats coloured by their water at mean level, the low water's and high water's lines
const LAND = [ 120, 140, 82 ], ROCK = [ 104, 98, 92 ];
const WATER = [ [ 0, [ 236, 226, 186 ] ], [ 0.3, [ 186, 232, 214 ] ], [ 0.6, [ 128, 214, 206 ] ], [ 1.2, [ 84, 186, 200 ] ], [ 3.5, [ 52, 140, 186 ] ], [ 20, [ 30, 86, 150 ] ] ];
const colour = ( k ) => {

	const h = H[ k ];
	if ( h >= HIGH ) return B[ k ] === 'rock' ? ROCK : LAND;
	if ( h >= 0 ) return [ 222, 206, 150 ]; // between the mean and high water: flooded at high
	const d = - h;
	for ( let n = 1; n < WATER.length; n ++ ) if ( d <= WATER[ n ][ 0 ] ) {

		const [ a, ca ] = WATER[ n - 1 ], [ b, cb ] = WATER[ n ], t = ( d - a ) / ( b - a );
		return ca.map( ( c, m ) => c + ( cb[ m ] - c ) * t );

	}

	return WATER[ WATER.length - 1 ][ 1 ];

};
const crosses = ( k, q, L ) => ( H[ k ] > L ) !== ( H[ q ] > L );
const px = new Uint8Array( N * ( N * 3 + 1 ) );
for ( let j = 0; j < N; j ++ ) {

	px[ j * ( N * 3 + 1 ) ] = 0;
	for ( let i = 0; i < N; i ++ ) {

		const k = j * N + i, r = j * N + Math.min( N - 1, i + 1 ), d = Math.min( N - 1, j + 1 ) * N + i;
		let c = colour( k );
		if ( B[ k ] === 'grass' && H[ k ] < 0 ) c = c.map( ( v, m ) => v * 0.82 + [ 40, 70, 30 ][ m ] * 0.18 );
		if ( B[ k ] === 'mud' && H[ k ] < HIGH ) c = c.map( ( v, m ) => v * 0.7 + [ 90, 70, 50 ][ m ] * 0.3 );
		if ( crosses( k, r, LOW ) || crosses( k, d, LOW ) ) c = [ 200, 60, 40 ]; // low water's line
		if ( crosses( k, r, HIGH ) || crosses( k, d, HIGH ) ) c = [ 30, 30, 30 ]; // high water's
		const o = j * ( N * 3 + 1 ) + 1 + i * 3;
		for ( let m = 0; m < 3; m ++ ) px[ o + m ] = Math.max( 0, Math.min( 255, c[ m ] ) );

	}

}

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
mkdirSync( dirname( out ), { recursive: true } );
writeFileSync( out, Buffer.concat( [ new Uint8Array( [ 137, 80, 78, 71, 13, 10, 26, 10 ] ), chunk( 'IHDR', ihdr ), chunk( 'IDAT', zlibSync( px, { level: 6 } ) ), chunk( 'IEND', new Uint8Array() ) ] ) );
console.log( `\n${ out }: ${ N } x ${ N }, ${ step } m a pixel, north up. Red: low water's line; black: high water's; sand-coloured: bared at low or flooded at high; greener: grass; browner: the mangroves' mud.` );
