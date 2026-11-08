// (M17) The project's script built as All the Spaces' cleanBuild builds it, its source maps beside it ('hidden': the
// page never asks for them), into <out>: a copy of a dist from cli.ts build, so its models and sounds are as they ship.
// The script's the same byte for byte (its files' names don't change), so the sampled stacks of a probe of it read as
// the source's files and lines (profile.mjs, buffers.mjs).   node tools/heap/build-map.mjs <project> <out>
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const req = createRequire( `${ ATS }/packages/qa-browser/package.json` );
const vite = await import( req.resolve( 'vite' ) );
const [ dir, outDir ] = process.argv.slice( 2 ).map( ( p ) => resolve( p ) );
await vite.build( {
	root: dir, configFile: false, envDir: false, base: './', publicDir: join( dir, 'public' ), css: { postcss: {} },
	logLevel: 'warn',
	resolve: { dedupe: [ 'three', '@allthespaces/portal', '@allthespaces/bridge-protocol' ] },
	worker: { format: 'iife' },
	build: { outDir, emptyOutDir: false, copyPublicDir: false, target: 'es2022', modulePreload: { polyfill: false }, assetsInlineLimit: 0, chunkSizeWarningLimit: 8000, reportCompressedSize: false, sourcemap: 'hidden' },
} );
