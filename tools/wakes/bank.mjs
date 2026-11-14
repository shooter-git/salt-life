#!/usr/bin/env node
// (M20) A wake in shallow water, seen (stream SEA: docs/m20/sea.md): a console's track coming off the plane at 8.2 kn along the
// start's bay, over its 1.9 m bank with the beach 15 to 45 m off her port side (the depth Froude number about 0.97: her arms
// wide open, her waves long, her crests twice as high), and the same speed out in deep water beside it; from the air and from
// the beach, each with her crests and without. Her track's made by hand (WakeWaves.follow each frame, no hull drawn): the
// waves are the thing. Drawn on the CPU (Chromium on SwiftShader, from All the Spaces' Playwright), into <out>/<tier>/, with the
// wake's figures in bank.json.
//
//   a dev server on LOOK_PORT (5241), then
//   node tools/wakes/bank.mjs <out> [tier]
//
// Don't edit src while it runs.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const [ OUTDIR = join( ROOT, 'qa-output/wakes-bank' ), TIER = 'mid' ] = process.argv.slice( 2 );
const PORT = process.env.LOOK_PORT || 5241;
const OUT = join( OUTDIR, TIER );
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
const KN = 0.5144, U = 8.2 * KN;
// her run: along +x at z (the bay: from -300, its bank from -140 to 110; out at sea, 2 km south), ending at x1
const RUNS = { bank: { z: 0, x0: - 330, x1: 100 }, deep: { z: 2000, x0: - 330, x1: 100 } };
// the views, about her run's end: from the air over the water toward the beach, her wake's port arm running in onto it; low
// over her track looking back along that arm; and from the beach (60 m off her track, the eye 1.7 m over the sand, the pier
// behind you) looking out across it
const VIEWS = { air: { eye: [ - 70, 32, 45 ], at: [ - 70, 0, - 25 ], fov: 60 }, arm: { eye: [ - 30, 9, 8 ], at: [ - 110, 0, - 25 ], fov: 60 }, beach: { eye: [ - 160, 1.7, - 60 ], at: [ - 200, 0, 0 ], fov: 60, ground: true } };

