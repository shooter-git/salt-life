#!/usr/bin/env node
// (M17) The moon seen (docs/m17/moon.md): headless views of the moon at each phase and the night it gives, with the
// island's clock held on a night of each (new, crescent, quarter, gibbous, full: the first month's, worked out here from
// Moon.js where the sky's dark and the moon's well up). Drawn on the CPU (Chromium on SwiftShader, from All the Spaces'
// Playwright), into qa-output/moon/look/<tier>/.
//
//   a dev server on MOON_PORT (5236: the project's .claude/launch.json "salt-life-moon"), then
//   node tools/moon/look.mjs [tier] [phases] [views]
//   node tools/moon/look.mjs low new,crescent,quarter,gibbous,full disc,sky,beach,sea[,torch]
//   (ALL_THE_SPACES: its checkout, if it isn't ../all-the-spaces; MOON_CLEAR=1: no cloud; MOON_QUICK=1: no waiting
//   for the island's plants, for the disc)
//
// Views: disc, the moon through a 1.5 degree lens (its phase, its seas, earthshine); sky, it and the sky about it as you
// see them (60 degrees); beach, the north's turtle beach from the sand out to sea; sea, from the water toward it, its path
// on the sea; torch, along the beach with the flashlight on. A load takes a minute or two (on mid and high on the CPU,
// many); each shot some tens of seconds more. Don't edit src while it runs.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moonSky, sunAt } from '../../src/sky/Moon.js';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const [ TIER = 'low', PHASES = 'new,crescent,quarter,gibbous,full', VIEWS = 'disc,sky,beach,sea' ] = process.argv.slice( 2 );
const PORT = process.env.MOON_PORT || 5236;
const OUT = join( ROOT, 'qa-output/moon/look', TIER );
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );

// each phase: its phase (0 new, 0.5 full), and how high the sun may be (sin): a crescent's seen in the dusk
const PHASE = { new: [ 0, - 0.3 ], crescent: [ 0.12, - 0.2 ], quarter: [ 0.25, - 0.3 ], gibbous: [ 0.38, - 0.3 ], full: [ 0.5, - 0.3 ] };
// the night of it: the day (of the first month) and hour where its phase is nearest, the sky's dark enough, and the moon
// highest up to 40 degrees (so the sea's in a view of it); for new, where it's furthest down
function nightOf( name ) {

	const [ want, sunMax ] = PHASE[ name ];
	let best = null;
	for ( let day = 1; day <= 31; day ++ ) for ( let h = 18.5; h < 29.5; h += 0.25 ) {

		const hour = h % 24, d = day + ( h >= 24 ? 1 : 0 ), T = ( d - 1 ) * 24 + hour;
		const sun = sunAt( hour );
		if ( sun[ 1 ] > sunMax ) continue;
		const m = moonSky( T, hour );
		const off = Math.abs( ( ( m.phase - want + 1.5 ) % 1 ) - 0.5 );
		const up = Math.asin( m.dir[ 1 ] ) * 180 / Math.PI;
		const score = off * 400 + ( name === 'new' ? up : Math.abs( Math.min( up, 40 ) - 40 ) + ( up > 40 ? ( up - 40 ) * 0.2 : 0 ) );
		if ( ! best || score < best.score ) best = { day: d, hour, phase: m.phase, up, score, lit: m.lit };

	}

	// (and the hour that night it's lowest over 8 degrees, in the dark: its path on the sea, as the photographs have it)
	if ( best ) for ( let h = 18.5; h < 29.5; h += 0.25 ) {

		const hour = h % 24, d = best.day - ( best.hour < 12 ? 1 : 0 ) + ( h >= 24 ? 1 : 0 ), T = ( d - 1 ) * 24 + hour;
		if ( sunAt( hour )[ 1 ] > sunMax ) continue;
		const up = Math.asin( moonSky( T, hour ).dir[ 1 ] ) * 180 / Math.PI;
		if ( up > 8 && ( ! best.low || Math.abs( up - 12 ) < Math.abs( best.low[ 2 ] - 12 ) ) ) best.low = [ d, hour, up ];

	}

	return best;

}

