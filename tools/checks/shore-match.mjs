#!/usr/bin/env node
// (M20) The CPU's water against the drawn water, pixel by pixel, at each tide (stream SEA: docs/m20/sea.md; M19's measurement,
// tools/checks/water.mjs, found the beach's swash 6 to 12 cm apart, but its clock let the breakers run a frame ahead). As
// tools/wakes/look.mjs' match does for the wakes: the frame held, the clock stopped for both (G.time, and the breakers' through
// ShoreWaves.update), the sea alone drawn from above into a float target, each pixel the drawn surface's place (vWater), and
// the CPU's query there (App.query.heightAt) set against it. Each spot's square, 12 m across, at each tide: how many pixels,
// the drawn less the CPU's (rms, mean, the share more than 5 and 20 cm off, the most either way), over the water that's wet
// (drawn more than 3 cm over the ground).
// Drawn on the CPU (Chromium on SwiftShader, from All the Spaces' Playwright); readings into <out>/shore-match-<tier>.json.
//
//   a dev server on LOOK_PORT (5241), then
//   node tools/checks/shore-match.mjs <out> [tier] [levels] [spots]      (SHORE_OFF=1: the breakers off, the open sea alone;
//   SHORE_DBG=y|x|z: the shore wave's height, or its push across x or z, at each of the sea's resting points against the CPU's there;
//   SHORE_T=s: the water's clock there, 1000 s unless asked, 50000 s for a long day's thousands of waves)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath( new URL( '../..', import.meta.url ) );
const ATS = process.env.ALL_THE_SPACES || join( ROOT, '../all-the-spaces' );
const [ OUTDIR = join( ROOT, 'qa-output/checks' ), TIER = 'mid', LEVELS = '-0.9,-0.3,0.3,0.9', SPOTS = 'swash,surf,bay,flat' ] = process.argv.slice( 2 );
const PORT = process.env.LOOK_PORT || 5241;
mkdirSync( OUTDIR, { recursive: true } );
const T0 = Date.now();
const log = ( ...a ) => console.log( `[${ ( ( Date.now() - T0 ) / 1000 ).toFixed( 0 ) } s]`, ...a );
// each spot's middle ( x, z )
const SPOT = { swash: [ 42, - 27 ], surf: [ 38, - 12 ], bay: [ 66, 38 ], flat: [ - 700, - 128 ] };

