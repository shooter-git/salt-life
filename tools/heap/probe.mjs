// (M17) Script memory over a check's play: qa/script.json played on one screen as All the Spaces' harness plays it (its
// server and sealed frame, its launch flags, the low tier, deviceScaleFactor 1), the creation's usedJSHeapSize read every
// 250 ms (the harness's own rate: its peak is the budget's figure), with the game's performance marks, each late stage's
// start and end (> and <) and the script's step under way. For a build: node <All the Spaces>/packages/qa-browser/src/cli.ts
// build <project> <dist>. The peak swings 20 to 40 MB with where the collector falls, so compare builds side by side on
// cores of their own (taskset), several rounds and every screen. timeline.mjs reads what it writes.
//   node tools/heap/probe.mjs <dist> <script.json> <out.json> [phone-portrait|phone-landscape|tablet|desktop]
// and, by the environment:
//   PROBE_SAMPLE=1           allocations sampled by their stacks (profile.mjs reads <out>.heapprofile), the collected too;
//     PROBE_SAMPLE_OLD=1     only what outlived the young generation (what piles up until a full collection)
//     PROBE_SAMPLE_FROM=n, PROBE_SAMPLE_UNTIL=n   from and to the script's nth step
//   PROBE_BUFFERS=1          every buffer of 64 KB or more, where it was made and when it went (buffers.mjs)
//   PROBE_SNAPSHOT=1         a heap snapshot at the end (snapshot.mjs, snapshot-buffers.mjs)
//   PROBE_UNTIL_MARK=name    on after the script until the game marks this ('world: whale': every late stage)
//   PROBE_WARM=1             opened once first, untimed, as the checks' harness does before its first screen
//   PROBE_HARNESS=1          and the harness's shots before and after the script, a phone upright turned, the laptop left
// For source lines in the stacks, build the dist's script again with its map beside it (build-map.mjs).
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const req = createRequire( `${ ATS }/packages/qa-browser/package.json` );
const { chromium } = req( 'playwright' );
const { serveCreation } = await import( `${ ATS }/packages/qa-browser/src/harness/serve.ts` );
const [ dist, scriptPath, outPath, vpName = 'desktop' ] = process.argv.slice( 2 );
const VP = {
	'phone-portrait': { width: 390, height: 844, touch: true, mobile: true },
	'phone-landscape': { width: 844, height: 390, touch: true, mobile: true },
	tablet: { width: 820, height: 1180, touch: true, mobile: false },
	desktop: { width: 1280, height: 800, touch: false, mobile: false },
}[ vpName ];
const LAUNCH_ARGS = [
	'--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist',
	'--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info',
	'--host-resolver-rules=MAP *.qa.localhost 127.0.0.1', ...( process.env.PROBE_GC ? [ '--js-flags=--expose-gc' ] : [] ),
];
const script = JSON.parse( await readFile( scriptPath, 'utf8' ) );
const server = await serveCreation( dist, null );
const browser = await chromium.launch( { args: LAUNCH_ARGS } );
const context = await browser.newContext( { viewport: { width: VP.width, height: VP.height }, hasTouch: VP.touch, ...( VP.mobile ? { isMobile: true } : {} ), deviceScaleFactor: 1 } );
// (PROBE_WARM=1) opened once first until it's ready, in a context of its own, as the checks' harness does (WARM_UP_MS):
// the browser's shaders made already, it loads faster, and the late stages fall elsewhere in the script
if ( process.env.PROBE_WARM ) {

	const c = await browser.newContext( { viewport: { width: VP.width, height: VP.height }, hasTouch: VP.touch, ...( VP.mobile ? { isMobile: true } : {} ), deviceScaleFactor: 1 } );
	const p = await c.newPage();
	await p.goto( server.url( { title: 'Creation', tier: 'low' } ) );
	const until = Date.now() + 30000;
	while ( Date.now() < until && ( await p.evaluate( () => globalThis.__host.log.readyAt ) ) === null ) await p.waitForTimeout( 100 );
	await c.close();

}
if ( process.env.PROBE_BUFFERS ) await context.addInitScript( { path: fileURLToPath( new URL( './track-buffers.js', import.meta.url ) ) } );
const page = await context.newPage();
const t0 = Date.now();
const log = ( ...a ) => console.log( `${ ( ( Date.now() - t0 ) / 1000 ).toFixed( 1 ).padStart( 6 ) }s`, ...a );
await page.goto( server.url( { title: 'Creation', tier: 'low' } ) );
let frame = null;
while ( ! frame ) { frame = page.frames().find( ( f ) => f.url().includes( '/c/qa/' ) ) || null; if ( ! frame ) await page.waitForTimeout( 50 ); }
// the sampler, in the creation's page
const install = () => frame.evaluate( () => {
	if ( window.__probe ) return;
	const p = window.__probe = { rows: [], step: '' };
	setInterval( () => { const m = performance.memory; p.rows.push( [ Math.round( performance.timeOrigin + performance.now() ), m.usedJSHeapSize, m.totalJSHeapSize, p.step ] ); }, 250 );
} ).catch( () => {} );
await install();
// (PROBE_SAMPLE=1) every allocation sampled by its stack, the collected ones too: who makes the garbage
let cdp = null;
const startSampling = async () => {

	cdp = await context.newCDPSession( page );
	await cdp.send( 'HeapProfiler.enable' );
	await cdp.send( 'HeapProfiler.startSampling', { samplingInterval: + ( process.env.PROBE_SAMPLE_BYTES || 65536 ), includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: ! process.env.PROBE_SAMPLE_OLD } );
	log( 'sampling started' );

};
if ( process.env.PROBE_SAMPLE && ! process.env.PROBE_SAMPLE_FROM ) await startSampling();
const host = () => page.evaluate( () => globalThis.__host.log );
while ( ( await host() ).readyAt === null ) await page.waitForTimeout( 100 );
log( 'ready', ( await host() ).readyAt );
await install();
// each late stage, boat and shore field marked on the timeline
await frame.evaluate( () => {

	const app = window.__app;
	for ( const name of [ 'plantsGrow', 'prepareLate', 'checkShaderLimits', 'buildCover', 'loadCharacters', 'lifeAndDebris', 'setBoat', 'solveShoreField', 'fullSea', 'scansArrive', 'reefGrows', 'letGoOfTheBuild', 'whaleArrives', 'airArrives', 'lifeArrives', 'debrisLands' ] ) {

		const f = app[ name ];
		if ( typeof f !== 'function' ) continue;
		app[ name ] = function ( ...a ) {

			performance.mark( `> ${ name }` );
			const r = f.apply( this, a );
			Promise.resolve( r ).then( () => performance.mark( `< ${ name }` ), () => performance.mark( `< ${ name } (failed)` ) );
			return r;

		};

	}

} );
await page.waitForTimeout( 1500 );
// (as the harness does before its script: a screenshot, then its counters reset)
if ( process.env.PROBE_HARNESS ) {

	await page.screenshot( { timeout: 60000 } ).catch( () => {} );
	await frame.evaluate( () => globalThis.__qa && globalThis.__qa.reset() ).catch( () => {} );

}
const size = { width: VP.width, height: VP.height };
const at = ( [ x, y ] ) => ( { x: x * size.width, y: y * size.height } );
const stepMarks = [];
let i = 0;
for ( const step of script.steps ) {
	if ( cdp && process.env.PROBE_SAMPLE_UNTIL && i === + process.env.PROBE_SAMPLE_UNTIL ) {

		const { profile } = await cdp.send( 'HeapProfiler.stopSampling' );
		await writeFile( outPath.replace( /\.json$/, '.heapprofile' ), JSON.stringify( profile ) );
		log( 'sampling stopped at step', i );
		cdp = null;

	}
	if ( process.env.PROBE_SAMPLE && process.env.PROBE_SAMPLE_FROM && i === + process.env.PROBE_SAMPLE_FROM ) await startSampling();
	const label = `${ i ++ } ${ JSON.stringify( step ) }`;
	stepMarks.push( [ Date.now(), label ] );
	await frame.evaluate( ( l ) => { if ( window.__probe ) window.__probe.step = l; }, label ).catch( () => {} );
	if ( 'wait' in step ) await page.waitForTimeout( step.wait * 1000 );
	else if ( 'press' in step ) await page.keyboard.press( step.press ).catch( () => {} );
	else if ( 'hold' in step ) { await page.keyboard.down( step.hold ).catch( () => {} ); await page.waitForTimeout( step.seconds * 1000 ); await page.keyboard.up( step.hold ).catch( () => {} ); }
	else if ( 'tap' in step ) { const p = at( step.tap ); if ( VP.touch ) await page.touchscreen.tap( p.x, p.y ); else await page.mouse.click( p.x, p.y ); }
	else if ( 'drag' in step ) { const a = at( step.drag[ 0 ] ), b = at( step.drag[ 1 ] ); await page.mouse.move( a.x, a.y ); await page.mouse.down(); await page.mouse.move( b.x, b.y, { steps: Math.max( 2, Math.round( ( step.seconds ?? 0.5 ) * 30 ) ) } ); await page.mouse.up(); }
	else if ( 'screenshot' in step ) { const s = Date.now(); await page.screenshot( { timeout: 60000 } ).catch( () => {} ); log( 'shot', step.screenshot, Date.now() - s, 'ms' ); }
}
await page.waitForTimeout( 500 );
// (PROBE_HARNESS=1) and what it does after: a screenshot; a phone upright turned on its side and back; the laptop left
if ( process.env.PROBE_HARNESS ) {

	const mark = ( l ) => frame.evaluate( ( l ) => { if ( window.__probe ) window.__probe.step = l; }, l ).catch( () => {} );
	await mark( 'after playing' );
	stepMarks.push( [ Date.now(), 'after playing' ] );
	await page.screenshot( { timeout: 60000 } ).catch( () => {} );
	if ( vpName === 'phone-portrait' ) {

		await mark( 'turned' );
		stepMarks.push( [ Date.now(), 'turned' ] );
		await page.setViewportSize( { width: VP.height, height: VP.width } );
		await page.waitForTimeout( 2000 );
		await page.screenshot( { timeout: 60000 } ).catch( () => {} );
		await page.setViewportSize( { width: VP.width, height: VP.height } );
		await page.waitForTimeout( 1000 );

	}

	if ( vpName === 'desktop' ) {

		await mark( 'leaving' );
		stepMarks.push( [ Date.now(), 'leaving' ] );
		await page.evaluate( () => globalThis.__host.requestExit() ).catch( () => {} );
		await page.waitForTimeout( 2500 );

	}

}
// (PROBE_UNTIL_MARK) on until the game marks this (or PROBE_UNTIL_S seconds more)
if ( process.env.PROBE_UNTIL_MARK ) {

	const until = Date.now() + + ( process.env.PROBE_UNTIL_S || 400 ) * 1000;
	while ( Date.now() < until && ! await frame.evaluate( ( m ) => performance.getEntriesByName( m ).length > 0, process.env.PROBE_UNTIL_MARK ) ) await page.waitForTimeout( 1000 );
	await page.waitForTimeout( 5000 );
	log( 'waited for', process.env.PROBE_UNTIL_MARK );

}
const res = await frame.evaluate( () => ( { rows: window.__probe.rows, marks: performance.getEntriesByType( 'mark' ).map( ( m ) => [ Math.round( performance.timeOrigin + m.startTime ), m.name ] ), buffers: window.__buffers ? window.__buffers.dump() : null } ) );
await writeFile( outPath, JSON.stringify( { vp: vpName, t0, stepMarks, ...res } ) );
if ( cdp ) {

	const { profile } = await cdp.send( 'HeapProfiler.stopSampling' );
	await writeFile( outPath.replace( /\.json$/, '.heapprofile' ), JSON.stringify( profile ) );

}
if ( process.env.PROBE_SNAPSHOT ) {

	const snap = await context.newCDPSession( page );
	const { createWriteStream } = await import( 'node:fs' );
	const out = createWriteStream( outPath.replace( /\.json$/, '.heapsnapshot' ) );
	snap.on( 'HeapProfiler.addHeapSnapshotChunk', ( e ) => out.write( e.chunk ) );
	await snap.send( 'HeapProfiler.enable' );
	const heapNow = await frame.evaluate( () => performance.memory.usedJSHeapSize );
	await snap.send( 'HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: false } );
	await new Promise( ( r ) => out.end( r ) );
	const heapAfter = await frame.evaluate( () => performance.memory.usedJSHeapSize );
	log( `snapshot taken: heap ${ ( heapNow / 1048576 ).toFixed( 1 ) } MB before, ${ ( heapAfter / 1048576 ).toFixed( 1 ) } after its collection` );

}
const MB = 1048576;
let peak = 0, at_ = null;
for ( const r of res.rows ) if ( r[ 1 ] > peak ) { peak = r[ 1 ]; at_ = r; }
log( `peak ${ ( peak / MB ).toFixed( 1 ) } MB at ${ ( ( at_[ 0 ] - t0 ) / 1000 ).toFixed( 1 ) }s during ${ at_[ 3 ] }` );
await browser.close();
await server.close();
