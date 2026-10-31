#!/usr/bin/env node
// Bakes the island: runs TerrainData's generator once and writes public/world/island.bin (1 m grids)
// and island-1024.bin (2 m, for low-powered devices), which the game loads instead of generating the
// island itself (seconds on a phone, and the page would freeze); also detail.bin, the terrain's
// tileable detail texture (another second of work on a phone); and (M15) the seabed past the island,
// public/world/offshore.bin (32 m over 32 km) and offshore-512.bin (64 m, for low-powered devices).
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
const OUT_SEA = join( ROOT, 'public/world/offshore.bin' ); // (M15) the seabed past the island, 32 m
const OUT_SEA_LOW = join( ROOT, 'public/world/offshore-512.bin' ); // (and 64 m)

// everything the generator's output depends on
const SOURCES = [
	'src/world/TerrainData.js',
	'src/world/WorldLayout.js',
	'src/world/terrain/IslandShape.js',
	'src/world/terrain/TerrainNoise.js',
	'src/world/terrain/IslandBake.js',
	'src/world/terrain/Mangrove.js',
	'src/util/Noise.js',
];

const hashOf = ( files ) => {

	const hash = createHash( 'sha256' );
	for ( const s of files ) hash.update( s + '\0' + readFileSync( join( ROOT, s ) ) );
	return hash.digest( 'hex' ).slice( 0, 16 );

};

const sourceHash = hashOf( SOURCES );
const detailSourceHash = hashOf( [ 'src/world/terrain/DetailTextures.js', 'src/world/terrain/TerrainNoise.js' ] );
// (the seabed next to the island is the island's own formula)
const seaSourceHash = hashOf( [ ...SOURCES, 'src/world/terrain/SeabedModel.js' ] );
const { detailData, encodeDetail, detailHash } = await import( '../src/world/terrain/DetailTextures.js' );

const { encodeIsland, halfIsland } = await import( '../src/world/terrain/IslandBake.js' );
const { readIslandHeader } = await import( '../src/world/terrain/IslandDecode.js' );
const { readSeabedHeader } = await import( '../src/world/terrain/Offshore.js' );
const { bakeSeabed, halveSeabed, encodeSeabed } = await import( '../src/world/terrain/SeabedModel.js' );

if ( process.argv.includes( '--check' ) ) {

	const bakedHash = ( file ) => {

		try {

			return readIslandHeader( readFileSync( file ) ).header.sourceHash;

		} catch {

			return null;

		}

	};

	const seaHash = ( file ) => {

		try {

			return readSeabedHeader( readFileSync( file ) ).header.sourceHash;

		} catch {

			return null;

		}

	};

	let detailBaked = null;
	try {

		detailBaked = detailHash( readFileSync( OUT_DETAIL ) );

	} catch {}

	if ( bakedHash( OUT ) !== sourceHash || bakedHash( OUT_LOW ) !== sourceHash || detailBaked !== detailSourceHash || seaHash( OUT_SEA ) !== seaSourceHash || seaHash( OUT_SEA_LOW ) !== seaSourceHash ) {

		console.error( 'public/world/island*.bin, offshore*.bin or detail.bin are out of date with their generators: run `pnpm bake`.' );
		process.exit( 1 );

	}

	console.log( 'public/world/island*.bin, offshore*.bin and detail.bin match their generators.' );
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
const t1 = performance.now();
const seabed = bakeSeabed( terrain, 1024 );
const sea = encodeSeabed( seabed, 1024, { sourceHash: seaSourceHash } );
const seaLow = encodeSeabed( halveSeabed( seabed, 1024 ), 512, { sourceHash: seaSourceHash } );
writeFileSync( OUT_SEA, sea );
writeFileSync( OUT_SEA_LOW, seaLow );
const mb = ( b ) => ( b.length / 1048576 ).toFixed( 2 ) + ' MB';
console.log( `Baked the island in ${ Math.round( t1 - t0 ) } ms: public/world/island.bin ${ mb( bytes ) }, island-1024.bin ${ mb( low ) }, detail.bin ${ mb( detail ) }; the seabed in ${ Math.round( performance.now() - t1 ) } ms: offshore.bin ${ mb( sea ) }, offshore-512.bin ${ mb( seaLow ) }.` );
