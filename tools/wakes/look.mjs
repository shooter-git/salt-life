#!/usr/bin/env node
// (M17) The wakes' far arms, seen and measured in the game (Chromium on SwiftShader, from All the Spaces' Playwright; the whole
// sea: ?fullsea). Into qa-output/wakes/<tier>/: each view with her wake's crests and without (the same frame, the crests let go),
// and readings.json.
//
//   a dev server on WAKES_PORT (5236: .claude/launch.json "salt-life-wakes", in this worktree), then
//   node tools/wakes/look.mjs [tier] [scenes]       (scenes: run, kayak, match; all by default)
//
//   run     the console at cruise in open water: from her transom, from her T-top's height astern, abeam, and from the air
//   kayak   the kayak lying still in open water, and a console (her stand-in) running past at 30 kn 30 m off: from her seat as
//           the wake comes, and her heave, roll and pitch frame by frame (readings.json: kayak)
//   match   the sea alone drawn into a float target (each pixel the drawn surface's place), set against the CPU's water
//           query there (WaterQuery.heightAt): where the grid draws the crests whole, and where it fades them
//
// A load takes a minute or more; a run's frames come a few a second. Don't edit src while it runs: the dev server reloads it.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const [ TIER = 'high', SCENES = 'run,match,kayak' ] = process.argv.slice( 2 );
const PORT = process.env.WAKES_PORT || 5236;
const OUT = join( ROOT, 'qa-output/wakes', TIER );
mkdirSync( OUT, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
const scenes = SCENES.split( ',' );
const readings = {};
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );

