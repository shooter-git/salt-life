#!/usr/bin/env node
// (M19) The stars and the Milky Way turning with the sky (stream CHECKS: docs/m19/checks.md; M17 left them still): the same view
// of a clear night's sky, to the south-east and 35 degrees up, at 21:00, 23:00 and 01:00 on the night nearest new moon, and at
// 21:00 the night after. The stars should wheel west about 15 degrees an hour, and come back a degree further on a day later.
// Drawn on the CPU (Chromium on SwiftShader, from All the Spaces' Playwright), into <out>/<tier>/.
//
//   a dev server on LOOK_PORT (5241), then
//   node tools/checks/stars.mjs <out> [tier]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moonAt } from '../../src/game/IslandClock.js';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const [ OUTDIR = join( ROOT, 'qa-output/checks' ), TIER = 'low' ] = process.argv.slice( 2 );
const PORT = process.env.LOOK_PORT || 5241;
const OUT = join( OUTDIR, TIER );
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
// the night nearest new moon in the first month (Moon.moonAt's phase, 0 new)
let day = 2;
for ( let d = 2; d < 31; d ++ ) if ( Math.abs( moonAt( ( d - 1 ) * 24 ).phase - 0.5 ) > Math.abs( moonAt( ( day - 1 ) * 24 ).phase - 0.5 ) ) day = d;
const SHOTS = [ [ day, 21 ], [ day, 23 ], [ day + 1, 1 ], [ day + 1, 21 ] ];

const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
page.setDefaultTimeout( 900000 );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&day=${ day }&hour=21&fullsea` );
await page.waitForFunction( () => window.__app && window.__app._started && window.__app.game, null, { timeout: 900000 } );
log( 'started, day', day );
await page.evaluate( async () => {

	const a = window.__app, g = a.game, cam = a.camera, { G } = await import( '/src/core/Globals.js' );
	if ( a.together ) a.together.syncClock = () => {};
	setInterval( () => {

		a.settings.timeSpeed = 0;
		if ( window.__when ) {

			a.settings.day = window.__when[ 0 ];
			a.settings.timeOfDay = window.__when[ 1 ];

		}

		if ( a.weather.live ) a.weather.live.coverage = 0;

	}, 200 );
	if ( g.guide ) {

		g.guide.seen.intro = true;
		if ( g.guide.open ) g.guide.close();
		g.guide._wait = - 1;

	}

	const css = document.createElement( 'style' );
	css.textContent = 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }';
	document.head.appendChild( css );
	// out at sea off the south, 3 m up, looking south-east 35 degrees up
	const draw = a.drawWorld.bind( a );
	a.drawWorld = function () {

		cam.position.set( 200, G.seaLevel.value + 3, 400 );
		cam.up.set( 0, 1, 0 );
		cam.lookAt( 200 + Math.sin( 2.36 ) * 100, G.seaLevel.value + 3 + Math.tan( 0.61 ) * 100, 400 - Math.cos( 2.36 ) * 100 );
		if ( cam.fov !== 70 ) {

			cam.fov = 70;
			cam.updateProjectionMatrix();

		}

		cam.updateMatrixWorld();
		G.cameraUnderwater.value = 0;
		draw();

	};

} );

for ( const [ d, h ] of SHOTS ) {

	await page.evaluate( ( w ) => {

		window.__when = w;

	}, [ d, h ] );
	const f0 = await page.evaluate( () => window.__app.renderer.info.render.frame );
	await page.waitForFunction( ( f0 ) => window.__app.renderer.info.render.frame > f0 + 10, f0, { timeout: 600000 } );
	await page.screenshot( { path: join( OUT, `stars-day${ d }-${ h }h.png` ) } );
	log( `day ${ d }, ${ h }:00` );

}

writeFileSync( join( OUT, 'stars-errors.txt' ), errors.join( '\n' ) );
log( `done, ${ errors.length } errors` );
await browser.close();
