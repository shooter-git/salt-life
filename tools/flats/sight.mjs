#!/usr/bin/env node
// (M17) The flats' fish, seen: headless views of each as sight-fishing has it (docs/m17/sight.md): bonefish tailing from
// the kayak's seat, mudding from wading, cruising from a bow (their nervous water and their shadows on the sand) and
// from above; permit on the edge, a tarpon laid up and one rolling, a snook and a barracuda lying still, the sharks.
// Each at a time of day game/Flats.js has that school there (found in Node first: tools/flats/sight.mjs --find), the
// clock held, the camera put beside the school with the sun at its back, at the eye's height asked, through the glasses
// or not. Drawn on the CPU (Chromium on SwiftShader, from All the Spaces' Playwright), into qa-output/flats/sight/<tier>/.
//
//   a dev server on SIGHT_PORT (5232: the worktree's .claude/launch.json "salt-life-sight"), then
//   node tools/flats/sight.mjs [tier] [views] [glasses: 1 | 0]
//   node tools/flats/sight.mjs low tails,muds,cruise,above,permit,laid,roll,snook,cuda,sharks
//   wrap it in tools/render-slot.sh. Don't edit src while it runs: the dev server reloads the page.
//
// The flats' own spooking is held off while it's staged (the camera's moved each frame, which they'd take for someone
// rushing at them); everything else is the game's.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { flatsSchools } from '../../src/game/Flats.js';
import { tideAt } from '../../src/game/IslandClock.js';
import { TerrainData } from '../../src/world/TerrainData.js';
import { decodeIsland } from '../../src/world/terrain/IslandDecode.js';
import { flatsAt } from '../../src/world/terrain/Flats.js';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const [ TIER = 'low', VIEWS = 'tails,muds,cruise,above,permit,laid,roll,snook,cuda,sharks', GLASSES = '1' ] = process.argv.slice( 2 );
const PORT = process.env.SIGHT_PORT || 5232;
const OUT = join( ROOT, 'qa-output/flats/sight', TIER );
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );

// each view: the school (its kind and mode, in this weather), how far off and how high the eye, the fish's side or
// its back to it ( turn, rad, about the school from the sun's side), and the size of the shot's look
const VIEW = {
	tails: { kind: 'bonefish', mode: 'tail', weather: 'calm', eye: 0.81, dist: 7, turn: 0.5, shallow: 0.32 },
	// (as the photographs of tails are taken: a long lens, from a little further off)
	tele: { kind: 'bonefish', mode: 'tail', weather: 'calm', eye: 0.81, dist: 9, turn: 0.5, shallow: 0.32, fov: 12 },
	muds: { kind: 'bonefish', mode: 'feed', weather: 'calm', eye: 1.65, dist: 8, turn: 0.4, grass: 0.5 },
	cruise: { kind: 'bonefish', mode: 'cruise', weather: 'calm', eye: 2.5, dist: 12, turn: 0.6, deep: 0.9 },
	above: { kind: 'bonefish', mode: 'tail', weather: 'calm', eye: 9, dist: 4, turn: 0.3, shallow: 0.32 },
	// (one fish and its shadow, as Louis Cahill's is: from above, close)
	overhead: { kind: 'bonefish', mode: 'tail', weather: 'calm', eye: 3.5, dist: 1.5, turn: 0.3, shallow: 0.32, fov: 30 },
	// (over sand, from a poling platform, as permit are looked for: over grass from a bow at 9 m one hardly shows)
	permit: { kind: 'permit', mode: 'cruise', weather: 'calm', eye: 3.5, dist: 8, turn: 0.6, deep: 1.1, bare: 0.05, hours: [ 9.5, 15 ] },
	laid: { kind: 'tarpon', mode: 'laid', weather: 'calm', eye: 2.5, dist: 8, turn: 0.5 },
	roll: { kind: 'tarpon', mode: 'roll', weather: 'calm', eye: 1.65, dist: 8, turn: 0, side: true, fov: 30, hours: [ 16.25, 17.5 ] },
	snook: { kind: 'snook', mode: 'hold', weather: 'calm', eye: 1.65, dist: 5, turn: 0, side: true, fov: 30 },
	cuda: { kind: 'barracuda', mode: 'hold', weather: 'calm', eye: 1.65, dist: 6, turn: 0.6 },
	sharks: { kind: 'lemonShark', mode: 'cruise', weather: 'calm', eye: 2.5, dist: 6, turn: 0.6, deep: 0.8, hours: [ 9.5, 15 ] },
	blacktips: { kind: 'blacktipShark', mode: 'cruise', weather: 'calm', eye: 2.5, dist: 7, turn: 0.6, deep: 0.8, hours: [ 9.5, 15 ] },
};
const WIND = { calm: 2.5, fair: 7 };

