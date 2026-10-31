// (M15) The way over: finds the trail from the village's hiking trail (IslandShape's PATHS[ 1 ], up the valley
// onto the central spur) over the ridge to the north beach, on the island's baked ground, the way a trail's
// laid out: a least-cost path on a 2 m grid (24 bearings out of each cell, a turn costing as a bend or a switchback
// does to build, so it holds a bearing in legs), each step
// costed by its grade (easy to 10%, steeper costing more, steps from 20% to 45%, nothing steeper), by the
// bench to be cut across the slope it's on (nothing to cut on gentle ground, more as it steepens, none past
// 62°: a cliff), and kept out of the sea. Switchbacks come of it where the ground's steep. Prints the route
// simplified (Douglas-Peucker, within a metre and a half, its grade kept), for terrain/NorthTrail.js.
//
//   node tools/trail-route.mjs [ --png out.png ]

import { readFileSync, writeFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { PATHS } from '../src/world/terrain/IslandShape.js';

const T = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island.bin', import.meta.url ) ) ) ) );
const S = 2, X0 = - 350, X1 = 400, Z0 = - 960, Z1 = 0;
const W = ( X1 - X0 ) / S, H = ( Z1 - Z0 ) / S;
const hAt = new Float32Array( W * H ), slope = new Float32Array( W * H );
for ( let j = 0; j < H; j ++ ) for ( let i = 0; i < W; i ++ ) hAt[ j * W + i ] = T.heightAt( X0 + i * S, Z0 + j * S );
for ( let j = 1; j < H - 1; j ++ ) for ( let i = 1; i < W - 1; i ++ ) {

	const k = j * W + i, gx = ( hAt[ k + 1 ] - hAt[ k - 1 ] ) / ( 2 * S ), gz = ( hAt[ k + W ] - hAt[ k - W ] ) / ( 2 * S );
	slope[ k ] = Math.atan( Math.hypot( gx, gz ) ) * 180 / Math.PI;

}

// the north beach's backshore: dry sand under the cliff, where the trail comes down to
const BEACH = { x: [ 85, 215 ], h: [ 1.3, 2.6 ], slope: 12 };
const isEnd = ( k ) => {

	const i = k % W, j = ( k - i ) / W, x = X0 + i * S;
	return x >= BEACH.x[ 0 ] && x <= BEACH.x[ 1 ] && hAt[ k ] >= BEACH.h[ 0 ] && hAt[ k ] <= BEACH.h[ 1 ] && slope[ k ] < BEACH.slope && Z0 + j * S < - 780;

};

// the ways out of a cell: 24 bearings, a step 2 to 6 m (so it can hold any bearing to within 15°)
const MOVES = [];
for ( let dj = - 3; dj <= 3; dj ++ ) for ( let di = - 3; di <= 3; di ++ ) {

	const g = gcd( Math.abs( di ), Math.abs( dj ) );
	if ( g !== 1 || Math.hypot( di, dj ) > 3.2 ) continue;
	MOVES.push( [ di, dj, Math.hypot( di, dj ) * S, Math.atan2( dj, di ) ] );

}

function gcd( a, b ) {

	return b ? gcd( b, a % b ) : a;

}

// a step's cost: its length, by its grade and by the bench it needs across the slope it's on (the worse of its
// end and its middle); a turn's, as a trail's built: bends cheap, switchbacks dearer, so it holds a bearing
const gradeCost = ( g ) => g <= 0.1 ? 1 + 2 * ( g / 0.1 ) ** 2 : g <= 0.2 ? 3 + 40 * ( g - 0.1 ) : g <= 0.45 ? 7 + 60 * ( g - 0.2 ) : Infinity;
const benchCost = ( s ) => s < 30 ? 0 : s < 62 ? ( ( s - 30 ) / 10 ) ** 2 : Infinity;
const turnCost = ( a, b ) => {

	let d = Math.abs( a - b ) % ( 2 * Math.PI );
	if ( d > Math.PI ) d = 2 * Math.PI - d;
	return d < 0.01 ? 0 : 1.5 + 10 * ( d / Math.PI ) ** 2;

};
const cost = ( a, b, L ) => {

	if ( hAt[ b ] < 1.0 && ! isEnd( b ) ) return Infinity;
	const ai = a % W, aj = ( a - ai ) / W, bi = b % W, bj = ( b - bi ) / W, m = Math.round( ( aj + bj ) / 2 ) * W + Math.round( ( ai + bi ) / 2 );
	if ( hAt[ m ] < 1.0 && ! isEnd( m ) ) return Infinity;
	const g = Math.abs( hAt[ b ] - hAt[ a ] ) / L;
	return L * ( gradeCost( g ) + benchCost( Math.max( slope[ b ], slope[ m ] ) ) );

};

// a state's a cell and the bearing it was come to on; the sources, every point of the valley trail (any
// bearing), at its distance along it from the plaza
const NM = MOVES.length;
const D = new Float64Array( W * H * NM ).fill( Infinity ), from = new Int32Array( W * H * NM ).fill( - 1 );
const heap = [];
const push = ( k, d ) => {

	heap.push( [ d, k ] );
	let n = heap.length - 1;
	while ( n > 0 ) {

		const p = ( n - 1 ) >> 1;
		if ( heap[ p ][ 0 ] <= heap[ n ][ 0 ] ) break;
		[ heap[ p ], heap[ n ] ] = [ heap[ n ], heap[ p ] ];
		n = p;

	}

};
const pop = () => {

	const top = heap[ 0 ], last = heap.pop();
	if ( heap.length ) {

		heap[ 0 ] = last;
		let n = 0;
		for ( ;; ) {

			const l = 2 * n + 1, r = l + 1;
			let m = n;
			if ( l < heap.length && heap[ l ][ 0 ] < heap[ m ][ 0 ] ) m = l;
			if ( r < heap.length && heap[ r ][ 0 ] < heap[ m ][ 0 ] ) m = r;
			if ( m === n ) break;
			[ heap[ m ], heap[ n ] ] = [ heap[ n ], heap[ m ] ];
			n = m;

		}

	}

	return top;

};
const cellOf = ( x, z ) => Math.round( ( z - Z0 ) / S ) * W + Math.round( ( x - X0 ) / S );
const valley = PATHS[ 1 ].pts;
let arc = 0;
for ( let n = 0; n < valley.length; n ++ ) {

	if ( n ) arc += Math.hypot( valley[ n ][ 0 ] - valley[ n - 1 ][ 0 ], valley[ n ][ 1 ] - valley[ n - 1 ][ 1 ] );
	const k = cellOf( valley[ n ][ 0 ], valley[ n ][ 1 ] );
	for ( let m = 0; m < NM; m ++ ) if ( arc < D[ k * NM + m ] ) {

		D[ k * NM + m ] = arc;
		push( k * NM + m, arc );

	}

}

let end = - 1;
while ( heap.length ) {

	const [ d, q ] = pop();
	if ( d > D[ q ] ) continue;
	const k = Math.floor( q / NM ), m0 = q % NM;
	if ( isEnd( k ) ) {

		end = q;
		break;

	}

	const i = k % W, j = ( k - i ) / W;
	for ( let m = 0; m < NM; m ++ ) {

		const [ di, dj, L, a ] = MOVES[ m ];
		const ii = i + di, jj = j + dj;
		if ( ii < 1 || jj < 1 || ii >= W - 1 || jj >= H - 1 ) continue;
		const b = jj * W + ii, c = cost( k, b, L );
		if ( c === Infinity ) continue;
		const nd = d + c + ( from[ q ] < 0 ? 0 : turnCost( MOVES[ m0 ][ 3 ], a ) ), r = b * NM + m;
		if ( nd < D[ r ] ) {

			D[ r ] = nd;
			from[ r ] = q;
			push( r, nd );

		}

	}

}

if ( end < 0 ) throw new Error( 'no way over' );
const cells = [];
for ( let q = end; q >= 0; q = from[ q ] ) cells.push( Math.floor( q / NM ) );
cells.reverse();
const pts = cells.map( ( k ) => [ X0 + ( k % W ) * S, Z0 + Math.floor( k / W ) * S ] );

// simplified within 1.5 m, keeping each kept stretch's grade under 0.45
const hOf = ( p ) => T.heightAt( p[ 0 ], p[ 1 ] );
function simplify( a, b, out ) {

	let worst = - 1, wd = 1.5;
	const [ ax, az ] = pts[ a ], [ bx, bz ] = pts[ b ], len = Math.hypot( bx - ax, bz - az ) || 1;
	for ( let n = a + 1; n < b; n ++ ) {

		const d = Math.abs( ( pts[ n ][ 0 ] - ax ) * ( bz - az ) - ( pts[ n ][ 1 ] - az ) * ( bx - ax ) ) / len;
		if ( d > wd ) {

			wd = d;
			worst = n;

		}

	}

	if ( worst < 0 && b - a > 12 ) worst = ( a + b ) >> 1;
	if ( worst < 0 ) {

		out.push( pts[ b ] );
		return;

	}

	simplify( a, worst, out );
	simplify( worst, b, out );

}

const route = [ pts[ 0 ] ];
simplify( 0, pts.length - 1, route );
let len = 0, climb = 0, steep = 0, maxG = 0, top = - Infinity;
for ( let n = 1; n < pts.length; n ++ ) {

	const L = Math.hypot( pts[ n ][ 0 ] - pts[ n - 1 ][ 0 ], pts[ n ][ 1 ] - pts[ n - 1 ][ 1 ] ), dh = hOf( pts[ n ] ) - hOf( pts[ n - 1 ] );
	len += L;
	climb += Math.max( 0, dh );
	maxG = Math.max( maxG, Math.abs( dh ) / L );
	if ( Math.abs( dh ) / L > 0.2 ) steep += L;
	top = Math.max( top, hOf( pts[ n ] ) );

}

console.log( `from ( ${ pts[ 0 ].join( ', ' ) } ) at ${ hOf( pts[ 0 ] ).toFixed( 0 ) } m to ( ${ pts.at( - 1 ).join( ', ' ) } ): ${ len.toFixed( 0 ) } m, ${ climb.toFixed( 0 ) } m of climbing, its top ${ top.toFixed( 0 ) } m, ${ steep.toFixed( 0 ) } m over 20% (steps), steepest ${ ( maxG * 100 ).toFixed( 0 ) }%` );
console.log( JSON.stringify( route.map( ( [ x, z ] ) => [ x, z ] ) ) );

const png = process.argv.indexOf( '--png' );
if ( png > 0 ) writeFileSync( process.argv[ png + 1 ], JSON.stringify( { W, H, S, X0, Z0, pts, route } ) );
