#!/usr/bin/env node
// Bakes the island: runs TerrainData's generator once and writes public/world/island.bin (1 m grids)
// and island-1024.bin (2 m, for low-powered devices), which the game loads instead of generating the
// island itself (seconds on a phone, and the page would freeze); also detail.bin, the terrain's
// tileable detail texture (another second of work on a phone).
//
//   node tools/bake-terrain.mjs           write it
//   node tools/bake-terrain.mjs --check   fail if the generator's source changed since the last bake

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '..', import.meta.url ) );
const OUT = join( ROOT, 'public/world/island.bin' );
const OUT_LOW = join( ROOT, 'public/world/island-1024.bin' ); // 2 m, for low-powered devices
const OUT_DETAIL = join( ROOT, 'public/world/detail.bin' ); // the terrain's tileable detail texture

// everything the generator's output depends on
const SOURCES = [
	'src/world/TerrainData.js',
	'src/world/WorldLayout.js',
	'src/world/terrain/IslandShape.js',
	'src/world/terrain/TerrainNoise.js',
	'src/world/terrain/IslandBake.js',
	'src/util/Noise.js',
];

const hashOf = ( files ) => {

	const hash = createHash( 'sha256' );
	for ( const s of files ) hash.update( s + '\0' + readFileSync( join( ROOT, s ) ) );
	return hash.digest( 'hex' ).slice( 0, 16 );

};

const sourceHash = hashOf( SOURCES );
const detailSourceHash = hashOf( [ 'src/world/terrain/DetailTextures.js', 'src/world/terrain/TerrainNoise.js' ] );
const { detailData, encodeDetail, detailHash } = await import( '../src/world/terrain/DetailTextures.js' );

const { readIslandHeader, encodeIsland, halfIsland } = await import( '../src/world/terrain/IslandBake.js' );

if ( process.argv.includes( '--check' ) ) {

	const bakedHash = ( file ) => {

		try {

			return readIslandHeader( readFileSync( file ) ).header.sourceHash;

		} catch {

			return null;

		}

	};

	let detailBaked = null;
	try {

		detailBaked = detailHash( readFileSync( OUT_DETAIL ) );

	} catch {}

	if ( bakedHash( OUT ) !== sourceHash || bakedHash( OUT_LOW ) !== sourceHash || detailBaked !== detailSourceHash ) {

		console.error( 'public/world/island*.bin or detail.bin are out of date with their generators: run `pnpm bake`.' );
		process.exit( 1 );

	}

	console.log( 'public/world/island*.bin and detail.bin match their generators.' );
	process.exit( 0 );

}

const { TerrainData } = await import( '../src/world/TerrainData.js' );
const t0 = performance.now();
const terrain = new TerrainData();
const bytes = encodeIsland( terrain, { sourceHash } );
const low = encodeIsland( halfIsland( terrain ), { sourceHash } );
mkdirSync( dirname( OUT ), { recursive: true } );
writeFileSync( OUT, bytes );
writeFileSync( OUT_LOW, low );
const detail = encodeDetail( detailData(), detailSourceHash );
writeFileSync( OUT_DETAIL, detail );
const mb = ( b ) => ( b.length / 1048576 ).toFixed( 2 ) + ' MB';
console.log( `Baked the island in ${ Math.round( performance.now() - t0 ) } ms: public/world/island.bin ${ mb( bytes ) }, island-1024.bin ${ mb( low ) }, detail.bin ${ mb( detail ) }.` );
