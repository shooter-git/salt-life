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
// (a load the machine's network changing cut off, ERR_NETWORK_CHANGED, gets one more go)
await p.waitForFunction( () => window.__app && window.__app._started, null, { timeout: 150000 } ).catch( async () => {

	await p.reload();
	await p.waitForFunction( () => window.__app && window.__app._started, null, { timeout: 280000 } );

} );
console.log( 'started' );
const closeGuide = () => p.evaluate( () => {

	const g = window.__app.game && window.__app.game.guide;
	if ( g && g.open ) g.close();

} );
// (frames drawn, the wait for the view to catch up: frames come slowly here, more so with other renders running)
const frames = async ( n ) => {

	const from = await p.evaluate( () => window.__frames );
	await p.waitForFunction( ( to ) => window.__frames >= to, from + n, { timeout: 120000 } );

};

const shot = async ( name ) => {

	await frames( 2 );
	await closeGuide();
	await p.waitForTimeout( 400 );
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
	window.__look = eye && { eye, at };
	if ( ! window.__lookOn ) {

		window.__lookOn = true;
		const place = () => {

			const L = window.__look;
			if ( ! L ) return;
			a.player.position.copy( c.position );
			cam.position.set( ...L.eye ).applyQuaternion( c.quaternion ).add( c.position );
			const t = cam.position.clone().set( ...L.at ).applyQuaternion( c.quaternion ).add( c.position );
			cam.up.set( 0, 1, 0 );
			cam.lookAt( t );
			cam.updateMatrixWorld();

		};

		// (before the sea's laid out as well, which is for the view it's given: drawn from another, it leaves black wedges)
		const draw = a.drawWorld.bind( a ), up = a.water.update.bind( a.water );
		a.water.update = function ( camera ) {

			place();
			up( camera );

		};

		a.drawWorld = function () {

			place();
			draw();
			window.__frames = ( window.__frames || 0 ) + 1;

		};

	}

}, [ eye, at ] );