// a time with that school on the flat, by day, in full ( life 1 ), a few of them for a bonefish; for tails, with water
// shallow enough for them within its reach (world/Fish.js' _tailGround), where it'll be drawn: { day, hour, x, z }
const terrain = new TerrainData( 7, decodeIsland( new Uint8Array( readFileSync( join( ROOT, 'public/world/island-1024.bin' ) ) ) ) );
function tailGround( s, sea ) {

	let best = { x: s.x, z: s.z, e: Math.abs( sea - terrain.heightAt( s.x, s.z ) - 0.28 ), d: sea - terrain.heightAt( s.x, s.z ) };
	for ( let r = 25 / 3; r <= 25 + 1e-6; r += 25 / 3 ) for ( let k = 0; k < 16; k ++ ) {

		const x = s.x + Math.cos( k / 16 * Math.PI * 2 ) * r, z = s.z + Math.sin( k / 16 * Math.PI * 2 ) * r, d = sea - terrain.heightAt( x, z ), e = Math.abs( d - 0.28 ) + r * 0.003;
		if ( d >= 0.17 && e < best.e ) best = { x, z, e, d };

	}

	return best;

}

function find( v ) {

	const [ h0, h1 ] = v.hours || [ 10.5, 14.5 ];
	for ( let day = 3; day < 60; day ++ ) for ( let h = h0; h <= h1; h += 0.25 ) {

		const T = ( day - 1 ) * 24 + h;
		for ( const s of flatsSchools( T, { wind: WIND[ v.weather ], overcast: 0, hour: h } ) ) {

			if ( s.kind !== v.kind || s.mode !== v.mode || s.life < 0.99 || ( s.kind === 'bonefish' && s.n < 6 ) ) continue;
			if ( v.deep && tideAt( T ) - terrain.heightAt( s.x, s.z ) > v.deep ) continue;
			// (a mud shows over the grass: on white sand it's hardly there)
			if ( v.grass && flatsAt( s.x, s.z ).grass < v.grass ) continue;
			if ( v.bare !== undefined && flatsAt( s.x, s.z ).grass > v.bare ) continue;
			if ( ! v.shallow ) return { day, hour: h, ...s };
			const t = tailGround( s, tideAt( T ) );
			if ( t.d <= v.shallow ) return { day, hour: h, ...s, x: t.x, z: t.z };

		}

	}

	return null;

}

