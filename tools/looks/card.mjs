#!/usr/bin/env node
// (M17 step 4) The catch card's two faults from step 0 (docs/m17/looks.md): a card up in the first seconds after the start, while
// FishPortrait.compile has its stand-ins in the card's scene (each draw of that scene counted, and any stand-in in it); and a
// toast over the card's title at 844 x 390. Pictures of each into <out>/.
//
//   a dev server on LOOK_PORT (5241), then   node tools/looks/card.mjs <out> [screens: side-844,phone-390,laptop-1366,side-667]

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const [ OUT = join( ROOT, 'qa-output/looks/card' ), ONLY = 'side-844,side-667,phone-390,laptop-1366' ] = process.argv.slice( 2 );
const PORT = process.env.LOOK_PORT || 5241;
mkdirSync( OUT, { recursive: true } );
const SCREENS = { 'side-844': [ 844, 390, true ], 'side-667': [ 667, 375, true ], 'phone-390': [ 390, 844, true ], 'laptop-1366': [ 1366, 768, false ] };
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
let first = true;
for ( const name of ONLY.split( ',' ) ) {

	const [ w, h, touch ] = SCREENS[ name ];
	const ctx = await browser.newContext( { viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 2 : 1 } );
	const page = await ctx.newPage();
	const errors = [];
	page.on( 'pageerror', ( e ) => errors.push( e.message ) );
	// (the card's scene watched from the first frame: each of its draws, and any stand-in drawn in it)
	await page.addInitScript( () => {

		window.__portrait = { draws: 0, standIns: 0, drawsWithStandIns: 0, compiling: 0, drawsCompiling: 0, compiled: false };
		const hook = () => {

			const a = window.__app, P = a && a.game && a.game.portrait;
			if ( ! P || ! a.renderer || a.renderer.__watched ) return;
			const r = a.renderer, render = r.render.bind( r ), compile = P.compile.bind( P );
			r.__watched = true;
			// (the card's shaders made after the start, App.prepareLate: how many of the card's draws came while they were)
			P.compile = ( ...args ) => {

				window.__portrait.compiling ++;
				return compile( ...args ).finally( () => {

					window.__portrait.compiling --;
					window.__portrait.compiled = true;

				} );

			};
			r.render = function ( scene, camera ) {

				if ( scene === P.scene ) {

					const n = scene.children.filter( ( o ) => o.isMesh && o.visible && o.geometry.attributes.position.count === 3 ).length;
					window.__portrait.draws ++;
					if ( window.__portrait.compiling ) window.__portrait.drawsCompiling ++;
					window.__portrait.standIns = Math.max( window.__portrait.standIns, n );
					if ( n ) window.__portrait.drawsWithStandIns ++;

				}

				return render( scene, camera );

			};

		};

		setInterval( hook, 20 );

	} );
	await page.goto( `http://127.0.0.1:${ PORT }/?tier=low&hour=10&weather=fair&day=5`, { waitUntil: 'domcontentloaded', timeout: 180000 } );
	// a card up the moment the game starts, before the card's shaders are made (App.prepareLate: FishPortrait.compile)
	await page.waitForFunction( () => window.__app && window.__app._started && window.__app.game && window.__app.game.hud, null, { timeout: 600000, polling: 50 } );
	await page.evaluate( () => {

		const g = window.__app.game, s = g.state;
		if ( g.guide ) {

			g.guide.seen.intro = true;
			if ( g.guide.open ) g.guide.close();
			g.guide._wait = - 1;

		}

		s.addFish( 'yellowtail', 0.9, 10, { place: 'bay', day: 5 } );
		g.hud.showCatch( s.lastCatch, 120000 );
		window.__cardAt = performance.now();

	} );
	if ( first ) for ( const t of [ 300, 1500, 4000 ] ) {

		await page.waitForTimeout( t === 300 ? 300 : t - 300 );
		await page.screenshot( { path: join( OUT, `${ name }-first-${ t }ms.png` ) } );

	}

	// (a picture while they're made, if it's caught)
	await page.waitForFunction( () => window.__portrait.compiling > 0 || window.__portrait.compiled, null, { timeout: 900000, polling: 30 } ).catch( () => {} );
	await page.screenshot( { path: join( OUT, `${ name }-while-compiling.png` ) } );
	// (the card kept up till its shaders are made, however long the late stages take on the CPU)
	await page.waitForFunction( () => {

		const H = window.__app.game.hud, s = window.__app.game.state;
		if ( ! H.catchOpen ) H.showCatch( s.lastCatch, 120000 );
		return window.__portrait.compiled;

	}, null, { timeout: 900000, polling: 250 } ).catch( () => console.log( 'the card\'s shaders never made' ) );
	await page.waitForTimeout( 3000 );
	const early = await page.evaluate( () => window.__portrait );
	console.log( `${ name }: the card from the start: ${ JSON.stringify( early ) }` );
	await page.screenshot( { path: join( OUT, `${ name }-card.png` ) } );
	// a toast over it: a long one and a short one
	for ( const [ tag, text ] of [ [ 'long', 'Somebody saw your flare and called it in. Marta came out for you · $120' ], [ 'short', 'Cut into 4 chunks of bait' ] ] ) {

		await page.evaluate( ( text ) => window.__app.game.toast( text, 20000 ), text );
		await page.waitForTimeout( 1500 );
		const m = await page.evaluate( () => {

			const box = ( e ) => {

				if ( ! e ) return null;
				const cs = getComputedStyle( e );
				if ( cs.display === 'none' || cs.visibility === 'hidden' || e.hidden ) return null;
				const r = e.getBoundingClientRect();
				return r.width && r.height ? [ r.left, r.top, r.right, r.bottom ].map( Math.round ) : null;

			};
			const toast = box( document.querySelector( '.hud-toast' ) );
			const card = document.querySelector( '.gm-catch.is-on' );
			const parts = card ? [ ...card.querySelectorAll( '.gm-catch-eyebrow, h2, .gm-catch-sci, .gm-catch-stage, .gm-catch-stats, .gm-catch-note, .gm-catch-foot' ) ].map( ( e ) => [ e.className || e.tagName, box( e ) ] ).filter( ( p ) => p[ 1 ] ) : [];
			const over = ( a, b ) => a && b && a[ 0 ] < b[ 2 ] - 1 && b[ 0 ] < a[ 2 ] - 1 && a[ 1 ] < b[ 3 ] - 1 && b[ 1 ] < a[ 3 ] - 1;
			return { toast, over: parts.filter( ( p ) => over( toast, p[ 1 ] ) ).map( ( p ) => p[ 0 ] ), parts: Object.fromEntries( parts.map( ( [ k, b ] ) => [ String( k ).split( ' ' )[ 0 ], b ] ) ) };

		} );
		console.log( `${ name }: toast (${ tag }) ${ JSON.stringify( m.toast ) } over ${ JSON.stringify( m.over ) } ${ JSON.stringify( m.parts ) }` );
		await page.screenshot( { path: join( OUT, `${ name }-toast-${ tag }.png` ) } );

	}

	// (and the card put away: what waited is shown, one after another)
	await page.evaluate( () => window.__app.game.hud.hideCatch() );
	await page.waitForTimeout( 1200 );
	const after = await page.evaluate( () => {

		const t = document.querySelector( '.hud-toast' );
		return { shown: ! t.hidden, text: t.textContent };

	} );
	console.log( `${ name }: the card put away, the toast ${ after.shown ? `shown: "${ after.text }"` : 'not shown' }` );
	await page.screenshot( { path: join( OUT, `${ name }-after-card.png` ) } );
	if ( errors.length ) console.log( `${ name }: errors`, errors.slice( 0, 4 ) );
	first = false;
	await ctx.close();

}

await browser.close();