const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&hour=11&fullsea` );
await page.waitForFunction( () => window.__app && window.__app._started && ! window.__app.water.plainMaterial, null, { timeout: 900000, polling: 1000 } );
log( 'started' );
await page.evaluate( async () => {

	const a = window.__app, cam = a.camera, s = a.settings;
	const url = performance.getEntriesByType( 'resource' ).map( ( e ) => e.name ).filter( ( u ) => /\/src\/core\/Globals\.js(\?|$)/.test( u ) ).pop() || '/src/core/Globals.js';
	const { G } = await import( url );
	window.__G = G;
	s.timeSpeed = 0;
	s.timeOfDay = 11;
	if ( a.together ) a.together.syncClock = ( st ) => {

		st.timeSpeed = 0;
		st.timeOfDay = 11;

	};
	const style = document.createElement( 'style' );
	style.textContent = 'body * { visibility: hidden !important; }';
	document.head.appendChild( style );
	a.renderer.domElement.style.setProperty( 'visibility', 'visible', 'important' );
	// (her track by hand: window.__run { z, x0, x1, t0 }, along +x at U from x0, stopping at x1)
	const w = a.waves.wakes, up = w.update.bind( w );
	w.update = function ( t, c ) {

		const R = window.__run;
		if ( R ) {

			const x = Math.min( R.x0 + window.__U * ( t - R.t0 ), R.x1 );
			this.follow( 'bank', x, R.z, x < R.x1 ? window.__U : 0, 0, 5.61, 2.49, t );
			R.x = x;

		}

		up( t, c );
		if ( window.__noWake ) this.count = 0;

	};

	const place = () => {

		const R = window.__run;
		if ( ! R ) return;
		// (while she runs, the camera over her: a wake's followed within WakeWaves' range of you)
		const L = window.__look || { eye: [ ( R.x ?? R.x0 ) - R.x1, 30, - 30 ], at: [ ( R.x ?? R.x0 ) - R.x1, 0, 0 ], fov: 60 };
		// (the player out of the way, the camera where it's asked about her end)
		a.player.position.set( R.x1 + L.eye[ 0 ], 5, R.z + L.eye[ 2 ] );
		const ex = R.x1 + L.eye[ 0 ], ez = R.z + L.eye[ 2 ];
		cam.position.set( ex, ( L.ground ? Math.max( a.terrainData.heightAt( ex, ez ), G.seaLevel.value ) : G.seaLevel.value ) + L.eye[ 1 ], ez );
		cam.up.set( 0, 1, 0 );
		cam.lookAt( R.x1 + L.at[ 0 ], G.seaLevel.value + L.at[ 1 ], R.z + L.at[ 2 ] );
		if ( cam.fov !== L.fov || cam.far !== 12000 ) {

			cam.fov = L.fov;
			cam.far = 12000;
			cam.updateProjectionMatrix();

		}

		cam.updateMatrixWorld();
		G.cameraUnderwater.value = 0;
		a.scene.fog.near = a.sky.fogNear;
		a.scene.fog.far = a.sky.fogFar;

	};

	const draw = a.drawWorld.bind( a ), water = a.water.update.bind( a.water ), ground = a.terrain.update.bind( a.terrain );
	a.terrain.update = function ( camera ) {

		place();
		ground( camera );

	};

	a.water.update = function ( camera ) {

		place();
		water( camera );

	};

	a.drawWorld = function () {

		place();
		draw();
		window.__frames = ( window.__frames || 0 ) + 1;

	};

	// (window.__fast: frames stepped without drawing for each drawn: her run in minutes)
	const frame = a.frame.bind( a );
	a.frame = function ( dt ) {

		const n = window.__fast || 1;
		if ( n > 1 ) {

			const d = this.drawWorld;
			this.drawWorld = () => {};
			for ( let i = 1; i < n; i ++ ) frame( 0.1 );
			this.drawWorld = d;

		}

		frame( dt );

	};

} );
const frames = async ( n ) => {

	const from = await page.evaluate( () => window.__frames || 0 );
	await page.waitForFunction( ( to ) => ( window.__frames || 0 ) >= to, from + n, { timeout: 900000, polling: 500 } );

};

const readings = { tier: TIER, U, runs: {} };
for ( const [ name, R ] of Object.entries( RUNS ) ) {

	await page.evaluate( ( [ R, U ] ) => {

		window.__U = U;
		window.__run = { ...R, t0: window.__G.time.value };
		window.__look = null;
		window.__fast = 8;

	}, [ R, U ] );
	// (her run, and 15 s more for her arms to reach the beach)
	for ( ;; ) {

		await page.waitForTimeout( 3000 );
		const st = await page.evaluate( () => ( { x: window.__run.x, since: window.__G.time.value - window.__run.t0 } ) );
		if ( st.x >= R.x1 && st.since > ( R.x1 - R.x0 ) / U + 15 ) break;

	}

	await page.evaluate( () => {

		window.__fast = 1;

	} );
	// (her waves as the CPU has them: the depth under her, Fh, her arms' angle, their length, how much higher)
	readings.runs[ name ] = await page.evaluate( async () => {

		const a = window.__app, w = a.waves.wakes, S = w.s, R = window.__run, i = Math.min( 2, w.n - 1 );
		if ( i < 0 ) return { none: true };
		const url = performance.getEntriesByType( 'resource' ).map( ( e ) => e.name ).filter( ( u ) => /\/src\/ocean\/WakeWaves\.js(\?|$)/.test( u ) ).pop();
		const { wakeWave } = await import( url );
		const wv = wakeWave( window.__U, 5.61, S.h[ i ] );
		return { depth: + S.h[ i ].toFixed( 2 ), Fh: + wv.Fh.toFixed( 3 ), armDeg: + ( Math.atan( wv.tan ) * 180 / Math.PI ).toFixed( 1 ), lam: + ( 2 * Math.PI / S.k[ i ] ).toFixed( 2 ), high: + wv.high.toFixed( 2 ), crest: + ( 2 * S.amp[ i ] ).toFixed( 3 ), ground: + a.terrainData.heightAt( R.x1, R.z - 30 ).toFixed( 2 ) };

	} );
	log( name, JSON.stringify( readings.runs[ name ] ) );
	for ( const [ v, L ] of Object.entries( VIEWS ) ) {

		await page.evaluate( ( L ) => {

			window.__look = L;
			window.__noWake = false;

		}, L );
		await frames( TIER === 'low' ? 12 : 8 );
		await page.screenshot( { path: join( OUT, `${ name }-${ v }.png` ) } );
		await page.evaluate( () => {

			window.__noWake = true;

		} );
		await frames( 3 );
		await page.screenshot( { path: join( OUT, `${ name }-${ v }-without.png` ) } );
		log( 'shot', name, v );

	}

	await page.evaluate( () => {

		window.__run = null;
		window.__noWake = false;

	} );
	await frames( 2 );

}

readings.errors = errors;
writeFileSync( join( OUT, 'bank.json' ), JSON.stringify( readings, null, 1 ) );
log( `done, ${ errors.length } errors` );
await browser.close();
