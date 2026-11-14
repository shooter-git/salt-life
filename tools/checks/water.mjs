#!/usr/bin/env node
// (M19) The CPU's water against the drawn water, at each tide level (stream CHECKS: docs/m19/checks.md; M17's release table
// asked for it, M18's list carried it): a small magenta ball put each frame at the CPU's height for the sea there
// (App.query.heightAt: Waves and ShoreWaves, what the boats, the swimmer and the bobber ride), and looked at from beside it at
// the water's level. Where the two agree, the drawn sea cuts the ball through its middle: its upper half bright over the
// water, its lower half dimmed under it. In the bay off the pier, on the west's flat, and in the beach's swash, with the tide
// held at -0.9, -0.3, 0.3 and 0.9 m. Drawn on the CPU (Chromium on SwiftShader, from All the Spaces' Playwright), into
// <out>/<tier>/, with what the CPU said each time.
//   WATER_SWEEP=1: the waves' clock stopped, the ball looked down on from over it and stepped from 12 cm under the CPU's height
//   to 12 over (STEPS): where it comes out of the drawn sea (bright, not dimmed) is the drawn sea's height there, so how far the
//   CPU's is off it (each step's frame in <spot>-<level>-<dh>.png)
//
//   a dev server on LOOK_PORT (5241), then
//   node tools/checks/water.mjs <out> [tier] [levels]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const [ OUTDIR = join( ROOT, 'qa-output/checks' ), TIER = 'mid', LEVELS = '-0.9,-0.3,0.3,0.9' ] = process.argv.slice( 2 );
const PORT = process.env.LOOK_PORT || 5241;
const SWEEP = !! process.env.WATER_SWEEP, STEPS = [ - 0.12, - 0.08, - 0.04, 0, 0.04, 0.08, 0.12 ];
const OUT = join( OUTDIR, TIER );
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
// where: ( x, z ), and the way the camera's off it (unit, horizontal)
const SPOTS = {
	bay: { x: 66, z: 38, off: [ 1, 0 ] },
	flat: { x: - 700, z: - 128, off: [ 0, 1 ] },
	swash: { x: 42, z: - 27, off: [ 0.6, - 0.8 ] },
};

const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 640, height: 480 } } );
page.setDefaultTimeout( 900000 );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
page.on( 'console', ( m ) => m.type() === 'error' && errors.push( m.text() ) );
await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&hour=12&fullsea` );
await page.waitForFunction( () => window.__app && window.__app._started, null, { timeout: 900000 } );
await page.waitForFunction( () => window.__app.shore.trains[ 0 ].upper && window.__app._plantsGrown, null, { timeout: 900000 } ).catch( () => log( 'not all in' ) );
log( 'started' );
await page.evaluate( async () => {

	const a = window.__app, g = a.game, cam = a.camera, THREE = await import( '/src/engine/index.js' ), { G } = await import( '/src/core/Globals.js' );
	setInterval( () => {

		a.settings.timeSpeed = 0;
		a.settings.timeOfDay = 12;

	}, 500 );
	if ( g.guide ) {

		g.guide.seen.intro = true;
		if ( g.guide.open ) g.guide.close();
		g.guide._wait = - 1;

	}

	const css = document.createElement( 'style' );
	css.textContent = 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }';
	document.head.appendChild( css );
	// the tide held where it's asked (as tools/flats/look.mjs holds it)
	const w = a.weather, up = w.update.bind( w );
	w.update = function ( ...args ) {

		up( ...args );
		if ( window.__tide !== undefined ) {

			this.tide = window.__tide;
			this.tideWet = window.__tide;
			this.apply();

		}

	};
	// the ball, at the CPU's height for the sea there, this frame's
	const ball = new THREE.Mesh( new THREE.SphereGeometry( 0.06, 24, 16 ), new THREE.MeshBasicMaterial( { color: 0xff22cc } ) );
	ball.frustumCulled = false;
	a.scene.add( ball );
	const place = () => {

		const L = window.__look;
		if ( ! L ) return;
		// ((sweep) the waves' clock stopped, the same for the CPU's query and the drawn sea)
		if ( window.__T !== undefined ) G.time.value = window.__T;
		const y = a.query.heightAt( L.x, L.z, G.time.value );
		ball.position.set( L.x, y + ( L.dh || 0 ), L.z );
		window.__said = { y, ground: a.terrainData.heightAt( L.x, L.z ), t: G.time.value, tide: a.weather.tide };
		if ( L.down ) {

			cam.position.set( L.x, y + 0.7, L.z + 0.001 );
			cam.up.set( 0, 0, - 1 );

		} else {

			cam.position.set( L.x + L.off[ 0 ] * 0.9, y + 0.05, L.z + L.off[ 1 ] * 0.9 );
			cam.up.set( 0, 1, 0 );

		}

		cam.lookAt( L.x, y + ( L.dh || 0 ), L.z );
		if ( cam.fov !== 28 ) {

			cam.fov = 28;
			cam.updateProjectionMatrix();

		}

		cam.updateMatrixWorld();
		G.cameraUnderwater.value = 0;

	};

	const draw = a.drawWorld.bind( a ), water = a.water.update.bind( a.water );
	a.water.update = function ( c ) {

		place();
		water( c );

	};

	a.drawWorld = function () {

		place();
		draw();

	};

} );

const said = [];
for ( const level of LEVELS.split( ',' ).map( Number ) ) for ( const [ name, S0 ] of Object.entries( SPOTS ) ) for ( const dh of SWEEP ? STEPS : [ null ] ) {

	const S = SWEEP ? { ...S0, dh, down: true } : S0;
	await page.evaluate( ( [ level, S, sweep ] ) => {

		window.__tide = level;
		window.__look = S;
		if ( sweep ) window.__T = 1000;

	}, [ level, S, SWEEP ] );
	const f0 = await page.evaluate( () => window.__app.renderer.info.render.frame );
	await page.waitForFunction( ( f0 ) => window.__app.renderer.info.render.frame > f0 + 8, f0, { timeout: 600000 } );
	const file = `${ name }-${ level }${ dh === null ? '' : `-${ dh }` }.png`;
	await page.screenshot( { path: join( OUT, file ) } );
	const s = await page.evaluate( () => window.__said );
	said.push( { name, level, dh, file, y: + s.y.toFixed( 3 ), ground: + s.ground.toFixed( 2 ), tide: + s.tide.toFixed( 2 ) } );
	log( name, level, JSON.stringify( said[ said.length - 1 ] ) );

}

writeFileSync( join( OUT, SWEEP ? 'water-sweep.json' : 'water.json' ), JSON.stringify( said, null, 1 ) );
writeFileSync( join( OUT, 'errors.txt' ), errors.join( '\n' ) );
log( `done, ${ errors.length } errors` );
await browser.close();
