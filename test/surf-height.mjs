// (M20) The surf's water height on the CPU (stream SEA: docs/m20/sea.md). The sea draws each vertex at its resting point moved
// by the open sea's waves and the shore's, whose push along the wave's way squeezes a breaking wave's face into a wall and
// folds it over; the query (WaterQuery.heightAt) has to find the resting point drawn at the point asked about, and where the
// water folds, the highest of them, as the sea's seen from above. Here, against every resting point drawn there, found by
// brute force; the integer hash both sides share (pcgHash, shorePcg); and what a height costs. The drawn water itself is
// measured in a browser: tools/checks/shore-match.mjs.
import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { Waves } from '../src/ocean/Waves.js';
import { WaterQuery } from '../src/ocean/WaterQuery.js';
import { ShoreWaves, pcgHash, ampHash } from '../src/ocean/ShoreWaves.js';
import { computeShoreField } from '../src/world/ShoreField.js';
import { WORLD } from '../src/world/WorldLayout.js';
import { G } from '../src/core/Globals.js';

let failed = 0;
const check = ( ok, label ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ label }` );
	if ( ! ok ) failed ++;

};

// ---- the integer hash: PCG's, in 32-bit unsigned arithmetic, as the shader's (BigInt's the reference)
{

	const M = ( 1n << 32n ) - 1n;
	const ref = ( v ) => {

		const s = ( BigInt( v >>> 0 ) * 747796405n + 2891336453n ) & M;
		const w = ( ( ( s >> ( ( s >> 28n ) + 4n ) ) ^ s ) * 277803737n ) & M;
		return Number( ( w >> 22n ) ^ w );

	};

	const vs = [ 0, 1, 2, 7, 1000, 123456, 0x7fffffff, 0x80000000, 0xffffffff, - 1, - 2, - 1000 ];
	for ( let i = 0; i < 200; i ++ ) vs.push( ( i * 2654435761 ) >>> 0 );
	check( vs.every( ( v ) => pcgHash( v ) === ref( v ) ), 'the integer hash is PCG\'s to the bit, negative and past 2^31 too (the shader\'s uint arithmetic)' );
	let lo = 1, hi = 0, sum = 0;
	for ( let m = - 500; m < 20000; m ++ ) {

		const h = ampHash( m );
		lo = Math.min( lo, h );
		hi = Math.max( hi, h );
		sum += h;

	}

	check( lo >= 0 && hi < 1 && Math.abs( sum / 20500 - 0.5 ) < 0.01, `each wave's own height's hash lies in [ 0, 1 ), about 0.5 on average (${ ( sum / 20500 ).toFixed( 3 ) }), past wave 20000` );

}

// ---- the height against every resting point drawn there
const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island.bin', import.meta.url ) ) ) ) );
const waves = new Waves( { tier: 'mid', terrain } );
const shore = new ShoreWaves( { field: computeShoreField( terrain, { res: 512, swellDir: [ WORLD.swellDir.x, WORLD.swellDir.y ] } ) } );
shore.setSurf( 0.6 ); // (a big day's surf: its faces broken and folded more often than a fair day's)
const q = new WaterQuery( waves, terrain, shore );
const v = { x: 0, y: 0, z: 0, push: 0, px: 0, pz: 0, reach: 0 };
// every resting point within R m of ( x, z ) on a STEP m grid drawn within NEAR m of it: the highest and the lowest of their heights
const R = 2.4, STEP = 0.04, NEAR = 0.05;
const drawnThere = ( x, z, t ) => {

	const fade = waves.fadeAt( x, z ), lee = waves.leeAt( x, z ), n = Math.round( R / STEP );
	let top = - Infinity, bottom = Infinity;
	for ( let i = - n; i <= n; i ++ ) for ( let j = - n; j <= n; j ++ ) {

		q.vertexAt( x + i * STEP, z + j * STEP, t, fade, lee, v, true );
		if ( Math.hypot( v.x - x, v.z - z ) < NEAR ) {

			top = Math.max( top, v.y );
			bottom = Math.min( bottom, v.y );

		}

	}

	return [ top, bottom ];

};

const SPOTS = { swash: [ 42, - 27 ], surf: [ 38, - 12 ] };
let cost = 0, costN = 0, nowAll = 0, wasAll = 0;
for ( const level of [ - 0.3, 0.3 ] ) for ( const T of [ 1000, 50000 ] ) {

	G.seaLevel.value = level;
	let n = 0, near = 0, inside = 0, nowOff = 0, wasOff = 0, worst = 0, placed = 0, exact = 0;
	for ( const [ name, [ mx, mz ] ] of Object.entries( SPOTS ) ) for ( let k = 0; k < 20; k ++ ) {

		// (points across the spot's square, 12 m across, the same each run)
		const x = mx - 6 + ( ( k * 0.6180339 + 0.13 ) % 1 ) * 12, z = mz - 6 + ( ( k * 0.7548777 + 0.41 ) % 1 ) * 12;
		const ground = terrain.heightAt( x, z );
		const [ top, bottom ] = drawnThere( x, z, T );
		if ( top === - Infinity || top < ground + 0.03 ) continue; // (dry, or the sheet alone)
		const t0 = performance.now();
		const h = q.heightAt( x, z, T );
		cost += performance.now() - t0;
		costN ++;
		n ++;
		// (its resting point's drawn there, and its height's the one asked for)
		q.vertexAt( x + q._ox, z + q._oz, T, waves.fadeAt( x, z ), waves.leeAt( x, z ), v, true );
		if ( Math.hypot( v.x - x, v.z - z ) < NEAR ) placed ++;
		if ( Math.abs( v.y - h ) < 1e-9 ) exact ++;
		if ( Math.abs( h - top ) < 0.05 ) near ++;
		if ( h > bottom - 0.03 && h < top + 0.03 ) inside ++;
		worst = Math.max( worst, Math.abs( h - top ) );
		if ( Math.abs( h - top ) > 0.05 ) nowOff ++;
		// (and the old way, the shore's height at the point itself on the open sea's)
		const old = waves.heightAt( x, z, T ) + shore.sample( x, z, T, ground, terrain ).y;
		if ( Math.abs( old - top ) > 0.05 ) wasOff ++;

	}

	console.log( `     sea ${ level } m, ${ T } s: ${ n } wet points; the height within 5 cm of the highest water drawn there at ${ near }, off by ${ ( worst * 100 ).toFixed( 1 ) } cm at most (the old way ${ wasOff } more than 5 cm off)` );
	check( n >= 16 && placed === n && exact === n, `sea ${ level } m, ${ T } s: each height's resting point is drawn within 5 cm of the point, and the height is that point's` );
	// (a bore's toe run up over the swash sheet ahead of it can be missed, from a resting point the shore doesn't push: the sheet's
	// where the steps end, and nothing says to look behind. 2 points in 160 here, 20 cm at most: docs/m20/sea.md)
	check( inside === n && nowOff <= 2, `sea ${ level } m, ${ T } s: the height is the highest water drawn there (within 5 cm at all but two points, and between the face's top and foot at every one)` );
	nowAll += nowOff;
	wasAll += wasOff;

}

check( wasAll >= 4 * Math.max( nowAll, 1 ), `the old way's more than 5 cm off at ${ wasAll } points, the new at ${ nowAll }` );

const us = cost / costN * 1000;
console.log( `     a height in the surf costs ${ us.toFixed( 0 ) } us on average` );
check( us < 400, 'a height in the surf costs well under half a millisecond' );

G.seaLevel.value = 0;
if ( failed ) {

	console.log( `\n${ failed } failed` );
	process.exit( 1 );

}

console.log( '\nall passed' );
