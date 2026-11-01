// (M16) The center console in the game itself, through a dev server on 5202, Playwright on SwiftShader:
//   tools/render-slot.sh node tools/console/game.mjs out-dir [ scene ... ]
// Scenes: dock (where she lies, from the pier), helm (her dash from the wheel, lit), run (under power, from astern and abeam, her
// wake), deck (walked round: bow, stern, platform), rain (a downpour: outside the top and under it), night (her lamps), tier=low
// in the url's query with QUERY=... for the phone's budgets.
import { chromium } from '/home/shooter/Documents/VS Code/all-the-spaces/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';

const [ out, ...scenes ] = process.argv.slice( 2 );
fs.mkdirSync( out, { recursive: true } );
const query = process.env.QUERY || '';
const b = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info' ] } );
const p = await b.newPage( { viewport: { width: 1280, height: 720 } } );
const seen = new Set();
p.on( 'pageerror', ( e ) => console.log( 'PAGEERROR', e.message.slice( 0, 400 ) ) );
p.on( 'console', ( m ) => {

	const t = m.text();
	if ( ! [ 'error', 'warning' ].includes( m.type() ) || /GPU stall|ReadPixels|PCFSoft/.test( t ) || seen.has( t.slice( 0, 80 ) ) ) return;
	seen.add( t.slice( 0, 80 ) );
	console.log( m.type(), t.slice( 0, 500 ) );

} );
await p.goto( `http://127.0.0.1:5202/?boat=console&hour=${ process.env.HOUR || 11 }${ query ? '&' + query : '' }` );
await p.waitForFunction( () => window.__app && window.__app._started, null, { timeout: 280000 } );
console.log( 'started' );
const closeGuide = () => p.evaluate( () => {

	const g = window.__app.game && window.__app.game.guide;
	if ( g && g.open ) g.close();

} );
const shot = async ( name ) => {

	await closeGuide();
	await p.waitForTimeout( 500 );
	await p.screenshot( { path: path.join( out, name + '.png' ) } );
	console.log( 'shot', name );

};

const wait = async ( ms ) => {

	await closeGuide();
	await p.waitForTimeout( ms );

};

// (a stage for a look: the camera's left where it's put, the frame's own camera work replaced)
const look = ( eye, at ) => p.evaluate( ( [ eye, at ] ) => {

	const a = window.__app, c = a.boatCtl, cam = a.camera;
	window.__look = { eye, at };
	if ( ! window.__lookOn ) {

		window.__lookOn = true;
		const draw = a.drawWorld.bind( a );
		a.drawWorld = function () {

			const L = window.__look;
			if ( L ) {

				a.player.position.copy( c.position );
				cam.position.set( ...L.eye ).applyQuaternion( c.quaternion ).add( c.position );
				const t = cam.position.clone().set( ...L.at ).applyQuaternion( c.quaternion ).add( c.position );
				cam.up.set( 0, 1, 0 );
				cam.lookAt( t );

			}

			draw();

		};

	}

}, [ eye, at ] );

