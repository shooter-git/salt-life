#!/usr/bin/env node
// (M16) pnpm test: the baked world's still what its sources make, every test/*.mjs in turn (a new test's just a new file
// there), and the assets' lock. Stops at the first that fails.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '..', import.meta.url ) );
const tests = readdirSync( ROOT + 'test' ).filter( ( f ) => f.endsWith( '.mjs' ) ).sort().map( ( f ) => 'test/' + f );
for ( const args of [ [ 'tools/bake-terrain.mjs', '--check' ], ...tests.map( ( t ) => [ t ] ), [ 'tools/update-lock.mjs', '--check' ] ] ) {

	const r = spawnSync( process.execPath, args, { cwd: ROOT, stdio: 'inherit' } );
	if ( r.status !== 0 ) {

		console.error( `\nFailed: node ${ args.join( ' ' ) }` );
		process.exit( r.status || 1 );

	}

}