async function load( boat, size = [ 960, 540 ] ) {

	const page = await browser.newPage( { viewport: { width: size[ 0 ], height: size[ 1 ] } } );
	page.on( 'pageerror', ( e ) => log( 'PAGEERROR', e.message.slice( 0, 400 ) ) );
	page.on( 'console', ( m ) => m.type() === 'error' && ! /GPU stall|ReadPixels/.test( m.text() ) && log( 'error', m.text().slice( 0, 400 ) ) );
	await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&hour=11&fullsea${ boat ? '&boat=' + boat : '' }` );
	await page.waitForFunction( () => window.__app && window.__app._started && ! window.__app.water.plainMaterial, null, { timeout: 400000, polling: 1000 } );
	log( 'started', boat || 'kayak' );
	// (late morning held, the guide closed and the game's own screens hidden: the sea's what's looked at)
	await page.evaluate( () => {

		const a = window.__app, s = a.settings, canvas = a.renderer.domElement;
		s.timeSpeed = 0;
		s.timeOfDay = 11;
		// (the island's clock is the session's, set each frame: held there)
		if ( a.together ) a.together.syncClock = ( st ) => {

			st.timeSpeed = 0;
			st.timeOfDay = 11;

		};
		const g = a.game && a.game.guide;
		if ( g && g.open ) g.close();
		const style = document.createElement( 'style' );
		style.textContent = 'body * { visibility: hidden !important; }';
		document.head.appendChild( style );
		canvas.style.setProperty( 'visibility', 'visible', 'important' );

	} );
	// (the camera put where it's asked, in her frame, before the sea's laid out for it; the crests let go on asking)
	await page.evaluate( async () => {

		const a = window.__app, c = a.boatCtl, cam = a.camera, { G } = await import( '/src/core/Globals.js' );
		window.__G = G;
		const place = () => {

			const L = window.__look;
			if ( ! L ) return;
			a.player.position.copy( c.position );
			cam.position.set( ...L.eye ).applyQuaternion( L.frame || c.quaternion ).add( L.from || c.position );
			const t = cam.position.clone().set( ...L.at ).applyQuaternion( L.frame || c.quaternion ).add( L.from || c.position );
			cam.up.set( 0, 1, 0 );
			cam.lookAt( t );
			cam.updateMatrixWorld();
			G.cameraUnderwater.value = 0;
			if ( cam.far !== 12000 ) {

				cam.far = 12000;
				cam.updateProjectionMatrix();

			}

		};

		const draw = a.drawWorld.bind( a ), water = a.water.update.bind( a.water ), wakes = a.waves.wakes, up = wakes.update.bind( wakes );
		a.water.update = function ( camera ) {

			place();
			water( camera );

		};

		a.drawWorld = function () {

			place();
			draw();
			window.__frames = ( window.__frames || 0 ) + 1;

		};

		wakes.update = function ( t, cam ) {

			up( t, cam );
			if ( window.__noWake ) this.count = 0;

		};

		// (window.__fast: frames stepped without drawing for each drawn, at the CPU's longest step: a run-up in minutes, not tens)
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
	return page;

}

const frames = async ( page, n ) => {

	const from = await page.evaluate( () => window.__frames || 0 );
	await page.waitForFunction( ( to ) => ( window.__frames || 0 ) >= to, from + n, { timeout: 300000, polling: 200 } );

};

// a view of what's on screen, with the crests and without them (the world held still between: the frame's clock stopped)
async function shot( page, name, eye, at, opts = {} ) {

	await page.evaluate( ( [ eye, at, opts ] ) => {

		window.__look = { eye, at };
		if ( opts.world ) {

			const a = window.__app, P = a.boatCtl.position;
			window.__look.from = P.clone().set( P.x, 0, P.z );
			window.__look.frame = a.boatCtl.quaternion.clone().set( 0, Math.sin( opts.yaw / 2 ), 0, Math.cos( opts.yaw / 2 ) );

		}

	}, [ eye, at, opts ] );
	await frames( page, 3 );
	await page.screenshot( { path: join( OUT, name + '.png' ) } );
	if ( opts.pair !== false ) {

		// (the same instant without them: the clock and the boat held, one frame drawn)
		await page.evaluate( () => {

			const a = window.__app;
			window.__hold = { frame: a.frame.bind( a ) };
			a.frame = function () {

				window.__noWake = true;
				this.wake.track( this.together, this.camera.position );
				this.water.update( this.camera );
				this.drawWorld();

			};

		} );
		await frames( page, 2 );
		await page.screenshot( { path: join( OUT, name + '-without.png' ) } );
		await page.evaluate( () => {

			const a = window.__app;
			a.frame = window.__hold.frame;
			window.__noWake = false;

		} );

	}

	log( 'shot', name );

}

// out in open water, a long clear run (away from the island), her bow along it
const toOpenWater = ( page ) => page.evaluate( () => {

	const a = window.__app, c = a.boatCtl, T = a.terrainData;
	let best = null;
	for ( let k = 0; k < 400 && ! best; k ++ ) {

		const x = ( k * 733 ) % 6000 - 3000, z = ( k * 461 ) % 6000 - 3000, yaw = k * 1.1;
		let clear = true;
		for ( let d = - 600; d <= 1500; d += 50 ) if ( T.heightAt( x + Math.sin( yaw ) * d, z + Math.cos( yaw ) * d ) > - 15 ) clear = false;
		if ( clear ) best = { x, z, yaw };

	}

	c.position.set( best.x, c.position.y, best.z );
	c.quaternion.setFromAxisAngle( new c.position.constructor( 0, 1, 0 ), best.yaw );
	c.velocity.set( 0, 0, 0 );
	c.angular.set( 0, 0, 0 );
	c.hasWater = false;
	c.moored = false;
	c.beached = false;
	return best;

} );

if ( scenes.includes( 'run' ) || scenes.includes( 'match' ) ) {

	const page = await load( 'console' );
	const best = await toOpenWater( page );
	await page.evaluate( () => {

		const a = window.__app, P = a.player;
		P.boardBoat();
		P.takeHelm();
		a.boatCtl.moored = false;
		P.input.down = ( ( down ) => function ( k ) {

			return k === 'KeyW' ? window.__lever !== false : down.call( this, k );

		} )( P.input.down );

	} );
	log( 'run from', JSON.stringify( best ) );
	await page.evaluate( () => { window.__fast = 6; } );
	// (her arms followed out: 80 s of the sea's time at speed)
	let st;
	for ( let i = 0; i < 200; i ++ ) {

		await page.waitForTimeout( 3000 );
		st = await page.evaluate( () => {

			const a = window.__app, c = a.boatCtl, w = a.waves.wakes;
			window.__runFrom = window.__runFrom ?? ( c.speed > 8 ? window.__G.time.value : null );
			return { kn: c.speed / 0.5144, since: window.__runFrom === null ? 0 : window.__G.time.value - window.__runFrom, samples: w.n, tracks: w.count };

		} );
		if ( st.since > 80 ) break;
		if ( i % 10 === 9 ) log( 'running', JSON.stringify( st ) );

	}

	await page.evaluate( () => { window.__fast = 1; } );
	log( 'under way', JSON.stringify( st ) );
	readings.run = st;
	if ( scenes.includes( 'run' ) ) {

		await shot( page, 'run-transom', [ 0, 2.2, - 3.6 ], [ 0, - 1, - 40 ] );
		await shot( page, 'run-astern', [ 0, 4.5, - 8 ], [ 0, 0, - 80 ] );
		await shot( page, 'run-abeam', [ 30, 2.5, - 40 ], [ - 10, 0, - 70 ] );
		await shot( page, 'run-air', [ 0, 55, - 50 ], [ 0, 0, - 51 ] );
		await shot( page, 'run-air-high', [ 0, 170, - 170 ], [ 0, 0, - 171 ] );

	}

	if ( scenes.includes( 'match' ) ) readings.match = await match( page );
	await page.close();

}

// the sea alone drawn from above into a float target, each pixel the drawn surface's place, against the CPU's query there
async function match( page ) {

	const out = [];
	for ( const [ name, back, side, half, height ] of [ [ 'near', 45, 8, 12, 6 ], [ 'far', 200, 26, 25, 10 ] ] ) {

		const r = await page.evaluate( async ( [ back, side, half, height ] ) => {

			const a = window.__app, THREE = await import( '/src/engine/index.js' ), G = window.__G, c = a.boatCtl, W = a.water;
			// (the world held: the frame stopped, the wake as it was packed)
			const hold = a.frame;
			a.frame = () => {};
			const f = c.forward( new THREE.Vector3() ).setY( 0 ).normalize(), s = new THREE.Vector3( f.z, 0, - f.x );
			const mid = c.position.clone().addScaledVector( f, - back ).addScaledVector( s, side ).setY( 0 );
			const cam = new THREE.OrthographicCamera( - half, half, half, - half, 0.1, 100 );
			cam.position.set( mid.x, G.seaLevel.value + height, mid.z );
			cam.up.set( f.x, 0, f.z );
			cam.lookAt( mid.x, - 100, mid.z );
			cam.updateMatrixWorld();
			const N = 192, rt = new THREE.WebGLRenderTarget( N, N, { type: THREE.FloatType } );
			const mat = W.material, dbg = mat.clone();
			dbg.onBeforeCompile = ( shader, renderer ) => {

				mat.onBeforeCompile( shader, renderer );
				shader.fragmentShader = shader.fragmentShader.replace( /}\s*$/, '\tgl_FragColor = vec4( vWater, 1.0 );\n}' );

			};
			dbg.customProgramCacheKey = () => 'wake-match';
			dbg.transparent = false;
			dbg.blending = THREE.NoBlending;
			dbg.premultipliedAlpha = false;
			dbg.side = THREE.DoubleSide;
			const scene = new THREE.Scene(), mesh = new THREE.Mesh( W.mesh.geometry, dbg );
			mesh.frustumCulled = false;
			scene.add( mesh );
			const R = a.renderer, was = R.getRenderTarget();
			const read = ( on ) => {

				window.__noWake = ! on;
				a.wake.track( a.together, cam.position );
				W.update( cam );
				mesh.position.copy( W.mesh.position );
				R.setRenderTarget( rt );
				R.setClearColor( 0x000000, 0 );
				R.clear();
				R.render( scene, cam );
				const px = new Float32Array( N * N * 4 );
				R.readRenderTargetPixels( rt, 0, 0, N, N, px );
				return px;

			};
			const t = G.time.value, px = read( true ), plain = read( false );
			R.setRenderTarget( was );
			window.__noWake = false;
			a.wake.track( a.together, cam.position );
			const q = a.query;
			let n = 0, sum = 0, max = 0, wake = 0, wakeMax = 0, drawnSum = 0;
			for ( let i = 0; i < N * N; i ++ ) {

				if ( px[ i * 4 + 3 ] < 0.5 ) continue;
				const x = px[ i * 4 ], y = px[ i * 4 + 1 ], z = px[ i * 4 + 2 ];
				const cpu = q.heightAt( x, z, t ), cw = a.waves.wakes.heightAt( x, z );
				const d = y - cpu;
				n ++;
				sum += d * d;
				max = Math.max( max, Math.abs( d ) );
				// (the crests' own height there, the CPU's, for scale; and the drawn one: with less without)
				const drawnWake = y - plain[ i * 4 + 1 ];
				wake += cw * cw;
				wakeMax = Math.max( wakeMax, Math.abs( cw ) );
				drawnSum += drawnWake * drawnWake;

			}

			rt.dispose();
			dbg.dispose();
			a.frame = hold;
			return { pixels: n, rms: Math.sqrt( sum / n ), max, wakeRms: Math.sqrt( wake / n ), wakeMax, drawnWakeRms: Math.sqrt( drawnSum / n ), spacing: W.lod._spacings[ 0 ] };

		}, [ back, side, half, height ] );
		log( 'match', name, JSON.stringify( r ) );
		out.push( { name, back, side, half, ...r } );

	}

	return out;

}

if ( scenes.includes( 'kayak' ) ) {

	const page = await load( null, [ 800, 450 ] );
	const best = await toOpenWater( page );
	// (in her, still; a console running past at 30 kn, 30 m off her starboard side, from 300 m astern of her to 900 m on: her
	// stand-in drawn where she is)
	await page.evaluate( async ( best ) => {

		const a = window.__app, P = a.player, c = a.boatCtl, G = window.__G, THREE = await import( '/src/engine/index.js' ), { standInGeometry } = await import( '/src/together/BoatCopies.js' );
		P.boardBoat();
		P.takeHelm();
		c.moored = false;
		const f = new THREE.Vector3( Math.sin( best.yaw ), 0, Math.cos( best.yaw ) ), s = new THREE.Vector3( f.z, 0, - f.x );
		const U = 30 * 0.5144, t0 = G.time.value + 4, ghost = new THREE.Mesh( standInGeometry( 'console' ), new THREE.MeshStandardMaterial( { color: 0xf2f2f0, roughness: 0.5 } ) );
		a.scene.add( ghost );
		window.__ghost = { t0, U };
		const track = a.wake.track.bind( a.wake ), rec = window.__kayak = [];
		a.wake.track = function ( together, cam ) {

			const t = G.time.value, d = - 300 + U * ( t - t0 );
			if ( d < 900 ) {

				const x = best.x + f.x * d - s.x * 30, z = best.z + f.z * d - s.z * 30;
				a.waves.wakes.follow( 'ghost', x, z, f.x * U, f.z * U, 5.61, 2.49, t );
				ghost.position.set( x, G.seaLevel.value, z );
				ghost.rotation.y = best.yaw;

			}

			track( together, cam );
			const e = new THREE.Euler().setFromQuaternion( c.quaternion, 'YXZ' );
			rec.push( [ +( t - t0 ).toFixed( 2 ), +c.position.y.toFixed( 4 ), +( e.z * 57.3 ).toFixed( 2 ), +( e.x * 57.3 ).toFixed( 2 ), +a.waves.wakeAt( c.position.x, c.position.z ).toFixed( 4 ) ] );

		};

	}, best );
	log( 'kayak in open water, the console coming' );
	await page.evaluate( () => { window.__fast = 4; } );
	// (her seat's view toward where it comes from, as it passes and as its wake reaches her)
	for ( const [ name, at ] of [ [ 'kayak-coming', 4 ], [ 'kayak-wake', 34 ], [ 'kayak-rocking', 48 ] ] ) {

		await page.waitForFunction( ( at ) => window.__G.time.value - window.__ghost.t0 > at - 3, at, { timeout: 600000, polling: 200 } );
		await page.evaluate( () => { window.__fast = 1; } );
		await page.waitForFunction( ( at ) => window.__G.time.value - window.__ghost.t0 > at, at, { timeout: 600000, polling: 200 } );
		await shot( page, name, [ - 1.5, 1.6, 2 ], [ - 40, - 1, - 25 ], { pair: name !== 'kayak-coming' } );
		await page.evaluate( () => { window.__fast = 4; } );

	}

	await page.waitForFunction( () => window.__G.time.value - window.__ghost.t0 > 75, null, { timeout: 600000, polling: 500 } );
	const rec = await page.evaluate( () => window.__kayak );
	const still = rec.filter( ( r ) => r[ 0 ] < 15 ), after = rec.filter( ( r ) => r[ 0 ] > 15 );
	const span = ( rows, i ) => rows.length ? Math.max( ...rows.map( ( r ) => r[ i ] ) ) - Math.min( ...rows.map( ( r ) => r[ i ] ) ) : 0;
	readings.kayak = { frames: rec.length, heave: [ span( still, 1 ), span( after, 1 ) ], roll: [ span( still, 2 ), span( after, 2 ) ], pitch: [ span( still, 3 ), span( after, 3 ) ], wake: span( after, 4 ), rec };
	log( 'kayak', JSON.stringify( { ...readings.kayak, rec: undefined } ) );
	await page.close();

}

writeFileSync( join( OUT, 'readings.json' ), JSON.stringify( readings, null, 1 ) );
await browser.close();
log( 'done' );
