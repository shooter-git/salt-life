#!/usr/bin/env node
// (M19) Resting and the tow's jump with the tide (stream CHECKS: docs/m19/checks.md; M17 took them by construction and never ran
// them, M18's list carried them): the console at a low water near noon, then a rest (DaysOut.sleep, alone: to dusk, near high
// water), (1) moored at her berth, (2) at anchor in the bay; then (3) Marta's tow in from there. Each frame after it: her height
// against the sea's (the CPU's water under her) and how fast she's rising or falling, against what she does on a quiet frame.
// A jump would show as her well off the water, or a fling. Into <out>/tide-rest.json.
//
//   a dev server on LOOK_PORT (5241), then
//   node tools/checks/tide-rest.mjs <out> [tier]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tideAt } from '../../src/game/IslandClock.js';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const [ OUTDIR = join( ROOT, 'qa-output/checks' ), TIER = 'low' ] = process.argv.slice( 2 );
const PORT = process.env.LOOK_PORT || 5241;
mkdirSync( OUTDIR, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
// a day whose low water's nearest noon (and the hour of it)
let best = null;
for ( let day = 2; day < 30; day ++ ) for ( let h = 10.5; h <= 13; h += 0.05 ) {

	const T = ( day - 1 ) * 24 + h, low = tideAt( T ) < tideAt( T - 0.05 ) && tideAt( T ) < tideAt( T + 0.05 );
	if ( low && ( ! best || Math.abs( h - 12 ) < Math.abs( best.h - 12 ) ) ) best = { day, h: + h.toFixed( 2 ), tide: + tideAt( T ).toFixed( 2 ) };

}

log( 'low water', JSON.stringify( best ) );

const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const errors = [], out = { low: best, cases: {} };
const page = await browser.newPage( { viewport: { width: 640, height: 360 } } );
page.setDefaultTimeout( 900000 );
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&boat=console&day=${ best.day }&hour=${ best.h }` );
await page.waitForFunction( () => window.__app && window.__app._started && window.__app.game, null, { timeout: 900000 } );
log( 'started' );
await page.evaluate( async () => {

	const a = window.__app, g = a.game, b = a.boatCtl, { G } = await import( '/src/core/Globals.js' );
	if ( g.guide ) {

		g.guide.seen.intro = true;
		if ( g.guide.open ) g.guide.close();
		g.guide._wait = - 1;

	}

	// her height against the water under her, each frame
	window.__log = [];
	const draw = a.drawWorld.bind( a );
	a.drawWorld = function () {

		const p = b.position, s = a.settings;
		window.__log.push( { T: + ( s.day * 24 + s.timeOfDay ).toFixed( 3 ), sea: + G.seaLevel.value.toFixed( 3 ), y: + p.y.toFixed( 3 ), w: + a.query.heightAt( p.x, p.z, G.time.value ).toFixed( 3 ), vy: + b.velocity.y.toFixed( 3 ), moored: !! b.moored, anchor: !! b.anchor } );
		draw();

	};

} );
const frames = ( n ) => page.evaluate( () => window.__log.length ).then( ( f0 ) => page.waitForFunction( ( [ f0, n ] ) => window.__log.length > f0 + n, [ f0, n ] ) );
// what she did on n quiet frames, then after what's done (do), n frames more: { before, after }
const watch = async ( name, n, act ) => {

	await frames( 30 );
	const f0 = await page.evaluate( () => window.__log.length );
	await frames( n );
	const f1 = await page.evaluate( () => window.__log.length );
	await page.evaluate( act );
	await frames( n * 3 );
	const L = await page.evaluate( ( [ f0, f1 ] ) => ( { before: window.__log.slice( f0, f1 ), after: window.__log.slice( f1 ) } ), [ f0, f1 ] );
	const sum = ( list ) => ( { n: list.length, sea: list.length ? [ list[ 0 ].sea, list[ list.length - 1 ].sea ] : null, off: list.length ? + Math.max( ...list.map( ( x ) => Math.abs( x.y - x.w ) ) ).toFixed( 3 ) : null, vy: list.length ? + Math.max( ...list.map( ( x ) => Math.abs( x.vy ) ) ).toFixed( 3 ) : null } );
	// (the jump: the frames from the clock's jump on)
	const j = L.after.findIndex( ( x, i ) => i > 0 && Math.abs( x.T - L.after[ i - 1 ].T ) > 0.5 );
	const after = j >= 0 ? L.after.slice( j ) : L.after;
	out.cases[ name ] = { before: sum( L.before ), after: sum( after ), first: after.slice( 0, 6 ), jumpAt: j };
	log( name, JSON.stringify( { before: out.cases[ name ].before, after: out.cases[ name ].after } ) );

};

// (1) moored at her berth, a rest to dusk
await watch( 'moored', 30, () => window.__app.game.daysOut.sleep() );
// (2) at anchor in the bay: back to the low water, out there, anchored, a rest
await page.evaluate( ( low ) => {

	const a = window.__app, g = a.game, b = a.boatCtl, s = a.settings;
	s.day = low.day;
	s.timeOfDay = low.h;
	b.moored = false;
	b.position.set( 66, b.position.y, 38 );
	b.velocity.set( 0, 0, 0 );
	b.angular.set( 0, 0, 0 );
	b.hasWater = false;
	b.apply();

}, best );
await frames( 40 );
await page.evaluate( () => window.__app.game.dropAnchor() );
await watch( 'anchored', 30, () => window.__app.game.daysOut.sleep() );
// (3) Marta's tow in from there
await watch( 'towed', 30, () => window.__app.game.tow( true ) );

out.errors = errors;
writeFileSync( join( OUTDIR, 'tide-rest.json' ), JSON.stringify( out, null, 1 ) );
log( `done, ${ errors.length } errors` );
await browser.close();
