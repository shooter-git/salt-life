#!/usr/bin/env node
// Bakes the island: runs TerrainData's generator once and writes public/world/island.bin, which the
// game loads instead of generating the island itself (seconds on a phone, and the page would freeze).
//
//   node tools/bake-terrain.mjs           write it
//   node tools/bake-terrain.mjs --check   fail if the generator's source changed since the last bake

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '..', import.meta.url ) );
const OUT = join( ROOT, 'public/world/island.bin' );

// everything the generator's output depends on
const SOURCES = [
	'src/world/TerrainData.js',
	'src/world/WorldLayout.js',
	'src/world/terrain/IslandShape.js',
	'src/world/terrain/TerrainNoise.js',
	'src/world/terrain/IslandBake.js',
	'src/util/Noise.js',
];

const hash = createHash( 'sha256' );
for ( const s of SOURCES ) hash.update( s + '\0' + readFileSync( join( ROOT, s ) ) );
const sourceHash = hash.digest( 'hex' ).slice( 0, 16 );

const { readIslandHeader, encodeIsland } = await import( '../src/world/terrain/IslandBake.js' );

if ( process.argv.includes( '--check' ) ) {

	let baked = null;
	try {

		baked = readIslandHeader( readFileSync( OUT ) ).header.sourceHash;

	} catch {}

	if ( baked !== sourceHash ) {

		console.error( 'public/world/island.bin is out of date with the terrain generator: run `pnpm bake`.' );
		process.exit( 1 );

	}

	console.log( 'public/world/island.bin matches the terrain generator.' );
	process.exit( 0 );

}

const { TerrainData } = await import( '../src/world/TerrainData.js' );
const t0 = performance.now();
const terrain = new TerrainData();
const bytes = encodeIsland( terrain, { sourceHash } );
mkdirSync( dirname( OUT ), { recursive: true } );
writeFileSync( OUT, bytes );
console.log( `Baked the island in ${ Math.round( performance.now() - t0 ) } ms: public/world/island.bin, ${ ( bytes.length / 1048576 ).toFixed( 2 ) } MB.` );
