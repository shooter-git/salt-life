// (M17) The shader programs two builds have made by ready, phone upright on the low tier as All the Spaces' harness opens it
// (tools/heap/programs.mjs' way), set side by side by their sources, not only their names: which are the same to the
// character, which differ, and by how much. What's built before ready is the first screen's to pay for.
//   node tools/wakes/ready-sources.mjs <dist> <other dist>      (builds: <All the Spaces>/packages/qa-browser/src/cli.ts build)
//   READY_SOURCES=<dir> writes each program's sources there; FULL_SEA=1 also times the whole sea's coming in after ready
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const req = createRequire( `${ ATS }/packages/qa-browser/package.json` );
const { chromium } = req( 'playwright' );
const { serveCreation } = await import( `${ ATS }/packages/qa-browser/src/harness/serve.ts` );
const dists = process.argv.slice( 2 );
const builds = [];
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
	const readyAt = Date.now();
	const programs = await frame.evaluate( () => {

		const r = window.__app.renderer, gl = r.getContext();
		return r.info.programs.map( ( p ) => {

			const src = {};
			for ( const s of gl.getAttachedShaders( p.program ) ) src[ gl.getShaderParameter( s, gl.SHADER_TYPE ) === gl.VERTEX_SHADER ? 'v' : 'f' ] = gl.getShaderSource( s );
			return { name: p.name, v: src.v, f: src.f };

		} );

	} );
	builds.push( programs );
	// (READY_SOURCES=dir: each program's sources written there, build by build, to diff)
	if ( process.env.READY_SOURCES ) {

		const { mkdirSync, writeFileSync } = await import( 'node:fs' );
		const dir = join( process.env.READY_SOURCES, String( builds.length ) );
		mkdirSync( dir, { recursive: true } );
		programs.forEach( ( p, i ) => {

			writeFileSync( join( dir, `${ i }-${ p.name }.vert` ), p.v );
			writeFileSync( join( dir, `${ i }-${ p.name }.frag` ), p.f );

		} );

	}

	console.log( `${ dist }: ${ programs.length } programs at ready` );
	// (FULL_SEA=1: and how long after ready the whole sea's in, its shader made and first drawn (App.fullSea))
	if ( process.env.FULL_SEA ) {

		await frame.waitForFunction( () => ! window.__app.water.plainMaterial, null, { timeout: 300000, polling: 20 } );
		console.log( `  the whole sea in ${ ( ( Date.now() - readyAt ) / 1000 ).toFixed( 2 ) } s after ready` );

	}

	await browser.close();
	await server.close?.();

}

if ( builds.length === 2 ) {

	const key = ( p ) => p.name + '\n' + p.v + '\n' + p.f;
	const [ a, b ] = builds;
	const left = new Map();
	for ( const p of a ) left.set( key( p ), ( left.get( key( p ) ) || 0 ) + 1 );
	let same = 0;
	const changed = [];
	for ( const p of b ) {

		const k = key( p ), n = left.get( k ) || 0;
		if ( n ) {

			left.set( k, n - 1 );
			same ++;

		} else changed.push( p );

	}

	console.log( `${ same } of ${ b.length } the same to the character` );
	for ( const p of changed ) {

		const was = a.find( ( q ) => q.name === p.name );
		console.log( `  ${ p.name }: ${ was ? `vertex ${ was.v.length } -> ${ p.v.length } chars, fragment ${ was.f.length } -> ${ p.f.length }` : 'new' }` );

	}

}

process.exit( 0 );
