#!/usr/bin/env node
// (M17) The flats and the tide, seen: headless views of the west's flats (from the air, wading and from the kayak's
// seat), the mangroves' edge, the village beach with the kayak on the sand, and the pier with a boat at her berth, each
// with the tide held at the levels asked for (WeatherDriver's tide: everything that reads the sea's level follows it).
// Drawn on the CPU (Chromium on SwiftShader, from All the Spaces' Playwright), into qa-output/flats/look/<tier>/.
//
//   a dev server on FLATS_PORT (5231: the project's .claude/launch.json "salt-life-m17"), then
//   node tools/flats/look.mjs [tier] [levels, m] [views]
//   node tools/flats/look.mjs low -0.6,0.6 aerial,wading,kayak,mangroves,beach,pier
//   (ALL_THE_SPACES: its checkout, if it isn't ../all-the-spaces)
//
// A load takes a minute or two (the island's all there once its plants have grown); each shot some tens of seconds
// more. The pier's view loads again, in the lobster boat. Don't edit src while it runs: the dev server reloads the page.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const [ TIER = 'low', LEVELS = '-0.6,0.6', VIEWS = 'aerial,wading,kayak,mangroves,beach,pier' ] = process.argv.slice( 2 );
const PORT = process.env.FLATS_PORT || 5231;
const OUT = join( ROOT, 'qa-output/flats/look', TIER );
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );

// each view: where you stand ( x, z ), the eye (x, z, and its height: over the ground, `ground`, or the sea, `sea`),
// and where it looks (x, y, z); `boat`: the boat a load starts in
const VIEW = {
	aerial: { stand: [ - 562, - 30 ], eye: [ - 548, - 4, 150, 'sea' ], at: [ - 690, - 1, - 170 ] },
	wading: { stand: [ - 640, - 198 ], eye: [ - 640, - 198, 1.65, 'ground' ], at: [ - 770, - 0.6, - 226 ] },
	kayak: { stand: [ - 612, - 108 ], eye: [ - 612, - 108, 0.81, 'sea' ], at: [ - 700, - 0.4, - 128 ] },
	mangroves: { stand: [ - 586, - 166 ], eye: [ - 586, - 166, 1.65, 'ground' ], at: [ - 500, 0.4, - 150 ] },
	beach: { stand: [ 78, - 64 ], eye: [ 78, - 64, 1.7, 'ground' ], at: [ 40, - 0.2, - 30 ] },
	pier: { stand: [ 55, 22 ], eye: [ 55, 22, 2.3 + 1.65, 'sea0' ], at: [ 66, 0, 38 ], boat: 'lobster' },
};
const levels = LEVELS.split( ',' ).map( Number ), views = VIEWS.split( ',' );
const groups = [ ...new Set( views.map( ( v ) => VIEW[ v ].boat || '' ) ) ];