// each view: where you stand ( x, z ), the eye's height over the ground or the sea, and how it looks: at the moon
// (`moon`, its pitch held to `pitch` degrees at most, `down` at least), or at a point; and its lens (degrees). On the
// north's turtle beach, away from any lamp; `offshore`: out from the island toward the moon until the sea's deep
// (its path on the water, at an hour of its own that night with the moon about 12 degrees up). With no moon up (new),
// the sky views look northwest, 30 degrees up, across the Milky Way
const VIEW = {
	disc: { stand: [ 150, - 826 ], eye: [ 1.7, 'ground' ], moon: true, fov: 1.5 },
	sky: { stand: [ 150, - 826 ], eye: [ 1.7, 'ground' ], moon: true, pitch: 28, fov: 60 },
	beach: { stand: [ 150, - 818 ], eye: [ 1.7, 'ground' ], at: [ 150, - 0.4, - 900 ], fov: 60 },
	sea: { offshore: true, eye: [ 2.2, 'sea' ], moon: true, pitch: 10, down: - 3, fov: 60, low: true },
	// (along the beach with the flashlight on: finding your way on the darkest night)
	torch: { stand: [ 150, - 826 ], eye: [ 1.7, 'ground' ], at: [ 128, - 0.6, - 838 ], fov: 60, torch: true },
};
const phases = PHASES.split( ',' ), views = VIEWS.split( ',' );
const nights = Object.fromEntries( phases.map( ( p ) => [ p, nightOf( p ) ] ) );
log( 'nights', JSON.stringify( nights ) );

