#!/usr/bin/env node
// (M19) The stalls' signs, drawn headless in the real game (docs/m19/stalls.md): Joe's stand and Marta's chandlery from in
// front and from behind (high and mid: the baked signs.png on the scanned stalls; low: the hand-painted boards on the plain
// ones), and Pearl's board from the beach. Drawn on the CPU (Chromium on SwiftShader, from All the Spaces' Playwright) into
// <out>/<tier>/.
//
//   a dev server on LOOK_PORT (5241), then
//   node tools/props/signs-look.mjs <out> [tier]
//   (ALL_THE_SPACES: its checkout, if it isn't ../all-the-spaces. A load takes some minutes on the CPU. Don't edit src while it
//   runs.)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const [ OUTDIR = join( ROOT, 'qa-output/signs' ), TIER = 'mid' ] = process.argv.slice( 2 );
const PORT = process.env.LOOK_PORT || 5241;
const OUT = join( OUTDIR, TIER );
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );

// a shot: whose ('stand' | 'chandlery' | 'camp'), the camera in that stall's own frame ( across, up, out ) and the point it
// looks at, the same way (a sign's face is its +z, StallKit's uv2Rect: Joe's out front, Marta's over her shelves facing in)
const SHOTS = [
	{ name: 'joe-front', who: 'stand', cam: [ 0.6, 1.7, 6.5 ], at: [ 0, 2.0, 0 ] },
	{ name: 'joe-back', who: 'stand', cam: [ 0.6, 1.7, - 6.5 ], at: [ 0, 2.0, 0 ] },
	{ name: 'joe-near', who: 'stand', cam: [ 0.3, 1.8, 3.6 ], at: [ 0, 2.1, 0.88 ] },
	{ name: 'marta-front', who: 'chandlery', cam: [ 0.6, 1.8, 7.5 ], at: [ 0, 2.0, 0 ] },
	{ name: 'marta-near', who: 'chandlery', cam: [ 0.3, 1.9, 2.6 ], at: [ 0, 2.25, - 1.66 ] },
	{ name: 'pearl', who: 'camp', cam: [ 0.2, - 0.1, 3.2 ], at: [ 0, 0, 0 ] },
];

const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 1280, height: 720 } } );
page.setDefaultTimeout( 900000 );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
page.on( 'console', ( m ) => m.type() === 'error' && errors.push( m.text() ) );
await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&hour=10.5&boat=kayak` );
await page.waitForFunction( () => window.__app && window.__app._started && window.__app.game, null, { timeout: 900000 } );
log( 'started' );
await page.waitForFunction( () => window.__app._plantsGrown, null, { timeout: 900000 } ).catch( () => log( 'no plants yet' ) );
await page.evaluate( async () => {

	const a = window.__app, cam = a.camera, THREE = await import( '/src/engine/index.js' );
	const v = new THREE.Vector3(), w = new THREE.Vector3(), g = a.game;
	// the world alone: no guide, no HUD
	if ( g.guide ) {

		g.guide.seen.intro = true;
		if ( g.guide.open ) g.guide.close();
		g.guide._wait = - 1;

	}

	const css = document.createElement( 'style' );
	css.textContent = 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }';
	document.head.appendChild( css );
	setInterval( () => {

		a.settings.timeSpeed = 0;
		a.settings.timeOfDay = 10.5;
		const wl = a.weather.live;
		if ( wl ) wl.coverage = 0;

	}, 300 );
	// a stall's frame: its group's, or for Pearl's, her board's
	const frame = ( who ) => who === 'camp' ? a.game.camp.board : a.game[ who ].group;
	const place = () => {

		const L = window.__look;
		if ( ! L ) return;
		const f = frame( L.who );
		if ( ! f ) return;
		f.updateMatrixWorld( true );
		f.localToWorld( v.set( ...L.cam ) );
		f.localToWorld( w.set( ...L.at ) );
		cam.position.copy( v );
		cam.up.set( 0, 1, 0 );
		cam.lookAt( w );
		if ( cam.fov !== 55 ) {

			cam.fov = 55;
			cam.updateProjectionMatrix();

		}

		cam.updateMatrixWorld();

	};

	for ( const k of [ 'drawWorld' ] ) {

		const f = a[ k ].bind( a );
		a[ k ] = function () {

			place();
			f();
			window.__frames = ( window.__frames || 0 ) + 1;

		};

	}

	const ground = a.terrain.update.bind( a.terrain );
	a.terrain.update = function ( c ) {

		place();
		ground( c );

	};

	window.__stage = ( L ) => {

		// you, a little way off from it (the low tier's near detail goes by the camera; Pearl's camp's built when you come near)
		window.__look = null;
		if ( L.who === 'camp' && ! a.game.camp.board ) {

			try {

				cam.position.set( 99, 30, - 845 );
				a.game.camp.update( cam );

			} catch ( e ) {

				return `camp: ${ e.message }`;

			}

		}

		window.__look = L;
		return frame( L.who ) ? 'ok' : `no ${ L.who }`;

	};

} );

for ( const L of SHOTS ) {

	const said = await page.evaluate( ( L ) => window.__stage( L ), L );
	if ( said !== 'ok' ) {

		log( L.name, said );
		continue;

	}

	const f0 = await page.evaluate( () => window.__frames || 0 );
	const drawn = await page.waitForFunction( ( f0 ) => ( window.__frames || 0 ) > f0 + 6, f0, { timeout: 240000 } ).then( () => true, () => false );
	if ( ! drawn ) log( L.name, 'no frames drawn in 4 minutes:', errors.slice( - 3 ).join( ' | ' ) );
	await page.screenshot( { path: join( OUT, `${ L.name }.png` ) } );
	log( L.name );

}

writeFileSync( join( OUT, 'errors.txt' ), errors.join( '\n' ) );
log( `done, ${ errors.length } errors` );
await browser.close();