const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const results = [];
for ( const boat of groups ) {

	const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
	const errors = [];
	page.on( 'pageerror', ( e ) => errors.push( e.message ) );
	page.on( 'console', ( m ) => m.type() === 'error' && errors.push( m.text() ) );
	await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&hour=11&fullsea${ boat ? '&boat=' + boat : '' }` );
	await page.waitForFunction( () => window.__app && window.__app._started, null, { timeout: 400000 } );
	log( 'started', boat || 'kayak' );
	// (high water's shore field, solved after the start, and on the CPU the island's held-back parts revealed and the
	// plants grown (till then whole tiles of it aren't drawn); then the tide's held where it's asked, and the views staged)
	await page.waitForFunction( () => window.__app.shore.trains[ 0 ].upper && window.__app._plantsGrown, null, { timeout: 600000 } );
	log( 'high water\'s field in, the island all there' );
	await page.evaluate( async () => {

		const a = window.__app, w = a.weather, up = w.update.bind( w ), cam = a.camera, { G } = await import( '/src/core/Globals.js' );
		w.update = function ( ...args ) {

			up( ...args );
			if ( window.__tide !== undefined ) {

				this.tide = window.__tide;
				this.apply();

			}

		};

		const place = () => {

			const L = window.__look;
			if ( ! L ) return;
			const T = a.terrainData;
			const sea = a.weather.tide + ( a.weather.live ? a.weather.live.surge : 0 ), g = T.heightAt( L.stand[ 0 ], L.stand[ 1 ] );
			a.player.position.set( L.stand[ 0 ], Math.max( g, sea - 1.2 ), L.stand[ 1 ] );
			const base = L.eye[ 3 ] === 'ground' ? g : L.eye[ 3 ] === 'sea' ? sea : 0;
			cam.position.set( L.eye[ 0 ], base + L.eye[ 2 ], L.eye[ 1 ] );
			cam.up.set( 0, 1, 0 );
			cam.lookAt( L.at[ 0 ], L.at[ 1 ], L.at[ 2 ] );
			cam.updateMatrixWorld();
			// (the frame's own reading of the camera's water was at its own camera, wading or swimming, and under water it
			// drew the far plane in to 32 m and the fog with it: this one's over the sea, or under it)
			const under = cam.position.y < sea;
			G.cameraUnderwater.value = under ? 1 : 0;
			if ( ! under ) {

				if ( cam.far !== 12000 ) {

					cam.far = 12000;
					cam.updateProjectionMatrix();

				}

				a.scene.fog.near = a.sky.fogNear;
				a.scene.fog.far = a.sky.fogFar;

			}

		};

		// (before the ground's tiles are picked for the view, and the sea's grid laid out for it: picked for the frame's
		// own camera, the ground out of its view isn't drawn, the sea leaves wedges)
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

	} );
	const frames = async ( n ) => {

		const from = await page.evaluate( () => window.__frames || 0 );
		await page.waitForFunction( ( to ) => ( window.__frames || 0 ) >= to, from + n, { timeout: 240000 } );

	};

	for ( const v of views.filter( ( k ) => ( VIEW[ k ].boat || '' ) === boat ) ) for ( const level of levels ) {

		await page.evaluate( ( [ L, level ] ) => {

			window.__look = L;
			window.__tide = level;
			const g = window.__app.game && window.__app.game.guide;
			if ( g && g.open ) g.close();

		}, [ VIEW[ v ], level ] );
		await frames( 6 );
		await page.evaluate( () => {

			const g = window.__app.game && window.__app.game.guide;
			if ( g && g.open ) g.close();

		} );
		await frames( 2 );
		// (FLATS_EVAL: a page script run before the shot, to see what paints what: a debug colour, say)
		if ( process.env.FLATS_EVAL ) {

			await page.evaluate( process.env.FLATS_EVAL );
			await frames( 3 );

		}

		// (FLATS_HIDE=water,terrain: those left out of the shot, to see what paints what)
		if ( process.env.FLATS_HIDE ) {

			await page.evaluate( ( hide ) => {

				const a = window.__app;
				for ( const k of hide.split( ',' ) ) ( k === 'water' ? a.water.mesh : k === 'terrain' ? a.terrain.mesh : a[ k ]?.group || a[ k ] ).visible = false;

			}, process.env.FLATS_HIDE );
			await frames( 2 );

		}

		const name = `${ v }-${ level >= 0 ? '+' : '' }${ level.toFixed( 2 ) }${ process.env.FLATS_HIDE ? '-no-' + process.env.FLATS_HIDE.replace( /,/g, '-' ) : '' }${ process.env.FLATS_EVAL ? '-eval' : '' }`;
		await page.screenshot( { path: join( OUT, name + '.png' ) } );
		const info = await page.evaluate( () => {

			const a = window.__app, mix = a.shore.trains[ 0 ].upperMix(), k = a.boatCtl;
			return { sea: a.weather.tide, mix: Number( mix.toFixed( 3 ) ), boat: a.boat.id, boatY: Number( k.position.y.toFixed( 3 ) ), beached: !! k.beached };

		} );
		results.push( { view: v, level, ...info } );
		log( 'shot', name, JSON.stringify( info ) );

	}

	if ( errors.length ) log( 'errors:', errors.slice( 0, 5 ) );
	results.push( { boat: boat || 'kayak', errors: errors.slice( 0, 10 ) } );
	await page.close();

}

await browser.close();
writeFileSync( join( OUT, 'results.json' ), JSON.stringify( results, null, 1 ) );
log( 'done', OUT );