const views = VIEWS.split( ',' );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const results = [];
for ( const weather of [ ...new Set( views.map( ( k ) => VIEW[ k ].weather ) ) ] ) {

	const page = await browser.newPage( { viewport: { width: 960, height: 540 } } );
	const errors = [];
	page.on( 'pageerror', ( e ) => errors.push( e.message ) );
	page.on( 'console', ( m ) => m.type() === 'error' && errors.push( m.text() ) );
	const first = find( VIEW[ views.find( ( k ) => VIEW[ k ].weather === weather ) ] );
	await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=${ weather }&day=${ first.day }&hour=${ first.hour }&fullsea` );
	await page.waitForFunction( () => window.__app && window.__app._started, null, { timeout: 900000 } );
	log( 'started', weather );
	await page.waitForFunction( () => window.__app.fish && window.__app._plantsGrown, null, { timeout: 900000 } );
	log( 'the fish and the plants in' );
	await page.evaluate( async ( glasses ) => {

		const a = window.__app, cam = a.camera, { G } = await import( '/src/core/Globals.js' );
		window.__fov0 = cam.fov;
		// (the clock held where each view sets it: the shared clock's not let move it)
		if ( a.together ) a.together.syncClock = () => {};
		a.settings.timeSpeed = 0;
		a.game.state.stats.polarized = glasses;
		const css = document.createElement( 'style' );
		css.textContent = 'body * { visibility: hidden !important }';
		document.head.appendChild( css );
		a.renderer.domElement.style.setProperty( 'visibility', 'visible', 'important' );
		a.game.flats.spooked = () => {};
		const place = window.__place = () => {

			// (SIGHT_HIDE: what's left out of a second shot of each view, to see what paints what: 'marks', 'fish')
			const hide = window.__hide || '';
			if ( a.fish.marks ) for ( const m of [ a.fish.marks.under.mesh, a.fish.marks.surface.mesh ] ) if ( hide.includes( 'marks' ) ) m.visible = false;
			if ( a.fish.batch ) for ( const m of a.fish.batch.meshes ) m.visible = ! hide.includes( 'fish' );
			const L = window.__look;
			if ( ! L ) return;
			// (one fish followed: the rolling tarpon, as it goes)
			if ( L.track !== undefined ) {

				L.x = a.fish.pos[ L.track * 3 ];
				L.z = a.fish.pos[ L.track * 3 + 2 ];

			}
			const T = a.terrainData, sea = G.seaLevel.value, sun = G.sunDir.value, sl = Math.hypot( sun.x, sun.z ) || 1;
			// (the sun behind: from the school toward the sun, turned a little about it; a fish followed side on, from
			// its side nearer the sun, as a roll's photographed)
			let base = Math.atan2( sun.z / sl, sun.x / sl );
			if ( L.track !== undefined && L.side ) {

				const h = a.fish.head, hx = h[ L.track * 3 ], hz = h[ L.track * 3 + 2 ];
				if ( hx || hz ) {

					const ha = Math.atan2( hz, hx ), off = ( t ) => Math.abs( Math.atan2( Math.sin( t - base ), Math.cos( t - base ) ) );
					base = off( ha + Math.PI / 2 ) < off( ha - Math.PI / 2 ) ? ha + Math.PI / 2 : ha - Math.PI / 2;

				}

			}

			const ang = base + L.turn, x = L.x + Math.cos( ang ) * L.dist, z = L.z + Math.sin( ang ) * L.dist;
			const g = T.heightAt( x, z );
			a.player.position.set( x, Math.max( g, sea - 1.2 ), z );
			cam.position.set( x, sea + L.eye, z );
			cam.up.set( 0, 1, 0 );
			cam.lookAt( L.x, sea - 0.3, L.z );
			cam.updateMatrixWorld();
			G.cameraUnderwater.value = 0;
			const fov = L.fov || window.__fov0;
			if ( cam.far !== 12000 || cam.fov !== fov ) {

				cam.far = 12000;
				cam.fov = fov;
				cam.updateProjectionMatrix();

			}

			a.scene.fog.near = a.sky.fogNear;
			a.scene.fog.far = a.sky.fogFar;

		};

		for ( const [ o, k ] of [ [ a, 'drawWorld' ], [ a.terrain, 'update' ], [ a.water, 'update' ], [ a.fish, 'update' ], [ a.game.flats, 'update' ] ] ) {

			const f = o[ k ].bind( o );
			o[ k ] = function ( ...args ) {

				place();
				if ( o === a.fish ) args[ 1 ] = cam.position;
				const r = f( ...args );
				if ( o === a ) window.__frames = ( window.__frames || 0 ) + 1;
				return r;

			};

		}

	}, GLASSES === '1' );
	const frames = async ( n ) => {

		const from = await page.evaluate( () => window.__frames || 0 );
		await page.waitForFunction( ( to ) => ( window.__frames || 0 ) >= to, from + n, { timeout: 300000 } );

	};

	for ( const v of views.filter( ( k ) => VIEW[ k ].weather === weather ) ) {

		const V = VIEW[ v ], s = find( V );
		if ( ! s ) {

			log( 'no school for', v );
			continue;

		}

		await page.evaluate( ( [ V, s ] ) => {

			const a = window.__app;
			a.settings.day = s.day;
			a.settings.timeOfDay = s.hour;
			// (every school given its group afresh at the new time, where it is then, and the last view's muds and rings gone)
			for ( const g of a.fish.sightGroups ) if ( g.sight ) a.fish._park( g );
			if ( a.fish.marks ) a.fish.marks.muds.length = a.fish.marks.rings.length = 0;
			window.__look = { ...V, x: s.x, z: s.z };
			const g = a.game.guide;
			if ( g && g.open ) g.close();

		}, [ V, s ] );
		await frames( 8 );
		await page.evaluate( ( [ kind, mode ] ) => {

			// (the view's group: its school's, or else the nearest of its kind doing the same, a pool being spent nearest first)
			window.__groupOf = ( id ) => {

				const G = window.__app.fish.sightGroups, L = window.__look;
				return G.find( ( h ) => h.sight && h.sight.id === id ) || G.filter( ( h ) => h.sight && h.sight.kind === kind && h.sight.mode === mode ).sort( ( a, b ) => Math.hypot( a.center.x - L.x, a.center.z - L.z ) - Math.hypot( b.center.x - L.x, b.center.z - L.z ) )[ 0 ];

			};

		}, [ V.kind, V.mode ] );
		await page.waitForFunction( ( id ) => { const g = window.__groupOf( id ); return g && g.sight.age > 3; }, s.id, { timeout: 300000 } ).catch( () => log( 'no group for', s.id ) );
		// (the camera put by the school as it's drawn, where its fish are, once they're there)
		await page.evaluate( ( id ) => {

			const g = window.__groupOf( id );
			if ( g ) Object.assign( window.__look, { x: g.center.x, z: g.center.z } );
			// (a lone fish followed from its side: the fish itself, where it lies, not its group's centre)
			if ( g && window.__look.side ) window.__look.track = g.offset;

		}, s.id );
		await frames( 4 );
		// (a rolling tarpon shot as it rolls: its next roll brought on now, and caught as its back's through the surface)
		if ( V.mode === 'roll' ) {

			await page.evaluate( ( id ) => {

				const f = window.__app.fish, g = window.__groupOf( id );
				if ( g ) {

					f.aux[ g.offset * 8 + 2 ] = 0;
					window.__look.track = g.offset;

				}

			}, s.id );
			await page.waitForFunction( ( id ) => {

				const f = window.__app.fish, g = window.__groupOf( id ), ph = g ? f.aux[ g.offset * 8 + 3 ] : 0;
				return ph > 0.45 && ph < 0.6;

			}, s.id, { timeout: 120000, polling: 'raf' } ).catch( () => log( 'no roll caught' ) );

		}

		const name = `${ v }${ GLASSES === '1' ? '' : '-bare' }`;
		await page.screenshot( { path: join( OUT, name + '.png' ) } );
		const info = await page.evaluate( ( id ) => {

			const a = window.__app, g = window.__groupOf( id ), r = a.renderer.info.render;
			const S = g && g.sight, cam = a.camera.position;
			const seen = S ? Object.fromEntries( Object.entries( S.seen ).map( ( [ k, x ] ) => [ k, Number( x.toFixed( 2 ) ) ] ) ) : null;
			return { clock: Number( a.settings.timeOfDay.toFixed( 2 ) ), group: g ? g.sp.name : null, mode: S && S.mode, shown: S && S.shown, seen, dist: g ? Number( Math.hypot( g.center.x - cam.x, g.center.z - cam.z ).toFixed( 1 ) ) : null, marks: a.fish.marks ? [ a.fish.marks.under.n, a.fish.marks.surface.n, a.fish.marks.muds.length, a.fish.marks.rings.length ] : null, kinds: a.fish.marks ? [ a.fish.marks.under, a.fish.marks.surface ].map( ( M ) => { const c = {}; for ( let k = 0; k < M.n; k ++ ) c[ M.info.array[ k * 4 ] ] = ( c[ M.info.array[ k * 4 ] ] || 0 ) + 1; return c; } ) : null, triangles: r.triangles, calls: r.calls, sea: Number( a.weather.tide.toFixed( 2 ) ), budget: a.fish._budget ? a.fish._budget.spent : null };

		}, s.id );
		results.push( { view: v, school: s.id, day: s.day, hour: s.hour, ...info } );
		log( 'shot', name, JSON.stringify( info ) );
		if ( process.env.SIGHT_HIDE ) {

			await page.evaluate( ( h ) => window.__hide = h, process.env.SIGHT_HIDE );
			await frames( 3 );
			await page.screenshot( { path: join( OUT, `${ name }-no-${ process.env.SIGHT_HIDE.replace( /,/g, '-' ) }.png` ) } );
			await page.evaluate( () => window.__hide = '' );
			log( 'shot', name, 'without', process.env.SIGHT_HIDE );

		}

	}

	if ( errors.length ) log( 'errors:', errors.slice( 0, 5 ) );
	results.push( { weather, errors: errors.slice( 0, 10 ) } );
	await page.close();

}

await browser.close();
writeFileSync( join( OUT, `results${ GLASSES === '1' ? '' : '-bare' }.json` ), JSON.stringify( results, null, 1 ) );
log( 'done', OUT );