const { chromium } = await import( join( ATS, 'node_modules/playwright/index.mjs' ) );
const browser = await chromium.launch( { args: [ '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] } );
const page = await browser.newPage( { viewport: { width: 640, height: 360 } } );
page.setDefaultTimeout( 900000 );
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
await page.goto( `http://127.0.0.1:${ PORT }/?tier=${ TIER }&weather=calm&hour=12&fullsea` );
await page.waitForFunction( () => window.__app && window.__app._started, null, { timeout: 900000 } );
await page.waitForFunction( () => window.__app.shore.trains[ 0 ].upper, null, { timeout: 900000 } ).catch( () => log( 'no high water field' ) );
log( 'started' );

const out = [];
if ( process.env.SHORE_OFF ) await page.evaluate( () => window.__shoreOff = true );
if ( process.env.SHORE_DBG ) await page.evaluate( ( k ) => window.__shoreDbg = k, /^[xyz]$/.test( process.env.SHORE_DBG ) ? process.env.SHORE_DBG : 'y' );
for ( const level of LEVELS.split( ',' ).map( Number ) ) for ( const name of SPOTS.split( ',' ) ) {

	const r = await page.evaluate( async ( [ level, mid, T ] ) => {

		const a = window.__app, THREE = await import( '/src/engine/index.js' ), { G } = await import( '/src/core/Globals.js' ), W = a.water;
		// (the world held: no frame runs while it's measured; the tide where it's asked, the clock stopped for both)
		const hold = a.frame;
		a.frame = () => {};
		a.weather.tide = level;
		a.weather.tideWet = level;
		a.weather.apply();
		G.time.value = T;
		// (SHORE_OFF: the breakers off on both sides, the open sea alone compared)
		if ( window.__shoreOff !== undefined ) {

			a.shore.params.enabled = window.__shoreOff ? 0 : 1;
			a.shore.syncUniforms();

		}

		a.shore.update( T );
		const half = 6, cam = new THREE.OrthographicCamera( - half, half, half, - half, 0.1, 200 );
		cam.position.set( mid[ 0 ], G.seaLevel.value + 20, mid[ 1 ] );
		cam.up.set( 0, 0, - 1 );
		cam.lookAt( mid[ 0 ], - 100, mid[ 1 ] );
		cam.updateMatrixWorld();
		const N = 192, rt = new THREE.WebGLRenderTarget( N, N, { type: THREE.FloatType } );
		const mat = W.material, dbg = mat.clone();
		const dbgShore = window.__shoreDbg || null; // ('y', 'x' or 'z': which of the shore's push)
		dbg.onBeforeCompile = ( shader, renderer ) => {

			mat.onBeforeCompile( shader, renderer );
			if ( dbgShore ) {

				// (SHORE_DBG: each pixel the sea's vertex's resting point and its shore wave's height there, against the CPU's
				// ShoreWaves.sample at that resting point: the shore's height alone, nothing of where it's drawn)
				shader.vertexShader = 'varying vec4 vDbg;\n' + shader.vertexShader.replace( 'vec3 total = waveDisplacementLod(', 'vDbg = vec4( 0.0, 0.0, 0.0, -1.0 );\n\tvec3 total = waveDisplacementLod(' ).replace( 'total += sw.disp;', `total += sw.disp;\n\t\tvDbg = vec4( x0.x, sw.disp.${ dbgShore }, x0.y, 1.0 );` );
				shader.fragmentShader = 'varying vec4 vDbg;\n' + shader.fragmentShader.replace( /}\s*$/, '\tgl_FragColor = vDbg;\n}' );

			} else shader.fragmentShader = shader.fragmentShader.replace( /}\s*$/, '\tgl_FragColor = vec4( vWater, 1.0 );\n}' );

		};
		dbg.customProgramCacheKey = () => dbgShore ? 'shore-match-dbg-' + dbgShore : 'shore-match';
		dbg.transparent = false;
		dbg.blending = THREE.NoBlending;
		dbg.premultipliedAlpha = false;
		dbg.side = THREE.DoubleSide;
		const scene = new THREE.Scene(), mesh = new THREE.Mesh( W.mesh.geometry, dbg );
		mesh.frustumCulled = false;
		scene.add( mesh );
		const R = a.renderer, was = R.getRenderTarget();
		W.update( cam );
		mesh.position.copy( W.mesh.position );
		R.setRenderTarget( rt );
		R.setClearColor( 0x000000, 0 );
		R.clear();
		R.render( scene, cam );
		const px = new Float32Array( N * N * 4 );
		R.readRenderTargetPixels( rt, 0, 0, N, N, px );
		R.setRenderTarget( was );
		rt.dispose();
		dbg.dispose();
		const q = a.query, Tr = a.terrainData, scans = q.scans || 0;
		let n = 0, sum = 0, sum2 = 0, hi = - Infinity, lo = Infinity, at = null, off5 = 0, off20 = 0;
		for ( let i = 0; i < N * N; i ++ ) {

			if ( px[ i * 4 + 3 ] < 0.5 ) continue;
			const x = px[ i * 4 ], y = px[ i * 4 + 1 ], z = px[ i * 4 + 2 ];
			let d;
			if ( dbgShore ) d = y - a.shore.sample( x, z, T, Tr.heightAt( x, z ), Tr )[ dbgShore ];
			else {

				if ( y < Tr.heightAt( x, z ) + 0.03 ) continue;
				d = y - q.heightAt( x, z, T );

			}

			n ++;
			sum += d;
			sum2 += d * d;
			if ( Math.abs( d ) > 0.05 ) off5 ++;
			if ( Math.abs( d ) > 0.2 ) off20 ++;
			if ( d > hi ) hi = d;
			if ( d < lo ) {

				lo = d;

			}

			if ( Math.abs( d ) >= Math.max( Math.abs( hi ), Math.abs( lo ) ) ) at = [ + x.toFixed( 2 ), + z.toFixed( 2 ), + y.toFixed( 3 ), + d.toFixed( 3 ) ];

		}

		a.frame = hold;
		return { sea: + G.seaLevel.value.toFixed( 2 ), spacing: W.lod._spacings[ 0 ], pixels: n, rms: n ? + Math.sqrt( sum2 / n ).toFixed( 4 ) : null, mean: n ? + ( sum / n ).toFixed( 4 ) : null, over5cm: n ? + ( off5 / n ).toFixed( 4 ) : null, over20cm: n ? + ( off20 / n ).toFixed( 4 ) : null, over: n ? + hi.toFixed( 3 ) : null, under: n ? + lo.toFixed( 3 ) : null, worst: at, scans: ( q.scans || 0 ) - scans };

	}, [ level, SPOT[ name ], + ( process.env.SHORE_T || 1000 ) ] );
	out.push( { spot: name, level, ...r } );
	log( name, level, JSON.stringify( r ) );

}

writeFileSync( join( OUTDIR, `shore-match-${ TIER }.json` ), JSON.stringify( { tier: TIER, out, errors }, null, 1 ) );
log( `done, ${ errors.length } errors` );
await browser.close();