await look( null );
await p.evaluate( () => { window.__frames = 0; } );
await wait( 2000 );
for ( const s of scenes.length ? scenes : [ 'dock', 'run', 'deck', 'helm' ] ) {

	if ( s === 'budget' ) {

		// (what she adds to a frame: drawn with her and without, shadows and all)
		const info = await p.evaluate( () => {

			const a = window.__app, I = a.renderer.info, was = I.autoReset, near = a.nearDetail;
			I.autoReset = false;
			const count = () => {

				I.reset();
				a.drawWorld();
				return [ I.render.calls, I.render.triangles ];

			};

			a.player.position.copy( a.boatCtl.position );
			const on = count();
			a.boat.group.visible = false;
			const off = count();
			a.boat.group.visible = true;
			I.autoReset = was;
			void near;
			return { tier: a.tier, boat: a.boat.id, boatTris: a.boat.triangleCount, meshes: Object.keys( a.boat.meshes ).length, addsCalls: on[ 0 ] - off[ 0 ], addsTris: on[ 1 ] - off[ 1 ], frameCalls: on[ 0 ], frameTris: on[ 1 ], programs: I.programs.length, heapMB: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null };

		} );
		console.log( JSON.stringify( info ) );

	}

	if ( s === 'dock' ) {

		await wait( 4000 );
		await look( [ - 9, 3.2, 7 ], [ 0, 1, 0 ] );
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

		for ( const [ name, x, z, yaw, pitch ] of [ [ 'deck-bow', 0, 1.3, 0, - 0.35 ], [ 'deck-post', 0.2, - 2.2, 0.1, - 0.25 ], [ 'deck-platform', - 0.3, - 3.45, 3.14, - 0.55 ] ] ) {

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

		// out in open water (a long clear run to the east or west, away from her berth), under way at the helm's cruise
		await p.evaluate( () => {

			const a = window.__app, c = a.boatCtl, P = a.player, T = a.terrainData;
			let best = null;
			for ( let k = 0; k < 400 && ! best; k ++ ) {

				const x = ( k * 733 ) % 6000 - 3000, z = ( k * 461 ) % 6000 - 3000, yaw = k * 1.1;
				let clear = true;
				for ( let d = 0; d <= 1500; d += 50 ) if ( T.heightAt( x + Math.sin( yaw ) * d, z + Math.cos( yaw ) * d ) > - 12 ) clear = false;
				if ( clear ) best = { x, z, yaw };

			}

			c.position.set( best.x, c.position.y, best.z );
			c.quaternion.setFromAxisAngle( new c.position.constructor( 0, 1, 0 ), best.yaw );
			c.velocity.set( 0, 0, 0 );
			c.angular.set( 0, 0, 0 );
			c.hasWater = false;
			console.warn( 'run from ' + JSON.stringify( best ) );
			P.boardBoat();
			P.takeHelm();
			c.moored = false;
			P.input.down = ( ( down ) => function ( k ) {

				if ( k === 'KeyW' ) return true;
				return down.call( this, k );

			} )( P.input.down );

		} );
		// (counted in frames, which come slowly here: wait for her speed, not the clock)
		for ( let i = 0; i < 90; i ++ ) {

			await wait( 4000 );
			const v = await p.evaluate( () => window.__app.boatCtl.speed );
			if ( v > 13 ) break;

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
		await wait( 60000 );
		await p.evaluate( () => {

			const g = window.__app.game;
			if ( g.soak ) g.soak.wet = 1;

		} );
		await wait( 8000 );
		await shot( 'rain-out' );
		console.log( JSON.stringify( await p.evaluate( () => ( { rain: 0 + ( window.__app.game.soak ? window.__app.game.soak.wet : - 1 ), level: window.__app.game._soakView?.level } ) ) ) );
		await p.evaluate( () => {

			const a = window.__app;
			a.player.deckPos.set( 0.72, a.boat.lines.deckY, - 0.9 );
			a.player.deckYaw = 0.5;
			a.player.pitch = 0.1;

		} );
		await wait( 8000 );
		console.log( JSON.stringify( await p.evaluate( () => {

			const a = window.__app, cam = a.camera.position;
			return { eyeY: cam.y, boatY: a.boatCtl.position.y, water: a.cameraWaterHeight, mode: a.player.mode, deck: a.player.deckPos.toArray(), cover: a.boat.covered };

		} ) ) );
		await shot( 'rain-under' );

	}

	// (under the top in the rain: what paints the middle of the view, hiding each thing in turn)
	if ( s === 'probe' ) {

		const r = await p.evaluate( () => {

			const a = window.__app, gl = a.renderer.getContext(), out = [];
			a.player.deckPos.set( 0.72, a.boat.lines.deckY, - 0.9 );
			a.player.deckYaw = 0.5;
			const px = () => {

				a.drawWorld();
				const b = new Uint8Array( 4 );
				gl.bindFramebuffer( gl.FRAMEBUFFER, null );
				gl.readPixels( gl.drawingBufferWidth >> 1, gl.drawingBufferHeight >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b );
				return [ ...b ].slice( 0, 3 );

			};

			const base = px();
			out.push( { base, cam: a.camera.position.toArray(), look: a.camera.getWorldDirection( a.camera.position.clone() ).toArray() } );
			const tryHide = ( o, name ) => {

				if ( ! o.visible ) return;
				o.visible = false;
				const c = px();
				o.visible = true;
				if ( Math.abs( c[ 0 ] - base[ 0 ] ) + Math.abs( c[ 1 ] - base[ 1 ] ) + Math.abs( c[ 2 ] - base[ 2 ] ) > 12 ) out.push( { name, c } );

			};

			a.scene.children.forEach( ( o, i ) => tryHide( o, o.name || o.type + i ) );
			a.boat.group.children.forEach( ( o, i ) => tryHide( o, 'boat:' + ( o.name || o.type + i ) ) );
			return out;

		} );
		console.log( JSON.stringify( r ) );
		await shot( 'probe' );

	}

	// (planing, her wake: the frames come too slowly here to get her there, so run her ahead, with her wake)
	if ( s === 'plane' ) {

		await p.evaluate( () => {

			const a = window.__app, c = a.boatCtl, P = a.player, T = a.terrainData;
			// (already running, from the scene before: carry on)
			if ( c.speed > 5 ) return;
			// (at the helm, her engines down, and out on a clear run)
			let best = null;
			for ( let k = 0; k < 400 && ! best; k ++ ) {

				const x = ( k * 733 ) % 6000 - 3000, z = ( k * 461 ) % 6000 - 3000, yaw = k * 1.1;
				let clear = true;
				for ( let d = 0; d <= 1500; d += 50 ) if ( T.heightAt( x + Math.sin( yaw ) * d, z + Math.cos( yaw ) * d ) > - 12 ) clear = false;
				if ( clear ) best = { x, z, yaw };

			}

			c.position.set( best.x, c.position.y, best.z );
			c.quaternion.setFromAxisAngle( new c.position.constructor( 0, 1, 0 ), best.yaw );
			c.velocity.set( 0, 0, 0 );
			c.angular.set( 0, 0, 0 );
			c.hasWater = false;
			if ( P.mode !== 'deck' ) P.boardBoat();
			P.takeHelm();
			c.driven = true;
			c.moored = false;

		} );
		// (the sea's height's read back over frames: the engines want the water where she is now)
		await frames( 6 );
		const st = await p.evaluate( () => {

			const a = window.__app, c = a.boatCtl;
			// (slow frames here can read as the clock jumping, which takes you off the helm: DaysOut.passed)
			if ( a.player.mode !== 'boat' ) a.player.takeHelm();
			// (and the crank's counted in the frames this runs ahead of)
			c.engineOn = true;
			for ( let i = 0; i < 1400; i ++ ) {

				c.setInput( 1, 0, 1 / 30 );
				c.update( 1 / 30 );
				a.wake.update( 1 / 30 );

			}

			const f = c.forward( c.position.clone() );
			return { kn: c.speed / 0.5144, rpm: c.rpm, pitch: Math.asin( f.y ) * 57.3, trim: c.outboardTrim * 57.3 };

		} );
		console.log( JSON.stringify( st ) );
		await look( [ - 8, 4, - 17 ], [ 0, 0.8, - 3 ] );
		await frames( 3 );
		await p.evaluate( () => {

			const a = window.__app, c = a.boatCtl;
			for ( let i = 0; i < 120; i ++ ) {

				c.setInput( 1, 0, 1 / 30 );
				c.update( 1 / 30 );
				a.wake.update( 1 / 30 );

			}

		} );
		// (the camera's sea height's read back over frames too: run ahead, it's stale, and the view's all under water)
		await frames( 6 );
		await shot( 'plane-astern' );
		await look( [ 13, 2.6, 7 ], [ 0, 1, 0 ] );
		await p.waitForTimeout( 2500 );
		await shot( 'plane-bow' );
		await p.evaluate( () => {

			window.__look = null;

		} );

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
