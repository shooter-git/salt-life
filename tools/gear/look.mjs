#!/usr/bin/env node
// (M19) Stream GEAR's gun, seen (docs/m19/gear.md): the blue-water speargun loaded and being loaded (its four bands, each on its
// notch), the railgun beside it, and a fish out on the blue-water gun's float line from the surface (the float, the line bowed
// up to it). Drawn on the CPU (Chromium on SwiftShader, from All the Spaces' Playwright), into <out>/<tier>/.
//
//   a dev server on LOOK_PORT (5241), then
//   node tools/gear/look.mjs <out> [tier]
//   (ALL_THE_SPACES: its checkout, if it isn't ../all-the-spaces. Don't edit src while it runs.)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const [ OUTDIR = join( ROOT, 'qa-output/gear' ), TIER = 'mid' ] = process.argv.slice( 2 );
const PORT = process.env.LOOK_PORT || 5241;
const OUT = join( OUTDIR, TIER );
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
// the guns over the bay's bright sand by the pier, looking away from it (BAY); the float out in the blue water off the west
// side (looks.mjs' SEA), where the gun's for
const BAY = { x: 60, z: 40 }, SEA = { x: - 2600, z: 3000 };

const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
page.setDefaultTimeout( 900000 );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
page.on( 'console', ( m ) => m.type() === 'error' && errors.push( m.text() ) );
await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&hour=11&boat=kayak&fullsea` );
await page.waitForFunction( () => window.__app && window.__app._started && window.__app.game, null, { timeout: 900000 } );
await page.waitForFunction( () => window.__app._plantsGrown, null, { timeout: 900000 } ).catch( () => log( 'no plants yet' ) );
log( 'started' );

const where = await page.evaluate( async ( { BAY, SEA } ) => {

	const a = window.__app, g = a.game, p = a.player, { G } = await import( '/src/core/Globals.js' );
	if ( a.together ) a.together.syncClock = () => {};
	setInterval( () => {

		a.settings.timeSpeed = 0;
		a.settings.timeOfDay = 11;

	}, 300 );
	if ( g.guide ) {

		g.guide.seen.intro = true;
		if ( g.guide.open ) g.guide.close();
		g.guide._wait = - 1;

	}

	const css = document.createElement( 'style' );
	css.textContent = 'body * { visibility: hidden !important; } canvas { visibility: visible !important; }';
	document.head.appendChild( css );
	// in the water, where you're put each frame (L: the depth under the surface, where you look)
	const sea = G.seaLevel.value, ground = a.terrainData.heightAt( BAY.x, BAY.z );
	const at = () => ( window.__look && window.__look.sea ? SEA : BAY );
	const up = p.update.bind( p );
	p.update = function ( dt, ...r ) {

		const L = window.__look;
		if ( L ) {

			p.mode = 'swim';
			p.position.set( at().x, sea - L.depth, at().z );
			p.velocity.set( 0, 0, 0 );
			p.yaw = L.yaw;
			p.pitch = L.pitch;

		}

		const out = up( dt, ...r );
		if ( L ) {

			p.position.set( at().x, sea - L.depth, at().z );
			p.yaw = L.yaw;
			p.pitch = L.pitch;

		}

		return out;

	};

	// the gun's state each frame: loaded, being loaded, or a fish out on the float
	const gun = g.gun, gu = gun.update.bind( gun );
	gun.update = function ( dt, o ) {

		const L = window.__look;
		if ( L && L.gun !== undefined ) {

			if ( L.state === 'fighting' ) {

				if ( gun.state !== 'fighting' ) {

					gun.setState( 'fighting' );
					// (the way it ran, ahead of you: the fight's bearing swings round to that over seconds)
					const fw = a.camera.getWorldDirection( gun.fightDir );
					fw.set( fw.x, - 0.25, fw.z ).normalize();

				}

				gun.fight( L.dist, 0.1, true );

			} else if ( L.state === 'loading' ) {

				gun.state = 'loading';
				gun.load = [ 1, 1, 0.55, 0 ];
				gun.loading = 2;

			} else if ( gun.state !== 'loaded' ) {

				gun.setState( 'loaded' );
				gun.load = [ 1, 1, 1, 1 ];

			}

		}

		return gu( dt, o );

	};

	// (the float's shot: from above the water beside you, looking at the float; the gun in your hands not drawn)
	const draw = a.drawWorld.bind( a );
	a.drawWorld = function () {

		const L = window.__look;
		if ( L && L.cam === 'float' ) {

			const cam = a.camera, F = gun.floatAt;
			cam.position.set( SEA.x + 2.5, sea + 2.4, SEA.z + 1.5 );
			cam.lookAt( F.x, F.y - 0.6, F.z );
			cam.updateMatrixWorld();
			gun.gunMesh.visible = gun.bandMesh.visible = false;

		}

		draw();

	};

	window.__stage = ( L ) => {

		g.state.upgrades.speargun = L.gun;
		g.applyGear();
		if ( ! gun.equipped ) gun.equip( true );
		window.__look = L;
		return { sea, ground };

	};

	return { sea, ground };

}, { BAY, SEA } );
log( `the water ${ ( where.sea - where.ground ).toFixed( 1 ) } m deep` );

const ONLY = process.env.GEAR_ONLY ? process.env.GEAR_ONLY.split( ',' ) : null;
const SHOTS = [
	{ name: 'blue-aim', gun: 3, depth: 1.2, yaw: 3.74, pitch: - 0.55 },
	{ name: 'blue-loading', gun: 3, depth: 1.2, yaw: 3.74, pitch: - 0.95, state: 'loading' },
	{ name: 'rail-aim', gun: 2, depth: 1.2, yaw: 3.74, pitch: - 0.55 },
	{ name: 'blue-float', gun: 3, depth: 0.05, yaw: 0.6, pitch: - 0.1, state: 'fighting', dist: 14, cam: 'float', sea: true },
];
for ( const L of SHOTS.filter( ( x ) => ! ONLY || ONLY.includes( x.name ) ) ) {

	await page.evaluate( ( L ) => window.__stage( L ), L );
	const f0 = await page.evaluate( () => window.__app.renderer.info.render.frame );
	await page.waitForFunction( ( f0 ) => window.__app.renderer.info.render.frame > f0 + 20, f0, { timeout: 600000 } );
	await page.screenshot( { path: join( OUT, `${ L.name }.png` ) } );
	const s = await page.evaluate( () => {

		const a = window.__app, gun = a.game.gun, v = gun.floatMesh.position.clone().project( a.camera );
		return { state: gun.state, bands: gun.bands, load: gun.load.map( ( x ) => +x.toFixed( 2 ) ), float: gun.floatMesh.visible, floatAt: gun.floatAt.toArray().map( ( x ) => +x.toFixed( 2 ) ), cam: a.camera.position.toArray().map( ( x ) => +x.toFixed( 2 ) ), onScreen: v.toArray().slice( 0, 2 ).map( ( x ) => +x.toFixed( 2 ) ), line: gun.lineMesh.visible, tip: gun.tip.toArray().map( ( x ) => +x.toFixed( 2 ) ) };

	} );
	log( L.name, JSON.stringify( s ) );

}

writeFileSync( join( OUT, 'errors.txt' ), errors.join( '\n' ) );
log( `done, ${ errors.length } errors` );
await browser.close();
