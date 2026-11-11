// (M17) The shader programs a build has made by the time it says it's ready, phone upright on the low tier, as All the
// Spaces' harness opens it: the names three gives them (renderer.info.programs, each its material's type and name), to
// set beside another build's. Anything new before ready is the first screen's to pay for, on the server most of all.
//   node tools/heap/programs.mjs <dist> [<other dist>]      (a build: <All the Spaces>/packages/qa-browser/src/cli.ts build)
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const req = createRequire( `${ ATS }/packages/qa-browser/package.json` );
const { chromium } = req( 'playwright' );
const { serveCreation } = await import( `${ ATS }/packages/qa-browser/src/harness/serve.ts` );
const dists = process.argv.slice( 2 );
const lists = [];
for ( const dist of dists ) {

	const server = await serveCreation( dist, null );
	const browser = await chromium.launch( { args: [ '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--host-resolver-rules=MAP *.qa.localhost 127.0.0.1' ] } );
	const context = await browser.newContext( { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 } );
	const page = await context.newPage();
	await page.goto( server.url( { title: 'Creation', tier: 'low' } ) );
	let frame = null;
	while ( ! frame ) {

		frame = page.frames().find( ( f ) => f.url().includes( '/c/qa/' ) ) || null;
		if ( ! frame ) await page.waitForTimeout( 50 );

	}

	while ( ( await page.evaluate( () => globalThis.__host.log.readyAt ) ) === null ) await page.waitForTimeout( 50 );
	const names = await frame.evaluate( () => window.__app.renderer.info.programs.map( ( p ) => p.name ) );
	lists.push( names.sort() );
	console.log( `${ dist }: ${ names.length } programs at ready` );
	await browser.close();
	await server.close?.();

}

if ( lists.length === 2 ) {

	const count = ( l ) => l.reduce( ( m, n ) => m.set( n, ( m.get( n ) || 0 ) + 1 ), new Map() );
	const [ a, b ] = lists.map( count );
	let differ = 0;
	for ( const n of new Set( [ ...a.keys(), ...b.keys() ] ) ) if ( a.get( n ) !== b.get( n ) ) {

		differ ++;
		console.log( `  ${ n }: ${ a.get( n ) || 0 } -> ${ b.get( n ) || 0 }` );

	}

	console.log( differ ? `${ differ } names differ` : 'the same programs, by name and number' );

}

process.exit( 0 );
