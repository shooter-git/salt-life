// The sea's CPU side: the Eulerian height the boat and the swimmer read must sit on the surface the GPU
// draws (the grid point x0 displaced by the same waves), the waves must fade out over land, and the
// query results must be sane numbers.
import { readFileSync } from 'node:fs';
import { TerrainData } from '../src/world/TerrainData.js';
import { decodeIsland } from '../src/world/terrain/IslandBake.js';
import { Waves } from '../src/ocean/Waves.js';
import { WaterQuery } from '../src/ocean/WaterQuery.js';

let failed = 0;
const check = ( ok, label ) => {

	console.log( `${ ok ? 'ok  ' : 'FAIL' } ${ label }` );
	if ( ! ok ) failed ++;

};

const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( new URL( '../public/world/island.bin', import.meta.url ) ) ) ) );

for ( const tier of [ 'low', 'mid', 'high' ] ) {

	const waves = new Waves( { tier, terrain } );
	const d = [ 0, 0, 0 ];
	let worst = 0;
	for ( let i = 0; i < 200; i ++ ) {

		// open water south of the island
		const x0 = - 600 + ( i * 37 ) % 1200, z0 = 200 + ( i * 53 ) % 600, t = i * 0.37;
		waves.displacement( x0, z0, t, d );
		const h = waves.heightAt( x0 + d[ 0 ], z0 + d[ 2 ], t );
		worst = Math.max( worst, Math.abs( h - d[ 1 ] ) );

	}

	check( worst < 0.02, `${ tier }: the height at a displaced grid point matches the surface drawn there (worst ${ ( worst * 100 ).toFixed( 2 ) } cm)` );

}

const waves = new Waves( { tier: 'mid', terrain } );
check( waves.fadeAt( 0, - 300 ) === 0, 'no open-sea waves on the island' );
check( waves.fadeAt( 0, 600 ) === 1, 'full waves offshore' );

const query = new WaterQuery( waves, terrain );
const slot = query.allocate( 'test', 3 );
query.setCamera( 64, 36 );
query.setPoint( slot, 0, 600 );
query.setPoint( slot + 1, 55, 10 );
query.setPoint( slot + 2, 0, - 300 );
query.update();
const finite = [ ...query.cpu.subarray( 0, query.count * 4 ) ].every( Number.isFinite );
check( query.cpuValid && finite, 'water queries give finite results' );
const n = ( i ) => Math.hypot( query.cpu[ i * 4 + 1 ], query.cpu[ i * 4 + 2 ] );
check( n( slot ) < 0.6 && n( slot + 2 ) < 1e-6, 'surface normals tilt with the waves, flat over land' );
check( query.cpu[ ( slot + 2 ) * 4 + 3 ] > 10, 'the sea floor under the island is the ground' );

if ( failed ) {

	console.log( `${ failed } failed` );
	process.exit( 1 );

}

console.log( 'all passed' );