const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
page.on( 'console', ( m ) => m.type() === 'error' && errors.push( m.text() ) );
const first = nights[ phases[ 0 ] ];
await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&hour=${ first.hour }&day=${ first.day }&fullsea` );
await page.waitForFunction( () => window.__app && window.__app._started, null, { timeout: 400000 } );
log( 'started' );
// (MOON_QUICK=1: the disc and the sky alone, without waiting for the island's plants)
if ( ! process.env.MOON_QUICK ) {

	await page.waitForFunction( () => window.__app._plantsGrown, null, { timeout: 600000 } );
	log( 'the island all there' );

}

await page.evaluate( async ( clear ) => {

	const a = window.__app, cam = a.camera, { G } = await import( '/src/core/Globals.js' );
	// the clock held where it's asked (window.__at: [ day, hour ])
	const hold = () => {

		const at = window.__at;
		if ( ! at ) return;
		a.settings.timeSpeed = 0;
		a.settings.day = at[ 0 ];
		a.settings.timeOfDay = at[ 1 ];
		const t = a.together;
		if ( t && t._clock ) t._clock = { ...t._clock, at: Date.now(), day: at[ 0 ], hour: at[ 1 ], speed: 0 };

	};

	setInterval( hold, 500 );
	window.__hold = hold;
	if ( clear ) {

		const w = a.weather, up = w.update.bind( w );
		w.update = function ( ...args ) {

			up( ...args );
			if ( this.live ) this.live.coverage = 0;

		};

	}

	const place = () => {

		const L = window.__look;
		if ( ! L ) return;
		hold();
		const T = a.terrainData, sea = G.seaLevel.value;
		if ( L.offshore && ! L.stand ) {

			// (out from the island's middle toward the moon, past where the sea's been deep for 300 m)
			const m = a.sky.moonDir, h = Math.hypot( m.x, m.z ) || 1;
			let deep = 0, r = 100;
			for ( ; r < 9000 && deep < 300; r += 20 ) deep = T.heightAt( m.x / h * r, m.z / h * r ) < - 8 ? deep + 20 : 0;
			L.stand = [ m.x / h * r, m.z / h * r ];

		}

		const g = T.heightAt( L.stand[ 0 ], L.stand[ 1 ] );
		a.player.position.set( L.stand[ 0 ], Math.max( g, sea - 1.2 ), L.stand[ 1 ] );
		cam.position.set( L.stand[ 0 ], ( L.eye[ 1 ] === 'ground' ? Math.max( g, sea ) : sea ) + L.eye[ 0 ], L.stand[ 1 ] );
		cam.up.set( 0, 1, 0 );
		// (no moon up: the sky's own, west over the sea's corner 30 degrees up, across the Milky Way's band)
		if ( L.moon && a.sky.moonDir.y < - 0.02 && L.fov > 10 ) cam.lookAt( cam.position.x - 0.7, cam.position.y + Math.tan( 30 * Math.PI / 180 ), cam.position.z - 0.7 );
		else if ( L.moon ) {

			const m = a.sky.moonDir;
			let x = m.x, y = m.y, z = m.z;
			if ( L.pitch !== undefined ) {

				const h = Math.hypot( x, z ) || 1, p = Math.min( Math.asin( Math.max( - 1, Math.min( 1, y ) ) ), L.pitch * Math.PI / 180 );
				const q = L.down !== undefined && y < Math.sin( L.pitch * Math.PI / 180 ) ? Math.max( L.down * Math.PI / 180, p ) : p;
				x = x / h * Math.cos( q );
				z = z / h * Math.cos( q );
				y = Math.sin( q );

			}

			cam.lookAt( cam.position.x + x, cam.position.y + y, cam.position.z + z );

		} else cam.lookAt( L.at[ 0 ], L.at[ 1 ], L.at[ 2 ] );

		if ( cam.fov !== L.fov || cam.far !== 12000 ) {

			cam.fov = L.fov;
			cam.far = 12000;
			cam.updateProjectionMatrix();

		}

		cam.updateMatrixWorld();
		const fl = a.localLights && a.localLights.flashlight;
		if ( fl && fl.on !== !! L.torch ) a.localLights.toggleFlashlight( !! L.torch );
		G.cameraUnderwater.value = 0;
		a.scene.fog.near = a.sky.fogNear;
		a.scene.fog.far = a.sky.fogFar;
		a.scene.fog.color.copy( G.horizonColor.value );
		if ( a.vegetation && a.vegetation.ready ) a.vegetation.group.visible = true;
		if ( a.snow && a.snow.mesh ) a.snow.mesh.visible = false;

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

	// (the HUD out of the shots)
	const canvas = a.renderer.domElement;
	for ( const el of document.body.querySelectorAll( '*' ) ) if ( el !== canvas && ! el.contains( canvas ) ) el.style.visibility = 'hidden';

}, !! process.env.MOON_CLEAR );
const frames = async ( n ) => {

	const from = await page.evaluate( () => window.__frames || 0 );
	await page.waitForFunction( ( to ) => ( window.__frames || 0 ) >= to, from + n, { timeout: 900000, polling: 1000 } );

};

const results = [];
for ( const p of phases ) {

	const N = nights[ p ];
	await page.evaluate( ( at ) => {

		window.__at = at;
		window.__hold();

	}, [ N.day, N.hour ] );
	// (the clouds' panorama and the reflections made again for the new hour: fewer frames on the tiers that draw slower)
	await frames( TIER === 'low' ? 30 : 16 );
	for ( const v of views ) {

		if ( v === 'disc' && N.up < 0 ) continue;
		// (the sea's view an hour of its own that night, the moon low: its path)
		const at = VIEW[ v ].low && N.low ? N.low.slice( 0, 2 ) : [ N.day, N.hour ];
		await page.evaluate( ( [ L, at ] ) => {

			window.__look = L;
			window.__at = at;
			window.__hold();

		}, [ { ...VIEW[ v ] }, at ] );
		if ( VIEW[ v ].low && N.low ) await frames( 24 );
		await frames( v === 'disc' ? 3 : 8 );
		const name = `${ p }-${ v }`;
		await page.screenshot( { path: join( OUT, name + '.png' ) } );
		const info = await page.evaluate( () => {

			const s = window.__app.sky, n = s.night;
			const r = ( x ) => Number( x.toFixed( 3 ) );
			return { day: window.__app.settings.day, hour: r( window.__app.settings.timeOfDay ), phase: r( s.moon.phase ), lit: r( s.moon.lit ), up: r( Math.asin( s.moon.dir[ 1 ] ) * 180 / Math.PI ), lux: Number( n.lux.toPrecision( 3 ) ), seen: r( n.seen ), key: r( s.sun.intensity ), fill: r( s.hemi.intensity ), sky: r( n.skySeen ), sb: r( n.sb ), stars: r( s.uniforms.skyNightLight.value.w - 1 ) };

		} );
		results.push( { phase: p, view: v, ...info } );
		log( 'shot', name, JSON.stringify( info ) );

	}

}

if ( errors.length ) log( 'errors:', errors.slice( 0, 5 ) );
results.push( { errors: errors.slice( 0, 10 ) } );
await browser.close();
writeFileSync( join( OUT, 'results.json' ), JSON.stringify( results, null, 1 ) );
log( 'done', OUT );