await wait( 2000 );
for ( const s of scenes.length ? scenes : [ 'dock', 'run', 'deck', 'helm' ] ) {

	if ( s === 'budget' ) {

		const info = await p.evaluate( () => {

			const a = window.__app, r = a.renderer.info;
			return { tier: a.tier, boat: a.boat.id, boatTris: a.boat.triangleCount, meshes: Object.keys( a.boat.meshes ).length, frameCalls: r.render.calls, frameTris: r.render.triangles, programs: r.programs.length, heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null };

		} );
		console.log( JSON.stringify( info ) );

	}

	if ( s === 'dock' ) {

		await wait( 4000 );
		await look( [ 9, 3.2, 7 ], [ 0, 1, 0 ] );
		await wait( 2500 );
		await shot( 'dock-bow' );
		await look( [ - 5, 3.2, - 9.5 ], [ 0, 0.8, - 2 ] );
		await wait( 2500 );
		await shot( 'dock-stern' );
		await p.evaluate( () => {

			window.__look = null;

		} );

	}

	if ( s === 'helm' ) {

		await p.evaluate( () => {

			const a = window.__app, P = a.player;
			P.boardBoat();
			P.takeHelm();

		} );
		await wait( 6000 );
		await shot( 'helm' );
		await p.evaluate( () => window.__app.player.leaveHelm() );

	}

	if ( s === 'deck' ) {

		for ( const [ name, x, z, yaw, pitch ] of [ [ 'deck-bow', 0, 2.2, 0, - 0.35 ], [ 'deck-side', 0.78, - 1.2, 0.1, - 0.2 ], [ 'deck-aft', - 0.4, - 2.1, 3.14, - 0.3 ], [ 'deck-post', 0.2, - 2.15, 0.1, - 0.25 ], [ 'deck-platform', - 0.3, - 3.45, 3.14, - 0.55 ] ] ) {

			await p.evaluate( ( [ x, z, yaw, pitch ] ) => {

				const a = window.__app, P = a.player;
				if ( P.mode !== 'deck' ) P.boardBoat();
				P.deckPos.set( x, a.boat.soleY( x, z, 2 ), z );
				P.deckYaw = yaw;
				P.pitch = pitch;

			}, [ x, z, yaw, pitch ] );
			await wait( 3000 );
			await shot( name );

		}

	}

	if ( s === 'run' ) {

		// off the dock and under way, flat out then at the helm's cruise
		await p.evaluate( () => {

			const a = window.__app, c = a.boatCtl, P = a.player;
			P.boardBoat();
			P.takeHelm();
			c.moored = false;
			P.input.down = ( ( down ) => function ( k ) {

				if ( k === 'KeyW' ) return true;
				return down.call( this, k );

			} )( P.input.down );

		} );
		for ( let i = 0; i < 30; i ++ ) {

			await wait( 2000 );
			const v = await p.evaluate( () => [ window.__app.boatCtl.speed, window.__app.boatCtl.rpm ] );
			if ( v[ 0 ] > 9 || i === 29 ) break;

		}

		const st = await p.evaluate( () => {

			const c = window.__app.boatCtl, f = c.forward( c.position.clone() );
			return { kn: c.speed / 0.5144, rpm: c.rpm, pitch: Math.asin( f.y ) * 57.3, y: c.position.y, trim: c.outboardTrim * 57.3 };

		} );
		console.log( JSON.stringify( st ) );
		await look( [ - 7, 3.2, - 14 ], [ 0, 0.8, - 2 ] );
		await wait( 3000 );
		await shot( 'run-astern' );
		await look( [ 14, 3, 3 ], [ 0, 1, - 1 ] );
		await wait( 3000 );
		await shot( 'run-abeam' );
		await p.evaluate( () => {

			window.__look = null;

		} );
		await shot( 'run-helm' );

	}

	if ( s === 'rain' ) {

		await p.evaluate( () => {

			const a = window.__app;
			a.game.time.pickWeather( 'storm' );
			a.game.time.rest( 'noon' );
			a.player.boardBoat();
			a.player.deckPos.set( 0, a.boat.lines.deckY, 2.2 );
			a.player.deckYaw = 3.14;
			a.player.pitch = - 0.1;

		} );
		await wait( 90000 );
		await shot( 'rain-out' );
		console.log( JSON.stringify( await p.evaluate( () => ( { rain: 0 + ( window.__app.game.soak ? window.__app.game.soak.wet : - 1 ), level: window.__app.game._soakView?.level } ) ) ) );
		await p.evaluate( () => {

			const a = window.__app;
			a.player.deckPos.set( 0.75, a.boat.lines.deckY, - 0.4 );
			a.player.deckYaw = 0;

		} );
		await wait( 20000 );
		await shot( 'rain-under' );

	}

	if ( s === 'night' ) {

		await p.evaluate( () => {

			const a = window.__app;
			a.game.time.rest( 'night' );
			a.boatCtl.moored = false;
			a.boatCtl.driven = false;

		} );
		await wait( 15000 );
		await look( [ 12, 3, 12 ], [ 0, 1, 0 ] );
		await wait( 4000 );
		await shot( 'night-bow' );
		await look( [ - 10, 3, - 12 ], [ 0, 1, 0 ] );
		await wait( 4000 );
		await shot( 'night-stern' );
		await p.evaluate( () => {

			window.__look = null;

		} );

	}

}

await b.close();
