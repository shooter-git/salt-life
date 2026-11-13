#!/usr/bin/env node
// (M19) The fly rod and its cast, seen (stream FLY: docs/m19/fly.md): wading a flat with the fly rod, false casting, shot and
// laid down, each moment held still and drawn, from your own eye and from beside you. Drawn on the CPU (Chromium on
// SwiftShader, from All the Spaces' Playwright), into qa-output/fly/<tier>/.
//
//   a dev server on FLY_PORT (5241: pnpm dev --port 5241 --strictPort), then
//   node tools/fly/look.mjs [tier]
//
// The cast's buttons are held by the script (FlyCast.input's held button and its letting go); the clock's held at 10:30 on day
// 4, the water 0.46 m deep on the flat's white sand at ( - 578, 10 ), 25 m of the flat ahead. Each moment's held by drawing
// the rod and the cast with no time passing while it's shot.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const [ TIER = 'low' ] = process.argv.slice( 2 );
const PORT = process.env.FLY_PORT || 5241;
const OUT = join( ROOT, 'qa-output/fly', TIER );
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
const AT = { x: - 578, z: 10, day: 4, hour: 10.5 };

const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
page.on( 'console', ( m ) => m.type() === 'error' && errors.push( m.text() ) );
await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&day=${ AT.day }&hour=${ AT.hour }` );
await page.waitForFunction( () => window.__app && window.__app._started, null, { timeout: 900000 } );
log( 'started' );
await page.waitForFunction( () => window.__app.game && window.__app._plantsGrown, null, { timeout: 900000 } );
log( 'the plants in' );

await page.evaluate( async ( AT ) => {

	const a = window.__app, g = a.game, st = g.state;
	if ( a.together ) a.together.syncClock = () => {};
	a.settings.timeSpeed = 0;
	st.upgrades.flyRod = 3;
	st.upgrades.flies = 3;
	st.upgrades.flatsLicence = 1;
	g.applyGear();
	const css = document.createElement( 'style' );
	css.textContent = 'body * { visibility: hidden !important }';
	document.head.appendChild( css );
	a.renderer.domElement.style.setProperty( 'visibility', 'visible', 'important' );
	if ( g.guide && g.guide.open ) g.guide.close();
	// wading the flat, looking along it
	const p = a.player;
	p.position.set( AT.x, a.terrainData.heightAt( AT.x, AT.z ), AT.z );
	p.velocity.set( 0, 0, 0 );
	// (stood up where you're put: the water level the player goes by is smoothed over seconds, and its first reading here is
	// the last place's, so both start at the sea's)
	const { G } = await import( '/src/core/Globals.js' );
	p.mode = 'walk';
	p.waterMean = p.waterH = G.seaLevel.value;
	p.yaw = - Math.PI / 2;
	p.pitch = - 0.12;
	// the cast's buttons, held by the script
	const f = g.flyCast, input = f.input.bind( f );
	f.input = ( o ) => {

		const up = !! window.__lUp;
		window.__lUp = false;
		return input( { ...o, lmb: !! window.__held, lUp: up || o.lUp, lDown: false } );

	};
	// a moment held: the rod and the cast drawn with no time passing
	for ( const [ o, k ] of [ [ g.rod, 'update' ], [ f, 'update' ] ] ) {

		const fn = o[ k ].bind( o );
		o[ k ] = ( dt, ...r ) => fn( window.__freeze ? 0 : dt, ...r );

	}

	// beside you: the camera put there just before the world's drawn (the rod's where your eye had it)
	const draw = a.drawWorld.bind( a ), cam = a.camera;
	window.__eye = null;
	a.drawWorld = ( ...args ) => {

		const s = window.__side;
		if ( s ) {

			window.__eye = window.__eye || { p: cam.position.clone(), q: cam.quaternion.clone() };
			cam.position.set( p.position.x + s[ 0 ], p.position.y + s[ 1 ], p.position.z + s[ 2 ] );
			cam.lookAt( p.position.x + s[ 3 ], p.position.y + s[ 4 ], p.position.z + s[ 5 ] );
			cam.updateMatrixWorld();

		}

		window.__frames = ( window.__frames || 0 ) + 1;
		return draw( ...args );

	};

}, AT );

const frames = async ( n ) => {

	const from = await page.evaluate( () => window.__frames || 0 );
	await page.waitForFunction( ( to ) => ( window.__frames || 0 ) >= to, from + n, { timeout: 300000 } );

};
const shot = async ( name, side = null ) => {

	await page.evaluate( ( s ) => ( window.__side = s ), side );
	await frames( 3 );
	writeFileSync( join( OUT, `${ name }.png` ), await page.screenshot() );
	log( name );
	await page.evaluate( () => ( window.__side = null ) );

};
// held still when this is so of the cast
const holdWhen = ( fn, arg ) => page.waitForFunction( `(${ fn })( window.__app.game.flyCast, window.__app.game.rod, ${ JSON.stringify( arg ) } ) && ( window.__freeze = true )`, null, { timeout: 300000, polling: 'raf' } );
const go = () => page.evaluate( () => ( window.__freeze = false ) );
const SIDE = [ 0.5, 1.4, - 7.5, 6, 1.6, 0 ], BEHIND = [ - 6, 2.2, - 2.5, 8, 1.2, 0 ];

// (what the player makes of the water for the first frames after it's put there)
await page.evaluate( () => {

	const a = window.__app, p = a.player, up = p.update.bind( p );
	window.__trace = [];
	p.update = ( dt ) => {

		const r = up( dt );
		if ( window.__trace.length < 12 ) window.__trace.push( [ p.mode, +p.waterH.toFixed( 2 ), +( p.waterMean ?? NaN ).toFixed( 2 ), +p.position.y.toFixed( 2 ), +p.wade.toFixed( 2 ), +dt.toFixed( 3 ) ] );
		return r;

	};

} );
await frames( 14 );
log( JSON.stringify( await page.evaluate( () => window.__trace ) ) );

// the rod out, the fly rig on
await page.evaluate( () => {

	const g = window.__app.game;
	if ( ! g.rod.equipped ) g.rod.equip( true );
	g.rigs.pick = 'fly';
	g.state.pickBait( 'flyShrimp' );
	g.rod.setRig( 'fly', true );
	g.rod.setGear( g.rigs.rodGear( 'fly' ) );

} );
await frames( 20 );
log( JSON.stringify( await page.evaluate( async () => {

	const { G } = await import( '/src/core/Globals.js' );
	const a = window.__app, g = a.game, p = a.player, r = g.rod;
	return { mode: p.mode, wade: p.wade, y: p.position.y, x: p.position.x, z: p.position.z, sea: G.seaLevel.value, ground: a.terrainData.heightAt( p.position.x, p.position.z ), cam: a.camera.position.y, rod: r.state, eq: r.equipped, vis: r.rodMesh.visible, fly: r.flyRod, can: g.canFish, rig: r.rig };

} ) ) );
await shot( 'rod' );
await shot( 'rod-side', SIDE );

// false casting
await page.evaluate( () => {

	window.__held = true;
	window.__app.game.rigs.press();

} );
// the back cast's loop unrolling behind, then the forward's ahead, on the second false cast
await holdWhen( ( f, r, n ) => f.casts >= n && f.stroke < 0 && f.t > f.T * 0.55, 1 );
await shot( 'back-side', SIDE );
await shot( 'back-behind', BEHIND );
await go();
await holdWhen( ( f, r, n ) => f.casts >= n && f.stroke > 0 && f.t > 0.3 + ( f.T - 0.3 ) * 0.4, 1 );
await shot( 'forward' );
await shot( 'forward-side', SIDE );
await go();
// shot at the best moment of the third
await holdWhen( ( f, r, n ) => f.casts >= n && f.stroke > 0 && f.t >= 0.4, 2 );
await page.evaluate( () => {

	window.__held = false;
	window.__lUp = true;
	window.__freeze = false;

} );
await holdWhen( ( f, r ) => r.state === 'shoot' && f.shot && f.t > 0.3 + f.shot.L1 / 20 * 0.8 );
await shot( 'shoot' );
await shot( 'shoot-side', SIDE );
await go();
await holdWhen( ( f, r ) => r.state === 'floating' );
await go();
await frames( 10 );
await shot( 'laid' );
await shot( 'laid-side', SIDE );
const info = await page.evaluate( () => {

	const g = window.__app.game, r = g.rod;
	return { state: r.state, out: Math.hypot( r.bobber.x - r.tip.x, r.bobber.z - r.tip.z ), wt: r.flyWt, programs: window.__app.renderer.info.programs.length };

} );
log( JSON.stringify( info ), errors.length ? errors.slice( 0, 5 ) : 'no errors' );
await browser.close();
