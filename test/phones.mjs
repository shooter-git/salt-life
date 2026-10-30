// (M15 step 20) What a phone's spared: the village behind the island's mountain from the north shore, and the
// weedlines the fog has whole.
//
//   node test/phones.mjs

import { readFileSync } from 'node:fs';
import { G } from '../src/core/Globals.js';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandDecode.js';
import { sightBlocked, hiddenBox } from '../src/world/SightLine.js';
import { CAMP } from '../src/game/FishCamp.js';

let failed = 0;
const check = ( ok, what ) => {

	console.log( ( ok ? 'ok   ' : 'FAIL ' ) + what );
	if ( ! ok ) failed ++;

};

// ---- the line itself
{

	const ridge = ( x, z ) => ( Math.abs( z ) < 50 ? 100 : 0 );
	check( sightBlocked( ridge, 0, 2, - 300, 0, 5, 300 ), 'a ridge between them hides it' );
	check( ! sightBlocked( ridge, 0, 300, - 300, 0, 5, 300 ), 'from high enough, not' );
	check( ! sightBlocked( ( ) => 0, 0, 2, - 300, 0, 5, 300 ), 'on the flat, not' );
	check( ! sightBlocked( ( ) => 50, 0, 2, 0, 0, 2, 20 ), 'and what\'s close by isn\'t the mountain' );
	const box = { min: { x: - 50, z: 280 }, max: { x: 50, y: 20, z: 320 } };
	check( hiddenBox( ridge, 0, 2, - 300, box ), 'a box behind it: hidden' );
	const notch = ( x, z ) => ( Math.abs( z ) < 50 && x < 40 ? 100 : 0 );
	check( ! hiddenBox( notch, 50, 2, - 300, box ), 'with a corner of it showing through a gap, not' );

}

// ---- on the island's own ground: the bay's village from where people go
{

	const T = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island.bin', import.meta.url ) ) ) ) );
	const h = ( x, z ) => T.heightAt( x, z ), sea = G.seaLevel.value;
	// (the harbour and the town, as the village has them: about the bay, roofs at 12 m and 60 m)
	const harbour = { min: { x: - 60, z: - 60 }, max: { x: 130, y: 16, z: 60 } }, town = { min: { x: - 80, z: - 190 }, max: { x: 140, y: 70, z: - 40 } };
	const from = ( x, y, z ) => [ h, x, y, z ];
	check( hiddenBox( ...from( CAMP.keeper.x, Math.max( h( CAMP.keeper.x, CAMP.keeper.z ), sea ) + 1.7, CAMP.keeper.z ), harbour ), 'from the fish camp, the harbour\'s behind the mountain' );
	check( hiddenBox( ...from( 150, sea + 2, - 900 ), town ), 'from the north beach, the town too' );
	check( ! hiddenBox( ...from( 64, sea + 3, 150 ), harbour ), 'from the bay, it isn\'t' );
	check( ! hiddenBox( ...from( 64, sea + 3, 2000 ), town ), 'nor from out to sea to the south' );

}

// ---- the sea's noise (WaterSurface's waterHash, as the shader has it): as good as the fuller hash it replaced
{

	const A = 1597334677, B = 3812015801 | 0;
	const hash = ( x, y ) => {

		const h = Math.imul( Math.imul( x, A ) ^ Math.imul( y, B ), A ) >>> 0;
		return ( ( h ^ ( h >>> 16 ) ) >>> 8 ) / 16777216;

	};

	for ( const [ ox, oy ] of [ [ 0, 0 ], [ - 3000, 20000 ], [ 100000, 77 ] ] ) {

		const N = 256, v = new Float64Array( N * N );
		let m = 0;
		for ( let j = 0; j < N; j ++ ) for ( let i = 0; i < N; i ++ ) m += v[ j * N + i ] = hash( i + ox, j + oy );
		m /= N * N;
		let s2 = 0, cx = 0, cy = 0, cd = 0;
		for ( let j = 0; j + 1 < N; j ++ ) for ( let i = 0; i + 1 < N; i ++ ) {

			const a = v[ j * N + i ] - m;
			s2 += a * a;
			cx += a * ( v[ j * N + i + 1 ] - m );
			cy += a * ( v[ ( j + 1 ) * N + i ] - m );
			cd += a * ( v[ ( j + 1 ) * N + i + 1 ] - m );

		}

		check( Math.abs( m - 0.5 ) < 0.01 && Math.abs( s2 / ( ( N - 1 ) * ( N - 1 ) ) - 1 / 12 ) < 0.003, `evenly spread about ( ${ ox }, ${ oy } )` );
		check( Math.max( Math.abs( cx ), Math.abs( cy ), Math.abs( cd ) ) / s2 < 0.02, 'and each cell nothing to do with the next' );

	}

	const src = readFileSync( new URL( '../src/ocean/WaterSurface.js', import.meta.url ), 'utf8' );
	check( src.includes( '1597334677u' ) && src.includes( '3812015801u' ), 'the same hash as the shader\'s' );
	check( ! /waterHash\( i \+/.test( src ), 'its four corners worked out at once in the noise, not a copy of it each' );
	check( /for \( int i = 0; i < 4; i \+\+ \) m\[ i \] = waterNoise/.test( src ), 'and a lace\'s noises round a loop: a call\'s a copy of the code to the compiler' );

}

// ---- what a device that draws on its CPU leaves out of the 45 s it has to load
{

	const src = readFileSync( new URL( '../src/App.js', import.meta.url ), 'utf8' );
	for ( const name of [ 'Lighthouse', 'HarbourLights', 'Wreck', 'Turtles', 'FarIsland', 'Signpost' ] ) check( new RegExp( `const landmarks = .*\\b${ name }\\b` ).test( src ), `${ name }: its shaders after the start` );
	check( /lean: this\.cpuGL/.test( src ) && /coarseCaves: this\.cpuGL/.test( src ), 'the sea\'s weedlines and slick left out, the far caves coarse' );

}

if ( failed ) {

	console.log( `${ failed } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
